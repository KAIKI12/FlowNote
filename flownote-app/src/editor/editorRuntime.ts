import { Editor, EditorStatus, rootCtx, defaultValueCtx, editorViewCtx, remarkStringifyOptionsCtx, serializerCtx } from '@milkdown/core';
import { commonmark, codeBlockSchema } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { block } from '@milkdown/plugin-block';
import { history } from '@milkdown/plugin-history';
import { prism } from '@milkdown/plugin-prism';
import { $ctx } from '@milkdown/utils';
import { htmlBlockPlugin } from './plugins/htmlBlock/htmlBlockPlugin';
import { taskListView } from './taskListPlugin';
import { configureEditorInteractions, editorStateEvents, EDITOR_STATE_EVENT } from './editorInteractions';
import { createMarkdownBridge } from './markdownBridge';
import { configureProtectedInput } from './protectedInput';
import { insertImage } from './editorActions';
import { configureMarkdownClipboard, preservePastedCodeBlocks } from './markdownClipboard';
import type { EditorSession } from './editorSession';
import type { FlowNoteEditorApi } from './editorTypes';
import { htmlBlockContext } from './plugins/htmlBlock/htmlBlockContext';
import type { HtmlBlockHost } from './plugins/htmlBlock/htmlBlockContext';
import { parseHtmlReference, validBlockId } from '../note/htmlBlockData';
import { managedImageContext, managedImageView } from './plugins/managedImageView';
import type { ManagedImageReader } from './plugins/managedImageView';
import { NodeSelection } from '@milkdown/prose/state';
import { DOMSerializer } from 'prosemirror-model';

export const editorSessionCtx = $ctx<EditorSession | null, 'flowNoteSession'>(null, 'flowNoteSession');

function bindEvents(root: HTMLElement, session: EditorSession): AbortController {
  const events = new AbortController();
  root.addEventListener('compositionstart', () => session.beginComposition(), { signal: events.signal });
  root.addEventListener('compositionend', () => session.endComposition(), { signal: events.signal });
  root.addEventListener(EDITOR_STATE_EVENT, event => {
    if ((event as CustomEvent<{ docChanged: boolean }>).detail?.docChanged) session.visualChanged();
  }, { signal: events.signal });
  return events;
}

function configureHtmlParsing(ctx: import('@milkdown/ctx').Ctx): void {
  ctx.update(codeBlockSchema.key, previous => current => {
    const spec = previous(current);
    return { ...spec, parseMarkdown: { ...spec.parseMarkdown, match: node => {
      const id = node.lang === 'flownote-html' && !node.meta ? parseHtmlReference(node.value) : null;
      return spec.parseMarkdown.match(node) && !(id && current.get(htmlBlockContext.key)?.host.knownIds()?.has(id));
    } } };
  });
}

export function createFlowEditor(root: HTMLElement, session: EditorSession, htmlHost?: HtmlBlockHost, imageReader: ManagedImageReader | null = null): Editor {
  const events = bindEvents(root, session);
  const editor = Editor.make()
    .config(ctx => {
      configureEditorInteractions(ctx);
      configureProtectedInput(ctx, session);
      configureMarkdownClipboard(ctx);
      configureHtmlParsing(ctx);
      ctx.set(rootCtx, root);
      // Risky source must never be hydrated through the rich-text parser first.
      ctx.set(defaultValueCtx, '');
      ctx.set(editorSessionCtx.key, session);
      ctx.set(htmlBlockContext.key, htmlHost ? { host: htmlHost, session } : null);
      ctx.set(managedImageContext.key, imageReader);
      ctx.update(remarkStringifyOptionsCtx, previous => ({ ...previous,
        unsafe: [...(previous.unsafe ?? []), { character: '$', inConstruct: 'phrasing' as const }],
      }));
      ctx.get(listenerCtx).markdownUpdated((_current, markdown) => session.acceptVisual(editor.ctx, markdown));
    })
    .onStatusChange(status => {
      if (status === EditorStatus.Created) session.connect(createMarkdownBridge(editor.ctx));
      if (status !== EditorStatus.Destroyed) return;
      events.abort();
      session.disconnect(editor.ctx);
    })
    .use(commonmark).use(gfm).use(history).use(prism).use(taskListView).use(preservePastedCodeBlocks)
    .use(editorStateEvents).use(listener).use(block).use(htmlBlockPlugin).use(managedImageView)
    .use(editorSessionCtx).use(htmlBlockContext).use(managedImageContext);
  return editor;
}

export function createEditorApi(session: EditorSession, get: () => Editor | undefined): FlowNoteEditorApi {
  return {
    getMarkdown: () => session.getMarkdown(),
    getBrowserBundleSnapshot: () => {
      const state = session.getSnapshot();
      const markdown = session.getMarkdown();
      if (state.active === 'source') {
        return { markdown, protected: true, reasons: [...state.reasons], bodyHtml: '' };
      }
      const editor = get();
      if (!editor) throw new Error('编辑器尚未准备就绪');
      let bodyHtml = '';
      editor.action(ctx => {
        const view = ctx.get(editorViewCtx);
        const container = document.createElement('div');
        const fragment = DOMSerializer.fromSchema(view.state.schema)
          .serializeFragment(view.state.doc.content, { document });
        container.appendChild(fragment);
        bodyHtml = container.innerHTML;
      });
      return { markdown, protected: false, reasons: [...state.reasons], bodyHtml };
    },
    setMarkdown: source => session.setMarkdown(source),
    setMode: mode => session.setMode(mode),
    focus: () => session.focus(),
    insertImage: (src, alt) => {
      session.requireVisualEdit();
      const editor = get();
      if (!editor) throw new Error('编辑器尚未准备就绪');
      insertImage(editor, { src, alt });
    },
    getImageSources: () => {
      session.requireVisualEdit();
      const editor = get();
      if (!editor) throw new Error('编辑器尚未准备就绪');
      const sources: string[] = [];
      editor.action(ctx => ctx.get(editorViewCtx).state.doc.descendants(node => {
        if (node.type.name === 'image' && typeof node.attrs.src === 'string') sources.push(node.attrs.src);
      }));
      return sources;
    },
    previewHtmlBlock: (id, width = 'normal', imageReplacements = {}) => {
      session.requireVisualEdit();
      if (!validBlockId(id)) throw new Error('Invalid FlowNote Block Reference');
      const editor = get();
      if (!editor) throw new Error('编辑器尚未准备就绪');
      let markdown = '';
      editor.action(ctx => {
        const view = ctx.get(editorViewCtx);
        const type = view.state.schema.nodes.html_block;
        if (!type) throw new Error('html_block node type 未找到');
        const blockNode = type.create({ id, width });
        const selection = view.state.selection;
        const transaction = selection instanceof NodeSelection && selection.node.type.name === 'html_block'
          ? view.state.tr.insert(selection.to, blockNode)
          : view.state.tr.replaceSelectionWith(blockNode);
        const images: Array<{ pos: number; attrs: Record<string, unknown> }> = [];
        transaction.doc.descendants((node, pos) => {
          if (node.type.name !== 'image' || typeof node.attrs.src !== 'string' || !imageReplacements[node.attrs.src]) return;
          images.push({ pos, attrs: { ...node.attrs, src: imageReplacements[node.attrs.src] } });
        });
        for (const image of images) transaction.setNodeMarkup(image.pos, undefined, image.attrs);
        markdown = ctx.get(serializerCtx)(transaction.doc);
      });
      return session.wrapVisualMarkdown(markdown);
    },
    previewDuplicateHtmlBlock: (sourceId, targetId) => {
      session.requireVisualEdit();
      if (!validBlockId(sourceId) || !validBlockId(targetId) || sourceId === targetId) throw new Error('Invalid FlowNote Block Reference');
      const editor = get();
      if (!editor) throw new Error('编辑器尚未准备就绪');
      let markdown = '';
      editor.action(ctx => {
        const view = ctx.get(editorViewCtx);
        const type = view.state.schema.nodes.html_block;
        if (!type) throw new Error('html_block node type 未找到');
        let source: { pos: number; size: number; width: 'normal' | 'wide' | 'full' } | undefined;
        view.state.doc.descendants((node, pos) => {
          if (source || node.type.name !== 'html_block' || node.attrs.id !== sourceId) return;
          const width = ['normal', 'wide', 'full'].includes(String(node.attrs.width)) ? node.attrs.width as 'normal' | 'wide' | 'full' : 'normal';
          source = { pos, size: node.nodeSize, width };
        });
        if (!source) throw new Error('Deep Copy 源 HTML Block 不存在');
        const transaction = view.state.tr.insert(source.pos + source.size, type.create({ id: targetId, width: source.width }));
        markdown = ctx.get(serializerCtx)(transaction.doc);
      });
      return session.wrapVisualMarkdown(markdown);
    },
    insertHtmlBlock: (id, width = 'normal') => {
      session.requireVisualEdit();
      if (!validBlockId(id)) throw new Error('Invalid FlowNote Block Reference');
      const editor = get();
      if (!editor) throw new Error('编辑器尚未准备就绪');
      editor.action(ctx => {
        const view = ctx.get(editorViewCtx);
        const type = view.state.schema.nodes.html_block;
        if (!type) throw new Error('html_block node type 未找到');
        const blockNode = type.create({ id, width });
        const selection = view.state.selection;
        const transaction = selection instanceof NodeSelection && selection.node.type.name === 'html_block'
          ? view.state.tr.insert(selection.to, blockNode)
          : view.state.tr.replaceSelectionWith(blockNode);
        view.dispatch(transaction);
      });
    },
  };
}

import { Editor, EditorStatus, rootCtx, defaultValueCtx, editorViewCtx, remarkStringifyOptionsCtx } from '@milkdown/core';
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

export function createFlowEditor(root: HTMLElement, session: EditorSession, htmlHost?: HtmlBlockHost): Editor {
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
    .use(editorStateEvents).use(listener).use(block).use(htmlBlockPlugin).use(editorSessionCtx).use(htmlBlockContext);
  return editor;
}

export function createEditorApi(session: EditorSession, get: () => Editor | undefined): FlowNoteEditorApi {
  return {
    getMarkdown: () => session.getMarkdown(),
    setMarkdown: source => session.setMarkdown(source),
    setMode: mode => session.setMode(mode),
    focus: () => session.focus(),
    insertImage: (src, alt) => {
      session.requireVisualEdit();
      const editor = get();
      if (!editor) throw new Error('编辑器尚未准备就绪');
      insertImage(editor, { src, alt });
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
        view.dispatch(view.state.tr.replaceSelectionWith(type.create({ id, width })));
      });
    },
  };
}

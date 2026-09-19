import type { Ctx } from '@milkdown/ctx';
import { editorStateCtx, editorStateOptionsCtx, editorViewCtx, parserCtx, remarkCtx, serializerCtx } from '@milkdown/core';
import { closeHistory } from '@milkdown/prose/history';
import { EditorState } from '@milkdown/prose/state';
import type { Node } from '@milkdown/prose/model';
import { protectionReasons, sameMarkdownMeaning } from './markdownProtection';
import type { MarkdownTree } from './markdownProtection';
import { htmlBlockContext } from './plugins/htmlBlock/htmlBlockContext';
import { hasFrontmatterOpener, splitFrontmatter } from './frontmatterEnvelope';

export interface MarkdownBridge {
  identity: unknown;
  inspect: (source: string) => string[];
  read: () => string;
  readVisual: () => string;
  wrapVisual: (markdown: string) => string;
  replace: (source: string, resetHistory: boolean) => void;
  editable: (enabled: boolean) => void;
  focus: () => void;
}

function parseTree(ctx: Ctx, source: string): MarkdownTree {
  return ctx.get(remarkCtx).parse(source) as unknown as MarkdownTree;
}

function parseDocument(ctx: Ctx, source: string): Node {
  const document = source.trim() ? ctx.get(parserCtx)(source)
    : ctx.get(editorViewCtx).state.schema.topNodeType.createAndFill();
  if (!document) throw new Error('Markdown 解析未产生文档');
  return document;
}

function bodySource(source: string): { prefix: string; body: string } | { error: string } {
  const frontmatter = splitFrontmatter(source);
  if (frontmatter) return frontmatter;
  if (hasFrontmatterOpener(source)) return { error: 'Frontmatter 元数据未闭合' };
  return { prefix: '', body: source };
}

function inspectMarkdown(ctx: Ctx, source: string): string[] {
  try {
    const extracted = bodySource(source);
    if ('error' in extracted) return [extracted.error];
    const before = parseTree(ctx, extracted.body);
    const reasons = protectionReasons(extracted.body, before, ctx.get(htmlBlockContext.key)?.host.knownIds());
    if (reasons.length) return reasons;
    // Milkdown's empty-line serializer depends on the live last paragraph's identity.
    if (before.children?.length === 0) return [];
    const document = parseDocument(ctx, extracted.body);
    const after = parseTree(ctx, ctx.get(serializerCtx)(document));
    return sameMarkdownMeaning(before, after) ? [] : ['可视化往返会改变 Markdown 结构'];
  } catch (error) {
    return [`Markdown 解析失败：${error instanceof Error ? error.message : String(error)}`];
  }
}

function resetDocument(ctx: Ctx, document: Node): void {
  const view = ctx.get(editorViewCtx);
  const state = EditorState.create(ctx.get(editorStateOptionsCtx)({
    schema: view.state.schema, plugins: view.state.plugins, doc: document,
  }));
  ctx.set(editorStateCtx, state);
  view.updateState(state);
}

function replaceDocument({ ctx, source, resetHistory }: { ctx: Ctx; source: string; resetHistory: boolean }): string {
  const extracted = bodySource(source);
  if ('error' in extracted) throw new Error(extracted.error);
  const view = ctx.get(editorViewCtx);
  const document = parseDocument(ctx, extracted.body);
  if (resetHistory) resetDocument(ctx, document);
  else {
    view.dispatch(closeHistory(view.state.tr).replaceWith(0, view.state.doc.content.size, document.content));
    view.dispatch(closeHistory(view.state.tr));
  }
  return extracted.prefix;
}

export function createMarkdownBridge(ctx: Ctx): MarkdownBridge {
  let frontmatterPrefix = '';
  const readVisual = () => ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc);
  return {
    identity: ctx,
    inspect: source => inspectMarkdown(ctx, source),
    read: () => frontmatterPrefix + readVisual(),
    readVisual,
    wrapVisual: markdown => frontmatterPrefix + markdown,
    replace: (source, resetHistory) => { frontmatterPrefix = replaceDocument({ ctx, source, resetHistory }); },
    editable: enabled => ctx.get(editorViewCtx).setProps({ editable: () => enabled }),
    focus: () => ctx.get(editorViewCtx).focus(),
  };
}

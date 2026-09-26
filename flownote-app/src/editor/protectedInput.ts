import type { Ctx } from '@milkdown/ctx';
import { editorViewOptionsCtx, serializerCtx } from '@milkdown/core';
import type { EditorView } from '@milkdown/prose/view';
import type { EditorSession } from './editorSession';
import { createMarkdownBridge } from './markdownBridge';
import { isCodeSelection } from './inputContext';

interface InputRange { from: number; to: number; text: string }
interface InputContext {
  ctx: Ctx; session: EditorSession; view: EditorView;
  pasteHtmlSource?: (html: string) => void | Promise<unknown>;
}

function looksLikeStandaloneHtmlSource(text: string): boolean {
  const trimmed = text.trim();
  return /^(?:<!doctype\s+html\b|<!--|<[a-zA-Z][\w:-]*(?:\s|>|\/))/.test(trimmed)
    && /(?:<\/[a-zA-Z][\w:-]*\s*>|\/>|<!doctype\s+html\b|-->)/i.test(trimmed);
}

function sourceWithInput(context: InputContext, range: InputRange): { source: string; caret: number } {
  const marker = 'FLOWNOTESOURCE' + crypto.randomUUID().replace(/-/g, '');
  const document = context.view.state.tr.insertText(marker, range.from, range.to).doc;
  const serialized = context.ctx.get(serializerCtx)(document);
  const start = serialized.indexOf(marker);
  if (start < 0 || serialized.indexOf(marker, start + marker.length) !== -1) throw new Error('无法定位源码中的插入位置');
  return { source: serialized.slice(0, start) + range.text + serialized.slice(start + marker.length),
    caret: start + range.text.length };
}

function protectInput(context: InputContext, range: InputRange): boolean {
  if (context.view.composing || context.session.getSnapshot().composing) {
    context.session.reportNotice('请先完成组合输入，再插入扩展 Markdown；剪贴板内容尚未插入。');
    return true;
  }
  try {
    const { source, caret } = sourceWithInput(context, range);
    context.session.openSourceInput(source, caret);
  } catch (error) {
    context.session.reportNotice(`${error instanceof Error ? error.message : String(error)}。请切换源码后重试插入。`);
  }
  return true;
}

function typedRange(view: EditorView, range: InputRange): InputRange | null {
  const $from = view.state.doc.resolve(range.from);
  const prefix = $from.parent.textBetween(0, $from.parentOffset, '', '\uFFFC');
  const joined = prefix + range.text;
  const syntax = [...joined.matchAll(/\[\[|\[\^|<\/?[a-zA-Z!]|\\[([]/g)]
    .find(match => match.index! + match[0].length > prefix.length);
  if (syntax) {
    const start = Math.min(prefix.length, syntax.index);
    return { ...range, from: range.from - (prefix.length - start), text: joined.slice(start) };
  }
  if (/^\s*:{2,}[a-zA-Z]?/.test(joined) || $from.before() === 0 && /^(---|\+\+\+)$/.test(joined)) {
    return { ...range, from: range.from - prefix.length, text: joined };
  }
  return null;
}

function handleText(context: InputContext, range: InputRange): boolean {
  if (!context.view.editable || isCodeSelection(context.view) || context.view.composing) return false;
  const protectedRange = typedRange(context.view, range);
  return protectedRange ? protectInput(context, protectedRange) : false;
}

function handlePaste(context: InputContext, event: ClipboardEvent): boolean {
  const text = event.clipboardData?.getData('text/plain');
  if (!text || !context.view.editable || isCodeSelection(context.view)) return false;
  if (context.pasteHtmlSource && looksLikeStandaloneHtmlSource(text)) {
    event.preventDefault();
    if (context.view.composing || context.session.getSnapshot().composing) {
      context.session.reportNotice('请先完成组合输入，再粘贴 HTML；剪贴板内容尚未插入。');
      return true;
    }
    void Promise.resolve(context.pasteHtmlSource(text)).catch(error =>
      context.session.reportNotice(error instanceof Error ? error.message : String(error)));
    return true;
  }
  const reasons = createMarkdownBridge(context.ctx).inspect(text);
  const { from, to } = context.view.state.selection;
  const range = typedRange(context.view, { from, to, text });
  if (!reasons.length && !range) return false;
  event.preventDefault();
  return protectInput(context, range ?? { from, to, text });
}

function handleFence(context: InputContext, event: KeyboardEvent): boolean {
  const { view } = context;
  if (event.key !== 'Enter' || !view.editable || view.composing || isCodeSelection(view)) return false;
  const { $from, from, to } = view.state.selection;
  const prefix = $from.parent.textBetween(0, $from.parentOffset);
  if (!/^\s*(`{3,}|~{3,})/.test(prefix) || !createMarkdownBridge(context.ctx).inspect(prefix + '\n').length) return false;
  return protectInput(context, { from: from - prefix.length, to, text: prefix + '\n' });
}

export function configureProtectedInput(ctx: Ctx, session: EditorSession,
  pasteHtmlSource?: (html: string) => void | Promise<unknown>): void {
  ctx.update(editorViewOptionsCtx, previous => ({ ...previous,
    handleTextInput(...args) {
      const [view, from, to, text] = args;
      return handleText({ ctx, session, view }, { from, to, text })
        || previous.handleTextInput?.apply(previous, args);
    },
    handleKeyDown(view, event) {
      return handleFence({ ctx, session, view }, event) || previous.handleKeyDown?.call(previous, view, event);
    },
    handleDOMEvents: { ...previous.handleDOMEvents,
      paste(view, event) {
        return handlePaste({ ctx, session, view, pasteHtmlSource }, event)
          || previous.handleDOMEvents?.paste?.call(previous, view, event);
      },
    },
  }));
}

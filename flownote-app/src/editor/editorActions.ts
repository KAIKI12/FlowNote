import type { Ctx } from '@milkdown/ctx';
import { Editor, EditorStatus, commandsCtx, editorViewCtx } from '@milkdown/core';
import { closeHistory, undoDepth, redoDepth } from '@milkdown/prose/history';
import { liftTarget } from '@milkdown/prose/transform';
import { liftListItem } from '@milkdown/prose/schema-list';
import { isInTable, selectedRect, deleteRow, deleteColumn } from '@milkdown/prose/tables';
import { TextSelection } from '@milkdown/prose/state';
import type { EditorState } from '@milkdown/prose/state';
import { undoCommand, redoCommand } from '@milkdown/plugin-history';
import { toggleStrongCommand, toggleEmphasisCommand, toggleInlineCodeCommand,
  wrapInHeadingCommand, turnIntoTextCommand, wrapInBulletListCommand,
  wrapInOrderedListCommand, wrapInBlockquoteCommand, createCodeBlockCommand, insertImageCommand } from '@milkdown/preset-commonmark';
import { toggleStrikethroughCommand, insertTableCommand, addRowAfterCommand, addColAfterCommand } from '@milkdown/preset-gfm';
import { isCodeSelection } from './inputContext';

const DEFAULT_TABLE_ROWS = 3;
const DEFAULT_TABLE_COLUMNS = 3;
const MAX_HEADING_LEVEL = 6;
const LINK_PROTOCOLS = ['http:', 'https:', 'mailto:'];
const IMAGE_PROTOCOLS = ['http:', 'https:'];
const URL_VALIDATION_BASE = 'https://flownote.invalid/';

function ancestorDepth(state: EditorState, names: readonly string[]): number {
  for (let depth = state.selection.$from.depth; depth > 0; depth--) {
    if (names.includes(state.selection.$from.node(depth).type.name)) return depth;
  }
  return 0;
}

function toggleList(ctx: Ctx, kind: 'bullet_list' | 'ordered_list'): boolean {
  const view = ctx.get(editorViewCtx);
  const depth = ancestorDepth(view.state, ['bullet_list', 'ordered_list']);
  if (!depth) return ctx.get(commandsCtx).call(kind === 'bullet_list' ? wrapInBulletListCommand.key : wrapInOrderedListCommand.key);
  const parent = view.state.selection.$from.node(depth);
  if (parent.type.name === kind) return liftListItem(view.state.schema.nodes.list_item)(view.state, view.dispatch);
  const pos = view.state.selection.$from.before(depth);
  const tr = view.state.tr.setNodeMarkup(pos, view.state.schema.nodes[kind], { ...parent.attrs, order: 1 });
  parent.forEach((child, offset, index) => {
    tr.setNodeMarkup(pos + 1 + offset, undefined, { ...child.attrs,
      listType: kind === 'ordered_list' ? 'ordered' : 'bullet',
      label: kind === 'ordered_list' ? String(index + 1) + '.' : '•' });
  });
  view.dispatch(tr);
  return true;
}

function toggleTask(ctx: Ctx): boolean {
  const view = ctx.get(editorViewCtx);
  if (!ancestorDepth(view.state, ['list_item']) && !ctx.get(commandsCtx).call(wrapInBulletListCommand.key)) return false;
  const depth = ancestorDepth(view.state, ['list_item']);
  if (!depth) return false;
  const item = view.state.selection.$from.node(depth);
  view.dispatch(view.state.tr.setNodeMarkup(view.state.selection.$from.before(depth), undefined,
    { ...item.attrs, checked: typeof item.attrs.checked === 'boolean' ? null : false }));
  return true;
}

function toggleQuote(ctx: Ctx): boolean {
  const view = ctx.get(editorViewCtx);
  const depth = ancestorDepth(view.state, ['blockquote']);
  if (!depth) return ctx.get(commandsCtx).call(wrapInBlockquoteCommand.key);
  const start = view.state.doc.resolve(view.state.selection.$from.start(depth));
  const end = view.state.doc.resolve(view.state.selection.$from.end(depth));
  const range = start.blockRange(end);
  const target = range && liftTarget(range);
  if (!range || target == null) return false;
  view.dispatch(view.state.tr.lift(range, target));
  return true;
}

function deleteBodyRow(ctx: Ctx): boolean {
  const view = ctx.get(editorViewCtx);
  if (!isInTable(view.state)) return false;
  if (selectedRect(view.state).top === 0) throw new Error('Markdown 表格必须保留表头；可以修改表头内容');
  return deleteRow(view.state, view.dispatch);
}

const ACTIONS = {
  bold: (ctx: Ctx) => ctx.get(commandsCtx).call(toggleStrongCommand.key),
  italic: (ctx: Ctx) => ctx.get(commandsCtx).call(toggleEmphasisCommand.key),
  strike: (ctx: Ctx) => ctx.get(commandsCtx).call(toggleStrikethroughCommand.key),
  inlineCode: (ctx: Ctx) => ctx.get(commandsCtx).call(toggleInlineCodeCommand.key),
  bullet: (ctx: Ctx) => toggleList(ctx, 'bullet_list'),
  ordered: (ctx: Ctx) => toggleList(ctx, 'ordered_list'),
  task: toggleTask,
  quote: toggleQuote,
  code: (ctx: Ctx) => ctx.get(editorViewCtx).state.selection.$from.parent.type.spec.code
    ? ctx.get(commandsCtx).call(turnIntoTextCommand.key)
    : ctx.get(commandsCtx).call(createCodeBlockCommand.key, 'javascript'),
  table: (ctx: Ctx) => ctx.get(commandsCtx).call(insertTableCommand.key, { row: DEFAULT_TABLE_ROWS, col: DEFAULT_TABLE_COLUMNS }),
  addRow: (ctx: Ctx) => ctx.get(commandsCtx).call(addRowAfterCommand.key),
  addColumn: (ctx: Ctx) => ctx.get(commandsCtx).call(addColAfterCommand.key),
  deleteRow: deleteBodyRow,
  deleteColumn: (ctx: Ctx) => { const view = ctx.get(editorViewCtx); return deleteColumn(view.state, view.dispatch); },
  undo: (ctx: Ctx) => ctx.get(commandsCtx).call(undoCommand.key),
  redo: (ctx: Ctx) => ctx.get(commandsCtx).call(redoCommand.key),
};

export type EditorAction = keyof typeof ACTIONS;

function perform(editor: Editor, action: (ctx: Ctx) => boolean): void {
  if (editor.status !== EditorStatus.Created) throw new Error('编辑器尚未准备就绪');
  editor.action(ctx => {
    const view = ctx.get(editorViewCtx);
    if (!view.editable || view.composing) throw new Error('请先结束输入，再修改格式');
    view.dispatch(closeHistory(view.state.tr));
    if (!action(ctx)) throw new Error('当前选择范围不适用此操作');
    view.dispatch(closeHistory(view.state.tr));
    view.focus();
  });
}

export function runEditorAction(editor: Editor, action: EditorAction): void {
  perform(editor, ACTIONS[action]);
}

export function setHeading(editor: Editor, level: number): void {
  if (!Number.isInteger(level) || level < 0 || level > MAX_HEADING_LEVEL) throw new Error('标题级别无效');
  perform(editor, ctx => ctx.get(commandsCtx).call(wrapInHeadingCommand.key, level));
}

export function setCodeLanguage(editor: Editor, language: string): void {
  perform(editor, ctx => {
    const view = ctx.get(editorViewCtx);
    if (view.state.selection.$from.parent.type.name !== 'code_block') return false;
    view.dispatch(view.state.tr.setNodeMarkup(view.state.selection.$from.before(), undefined, { language }));
    return true;
  });
}

export function insertLink(editor: Editor, value: string): void {
  const href = value.trim();
  if (!href || /[\u0000-\u0020]/.test(href)) throw new Error('请输入有效链接地址');
  const url = new URL(href, URL_VALIDATION_BASE);
  if (!LINK_PROTOCOLS.includes(url.protocol)) throw new Error('链接仅支持 http、https、mailto 或相对地址');
  perform(editor, ctx => {
    const view = ctx.get(editorViewCtx);
    const { from, to, empty } = view.state.selection;
    const mark = view.state.schema.marks.link;
    if (view.state.selection.$from.parent.type.spec.code) return false;
    const tr = view.state.tr;
    if (empty) tr.insertText(href);
    tr.addMark(from, empty ? from + href.length : to, mark.create({ href }));
    tr.removeStoredMark(mark);
    if (empty) tr.setSelection(TextSelection.create(tr.doc, from + href.length));
    view.dispatch(tr);
    return true;
  });
}

function imageAttributes(value: { src: string; alt?: string }) {
  if (typeof value.src !== 'string') throw new TypeError('图片地址必须是文本');
  const src = value.src.trim();
  const alt = value.alt ?? '';
  if (!src || /[\u0000-\u001f\u007f\\]/.test(src)) throw new Error('请输入有效图片地址，路径使用 / 分隔');
  if (typeof alt !== 'string' || /[\u0000-\u001f\u007f]/.test(alt)) throw new Error('图片替代文字必须是单行文本');
  const url = new URL(src, URL_VALIDATION_BASE);
  if (!IMAGE_PROTOCOLS.includes(url.protocol)) throw new Error('图片地址仅支持 HTTP、HTTPS 或相对路径');
  return { src, alt };
}

export function insertImage(editor: Editor, value: { src: string; alt?: string }): void {
  const attributes = imageAttributes(value);
  perform(editor, ctx => {
    if (isCodeSelection(ctx.get(editorViewCtx))) return false;
    return ctx.get(commandsCtx).call(insertImageCommand.key, attributes);
  });
}

export function readToolbarState(editor: Editor | undefined) {
  if (!editor || editor.status !== EditorStatus.Created) return null;
  const view = editor.ctx.get(editorViewCtx);
  const state = view.state;
  const active = (name: string) => {
    const mark = state.schema.marks[name];
    if (!mark) return false;
    return state.selection.empty ? !!mark.isInSet(state.storedMarks ?? state.selection.$from.marks())
      : state.doc.rangeHasMark(state.selection.from, state.selection.to, mark);
  };
  const parent = state.selection.$from.parent;
  const inTable = isInTable(state);
  return { inTable, canDeleteRow: inTable && selectedRect(state).top > 0,
    inCode: parent.type.name === 'code_block', selectionEmpty: state.selection.empty,
    heading: parent.type.name === 'heading' ? Number(parent.attrs.level) : 0,
    language: parent.type.name === 'code_block' ? String(parent.attrs.language) : '',
    canUndo: undoDepth(state) > 0, canRedo: redoDepth(state) > 0,
    bold: active('strong'), italic: active('emphasis'), strike: active('strike_through'),
    inlineCode: active('inlineCode'), editable: view.editable };
}

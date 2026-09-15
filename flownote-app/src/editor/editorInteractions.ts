import type { Ctx } from '@milkdown/ctx';
import { commandsCtx, editorViewOptionsCtx } from '@milkdown/core';
import { TextSelection } from '@milkdown/prose/state';
import { joinTextblockBackward } from '@milkdown/prose/commands';
import type { EditorView } from '@milkdown/prose/view';
import { isInTable } from '@milkdown/prose/tables';
import { addRowAfterCommand, goToNextTableCellCommand, goToPrevTableCellCommand } from '@milkdown/preset-gfm';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { $prose } from '@milkdown/utils';

export const EDITOR_STATE_EVENT = 'flownote-editor-state';
export const editorStateEvents = $prose(() => new Plugin({
  key: new PluginKey('flownote-editor-state'),
  view: view => ({ update: (_view, previous) => view.dom.dispatchEvent(new CustomEvent(EDITOR_STATE_EVENT, {
    bubbles: true, detail: { docChanged: !view.state.doc.eq(previous.doc) },
  })) }),
}));

const CODE_INDENT = '  ';
const CODE_OUTDENT = /^( {1,2}|\t)/;

function indentCode({ view, outdent }: { view: EditorView; outdent: boolean }): boolean {
  const { selection, tr } = view.state;
  const { $from, $to, from, to, empty } = selection;
  if (!$from.sameParent($to) || !$from.parent.type.spec.code) return false;
  if (empty && !outdent) {
    view.dispatch(tr.insertText(CODE_INDENT).scrollIntoView());
    return true;
  }
  const text = $from.parent.textContent;
  const start = $from.start();
  const offset = from - start;
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const endOffset = !empty && text[to - start - 1] === '\n' ? to - start - 1 : to - start;
  const nextBreak = text.indexOf('\n', endOffset);
  const lineEnd = nextBreak < 0 ? text.length : nextBreak;
  const original = text.slice(lineStart, lineEnd);
  const lines = original.split('\n');
  const changed = lines.map(line => outdent ? line.replace(CODE_OUTDENT, '') : CODE_INDENT + line);
  const replacement = changed.join('\n');
  const firstDelta = changed[0].length - lines[0].length;
  const totalDelta = replacement.length - original.length;
  tr.insertText(replacement, start + lineStart, start + lineEnd);
  const selectionFrom = Math.max(start + lineStart, from + firstDelta);
  const selectionTo = empty ? selectionFrom : Math.max(selectionFrom, to + totalDelta);
  tr.setSelection(TextSelection.create(tr.doc, selectionFrom, selectionTo));
  view.dispatch(tr.scrollIntoView());
  return true;
}

function moveTableCell(ctx: Ctx, backwards: boolean): boolean {
  const commands = ctx.get(commandsCtx);
  if (backwards) {
    commands.call(goToPrevTableCellCommand.key);
    return true;
  }
  if (commands.call(goToNextTableCellCommand.key)) return true;
  if (commands.call(addRowAfterCommand.key)) commands.call(goToNextTableCellCommand.key);
  return true;
}

function joinListParagraphs(view: EditorView): boolean {
  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || !selection.empty) return false;
  const { $from } = selection;
  if ($from.depth < 3 || $from.parentOffset !== 0 || $from.parent.type.name !== 'paragraph') return false;
  const itemDepth = $from.depth - 1;
  if ($from.node(itemDepth).type.name !== 'list_item' || $from.index(itemDepth) !== 0) return false;
  const previous = $from.node(itemDepth - 1).maybeChild($from.index(itemDepth - 1) - 1);
  if (previous?.lastChild?.type.name !== 'paragraph') return false;
  return joinTextblockBackward(view.state, view.dispatch, view);
}

function keyboardBlocked(view: EditorView, event: KeyboardEvent): boolean {
  return !view.editable || view.composing || event.isComposing || event.ctrlKey || event.metaKey || event.altKey;
}

function handleKey({ ctx, view, event }: { ctx: Ctx; view: EditorView; event: KeyboardEvent }): boolean {
  if (keyboardBlocked(view, event)) return false;
  if (event.key === 'Backspace' && joinListParagraphs(view)) return true;
  if (event.key !== 'Tab') return false;
  if (indentCode({ view, outdent: event.shiftKey })) return true;
  if (isInTable(view.state)) return moveTableCell(ctx, event.shiftKey);
  return false;
}

export function configureEditorInteractions(ctx: Ctx): void {
  ctx.update(editorViewOptionsCtx, previous => ({
    ...previous,
    attributes: state => ({
      ...(typeof previous.attributes === 'function' ? previous.attributes(state) : previous.attributes),
      role: 'textbox', 'aria-label': 'Markdown 正文', 'aria-multiline': 'true',
    }),
    handleKeyDown(view, event) {
      return handleKey({ ctx, view, event }) || previous.handleKeyDown?.call(previous, view, event);
    },
  }));
}

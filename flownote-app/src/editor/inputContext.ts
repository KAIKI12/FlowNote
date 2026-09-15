import type { Mark, ResolvedPos } from '@milkdown/prose/model';
import type { EditorView } from '@milkdown/prose/view';

export function inputMarks(view: EditorView, context: ResolvedPos = view.state.selection.$from): readonly Mark[] {
  const { selection, storedMarks } = view.state;
  if (context.pos !== selection.from) return context.marks();
  if (selection.empty) return storedMarks ?? context.marks();
  // Exclusive marks disappear at their boundary; replacement inherits the selected text.
  return context.nodeAfter?.marks ?? context.marks();
}

export function isCodeSelection(view: EditorView): boolean {
  return view.state.selection.$from.parent.type.spec.code === true
    || inputMarks(view).some(mark => mark.type.spec.code);
}

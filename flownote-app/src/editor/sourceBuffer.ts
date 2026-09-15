interface SourceEdit { from: number; before: string; after: string }
const MAX_UNDO_ENTRIES = 200;

export function displaySource(source: string): string {
  return source.replace(/\r\n?/g, '\n');
}

function rawOffset(source: string, offset: number): number {
  let raw = 0;
  for (let visible = 0; visible < offset; visible += 1) {
    if (source[raw] === '\r' && source[raw + 1] === '\n') raw += 1;
    raw += 1;
  }
  return raw;
}

function difference(before: string, after: string): SourceEdit {
  let start = 0;
  while (start < before.length && before[start] === after[start]) start += 1;
  let end = before.length;
  let nextEnd = after.length;
  while (end > start && nextEnd > start && before[end - 1] === after[nextEnd - 1]) {
    end -= 1;
    nextEnd -= 1;
  }
  return { from: start, before: before.slice(start, end), after: after.slice(start, nextEnd) };
}

export function applySourceEdit(source: string, display: string): string {
  const edit = difference(displaySource(source), displaySource(display));
  const start = rawOffset(source, edit.from);
  const end = rawOffset(source, edit.from + edit.before.length);
  const newline = source.match(/\r\n|\r|\n/)?.[0] ?? '\n';
  return source.slice(0, start) + edit.after.replace(/\n/g, newline) + source.slice(end);
}

export class SourceBuffer {
  private entries: SourceEdit[] = [];
  private cursor = 0;
  private compositionBase?: string;
  constructor(public value: string) {}

  edit(display: string): string {
    const next = applySourceEdit(this.value, display);
    if (next === this.value) return this.value;
    if (this.compositionBase === undefined) this.record(this.value, next);
    this.value = next;
    return next;
  }

  private record(before: string, after: string): void {
    this.entries = this.entries.slice(0, this.cursor);
    this.entries.push(difference(before, after));
    this.entries = this.entries.slice(-MAX_UNDO_ENTRIES);
    this.cursor = this.entries.length;
  }

  beginComposition(): void {
    this.compositionBase = this.value;
  }

  endComposition(): void {
    const before = this.compositionBase;
    this.compositionBase = undefined;
    if (before !== undefined && before !== this.value) this.record(before, this.value);
  }

  undo(redo = false): string {
    const edit = this.entries[redo ? this.cursor : this.cursor - 1];
    if (!edit) return this.value;
    const removed = redo ? edit.before : edit.after;
    const inserted = redo ? edit.after : edit.before;
    this.value = this.value.slice(0, edit.from) + inserted + this.value.slice(edit.from + removed.length);
    this.cursor += redo ? 1 : -1;
    return this.value;
  }
}

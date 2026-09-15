import type { NoteStructure } from './noteTypes';

const DEFAULT_AUTOSAVE_DELAY_MS = 500;

/**
 * 保存 Note 到磁盘
 */
export async function saveNote(note: NoteStructure): Promise<void> {
  throw new Error(`Note 包保存尚未实现：${note.path}。普通 Markdown 请通过文件工具栏保存。`);
}

/**
 * 保留旧调用签名；自动保存接入之前，调用者必须处理明确的未实现错误。
 */
export class AutoSaver {
  constructor(_delay: number = DEFAULT_AUTOSAVE_DELAY_MS) {}

  schedule(_note: NoteStructure): void {
    throw new Error('自动保存尚未实现，请手动保存当前笔记');
  }

  flush(_note: NoteStructure): void {
    throw new Error('自动保存尚未实现，请手动保存当前笔记');
  }

  cancel(): void { /* No automatic save is scheduled while the feature is unavailable. */ }
}

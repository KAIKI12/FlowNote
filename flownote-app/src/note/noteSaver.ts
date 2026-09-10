import { NoteStructure } from './noteTypes';

/**
 * 保存 Note 到磁盘
 */
export async function saveNote(note: NoteStructure): Promise<void> {
  console.log('保存 Note:', note.path);
  // TODO: 使用 Tauri 文件系统 API
  // 1. 保存 note.json
  // 2. 保存 content.md
  // 3. 保存 blocks/*.html
}

/**
 * Debounced 自动保存
 */
export class AutoSaver {
  private timeoutId: number | null = null;
  private delay: number;

  constructor(delay: number = 500) {
    this.delay = delay;
  }

  schedule(note: NoteStructure): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
    }

    this.timeoutId = window.setTimeout(() => {
      saveNote(note);
      this.timeoutId = null;
    }, this.delay);
  }

  flush(note: NoteStructure): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    saveNote(note);
  }

  cancel(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}

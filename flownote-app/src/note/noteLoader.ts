import type { NoteStructure } from './noteTypes';

/**
 * 从磁盘加载 Note
 */
export async function loadNote(notePath: string): Promise<NoteStructure> {
  throw new Error(`Note 包加载尚未实现：${notePath}。普通 Markdown 请通过文件工具栏打开。`);
}

/**
 * 解析 content.md 中的 HTML Block 引用
 */
export function parseHtmlBlockRefs(markdown: string): string[] {
  const regex = /```flownote-html\s*\n\s*{"id":"([^"]+)"}\s*\n```/g;
  const ids: string[] = [];
  let match;

  while ((match = regex.exec(markdown)) !== null) {
    ids.push(match[1]);
  }

  return ids;
}

/**
 * 生成新的 HTML Block ID
 */
export function generateHtmlBlockId(existingIds: string[]): string {
  let counter = 1;
  while (existingIds.includes(`html_${String(counter).padStart(3, '0')}`)) {
    counter++;
  }
  return `html_${String(counter).padStart(3, '0')}`;
}

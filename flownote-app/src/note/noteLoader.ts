import { NoteStructure, NoteMetadata } from './noteTypes';

/**
 * 从磁盘加载 Note
 */
export async function loadNote(notePath: string): Promise<NoteStructure> {
  // TODO: 使用 Tauri 文件系统 API
  // 目前返回模拟数据

  const metadata: NoteMetadata = {
    version: 1,
    title: 'Test Note',
    type: 'mixed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    path: notePath,
    metadata,
    contentMd: '# 欢迎使用 FlowNote\n\n这是一个测试笔记。',
    htmlBlocks: new Map(),
    assets: [],
  };
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

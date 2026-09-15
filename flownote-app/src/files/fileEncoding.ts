import { MarkdownFileError } from './fileTypes';
import { applySourceEdit, displaySource } from '../editor/sourceBuffer';

export const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024;

export function validateFileName(name: string): void {
  if (!/\.(md|markdown)$/i.test(name)) throw new MarkdownFileError('invalidPath', '请选择 .md 或 .markdown 文件');
}

export function markdownBytes(content: string): Uint8Array {
  const bytes = new TextEncoder().encode(content);
  if (bytes.length > MAX_MARKDOWN_BYTES) throw new MarkdownFileError('tooLarge', 'Markdown 文件不能超过 2 MiB');
  if (content.includes('\0')) throw new MarkdownFileError('encoding', 'Markdown 包含 NUL 字节，不能作为文本文件处理');
  if (new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes) !== content) {
    throw new MarkdownFileError('encoding', 'Markdown 包含无法编码为 UTF-8 的字符');
  }
  return bytes;
}

export function decodeMarkdown(bytes: ArrayBuffer): string {
  let content: string;
  try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch (cause) { throw new MarkdownFileError('encoding', `文件不是有效 UTF-8：${String(cause)}`); }
  markdownBytes(content);
  return content;
}

export async function contentRevision(content: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(markdownBytes(content)).buffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function contentForFile(content: string, original?: string): string {
  if (original === undefined) return content;
  const withBom = original.startsWith('\uFEFF') && !content.startsWith('\uFEFF') ? '\uFEFF' + content : content;
  return applySourceEdit(original, displaySource(withBom));
}

export function readBrowserMarkdown(file: File): Promise<string> {
  validateFileName(file.name);
  if (file.size > MAX_MARKDOWN_BYTES) return Promise.reject(new MarkdownFileError('tooLarge', 'Markdown 文件不能超过 2 MiB'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        if (!reader.result || typeof reader.result === 'string') throw new MarkdownFileError('io', '读取文件字节失败');
        resolve(decodeMarkdown(reader.result));
      } catch (cause) { reject(cause); }
    };
    reader.onerror = () => reject(reader.error ?? new MarkdownFileError('io', '读取文件失败'));
    reader.onabort = () => reject(new MarkdownFileError('cancelled', '文件读取已取消'));
    reader.readAsArrayBuffer(file);
  });
}

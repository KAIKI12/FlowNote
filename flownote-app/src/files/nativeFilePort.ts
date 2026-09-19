import { invoke } from '@tauri-apps/api/core';
import { fileError, MarkdownFileError } from './fileTypes';
import type { MarkdownFile, MarkdownFileAsset, MarkdownFilePort } from './fileTypes';
import { markdownBytes } from './fileEncoding';

export type FileInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

function fileAsset(value: unknown): MarkdownFileAsset {
  if (!value || typeof value !== 'object') throw new MarkdownFileError('protocol', 'Markdown 资源服务返回了无效结果');
  const asset = value as Record<string, unknown>;
  if (typeof asset.path !== 'string' || typeof asset.mime !== 'string' || !Array.isArray(asset.bytes)
    || !asset.bytes.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    throw new MarkdownFileError('protocol', 'Markdown 资源服务响应字段不完整');
  }
  return { path: asset.path, mime: asset.mime, bytes: asset.bytes as number[] };
}

function fileSnapshot(value: unknown): MarkdownFile {
  if (!value || typeof value !== 'object') throw new MarkdownFileError('protocol', '文件服务返回了无效结果');
  const file = value as Record<string, unknown>;
  const strings = ['id', 'path', 'name', 'content', 'revision'];
  if (!strings.every(key => typeof file[key] === 'string') || typeof file.readOnly !== 'boolean') {
    throw new MarkdownFileError('protocol', '文件服务响应字段不完整');
  }
  markdownBytes(file.content as string);
  return file as unknown as MarkdownFile;
}

export function createNativeFilePort(call: FileInvoke = invoke): MarkdownFilePort {
  const request = async (command: string, args?: Record<string, unknown>): Promise<unknown> => {
    try { return await call(command, args); }
    catch (cause) { throw fileError(cause); }
  };
  return { mode: 'desktop', canWrite: true,
    async open() {
      const result = await request('markdown_open');
      return result === null ? null : fileSnapshot(result);
    },
    async openWorkspace(relativePath) {
      return fileSnapshot(await request('markdown_open_workspace', { request: { relativePath } }));
    },
    async save(value) {
      markdownBytes(value.content);
      return fileSnapshot(await request('markdown_save', { request: value }));
    },
    async saveAs(value) {
      markdownBytes(value.content);
      const result = await request('markdown_save_as', { request: value });
      return result === null ? null : fileSnapshot(result);
    },
    async reload(id) { return fileSnapshot(await request('markdown_reload', { id })); },
    async readAsset(id, path) { return fileAsset(await request('markdown_read_asset', { request: { id, path } })); },
    async release(id) { await request('markdown_release', { id }); },
  };
}

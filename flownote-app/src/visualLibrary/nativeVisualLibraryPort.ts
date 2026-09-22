import { invoke } from '@tauri-apps/api/core';
import { fileError, MarkdownFileError } from '../files/fileTypes';
import { validBlockId, validateHtmlSource } from '../note/htmlBlockData';
import type { HtmlBlockConfig } from '../note/mixedTypes';
import type { BlockAsset } from '../note/nativeNotePort';
import type { VisualLibraryItem, VisualLibraryPackage, VisualLibraryPort } from './types';

type VisualInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

function protocol(message: string): never {
  throw new MarkdownFileError('protocol', message);
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) protocol(`Visual Library ${label} 响应格式无效`);
  return value as Record<string, unknown>;
}

function config(value: unknown): HtmlBlockConfig {
  const item = object(value, 'config');
  const viewport = object(item.viewport, 'viewport');
  if (item.kind !== 'html' || !['fragment', 'document'].includes(String(item.inputKind))
    || !['off', 'sandbox'].includes(String(item.scriptPolicy))
    || !Number.isInteger(viewport.heightPx) || Number(viewport.heightPx) <= 0) {
    protocol('Visual Library config 字段不完整');
  }
  return item as unknown as HtmlBlockConfig;
}

function asset(value: unknown): BlockAsset {
  const item = object(value, 'asset');
  if (typeof item.path !== 'string' || typeof item.mime !== 'string' || !Array.isArray(item.bytes)
    || !item.bytes.every(byte => Number.isInteger(byte) && Number(byte) >= 0 && Number(byte) <= 255)) {
    protocol('Visual Library asset 字段不完整');
  }
  return { path: item.path as string, mime: item.mime as string, bytes: item.bytes as number[] };
}

function visual(value: unknown): VisualLibraryItem {
  const item = object(value, 'item');
  if (!validBlockId(item.id) || typeof item.title !== 'string' || !item.title.trim()
    || !Number.isInteger(item.createdAtMs) || !Number.isInteger(item.updatedAtMs)
    || typeof item.html !== 'string' || !Number.isInteger(item.assetCount) || Number(item.assetCount) < 0) {
    protocol('Visual Library item 字段不完整');
  }
  validateHtmlSource(item.html);
  return {
    id: item.id as string,
    title: item.title as string,
    createdAtMs: Number(item.createdAtMs),
    updatedAtMs: Number(item.updatedAtMs),
    html: item.html as string,
    config: config(item.config),
    assetCount: Number(item.assetCount),
  };
}

function packageValue(value: unknown): VisualLibraryPackage {
  const item = object(value, 'package');
  if (typeof item.originalHtml !== 'string' || !Array.isArray(item.assets)) protocol('Visual Library package 字段不完整');
  validateHtmlSource(item.originalHtml);
  return { item: visual(item.item), originalHtml: item.originalHtml as string, assets: item.assets.map(asset) };
}

export function createNativeVisualLibraryPort(call: VisualInvoke = invoke): VisualLibraryPort {
  const request = async (command: string, args?: Record<string, unknown>) => {
    try { return await call(command, args); }
    catch (cause) { throw fileError(cause); }
  };
  return {
    async list() {
      const value = await request('visual_library_list');
      if (!Array.isArray(value)) protocol('Visual Library list 响应格式无效');
      return value.map(visual);
    },
    async collect(value) {
      return visual(await request('visual_library_collect', { request: value }));
    },
    async load(id) {
      if (!validBlockId(id)) protocol('Visual Library item ID 无效');
      return packageValue(await request('visual_library_package', { request: { id } }));
    },
    async readAsset(id, path) {
      if (!validBlockId(id)) protocol('Visual Library item ID 无效');
      return asset(await request('visual_library_read_asset', { request: { id, path } }));
    },
  };
}

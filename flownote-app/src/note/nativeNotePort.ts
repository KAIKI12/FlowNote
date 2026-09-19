import { invoke } from '@tauri-apps/api/core';
import { markdownBytes } from '../files/fileEncoding';
import { fileError, MarkdownFileError } from '../files/fileTypes';
import { validBlockId, validateHtmlSource } from './htmlBlockData';
import type { HtmlBlockConfig, HtmlBlockData, MixedNoteData } from './mixedTypes';

export type NoteInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

export interface NoteSnapshot {
  id: string;
  path: string;
  name: string;
  content: string;
  revision: string;
  readOnly: boolean;
  notice?: string;
  diagnostics?: NoteDiagnostic[];
  mixed: { metadata: Record<string, unknown>; blocks: HtmlBlockData[] };
}

export interface BlockCopyRequest { sourceId: string; targetId: string }
export interface NoteSaveRequest { id: string; revision: string; content: string; mixed: MixedNoteData; blockCopies?: BlockCopyRequest[] }
export interface NoteProbe { revision: string; changed: boolean }
export interface NoteDiagnostic { kind: string; blockId?: string; message: string }
export interface NoteAssetData { path: string; bytes: number[] }
export interface NoteSaveAsRequest { name: string; content: string; mixed: MixedNoteData; sourceId?: string; assets?: NoteAssetData[] }
export interface BlockAsset { path: string; mime: string; bytes: number[] }

export interface NativeNotePort {
  readonly mode: 'desktop';
  readonly canWrite: true;
  open(): Promise<NoteSnapshot | null>;
  openWorkspace?(relativePath: string): Promise<NoteSnapshot>;
  save(request: NoteSaveRequest): Promise<NoteSnapshot>;
  saveAs(request: NoteSaveAsRequest): Promise<NoteSnapshot | null>;
  reload(id: string): Promise<NoteSnapshot>;
  probe?(id: string): Promise<NoteProbe>;
  repairRemoveReference?(id: string, revision: string, blockId: string): Promise<NoteSnapshot>;
  repairRestoreOrphan?(id: string, revision: string, blockId: string): Promise<NoteSnapshot>;
  readAsset(id: string, blockId: string, path: string): Promise<BlockAsset>;
  readNoteImage(id: string, path: string): Promise<BlockAsset>;
  release(id: string): Promise<void>;
}

function protocol(message: string): never {
  throw new MarkdownFileError('protocol', message);
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) protocol(`${name} 字段格式无效`);
  return value as Record<string, unknown>;
}

function blockConfig(value: unknown): HtmlBlockConfig {
  const config = object(value, 'block.json');
  const viewport = object(config.viewport, 'viewport');
  const height = viewport.heightPx;
  if (config.kind !== 'html' || !['fragment', 'document'].includes(String(config.inputKind))
    || !['off', 'sandbox'].includes(String(config.scriptPolicy)) || !Number.isInteger(height) || Number(height) <= 0) {
    protocol('HTML Block 配置字段不完整');
  }
  return config as unknown as HtmlBlockConfig;
}

function htmlBlock(value: unknown): HtmlBlockData {
  const block = object(value, 'HTML Block');
  if (!validBlockId(block.id) || typeof block.html !== 'string' || typeof block.originalHtml !== 'string') {
    protocol('HTML Block 字段不完整');
  }
  validateHtmlSource(block.html);
  validateHtmlSource(block.originalHtml);
  return { id: block.id, html: block.html, originalHtml: block.originalHtml, config: blockConfig(block.config) };
}

function mixedSnapshot(value: unknown, readOnly: boolean): NoteSnapshot['mixed'] {
  const mixed = object(value, 'Mixed Note');
  const metadata = object(mixed.metadata, 'Note metadata');
  const version = metadata.formatVersion;
  if (!Number.isInteger(version) || Number(version) <= 0 || !Array.isArray(mixed.blocks)) protocol('Note metadata 格式无效');
  if (version !== 1) {
    if (!readOnly) protocol('未知 Note 格式版本必须只读打开');
    return { metadata, blocks: [] };
  }
  if (metadata.type !== 'mixed' || !['title', 'createdAt', 'updatedAt'].every(key => typeof metadata[key] === 'string')) {
    protocol('Note metadata 字段不完整');
  }
  const blocks = mixed.blocks.map(htmlBlock);
  if (new Set(blocks.map(block => block.id)).size !== blocks.length) protocol('HTML Block ID 重复');
  return { metadata, blocks };
}

function blockAsset(value: unknown): BlockAsset {
  const asset = object(value, 'Block asset');
  if (typeof asset.path !== 'string' || typeof asset.mime !== 'string' || !Array.isArray(asset.bytes)
    || !asset.bytes.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    protocol('Block asset 响应字段不完整');
  }
  return { path: asset.path as string, mime: asset.mime as string, bytes: asset.bytes as number[] };
}

function noteProbe(value: unknown): NoteProbe {
  const probe = object(value, 'Note probe');
  if (typeof probe.revision !== 'string' || typeof probe.changed !== 'boolean') protocol('Note probe 响应字段不完整');
  return { revision: probe.revision as string, changed: probe.changed as boolean };
}

function noteDiagnostics(value: unknown): NoteDiagnostic[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) protocol('Note diagnostics 字段格式无效');
  return value.map(item => {
    const diagnostic = object(item, 'Note diagnostic');
    if (typeof diagnostic.kind !== 'string' || typeof diagnostic.message !== 'string'
      || diagnostic.blockId !== undefined && typeof diagnostic.blockId !== 'string') protocol('Note diagnostic 字段不完整');
    return { kind: diagnostic.kind as string, message: diagnostic.message as string, blockId: diagnostic.blockId as string | undefined };
  });
}

function noteSnapshot(value: unknown): NoteSnapshot {
  const file = object(value, 'Note');
  const strings = ['id', 'path', 'name', 'content', 'revision'];
  if (!strings.every(key => typeof file[key] === 'string') || typeof file.readOnly !== 'boolean'
    || file.notice !== undefined && typeof file.notice !== 'string') protocol('Note 服务响应字段不完整');
  markdownBytes(file.content as string);
  return {
    id: file.id as string, path: file.path as string, name: file.name as string, content: file.content as string,
    revision: file.revision as string, readOnly: file.readOnly as boolean, notice: file.notice as string | undefined,
    diagnostics: noteDiagnostics(file.diagnostics), mixed: mixedSnapshot(file.mixed, file.readOnly as boolean),
  };
}

export function createNativeNotePort(call: NoteInvoke = invoke): NativeNotePort {
  const request = async (command: string, args?: Record<string, unknown>): Promise<unknown> => {
    try { return await call(command, args); }
    catch (cause) { throw fileError(cause); }
  };
  return { mode: 'desktop', canWrite: true,
    async open() {
      const result = await request('note_open');
      return result === null ? null : noteSnapshot(result);
    },
    async openWorkspace(relativePath) {
      return noteSnapshot(await request('note_open_workspace', { request: { relativePath } }));
    },
    async save(value) {
      markdownBytes(value.content);
      return noteSnapshot(await request('note_save', { request: value }));
    },
    async saveAs(value) {
      markdownBytes(value.content);
      const result = await request('note_save_as', { request: value });
      return result === null ? null : noteSnapshot(result);
    },
    async reload(id) { return noteSnapshot(await request('note_reload', { id })); },
    async probe(id) { return noteProbe(await request('note_probe', { id })); },
    async repairRemoveReference(id, revision, blockId) {
      if (!validBlockId(blockId)) protocol('Repair 使用了无效 Block ID');
      return noteSnapshot(await request('note_repair_remove_reference', { request: { id, revision, blockId } }));
    },
    async repairRestoreOrphan(id, revision, blockId) {
      if (!validBlockId(blockId)) protocol('Repair 使用了无效 Block ID');
      return noteSnapshot(await request('note_repair_restore_orphan', { request: { id, revision, blockId } }));
    },
    async readAsset(id, blockId, path) {
      if (!validBlockId(blockId)) protocol('Block asset 使用了无效 Block ID');
      return blockAsset(await request('note_read_asset', { request: { id, blockId, path } }));
    },
    async readNoteImage(id, path) { return blockAsset(await request('note_read_image', { request: { id, path } })); },
    async release(id) { await request('note_release', { id }); },
  };
}

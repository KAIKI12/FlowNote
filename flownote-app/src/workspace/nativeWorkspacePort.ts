import { invoke } from '@tauri-apps/api/core';
import { fileError, MarkdownFileError } from '../files/fileTypes';
import type {
  WorkspaceEntry, WorkspaceEntryKind, WorkspaceMutation, WorkspacePort,
  WorkspaceSearchResult, WorkspaceSnapshot, WorkspaceTrashItem,
} from './workspaceTypes';

export type WorkspaceInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MarkdownFileError('protocol', `Workspace ${label} 响应格式无效`);
  }
  return value as Record<string, unknown>;
}

function relativePath(value: unknown): string {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') || value.startsWith('/')) {
    throw new MarkdownFileError('protocol', 'Workspace 相对路径响应无效');
  }
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || part.includes(':'))) {
    throw new MarkdownFileError('protocol', 'Workspace 相对路径响应无效');
  }
  return value;
}

function kind(value: unknown): WorkspaceEntryKind {
  if (value === 'folder' || value === 'markdown' || value === 'note') return value;
  throw new MarkdownFileError('protocol', 'Workspace 条目 kind 无效');
}

function entry(value: unknown): WorkspaceEntry {
  const item = object(value, '条目');
  if (typeof item.name !== 'string' || !Array.isArray(item.children)) {
    throw new MarkdownFileError('protocol', 'Workspace 条目字段不完整');
  }
  const parsedKind = kind(item.kind);
  const children = item.children.map(entry);
  if (parsedKind !== 'folder' && children.length) {
    throw new MarkdownFileError('protocol', 'Workspace 笔记条目不能包含 children');
  }
  return { name: item.name, relativePath: relativePath(item.relativePath), kind: parsedKind, children };
}

export function workspaceSnapshot(value: unknown): WorkspaceSnapshot {
  const snapshot = object(value, '快照');
  if (typeof snapshot.workspaceId !== 'string' || !snapshot.workspaceId
    || typeof snapshot.name !== 'string' || !Array.isArray(snapshot.entries)) {
    throw new MarkdownFileError('protocol', 'Workspace 快照字段不完整');
  }
  return { workspaceId: snapshot.workspaceId, name: snapshot.name, entries: snapshot.entries.map(entry) };
}

function mutation(value: unknown): WorkspaceMutation {
  const result = object(value, '变更');
  return { relativePath: relativePath(result.relativePath) };
}

function trashId(value: unknown): string {
  if (typeof value !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new MarkdownFileError('protocol', 'Workspace Trash ID 无效');
  }
  return value.toLowerCase();
}

function trashItem(value: unknown): WorkspaceTrashItem {
  const item = object(value, 'Trash');
  const parsedKind = kind(item.kind);
  if (typeof item.name !== 'string' || !item.name
    || typeof item.deletedAtMs !== 'number' || !Number.isSafeInteger(item.deletedAtMs) || item.deletedAtMs < 0) {
    throw new MarkdownFileError('protocol', 'Workspace Trash 响应字段不完整');
  }
  return {
    id: trashId(item.id),
    originalRelativePath: relativePath(item.originalRelativePath),
    name: item.name,
    kind: parsedKind,
    deletedAtMs: item.deletedAtMs,
  };
}

function searchResult(value: unknown): WorkspaceSearchResult {
  const result = object(value, '搜索');
  const parsedKind = kind(result.kind);
  if (parsedKind === 'folder' || typeof result.title !== 'string' || typeof result.snippet !== 'string') {
    throw new MarkdownFileError('protocol', 'Workspace 搜索结果字段不完整');
  }
  return {
    relativePath: relativePath(result.relativePath),
    kind: parsedKind,
    title: result.title,
    snippet: result.snippet,
  };
}

export function createNativeWorkspacePort(call: WorkspaceInvoke = invoke): WorkspacePort {
  const request = async (command: string, args?: Record<string, unknown>) => {
    try { return await call(command, args); }
    catch (cause) { throw fileError(cause); }
  };
  return {
    async restore() {
      const result = await request('workspace_restore');
      return result === null ? null : workspaceSnapshot(result);
    },
    async pick() {
      const result = await request('workspace_pick');
      return result === null ? null : workspaceSnapshot(result);
    },
    async scan() { return workspaceSnapshot(await request('workspace_scan')); },
    async search(query) {
      const value = await request('workspace_search', { request: { query } });
      if (!Array.isArray(value)) throw new MarkdownFileError('protocol', 'Workspace 搜索响应格式无效');
      return value.map(searchResult);
    },
    async createMarkdown(folder) {
      return mutation(await request('workspace_create_markdown', { request: { folder } }));
    },
    async rename(path, newName) {
      return mutation(await request('workspace_rename', { request: { relativePath: path, newName } }));
    },
    async trash(path) {
      return trashItem(await request('workspace_trash', { request: { relativePath: path } }));
    },
    async listTrash() {
      const value = await request('workspace_trash_list');
      if (!Array.isArray(value)) throw new MarkdownFileError('protocol', 'Workspace Trash 列表响应格式无效');
      return value.map(trashItem);
    },
    async restoreTrash(id) {
      return mutation(await request('workspace_trash_restore', { request: { id: trashId(id) } }));
    },
    async deleteTrash(id) {
      await request('workspace_trash_delete', { request: { id: trashId(id) } });
    },
  };
}

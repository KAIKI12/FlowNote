import type { WorkspaceEntryKind } from './workspaceTypes';

const KEY = 'flownote.workspace.recent.v1';
const MAX_PER_WORKSPACE = 10;
const MAX_TOTAL = 80;

export interface WorkspaceRecentEntry {
  workspaceId: string;
  relativePath: string;
  kind: Exclude<WorkspaceEntryKind, 'folder'>;
  openedAt: number;
}

function validRelative(path: unknown): path is string {
  return typeof path === 'string' && !!path && !path.includes('\\') && !path.startsWith('/')
    && path.split('/').every(part => !!part && part !== '.' && part !== '..' && !part.includes(':'));
}

function readAll(storage: Storage = window.localStorage): WorkspaceRecentEntry[] {
  try {
    const raw = JSON.parse(storage.getItem(KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item): WorkspaceRecentEntry[] => {
      if (!item || typeof item !== 'object') return [];
      const value = item as Record<string, unknown>;
      if (typeof value.workspaceId !== 'string' || !validRelative(value.relativePath)
        || !['markdown', 'note'].includes(String(value.kind)) || typeof value.openedAt !== 'number') return [];
      return [{ workspaceId: value.workspaceId, relativePath: value.relativePath,
        kind: value.kind as 'markdown' | 'note', openedAt: value.openedAt }];
    });
  } catch { return []; }
}

function writeAll(entries: WorkspaceRecentEntry[], storage: Storage = window.localStorage): void {
  storage.setItem(KEY, JSON.stringify(entries.slice(0, MAX_TOTAL)));
}

export function loadRecent(workspaceId: string, storage: Storage = window.localStorage): WorkspaceRecentEntry[] {
  return readAll(storage).filter(entry => entry.workspaceId === workspaceId)
    .sort((a, b) => b.openedAt - a.openedAt).slice(0, MAX_PER_WORKSPACE);
}

export function recordRecent(
  workspaceId: string,
  entry: { relativePath: string; kind: 'markdown' | 'note' },
  openedAt = Date.now(),
  storage: Storage = window.localStorage,
): void {
  if (!workspaceId || !validRelative(entry.relativePath)) return;
  const all = readAll(storage).filter(value =>
    !(value.workspaceId === workspaceId && value.relativePath === entry.relativePath));
  all.unshift({ workspaceId, relativePath: entry.relativePath, kind: entry.kind, openedAt });
  const perWorkspace = new Map<string, number>();
  writeAll(all.filter(value => {
    const count = perWorkspace.get(value.workspaceId) ?? 0;
    if (count >= MAX_PER_WORKSPACE) return false;
    perWorkspace.set(value.workspaceId, count + 1);
    return true;
  }), storage);
}

export function renameRecent(
  workspaceId: string,
  previous: string,
  next: string,
  storage: Storage = window.localStorage,
): void {
  if (!validRelative(next)) return;
  const prefix = previous + '/';
  const all = readAll(storage).map(entry => {
    if (entry.workspaceId !== workspaceId) return entry;
    if (entry.relativePath === previous) return { ...entry, relativePath: next };
    if (entry.relativePath.startsWith(prefix)) {
      return { ...entry, relativePath: next + entry.relativePath.slice(previous.length) };
    }
    return entry;
  });
  writeAll(all, storage);
}

export function removeRecent(
  workspaceId: string,
  relativePath: string,
  storage: Storage = window.localStorage,
): void {
  writeAll(readAll(storage).filter(entry =>
    !(entry.workspaceId === workspaceId && entry.relativePath === relativePath)), storage);
}

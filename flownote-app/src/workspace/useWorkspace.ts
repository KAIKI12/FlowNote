import { useEffect, useRef, useState } from 'react';
import { fileError, type MarkdownFileError } from '../files/fileTypes';
import { defaultWorkspacePort } from './defaultWorkspacePort';
import { loadRecent, recordRecent, removeRecent, renameRecent, type WorkspaceRecentEntry } from './workspaceRecent';
import type { WorkspaceEntry, WorkspacePort, WorkspaceSearchResult, WorkspaceSnapshot } from './workspaceTypes';

interface OpenWorkspaceEntry {
  (entry: WorkspaceEntry, onApplied: () => void): Promise<void>;
}

interface Options {
  port?: WorkspacePort | null;
  openEntry: OpenWorkspaceEntry;
}

export interface WorkspaceRecentView extends WorkspaceRecentEntry {
  available: boolean;
  name: string;
}

function leafName(relativePath: string): string {
  const parts = relativePath.split('/');
  return parts[parts.length - 1] ?? relativePath;
}

export function findWorkspaceEntry(entries: WorkspaceEntry[], relativePath: string): WorkspaceEntry | undefined {
  for (const entry of entries) {
    if (entry.relativePath === relativePath) return entry;
    if (entry.kind === 'folder') {
      const child = findWorkspaceEntry(entry.children, relativePath);
      if (child) return child;
    }
  }
  return undefined;
}

export function useWorkspace(options: Options) {
  const portRef = useRef<WorkspacePort | null>(options.port === undefined ? defaultWorkspacePort() : options.port);
  const openRef = useRef(options.openEntry);
  openRef.current = options.openEntry;
  const searchGeneration = useRef(0);
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [busy, setBusy] = useState<'restore' | 'pick' | 'scan' | 'search' | 'create' | 'rename' | 'delete' | null>(null);
  const [error, setError] = useState<MarkdownFileError | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WorkspaceSearchResult[]>([]);
  const [recent, setRecent] = useState<WorkspaceRecentEntry[]>([]);
  const [activeRelativePath, setActiveRelativePath] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const applySnapshot = (next: WorkspaceSnapshot | null) => {
    setSnapshot(next);
    setRecent(next ? loadRecent(next.workspaceId) : []);
    setSelectedFolder('');
    setExpanded(new Set());
    if (!next) {
      setActiveRelativePath(null);
      setQuery('');
      setResults([]);
    }
  };

  useEffect(() => {
    const port = portRef.current;
    if (!port) return;
    let active = true;
    setBusy('restore');
    void port.restore().then(value => {
      if (active) applySnapshot(value);
    }).catch(cause => {
      if (active) setError(fileError(cause));
    }).finally(() => { if (active) setBusy(null); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const port = portRef.current;
    const current = snapshot;
    const needle = query.trim();
    if (!port || !current || !needle) {
      searchGeneration.current += 1;
      setResults([]);
      return;
    }
    const generation = ++searchGeneration.current;
    setBusy(value => value && value !== 'search' ? value : 'search');
    const timer = setTimeout(() => {
      void port.search(needle).then(value => {
        if (generation === searchGeneration.current) setResults(value);
      }).catch(cause => {
        if (generation === searchGeneration.current) setError(fileError(cause));
      }).finally(() => {
        if (generation === searchGeneration.current) setBusy(value => value === 'search' ? null : value);
      });
    }, 80);
    return () => clearTimeout(timer);
  }, [query, snapshot?.workspaceId]);

  const pick = async (): Promise<WorkspaceSnapshot | null> => {
    const port = portRef.current;
    if (!port) { setError(fileError(new Error('Workspace 仅在桌面版可用'))); return null; }
    setBusy('pick'); setError(null);
    try {
      const value = await port.pick();
      if (value) applySnapshot(value);
      return value;
    } catch (cause) { setError(fileError(cause)); return null; }
    finally { setBusy(null); }
  };

  const refresh = async () => {
    const port = portRef.current;
    if (!port || !snapshot) return;
    setBusy('scan'); setError(null);
    try {
      const value = await port.scan();
      setSnapshot(value);
      const valid = new Set<string>();
      const collect = (entries: WorkspaceEntry[]) => entries.forEach(entry => {
        valid.add(entry.relativePath);
        if (entry.kind === 'folder') collect(entry.children);
      });
      collect(value.entries);
      for (const item of loadRecent(value.workspaceId)) {
        if (!valid.has(item.relativePath)) removeRecent(value.workspaceId, item.relativePath);
      }
      setRecent(loadRecent(value.workspaceId));
    } catch (cause) { setError(fileError(cause)); }
    finally { setBusy(null); }
  };

  const markApplied = (entry: WorkspaceEntry) => {
    const current = snapshot;
    if (!current || entry.kind === 'folder') return;
    setActiveRelativePath(entry.relativePath);
    recordRecent(current.workspaceId, { relativePath: entry.relativePath, kind: entry.kind });
    setRecent(loadRecent(current.workspaceId));
    setQuery('');
    setResults([]);
  };

  const open = async (entry: WorkspaceEntry) => {
    if (entry.kind === 'folder') {
      setSelectedFolder(entry.relativePath);
      setExpanded(previous => {
        const next = new Set(previous);
        if (next.has(entry.relativePath)) next.delete(entry.relativePath); else next.add(entry.relativePath);
        return next;
      });
      return;
    }
    setError(null);
    await openRef.current(entry, () => markApplied(entry));
  };

  const createNote = async () => {
    const port = portRef.current;
    if (!port) { await pick(); return; }
    let current = snapshot;
    if (!current) {
      current = await pick();
      if (!current) return;
    }
    setBusy('create'); setError(null);
    try {
      const folder = snapshot ? selectedFolder : '';
      const created = await port.createMarkdown(folder);
      const value = await port.scan();
      setSnapshot(value);
      const entry = findWorkspaceEntry(value.entries, created.relativePath)
        ?? { name: leafName(created.relativePath), relativePath: created.relativePath, kind: 'markdown' as const, children: [] };
      if (entry.kind !== 'markdown') throw new Error('Workspace 新建结果不是 Markdown 文件');
      await openRef.current(entry, () => {
        setActiveRelativePath(entry.relativePath);
        recordRecent(value.workspaceId, { relativePath: entry.relativePath, kind: 'markdown' });
        setRecent(loadRecent(value.workspaceId));
        setQuery('');
        setResults([]);
      });
    } catch (cause) { setError(fileError(cause)); }
    finally { setBusy(null); }
  };

  const rename = async (entry: WorkspaceEntry, newName: string) => {
    const port = portRef.current;
    const current = snapshot;
    if (!port || !current) return;
    setBusy('rename'); setError(null);
    try {
      const previous = entry.relativePath;
      const renamed = await port.rename(previous, newName);
      const remap = (path: string | null): string | null => {
        if (!path) return path;
        if (path === previous) return renamed.relativePath;
        return path.startsWith(previous + '/') ? renamed.relativePath + path.slice(previous.length) : path;
      };
      const remappedActive = remap(activeRelativePath);
      renameRecent(current.workspaceId, previous, renamed.relativePath);
      const value = await port.scan();
      setSnapshot(value);
      setRecent(loadRecent(current.workspaceId));
      setSelectedFolder(folder => remap(folder) ?? '');
      setExpanded(paths => new Set([...paths].map(path => remap(path) ?? path)));

      const activeMoved = !!activeRelativePath && remappedActive !== activeRelativePath;
      if (activeMoved && remappedActive) {
        const next = findWorkspaceEntry(value.entries, remappedActive);
        if (next && next.kind !== 'folder') await openRef.current(next, () => markApplied(next));
      } else if (activeRelativePath === previous && entry.kind !== 'folder') {
        const next = findWorkspaceEntry(value.entries, renamed.relativePath)
          ?? { ...entry, name: leafName(renamed.relativePath), relativePath: renamed.relativePath };
        await openRef.current(next, () => markApplied(next));
      }
    } catch (cause) { setError(fileError(cause)); }
    finally { setBusy(null); }
  };

  const deleteEntry = async (entry: WorkspaceEntry) => {
    const port = portRef.current;
    const current = snapshot;
    if (!port?.delete || !current) {
      setError(fileError(new Error('当前 Workspace 不支持删除')));
      return false;
    }
    setBusy('delete'); setError(null);
    try {
      const deleted = await port.delete(entry.relativePath);
      const removed = deleted.relativePath;
      for (const item of loadRecent(current.workspaceId)) {
        if (item.relativePath === removed || item.relativePath.startsWith(removed + '/')) {
          removeRecent(current.workspaceId, item.relativePath);
        }
      }
      const value = await port.scan();
      setSnapshot(value);
      setRecent(loadRecent(current.workspaceId));
      setSelectedFolder(folder => folder === removed || folder.startsWith(removed + '/') ? '' : folder);
      setExpanded(paths => new Set([...paths].filter(path => path !== removed && !path.startsWith(removed + '/'))));
      setActiveRelativePath(path => path && (path === removed || path.startsWith(removed + '/')) ? null : path);
      return true;
    } catch (cause) { setError(fileError(cause)); return false; }
    finally { setBusy(null); }
  };

  const recentView: WorkspaceRecentView[] = recent.map(item => ({
    ...item,
    available: !!snapshot && !!findWorkspaceEntry(snapshot.entries, item.relativePath),
    name: leafName(item.relativePath),
  }));

  return {
    portAvailable: !!portRef.current,
    snapshot, busy, error, query, setQuery, results, recent: recentView,
    activeRelativePath, selectedFolder, setSelectedFolder, expanded, setExpanded,
    pick, refresh, open, createNote, rename, deleteEntry,
  };
}

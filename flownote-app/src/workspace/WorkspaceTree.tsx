import { useEffect, useRef, useState } from 'react';
import { FileText, Folder, Layers3 } from 'lucide-react';
import type { WorkspaceEntry, WorkspaceSearchResult, WorkspaceSnapshot } from './workspaceTypes';
import type { WorkspaceRecentView } from './useWorkspace';

interface Props {
  snapshot: WorkspaceSnapshot | null;
  busy: string | null;
  error: Error | null;
  query: string;
  view: 'files' | 'recent';
  results: WorkspaceSearchResult[];
  recent: WorkspaceRecentView[];
  activeRelativePath: string | null;
  selectedFolder: string;
  expanded: Set<string>;
  renameDisabled?: boolean;
  onPick(): void;
  onRefresh(): void;
  onOpen(entry: WorkspaceEntry): void;
  onRename(entry: WorkspaceEntry, newName: string): void;
  onDelete(entry: WorkspaceEntry): void;
}

function nameOf(path: string) { const parts = path.split('/'); return parts[parts.length - 1] ?? path; }

function TreeEntry({ entry, depth, activeRelativePath, selectedFolder, expanded, renameDisabled, onOpen, onRename, onDelete }: {
  entry: WorkspaceEntry; depth: number; activeRelativePath: string | null; selectedFolder: string; expanded: Set<string>;
  renameDisabled?: boolean; onOpen(entry: WorkspaceEntry): void; onRename(entry: WorkspaceEntry, newName: string): void;
  onDelete(entry: WorkspaceEntry): void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState(entry.name);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) { setMenuOpen(false); setConfirmDelete(false); }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);
  const isFolder = entry.kind === 'folder';
  const isExpanded = isFolder && expanded.has(entry.relativePath);
  const active = activeRelativePath === entry.relativePath;
  const selected = isFolder && selectedFolder === entry.relativePath;
  const submit = () => {
    const value = draft.trim();
    setRenaming(false);
    if (value && value !== entry.name) onRename(entry, value);
  };
  return <div className="workspace-tree-node">
    <div className={'workspace-tree-row' + (active ? ' active' : '') + (selected ? ' selected-folder' : '')}
      style={{ '--tree-depth': depth } as React.CSSProperties}
      onContextMenu={event => {
        if (renameDisabled) return;
        event.preventDefault();
        setConfirmDelete(false);
        setMenuOpen(true);
      }}>
      {renaming ? <input className="workspace-tree-rename" aria-label={'重命名输入 ' + entry.relativePath} value={draft} autoFocus
        onChange={event => setDraft(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') submit();
          if (event.key === 'Escape') { setDraft(entry.name); setRenaming(false); }
        }}
        onBlur={submit} />
      : <>
        <button type="button" className="workspace-tree-main"
          aria-label={(isFolder ? '打开文件夹 ' : '打开 Workspace 笔记 ') + entry.relativePath}
          onClick={() => onOpen(entry)}>
          <span className={'workspace-tree-chevron' + (isExpanded ? ' expanded' : '')} aria-hidden="true">{isFolder ? '›' : ''}</span>
          <span className="workspace-tree-kind" aria-hidden="true">
            {isFolder ? <Folder size={13} /> : entry.kind === 'note' ? <Layers3 size={13} /> : <FileText size={13} />}
          </span>
          <span className="workspace-tree-name">{entry.name}</span>
        </button>
        <div className="workspace-tree-actions" ref={menuRef}>
          <button type="button" className="workspace-tree-more" aria-label={'更多操作 ' + entry.relativePath}
            disabled={renameDisabled} onClick={() => { setConfirmDelete(false); setMenuOpen(value => !value); }}>•••</button>
          {menuOpen && <div className="workspace-tree-menu" role="menu" aria-label={'文件操作 ' + entry.relativePath}>
            {!confirmDelete ? <>
              <button type="button" role="menuitem" aria-label={'重命名 ' + entry.relativePath}
                onClick={() => { setMenuOpen(false); setDraft(entry.name); setRenaming(true); }}>重命名</button>
              <button type="button" role="menuitem" className="danger" aria-label={'删除 ' + entry.relativePath}
                onClick={() => setConfirmDelete(true)}>删除</button>
            </> : <>
              <p>确定删除“{entry.name}”？{isFolder ? '仅空文件夹可删除。' : ''}</p>
              <button type="button" className="danger" aria-label={'确认删除 ' + entry.relativePath}
                onClick={() => { setMenuOpen(false); setConfirmDelete(false); onDelete(entry); }}>确认删除</button>
              <button type="button" aria-label={'取消删除 ' + entry.relativePath}
                onClick={() => setConfirmDelete(false)}>取消</button>
            </>}
          </div>}
        </div>
      </>}
    </div>
    {isExpanded && entry.children.map(child => <TreeEntry key={child.relativePath} entry={child} depth={depth + 1}
      activeRelativePath={activeRelativePath} selectedFolder={selectedFolder} expanded={expanded}
      renameDisabled={renameDisabled} onOpen={onOpen} onRename={onRename} onDelete={onDelete} />)}
  </div>;
}

export function WorkspaceNavigation(props: Props) {
  if (!props.snapshot) {
    return <div className="workspace-empty">
      <div className="workspace-empty-title">Local Workspace</div>
      <p>选择一个本地文件夹，FlowNote 只会管理其中的 Markdown 和 .note。</p>
      <button type="button" onClick={props.onPick} disabled={!!props.busy}>Choose Workspace</button>
      {props.error && <p className="workspace-inline-error" role="alert">{props.error.message}</p>}
    </div>;
  }
  const searchMode = !!props.query.trim();
  return <nav className="workspace-real-nav" aria-label="Workspace 文件">
    <div className="workspace-root-header">
      <div aria-label="当前 Workspace"><span>Workspace</span><strong>{props.snapshot.name}</strong></div>
      <div>
        <button type="button" aria-label="刷新 Workspace" onClick={props.onRefresh} disabled={!!props.busy}>Refresh</button>
        <button type="button" aria-label="更换 Workspace" onClick={props.onPick} disabled={!!props.busy}>Change</button>
      </div>
    </div>
    {props.error && <p className="workspace-inline-error" role="alert">{props.error.message}</p>}
    {searchMode ? <div className="workspace-nav-section">
      <span>Search</span>
      {props.busy === 'search' && <p className="workspace-tree-empty">Searching…</p>}
      {!props.busy && !props.results.length && <p className="workspace-tree-empty">No notes match this search.</p>}
      {props.results.map(result => <button type="button" className="workspace-search-result" key={result.relativePath}
        onClick={() => props.onOpen({ name: nameOf(result.relativePath), relativePath: result.relativePath,
          kind: result.kind, children: [] })}>
        <strong>{result.title}</strong><span>{result.relativePath}</span><small>{result.snippet}</small>
      </button>)}
    </div> : props.view === 'recent' ? <div className="workspace-nav-section workspace-nav-section--primary">
      <span>Recent Notes</span>
      {props.recent.length ? props.recent.map(item =>
        <button type="button" className="workspace-nav-item workspace-recent" key={item.relativePath}
          disabled={!item.available} onClick={() => props.onOpen({
            name: item.name, relativePath: item.relativePath, kind: item.kind, children: [],
          })}>
          <span className="workspace-recent-main">
            {item.kind === 'note' ? <Layers3 size={13} aria-hidden="true" /> : <FileText size={13} aria-hidden="true" />}
            <span>{item.name}</span>
          </span>
          {!item.available && <small>Missing</small>}
        </button>) : <p className="workspace-tree-empty">No recent notes</p>}
    </div> : <div className="workspace-nav-section workspace-tree-section workspace-nav-section--primary">
      <span>Workspace Files</span>
      {props.snapshot.entries.length ? props.snapshot.entries.map(entry =>
        <TreeEntry key={entry.relativePath} entry={entry} depth={0} activeRelativePath={props.activeRelativePath}
          selectedFolder={props.selectedFolder} expanded={props.expanded} renameDisabled={props.renameDisabled}
          onOpen={props.onOpen} onRename={props.onRename} onDelete={props.onDelete} />)
        : <p className="workspace-tree-empty">No notes yet. Use New Note above to create your first Markdown file.</p>}
    </div>}
  </nav>;
}

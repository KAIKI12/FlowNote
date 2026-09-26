import { useEffect, useRef, useState } from 'react';
import { FilePlus2, FileText, Folder, Layers3, RotateCcw, Trash2 } from 'lucide-react';
import type { WorkspaceEntry, WorkspaceSearchResult, WorkspaceSnapshot, WorkspaceTrashItem } from './workspaceTypes';
import type { WorkspaceRecentView } from './useWorkspace';

interface Props {
  snapshot: WorkspaceSnapshot | null;
  busy: string | null;
  error: Error | null;
  query: string;
  view: 'files' | 'recent' | 'trash';
  results: WorkspaceSearchResult[];
  recent: WorkspaceRecentView[];
  trashItems: WorkspaceTrashItem[];
  activeRelativePath: string | null;
  selectedFolder: string;
  expanded: Set<string>;
  renameDisabled?: boolean;
  actionsDisabled?: boolean;
  onPick(): void;
  onRefresh(): void;
  onOpen(entry: WorkspaceEntry): void;
  onRename(entry: WorkspaceEntry, newName: string): void;
  onCreateInFolder(entry: WorkspaceEntry): void;
  onTrash(entry: WorkspaceEntry): void;
  onRestoreTrash(item: WorkspaceTrashItem): void;
  onDeleteTrash(item: WorkspaceTrashItem): void;
}

function nameOf(path: string) { const parts = path.split('/'); return parts[parts.length - 1] ?? path; }

function TreeEntry({ entry, depth, activeRelativePath, selectedFolder, expanded, renameDisabled, actionsDisabled, onOpen, onRename,
  onCreateInFolder, onTrash }: {
  entry: WorkspaceEntry; depth: number; activeRelativePath: string | null; selectedFolder: string; expanded: Set<string>;
  renameDisabled?: boolean; actionsDisabled?: boolean;
  onOpen(entry: WorkspaceEntry): void; onRename(entry: WorkspaceEntry, newName: string): void;
  onCreateInFolder(entry: WorkspaceEntry): void; onTrash(entry: WorkspaceEntry): void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [draft, setDraft] = useState(entry.name);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) { setMenuOpen(false); setConfirmTrash(false); }
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
        if (actionsDisabled) return;
        event.preventDefault();
        setConfirmTrash(false);
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
            disabled={actionsDisabled} onClick={() => { setConfirmTrash(false); setMenuOpen(value => !value); }}>•••</button>
          {menuOpen && <div className="workspace-tree-menu" role="menu" aria-label={'文件操作 ' + entry.relativePath}>
            {!confirmTrash ? <>
              {isFolder && <button type="button" role="menuitem" aria-label={'在 ' + entry.relativePath + ' 新建笔记'}
                disabled={renameDisabled} onClick={() => { setMenuOpen(false); onCreateInFolder(entry); }}>
                <FilePlus2 size={12} />New Note Here
              </button>}
              <button type="button" role="menuitem" aria-label={'重命名 ' + entry.relativePath}
                disabled={renameDisabled}
                onClick={() => { setMenuOpen(false); setDraft(entry.name); setRenaming(true); }}>重命名</button>
              <button type="button" role="menuitem" className="danger" aria-label={'移到 Trash ' + entry.relativePath}
                onClick={() => setConfirmTrash(true)}><Trash2 size={12} />Move to Trash</button>
            </> : <>
              <p>“{entry.name}”将移到 Trash，可稍后恢复。</p>
              <button type="button" className="danger" aria-label={'确认移到 Trash ' + entry.relativePath}
                onClick={() => { setMenuOpen(false); setConfirmTrash(false); onTrash(entry); }}>Move to Trash</button>
              <button type="button" aria-label={'取消移到 Trash ' + entry.relativePath}
                onClick={() => setConfirmTrash(false)}>取消</button>
            </>}
          </div>}
        </div>
      </>}
    </div>
    {isExpanded && entry.children.map(child => <TreeEntry key={child.relativePath} entry={child} depth={depth + 1}
      activeRelativePath={activeRelativePath} selectedFolder={selectedFolder} expanded={expanded}
      renameDisabled={renameDisabled} actionsDisabled={actionsDisabled} onOpen={onOpen} onRename={onRename}
      onCreateInFolder={onCreateInFolder} onTrash={onTrash} />)}
  </div>;
}

function TrashEntry({ item, disabled, onRestore, onDelete }: {
  item: WorkspaceTrashItem; disabled?: boolean;
  onRestore(item: WorkspaceTrashItem): void; onDelete(item: WorkspaceTrashItem): void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return <div className="workspace-trash-row">
    <div className="workspace-trash-main">
      <span className="workspace-tree-kind" aria-hidden="true">
        {item.kind === 'folder' ? <Folder size={13} /> : item.kind === 'note' ? <Layers3 size={13} /> : <FileText size={13} />}
      </span>
      <span><strong>{item.name}</strong><small>Original: {item.originalRelativePath}</small></span>
    </div>
    {!confirmDelete ? <div className="workspace-trash-actions">
      <button type="button" aria-label={'恢复 ' + item.name} disabled={disabled} onClick={() => onRestore(item)}>
        <RotateCcw size={12} />Restore
      </button>
      <button type="button" className="danger" aria-label={'永久删除 ' + item.name} disabled={disabled}
        onClick={() => setConfirmDelete(true)}><Trash2 size={12} />Delete</button>
    </div> : <div className="workspace-trash-confirm">
      <small>永久删除后无法恢复。</small>
      <button type="button" className="danger" aria-label={'确认永久删除 ' + item.name}
        disabled={disabled} onClick={() => { setConfirmDelete(false); onDelete(item); }}>确认删除</button>
      <button type="button" aria-label={'取消永久删除 ' + item.name} disabled={disabled}
        onClick={() => setConfirmDelete(false)}>取消</button>
    </div>}
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
  const searchMode = props.view !== 'trash' && !!props.query.trim();
  return <nav className="workspace-real-nav" aria-label="Workspace 文件">
    <div className="workspace-root-header">
      <div aria-label="当前 Workspace"><span>Workspace</span><strong>{props.snapshot.name}</strong></div>
      <div>
        <button type="button" aria-label="刷新 Workspace" onClick={props.onRefresh} disabled={!!props.busy}>Refresh</button>
        <button type="button" aria-label="更换 Workspace" onClick={props.onPick} disabled={!!props.busy}>Change</button>
      </div>
    </div>
    {props.error && <p className="workspace-inline-error" role="alert">{props.error.message}</p>}
    {props.view === 'trash' ? <div className="workspace-nav-section workspace-nav-section--primary workspace-trash-section">
      <span>Workspace Trash</span>
      {props.trashItems.length ? props.trashItems.map(item =>
        <TrashEntry key={item.id} item={item} disabled={!!props.busy}
          onRestore={props.onRestoreTrash} onDelete={props.onDeleteTrash} />)
        : <p className="workspace-tree-empty">Trash 为空。移到 Trash 的文件可以在这里恢复。</p>}
    </div> : searchMode ? <div className="workspace-nav-section">
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
          actionsDisabled={props.actionsDisabled}
          onOpen={props.onOpen} onRename={props.onRename}
          onCreateInFolder={props.onCreateInFolder} onTrash={props.onTrash} />)
        : <p className="workspace-tree-empty">No notes yet. Use New Note above to create your first Markdown file.</p>}
    </div>}
  </nav>;
}

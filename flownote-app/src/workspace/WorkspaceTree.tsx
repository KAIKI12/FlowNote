import { useState } from 'react';
import type { WorkspaceEntry, WorkspaceSearchResult, WorkspaceSnapshot } from './workspaceTypes';
import type { WorkspaceRecentView } from './useWorkspace';

interface Props {
  snapshot: WorkspaceSnapshot | null;
  busy: string | null;
  error: Error | null;
  query: string;
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
}

function nameOf(path: string) { const parts = path.split('/'); return parts[parts.length - 1] ?? path; }

function TreeEntry({ entry, depth, activeRelativePath, selectedFolder, expanded, renameDisabled, onOpen, onRename }: {
  entry: WorkspaceEntry; depth: number; activeRelativePath: string | null; selectedFolder: string; expanded: Set<string>;
  renameDisabled?: boolean; onOpen(entry: WorkspaceEntry): void; onRename(entry: WorkspaceEntry, newName: string): void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(entry.name);
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
      style={{ '--tree-depth': depth } as React.CSSProperties}>
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
          <span className="workspace-tree-name">{entry.name}</span>
        </button>
        <button type="button" className="workspace-tree-more" aria-label={'重命名 ' + entry.relativePath}
          disabled={renameDisabled} onClick={() => { setDraft(entry.name); setRenaming(true); }}>•••</button>
      </>}
    </div>
    {isExpanded && entry.children.map(child => <TreeEntry key={child.relativePath} entry={child} depth={depth + 1}
      activeRelativePath={activeRelativePath} selectedFolder={selectedFolder} expanded={expanded}
      renameDisabled={renameDisabled} onOpen={onOpen} onRename={onRename} />)}
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
    </div> : <>
      <div className="workspace-nav-section">
        <span>Recent</span>
        {props.recent.length ? props.recent.slice(0, 6).map(item =>
          <button type="button" className="workspace-nav-item workspace-recent" key={item.relativePath}
            disabled={!item.available} onClick={() => props.onOpen({
              name: item.name, relativePath: item.relativePath, kind: item.kind, children: [],
            })}>
            <span>{item.name}</span>{!item.available && <small>Missing</small>}
          </button>) : <p className="workspace-tree-empty">No recent notes</p>}
      </div>
      <div className="workspace-nav-section workspace-tree-section">
        <span>Files</span>
        {props.snapshot.entries.length ? props.snapshot.entries.map(entry =>
          <TreeEntry key={entry.relativePath} entry={entry} depth={0} activeRelativePath={props.activeRelativePath}
            selectedFolder={props.selectedFolder} expanded={props.expanded} renameDisabled={props.renameDisabled}
            onOpen={props.onOpen} onRename={props.onRename} />)
          : <p className="workspace-tree-empty">No notes yet. Use + New Note above to create your first Markdown file.</p>}
      </div>
    </>}
  </nav>;
}

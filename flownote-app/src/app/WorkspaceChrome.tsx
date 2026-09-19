import type { ReactNode } from 'react';

export type WorkspaceMode = 'edit' | 'read' | 'focus';
export type InspectorTab = 'outline' | 'block' | 'info';

interface TopbarProps {
  mode: WorkspaceMode;
  title: string;
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  dark: boolean;
  searchQuery: string;
  searchDisabled?: boolean;
  onSearchQueryChange(value: string): void;
  onModeChange(mode: WorkspaceMode): void;
  onToggleSidebar(): void;
  onToggleInspector(): void;
  onToggleTheme(): void;
}

export function WorkspaceTopbar({
  mode, title, sidebarOpen, inspectorOpen, dark, searchQuery, searchDisabled,
  onSearchQueryChange, onModeChange, onToggleSidebar, onToggleInspector, onToggleTheme,
}: TopbarProps) {
  return <header className="workspace-topbar">
    <div className="workspace-brand">
      {mode !== 'focus' && <button type="button" className="workspace-icon-button"
        aria-label={sidebarOpen ? '收起文件侧栏' : '展开文件侧栏'}
        onClick={onToggleSidebar}>{sidebarOpen ? '‹' : '›'}</button>}
      <span className="workspace-logo" aria-hidden="true" />
      <span className="workspace-brand-name">FlowNote</span>
      <span className="workspace-current-title">{title}</span>
    </div>
    <div className="workspace-global-search" aria-label="全局搜索">
      <span aria-hidden="true">⌕</span>
      <input aria-label="搜索笔记" placeholder="Search notes…" value={searchQuery} disabled={searchDisabled}
        onChange={event => onSearchQueryChange(event.target.value)} />
      <kbd>Ctrl K</kbd>
    </div>
    <div className="workspace-mode-switch" role="group" aria-label="工作区模式">
      <button type="button" aria-label="编辑模式" aria-pressed={mode === 'edit'} onClick={() => onModeChange('edit')}>Edit</button>
      <button type="button" aria-label="阅读模式" aria-pressed={mode === 'read'} onClick={() => onModeChange('read')}>Read</button>
      <button type="button" aria-label="专注模式" aria-pressed={mode === 'focus'} onClick={() => onModeChange('focus')}>Focus</button>
    </div>
    <div className="workspace-top-actions">
      {mode !== 'focus' && <button type="button" aria-label="切换 Inspector" aria-pressed={inspectorOpen}
        onClick={onToggleInspector}>Inspector</button>}
      <button type="button" aria-label="切换主题" onClick={onToggleTheme}>{dark ? 'Light' : 'Dark'}</button>
    </div>
  </header>;
}

interface SidebarProps {
  activeView: 'editor' | 'demo' | 'qualification';
  fileActions: ReactNode;
  workspaceContent: ReactNode;
  fileActionsDisabled: boolean;
  onNew(): void;
  onOpen(): void;
  onSelectView(view: 'editor' | 'demo' | 'qualification'): void;
}

export function WorkspaceSidebar({
  activeView, fileActions, workspaceContent, fileActionsDisabled, onNew, onOpen, onSelectView,
}: SidebarProps) {
  return <aside className="workspace-sidebar" aria-label="Files">
    <div className="workspace-quick-file-actions">
      <button type="button" disabled={fileActionsDisabled} onClick={onNew}>+ New Note</button>
      <button type="button" disabled={fileActionsDisabled} onClick={onOpen}>Open</button>
    </div>
    <details className="workspace-sidebar-primary">
      <summary>File actions</summary>
      <div className="workspace-file-actions">{fileActions}</div>
    </details>
    <div className="workspace-nav-shell">{workspaceContent}</div>
    {import.meta.env.DEV && <div className="workspace-nav-section workspace-dev-tools">
      <span>Development</span>
      <button type="button" className={activeView === 'qualification' ? 'workspace-nav-item active' : 'workspace-nav-item'}
        onClick={() => onSelectView('qualification')}>Markdown Gate</button>
      <button type="button" className={activeView === 'demo' ? 'workspace-nav-item active' : 'workspace-nav-item'}
        onClick={() => onSelectView('demo')}>调试状态</button>
    </div>}
  </aside>;
}

interface InspectorProps {
  tab: InspectorTab;
  markdown: string;
  title: string;
  type: string;
  dirty: boolean;
  selectedBlockId: string | null;
  selectedBlock?: {
    id: string;
    config: { scriptPolicy?: string; viewport?: { heightPx?: number }; inputKind?: string; kind?: string };
  };
  onTabChange(tab: InspectorTab): void;
}

function headings(markdown: string) {
  return markdown.split(/\r?\n/).flatMap(line => {
    const match = /^(#{1,3})\s+(.+)$/.exec(line);
    return match ? [{ depth: match[1].length, text: match[2].trim() }] : [];
  });
}

export function WorkspaceInspector({
  tab, markdown, title, type, dirty, selectedBlockId, selectedBlock, onTabChange,
}: InspectorProps) {
  const outline = headings(markdown);
  return <aside className="workspace-inspector" aria-label="Inspector">
    <div className="workspace-inspector-tabs" role="tablist" aria-label="Inspector tabs">
      {(['outline', 'block', 'info'] as const).map(value =>
        <button key={value} type="button" role="tab" aria-selected={tab === value}
          onClick={() => onTabChange(value)}>{value === 'outline' ? 'Outline' : value === 'block' ? 'Block' : 'Info'}</button>)}
    </div>
    <div className="workspace-inspector-body">
      {tab === 'outline' && <div className="workspace-outline">
        {outline.length ? outline.map((item, index) =>
          <div key={item.text + '-' + index} className={'workspace-outline-item depth-' + item.depth}>{item.text}</div>)
          : <p className="workspace-inspector-empty">当前文档还没有标题。</p>}
      </div>}
      {tab === 'block' && (selectedBlock
        ? <div className="workspace-properties">
            <div><span>HTML Status</span><strong>Ready</strong></div>
            <div><span>Block ID</span><code>{selectedBlock.id.slice(0, 12)}…</code></div>
            <div><span>Height</span><strong>{selectedBlock.config.viewport?.heightPx ?? 'Auto'}</strong></div>
            <div><span>Script Policy</span><strong>{selectedBlock.config.scriptPolicy ?? 'sandbox'}</strong></div>
            <div><span>Network</span><strong>Off</strong></div>
          </div>
        : <p className="workspace-inspector-empty">{selectedBlockId ? '当前 HTML Visual 不可用。' : '选择一个 HTML Visual 后，这里显示对象级设置。'}</p>)}
      {tab === 'info' && <div className="workspace-properties">
        <div><span>Title</span><strong>{title}</strong></div>
        <div><span>Type</span><strong>{type}</strong></div>
        <div><span>Status</span><strong>{dirty ? 'Modified' : 'Saved'}</strong></div>
        <div><span>Storage</span><strong>Local First</strong></div>
      </div>}
    </div>
  </aside>;
}

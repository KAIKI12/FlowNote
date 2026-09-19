import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  BookOpen, CheckCircle2, ChevronRight, Clock3, Download, Edit3, FilePlus2, Files, FolderOpen, Info,
  ListTree, Maximize2, Moon, MoreHorizontal, PanelLeft, PanelLeftClose, PanelRight, PanelRightClose,
  Search, SlidersHorizontal, Sun, X,
} from 'lucide-react';
import type { ThemePreference } from './themePreference';

export type WorkspaceMode = 'edit' | 'read' | 'focus';
export type InspectorTab = 'outline' | 'block' | 'info';

interface TopbarProps {
  mode: WorkspaceMode;
  title: string;
  documentPath?: string;
  mixed?: boolean;
  modified?: boolean;
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  themePreference: ThemePreference;
  resolvedTheme: 'light' | 'dark';
  searchQuery: string;
  searchDisabled?: boolean;
  statusNode?: ReactNode;
  exportDisabled?: boolean;
  onExport(): void;
  onSearchQueryChange(value: string): void;
  onModeChange(mode: WorkspaceMode): void;
  onToggleSidebar(): void;
  onToggleInspector(): void;
  onToggleTheme(): void;
}

function breadcrumbFolder(path?: string): string {
  if (!path) return 'Local Workspace';
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.length > 1 ? parts.slice(Math.max(0, parts.length - 3), -1).join(' / ') : 'Local Workspace';
}

export function WorkspaceTopbar({
  mode, title, documentPath, mixed, modified, sidebarOpen, inspectorOpen, themePreference, resolvedTheme, searchQuery,
  searchDisabled, statusNode, exportDisabled, onExport, onSearchQueryChange, onModeChange, onToggleSidebar, onToggleInspector, onToggleTheme,
}: TopbarProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const keydown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && searchOpen) {
        event.preventDefault();
        setSearchOpen(false);
        return;
      }
      if (mode === 'focus' || searchDisabled || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      setSearchOpen(true);
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [mode, searchDisabled, searchOpen]);
  const themeLabel = themePreference === 'system' ? 'Auto' : themePreference === 'light' ? 'Light' : 'Dark';
  const themeIcon = resolvedTheme === 'dark' ? <Sun size={14} /> : <Moon size={14} />;
  return <header className="workspace-topbar">
    <div className="workspace-brand">
      {mode !== 'focus' && <button type="button" className="workspace-icon-button"
        aria-label={sidebarOpen ? '收起文件侧栏' : '展开文件侧栏'} onClick={onToggleSidebar}
        title={sidebarOpen ? '收起左侧边栏' : '展开左侧边栏'}>
        {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeft size={15} />}
      </button>}
      <div className="workspace-brand-mark" aria-label="FlowNote">
        <span className="workspace-logo" aria-hidden="true">FN</span>
        <span className="workspace-brand-name">FlowNote</span>
      </div>
      <div className="workspace-breadcrumb">
        <span className="workspace-folder-crumb">{breadcrumbFolder(documentPath)}</span>
        <ChevronRight size={12} aria-hidden="true" />
        <span className="workspace-current-title">{title}</span>
        {mixed && <span className="workspace-note-badge">Mixed Note</span>}
        <span className={'workspace-sync-status' + (modified ? ' modified' : '')}>
          <CheckCircle2 size={11} aria-hidden="true" />{statusNode ?? 'Local · Saved'}
        </span>
      </div>
    </div>

    <div className="workspace-mode-switch" role="group" aria-label="工作区模式">
      <button type="button" aria-label="编辑模式" aria-pressed={mode === 'edit'} onClick={() => onModeChange('edit')}>
        <Edit3 size={12} /><span>Edit</span>
      </button>
      <button type="button" aria-label="阅读模式" aria-pressed={mode === 'read'} onClick={() => onModeChange('read')}>
        <BookOpen size={12} /><span>Read</span>
      </button>
      <button type="button" aria-label="专注模式" aria-pressed={mode === 'focus'} onClick={() => onModeChange('focus')}>
        <Maximize2 size={12} /><span>Focus</span>
      </button>
    </div>

    <div className="workspace-top-actions">
      {mode !== 'focus' && <button type="button" className="workspace-search-trigger" aria-label="打开搜索"
        aria-expanded={searchOpen} onClick={() => { setSearchOpen(true); searchRef.current?.focus(); }}>
        <Search size={13} /><span>Ctrl K</span>
      </button>}
      {mode !== 'focus' && <button type="button" aria-label="导出当前笔记" disabled={exportDisabled}
        onClick={onExport} title="Export">
        <Download size={14} />
      </button>}
      <button type="button" aria-label="切换主题" onClick={onToggleTheme}
        title={themePreference === 'system' ? `Theme: Auto · System ${resolvedTheme}` : `Theme: ${themeLabel}`}>
        {themeIcon}<span className="workspace-theme-label">{themeLabel}</span>
      </button>
      {mode !== 'focus' && <button type="button" aria-label="切换 Inspector" aria-pressed={inspectorOpen}
        onClick={onToggleInspector} title={inspectorOpen ? '关闭 Inspector' : '打开 Inspector'}>
        {inspectorOpen ? <PanelRightClose size={15} /> : <PanelRight size={15} />}
      </button>}
    </div>

    <div className={'workspace-search-popover' + (searchOpen ? ' open' : '')}>
      <Search size={14} aria-hidden="true" />
      <input ref={searchRef} aria-label="搜索笔记"
        placeholder={searchDisabled ? 'Choose a workspace to search' : 'Search notes…'}
        value={searchQuery} disabled={searchDisabled}
        onChange={event => onSearchQueryChange(event.target.value)} />
      <kbd>Esc</kbd>
      <button type="button" aria-label="关闭搜索" onClick={() => setSearchOpen(false)}>×</button>
    </div>
  </header>;
}

interface SidebarProps {
  activeView: 'editor' | 'demo' | 'qualification';
  fileActions: ReactNode;
  workspaceContent: ReactNode;
  fileActionsDisabled: boolean;
  searchQuery: string;
  searchDisabled?: boolean;
  view: 'files' | 'recent';
  onSearchQueryChange(value: string): void;
  onViewChange(view: 'files' | 'recent'): void;
  onNew(): void;
  onOpen(): void;
  onSelectView(view: 'editor' | 'demo' | 'qualification'): void;
}

export function WorkspaceSidebar({
  activeView, fileActions, workspaceContent, fileActionsDisabled, searchQuery, searchDisabled, view,
  onSearchQueryChange, onViewChange, onNew, onOpen, onSelectView,
}: SidebarProps) {
  return <aside className="workspace-sidebar" aria-label="Files">
    <div className="workspace-sidebar-head">
      <label className="workspace-sidebar-search">
        <Search size={13} aria-hidden="true" />
        <input aria-label="侧栏搜索笔记" placeholder={searchDisabled ? 'Choose a workspace first' : '搜索笔记…'}
          value={searchQuery} disabled={searchDisabled} onChange={event => onSearchQueryChange(event.target.value)} />
      </label>
      <div className="workspace-quick-file-actions">
        <button type="button" disabled={fileActionsDisabled} onClick={onNew}>
          <FilePlus2 size={13} /><span>New Note</span>
        </button>
        <button type="button" disabled={fileActionsDisabled} onClick={onOpen} title="打开 Markdown 文件">
          <FolderOpen size={13} /><span>Open</span>
        </button>
        <details className="workspace-sidebar-primary">
          <summary aria-label="更多文件操作"><MoreHorizontal size={14} /></summary>
          <div className="workspace-file-actions">{fileActions}</div>
        </details>
      </div>
      <div className="workspace-sidebar-tabs" role="tablist" aria-label="Workspace navigation">
        <button type="button" role="tab" aria-selected={view === 'files'} onClick={() => onViewChange('files')}>
          <Files size={12} />Files
        </button>
        <button type="button" role="tab" aria-selected={view === 'recent'} onClick={() => onViewChange('recent')}>
          <Clock3 size={12} />Recent
        </button>
      </div>
    </div>
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
  onClose(): void;
}

function headings(markdown: string) {
  return markdown.split(/\r?\n/).flatMap(line => {
    const match = /^(#{1,3})\s+(.+)$/.exec(line);
    return match ? [{ depth: match[1].length, text: match[2].trim() }] : [];
  });
}

export function WorkspaceInspector({
  tab, markdown, title, type, dirty, selectedBlockId, selectedBlock, onTabChange, onClose,
}: InspectorProps) {
  const outline = headings(markdown);
  const tabs = [
    { value: 'outline' as const, label: 'Outline', icon: <ListTree size={12} /> },
    { value: 'block' as const, label: 'Block', icon: <SlidersHorizontal size={12} /> },
    { value: 'info' as const, label: 'Info', icon: <Info size={12} /> },
  ];
  return <aside className="workspace-inspector" aria-label="Inspector">
    <div className="workspace-inspector-header">
      <div className="workspace-inspector-tabs" role="tablist" aria-label="Inspector tabs">
        {tabs.map(({ value, label, icon }) =>
          <button key={value} type="button" role="tab" aria-selected={tab === value}
            onClick={() => onTabChange(value)}>{icon}<span>{label}</span>
            {value === 'block' && selectedBlock && <i aria-hidden="true" />}</button>)}
      </div>
      <button type="button" className="workspace-inspector-close" aria-label="关闭 Inspector" onClick={onClose}>
        <X size={14} />
      </button>
    </div>
    <div className="workspace-inspector-body">
      {tab === 'outline' && <div className="workspace-outline">
        <div className="workspace-inspector-section-heading"><span>Document Outline</span><small>{outline.length} headings</small></div>
        {outline.length ? outline.map((item, index) =>
          <div key={item.text + '-' + index} className={'workspace-outline-item depth-' + item.depth}>
            <span>H{item.depth}</span><strong>{item.text}</strong>
          </div>)
          : <p className="workspace-inspector-empty">当前文档还没有标题。在正文中输入 # 标题后会自动出现在这里。</p>}
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

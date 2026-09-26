import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { FormEvent, RefObject } from 'react';
import { MilkdownProvider } from '@milkdown/react';
import { FlowNoteEditor } from '../editor/FlowNoteEditor';
import type { FlowNoteEditorApi } from '../editor/editorTypes';
import { useNoteStore } from '../note/noteStore';
import type { NoteStructure } from '../note/noteTypes';
import { downloadText } from '../utils/downloadText';
import { useDocumentFiles } from '../files/useDocumentFiles';
import { FileErrorView, FileStatus, FileToolbar, UnsavedDialog } from '../files/FileControls';
import { MarkdownFileError } from '../files/fileTypes';
import type { MarkdownFilePort } from '../files/fileTypes';
import type { DocumentSession } from '../files/documentSession';
import type { BlockAssetImport, NativeNotePort, NoteAssetData } from '../note/nativeNotePort';
import { createHtmlBlock, newMixedNote } from '../note/htmlBlockData';
import { managedMarkdownImageTarget } from '../note/markdownAssetMigration';
import { useMixedNoteFiles } from '../note/useMixedNoteFiles';
import { WorkspaceInspector, WorkspaceSidebar, WorkspaceTopbar } from './WorkspaceChrome';
import type { InspectorTab, WorkspaceMode } from './WorkspaceChrome';
import { WorkspaceNavigation } from '../workspace/WorkspaceTree';
import { useWorkspace } from '../workspace/useWorkspace';
import type { WorkspaceEntry, WorkspacePort } from '../workspace/workspaceTypes';
import { nextThemePreference, readThemePreference, resolvedTheme, saveThemePreference, systemPrefersDark } from './themePreference';
import { VisualLibraryPanel } from '../visualLibrary/VisualLibraryPanel';
import { useVisualLibrary } from '../visualLibrary/useVisualLibrary';
import type { VisualLibraryPort } from '../visualLibrary/types';

const QualificationPanel = import.meta.env.DEV
  ? lazy(() => import('../editor/MarkdownQualification')) : null;
type AppView = 'editor' | 'demo' | 'qualification';

const INITIAL_MARKDOWN = [
  '# 项目周记', '',
  '在这里整理想法、记录进度。选中文字后，可以使用上方工具栏设置 **加粗**、*斜体* 或 ~~删除线~~。', '',
  '## 今天的安排', '',
  '1. 梳理本周目标',
  '   - 确定重点任务',
  '   - 收集参考资料',
  '2. 完成第一轮验证',
  '   1. 检查显示效果',
  '   2. 记录下一步行动', '',
  '## 待办清单', '',
  '- [x] 建立笔记结构',
  '- [ ] 整理会议记录',
  '- [ ] 分享本周进展', '',
  '> 先把重要的事写下来，再逐步完善细节。', '',
  '## 数据记录', '',
  '| 项目 | 状态 | 数量 |',
  '| --- | --- | ---: |',
  '| 文档 | 已完成 | 3 |',
  '| 待办 | 进行中 | 2 |', '',
  '## 代码片段', '',
  '```javascript',
  'const message = "你好，FlowNote";',
  'console.log(message);',
  '```', '',
  '行内代码也可以这样记录：`npm run dev`。', '',
  '## 参考资料', '',
  '[Markdown 语法参考](https://commonmark.org/help/)', '',
  '---', '',
  '你可以直接修改这篇笔记。使用「导出 Markdown」将当前内容保存为文件。', '',
].join('\n');

function createDraft(): NoteStructure {
  const now = new Date().toISOString();
  return { path: 'untitled.md', contentMd: INITIAL_MARKDOWN, htmlBlocks: new Map(), assets: [],
    metadata: { version: 1, title: '项目周记', type: 'markdown', createdAt: now, updatedAt: now } };
}

function useAppNote(editorRef: RefObject<FlowNoteEditorApi>) {
  const { currentNote, setCurrentNote, updateContent, isComposing } = useNoteStore();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { if (!useNoteStore.getState().currentNote) setCurrentNote(createDraft()); }, [setCurrentNote]);
  const perform = (operation: (api: FlowNoteEditorApi) => void): boolean => {
    try {
      if (!editorRef.current) throw new Error('编辑器尚未准备就绪');
      operation(editorRef.current);
      setError('');
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    }
  };
  const synchronize = () => {
    if (!useNoteStore.getState().isDirty) return true;
    return perform(api => updateContent(api.getMarkdown()));
  };
  const exportNote = () => perform(api => {
    const latest = useNoteStore.getState();
    if (latest.isComposing) throw new Error('请先完成组合输入，再导出笔记');
    if (!latest.currentNote || latest.currentNote.metadata.type !== 'markdown' || latest.currentNote.htmlBlocks.size) {
      throw new Error('Mixed Note 请使用目录型 Markdown 导出，以保留 HTML 与 managed resources');
    }
    downloadText({ content: api.getMarkdown(), fileName: 'FlowNote.md', type: 'text/markdown;charset=utf-8' });
    setNotice('已请求导出 FlowNote.md，请查看下载位置。');
  });
  return { currentNote, onContentChange: updateContent, synchronize, exportNote, isComposing, error, notice };
}

type AppNote = ReturnType<typeof useAppNote>;
type AppFiles = ReturnType<typeof useDocumentFiles>;
type MixedFiles = ReturnType<typeof useMixedNoteFiles>;

async function storeHtmlSource(htmlSource: string, files: AppFiles, mixed: MixedFiles,
  editorRef: RefObject<FlowNoteEditorApi>): Promise<boolean> {
  const current = useNoteStore.getState().currentNote;
  const api = editorRef.current;
  if (!current) throw new Error('尚未打开笔记');
  if (!api || !files.editorReady) throw new Error('编辑器尚未准备就绪');
  if (!htmlSource.trim()) throw new Error('请输入要导入的 HTML');
  const block = createHtmlBlock(htmlSource);
  const replacements: Record<string, string> = {};
  const assets: NoteAssetData[] = [];
  if (current.metadata.type === 'markdown' && files.state.file) {
    const reader = files.session.port.readAsset;
    const seen = new Set<string>();
    for (const source of api.getImageSources()) {
      const target = managedMarkdownImageTarget(files.state.file.name, source);
      if (!target || seen.has(source)) continue;
      if (!reader) throw new MarkdownFileError('unsupported', '当前文件入口不能迁移 Markdown 本地图片');
      const asset = await reader(files.state.file.id, source);
      if (!asset.mime.startsWith('image/')) throw new MarkdownFileError('invalidFormat', `Markdown 图片类型无效：${source}`);
      replacements[source] = target;
      assets.push({ path: target, bytes: asset.bytes });
      seen.add(source);
    }
  }
  const content = api.previewHtmlBlock(block.id, 'normal', replacements);
  return current.metadata.type === 'markdown'
    ? mixed.create(content, newMixedNote(current.metadata.title, block), undefined, () => files.session.detachCurrent(), assets)
    : current.mixed?.metadata.formatVersion === 1
      ? mixed.commit(content, { metadata: { ...current.mixed.metadata, updatedAt: new Date().toISOString() },
          blocks: [...current.mixed.blocks, block] })
      : false;
}

function WritingHeader({ activeView, note, files, mixed, editorRef }: {
  activeView: AppView; note: AppNote; files: AppFiles; mixed: MixedFiles; editorRef: RefObject<FlowNoteEditorApi>;
}) {
  const dirty = useNoteStore(state => state.isDirty);
  const [htmlOpen, setHtmlOpen] = useState(false);
  const [htmlSource, setHtmlSource] = useState('');
  const [htmlError, setHtmlError] = useState('');
  const controls = { ...files, hasDocument: !!note.currentNote, dirty, composing: note.isComposing, ready: files.editorReady };
  const canImportHtml = note.currentNote?.metadata.type === 'markdown'
    || note.currentNote?.metadata.type === 'mixed' && !!mixed.state.file && !mixed.state.file.readOnly;
  const importHtml = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (!(await storeHtmlSource(htmlSource, files, mixed, editorRef))) return;
      setHtmlSource('');
      setHtmlError('');
      setHtmlOpen(false);
    } catch (cause) { setHtmlError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return <header className="writing-header">
    <div className="writing-file-heading"><h2>Markdown 写作</h2><FileStatus {...controls} /></div>
    <div className="writing-header-actions"><FileToolbar {...controls} />
      <button aria-label="导入 HTML Block" disabled={activeView === 'demo' || !!mixed.state.busy || note.isComposing
        || !files.editorReady || !canImportHtml} onClick={() => setHtmlOpen(value => !value)}>导入 HTML</button>
      <button aria-label="打开 Mixed Note" disabled={!!mixed.state.busy || dirty || note.isComposing}
        onClick={() => void mixed.open(async () => { await files.session.detachCurrent(); return true; })}>打开 Mixed Note</button>
      <button aria-label="保存 Mixed Note" disabled={!!mixed.state.busy || note.isComposing || note.currentNote?.metadata.type !== 'mixed'}
        onClick={() => void mixed.save()}>保存 Mixed Note</button>
      <button aria-label="导出 Browser Bundle" disabled={activeView === 'demo' || note.isComposing || !!mixed.state.busy
        || !!mixed.state.externalConflict || note.currentNote?.metadata.type !== 'mixed' || !mixed.state.file
        || mixed.state.file.readOnly || !files.editorReady}
        onClick={() => void mixed.exportBrowserBundle()}>导出 Browser Bundle</button>
      <button aria-label="导出 Markdown 笔记" disabled={activeView === 'demo' || note.isComposing || !note.currentNote || !files.editorReady
        || note.currentNote.metadata.type === 'mixed' && (!!mixed.state.busy || !!mixed.state.externalConflict || !mixed.state.file || mixed.state.file.readOnly)}
        onClick={() => note.currentNote?.metadata.type === 'mixed' ? void mixed.exportMarkdown() : note.exportNote()}>导出 Markdown</button>
      {htmlOpen && <form className="editor-link-form html-import-form" aria-label="HTML 导入" onSubmit={event => void importHtml(event)}>
        <textarea aria-label="HTML 导入源码" value={htmlSource} onChange={event => setHtmlSource(event.target.value)} autoFocus />
        <button type="submit" aria-label="确认导入 HTML" disabled={!!mixed.state.busy || note.isComposing}>
          {note.currentNote?.metadata.type === 'mixed' ? '添加 Block' : '创建 .note'}
        </button>
        <button type="button" onClick={() => { setHtmlOpen(false); setHtmlError(''); }}>取消</button>
        {htmlError && <span role="alert">{htmlError}</span>}
      </form>}
    </div>
  </header>;
}

function DebugPanel({ activeView }: { activeView: AppView }) {
  if (!import.meta.env.DEV || activeView !== 'demo') return null;
  return <DebugView />;
}

function useFileEvents({ session, mixed, exportNote }: { session: DocumentSession; mixed: MixedFiles; exportNote: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!(event.ctrlKey || event.metaKey) || !['s', 'o'].includes(key)) return;
      event.preventDefault();
      if (event.isComposing) { session.notifyError(new MarkdownFileError('composing', '请先完成组合输入')); return; }
      const current = useNoteStore.getState().currentNote;
      if (key === 's' && current?.metadata.type === 'mixed') { void mixed.save(event.shiftKey); return; }
      if (key === 's' && !session.port.canWrite) { exportNote(); return; }
      void (key === 'o' ? session.open() : session.save(event.shiftKey)).catch(cause => session.notifyError(cause));
    };
    const protect = (event: BeforeUnloadEvent) => {
      const latest = useNoteStore.getState();
      if (!latest.isDirty && !latest.isComposing && !session.getSnapshot().busy && !mixed.state.busy) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', protect);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', protect); };
  }, [session, mixed, exportNote]);
}

function WritingWorkspace({ activeView, editorRef, note, files, mixed, workspaceMode, onHtmlBlockSelect, onCollectHtmlBlock,
  onPasteHtmlSource }: {
  activeView: AppView; editorRef: RefObject<FlowNoteEditorApi>; note: AppNote; files: AppFiles; mixed: MixedFiles;
  workspaceMode: WorkspaceMode; onHtmlBlockSelect: (blockId: string) => void;
  onCollectHtmlBlock: (blockId: string) => void | Promise<unknown>;
  onPasteHtmlSource: (html: string) => void | Promise<unknown>;
}) {
  if (!note.currentNote) return <p className="file-empty-state">尚未打开笔记。使用「新建」开始写作，或「打开」选择 Markdown 文件。</p>;
  const showQualification = import.meta.env.DEV && activeView === 'qualification';
  const readManagedImage = async (path: string) => {
    const current = useNoteStore.getState().currentNote;
    if (current?.metadata.type === 'mixed') return mixed.readNoteImage(path);
    const file = files.session.getSnapshot().file;
    const reader = files.session.port.readAsset;
    if (!file || !reader) throw new MarkdownFileError('closed', 'Markdown 文件尚未绑定本地资源读取能力');
    return reader(file.id, path);
  };
  return <MilkdownProvider key={files.state.documentKey}>
    <div hidden={activeView === 'demo'} className={'writing-workspace ' + (showQualification ? 'qualification-workspace' : 'editor-workspace')}>
      <FlowNoteEditor ref={editorRef} initialContent={note.currentNote.contentMd} onContentChange={note.onContentChange}
        mode={workspaceMode === 'read' ? 'read' : 'edit'} onReadyChange={files.readyChanged} readLockRef={files.readLockRef}
        readHtmlAsset={mixed.readAsset} listHtmlAssets={mixed.listAssets} commitHtmlFullEditor={mixed.commitFullEditor}
        readManagedImage={readManagedImage} onDuplicateHtmlBlock={mixed.duplicateBlock}
        onCollectHtmlBlock={onCollectHtmlBlock} onHtmlBlockSelect={onHtmlBlockSelect}
        onPasteHtmlSource={onPasteHtmlSource} />
      {showQualification && QualificationPanel && <Suspense fallback={<p role="status">正在加载测试面板…</p>}>
        <QualificationPanel editorRef={editorRef} />
      </Suspense>}
    </div>
  </MilkdownProvider>;
}

function viewSwitchBlocked(files: AppFiles): boolean {
  return files.state.busy === 'closing' || useNoteStore.getState().isComposing;
}

function App({ filePort, notePort, workspacePort, visualLibraryPort }: {
  filePort?: MarkdownFilePort; notePort?: NativeNotePort; workspacePort?: WorkspacePort | null;
  visualLibraryPort?: VisualLibraryPort | null;
} = {}) {
  const [activeView, setActiveView] = useState<AppView>('editor');
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('edit');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarView, setSidebarView] = useState<'files' | 'recent' | 'visuals'>('files');
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('outline');
  const [selectedHtmlBlockId, setSelectedHtmlBlockId] = useState<string | null>(null);
  const [themePreference, setThemePreference] = useState(readThemePreference);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const editorRef = useRef<FlowNoteEditorApi | null>(null);
  const note = useAppNote(editorRef);
  const dirty = useNoteStore(state => state.isDirty);
  const mixed = useMixedNoteFiles({ editorRef, port: notePort, showEditor: () => setActiveView('editor') });
  const visualLibrary = useVisualLibrary({ port: visualLibraryPort });
  const files = useDocumentFiles({ editorRef, port: filePort, showEditor: () => setActiveView('editor'),
    saveAlternate: mixed.save, closeAlternate: mixed.close });
  useFileEvents({ session: files.session, mixed, exportNote: note.exportNote });
  const openWorkspaceEntry = async (entry: WorkspaceEntry, onApplied: () => void) => {
    setActiveView('editor');
    if (entry.kind === 'markdown') {
      await files.session.openWorkspace(entry.relativePath, onApplied);
      return;
    }
    if (entry.kind !== 'note') return;
    const openNote = async () => {
      const opened = await mixed.openWorkspace(entry.relativePath, async () => {
        try { await files.session.detachCurrent(); return true; }
        catch (cause) { files.session.notifyError(cause); return false; }
      });
      if (opened) onApplied();
    };
    const store = useNoteStore.getState();
    if (store.isDirty || store.isComposing) {
      await files.session.newDocument(() => { void openNote(); });
      return;
    }
    await openNote();
  };
  const workspace = useWorkspace({ port: workspacePort, openEntry: openWorkspaceEntry });
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    update();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener?.(update);
    return () => media.removeListener?.(update);
  }, []);
  const theme = resolvedTheme(themePreference, systemDark);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    saveThemePreference(themePreference);
  }, [theme, themePreference]);
  const selectView = (view: AppView) => {
    if (viewSwitchBlocked(files)) return;
    if (view === 'demo' && activeView !== 'demo' && !note.synchronize()) return;
    if (view === 'qualification' && activeView !== 'qualification' && (files.state.file || useNoteStore.getState().isDirty || !note.currentNote)) {
      void files.session.newDocument(() => setActiveView(view)).catch(cause => files.session.notifyError(cause));
      return;
    }
    setActiveView(view);
  };
  const selectHtmlBlock = (blockId: string) => {
    setSelectedHtmlBlockId(blockId);
    setInspectorTab('block');
    if (workspaceMode !== 'focus') setInspectorOpen(true);
  };
  const title = note.currentNote?.metadata.title ?? 'Untitled';
  const selectedBlock = note.currentNote?.mixed?.metadata.formatVersion === 1
    ? note.currentNote.mixed.blocks.find(block => block.id === selectedHtmlBlockId) : undefined;
  const collectHtmlBlock = async (blockId: string) => {
    const current = useNoteStore.getState().currentNote;
    const file = mixed.state.file;
    if (!visualLibrary.available) {
      files.session.notifyError(new MarkdownFileError('unsupported', 'Visual Library 仅在桌面版可用'));
      return;
    }
    if (dirty) {
      files.session.notifyError(new MarkdownFileError('dirty', '请先保存当前 Mixed Note，再收藏 HTML Visual'));
      return;
    }
    if (mixed.state.externalConflict) {
      files.session.notifyError(new MarkdownFileError('externalConflict', '磁盘内容已被外部修改，请先处理冲突再收藏 Visual'));
      return;
    }
    if (!current?.mixed || current.mixed.metadata.formatVersion !== 1 || !file || file.readOnly) {
      files.session.notifyError(new MarkdownFileError('readonly', '当前 HTML Visual 尚未绑定到可写 Mixed Note'));
      return;
    }
    const index = current.mixed.blocks.findIndex(block => block.id === blockId);
    if (index < 0) {
      files.session.notifyError(new MarkdownFileError('notFound', '当前 Mixed Note 中找不到要收藏的 HTML Visual'));
      return;
    }
    const item = await visualLibrary.collect({
      noteId: file.id,
      revision: file.revision,
      blockId,
      title: `${current.metadata.title} · Visual ${index + 1}`,
    });
    if (item) {
      setSidebarOpen(true);
      setSidebarView('visuals');
    }
  };
  const insertVisual = async (visualId: string) => {
    const current = useNoteStore.getState().currentNote;
    const file = mixed.state.file;
    const api = editorRef.current;
    if (!current?.mixed || current.mixed.metadata.formatVersion !== 1 || !file || file.readOnly || !api || !files.editorReady) {
      files.session.notifyError(new MarkdownFileError('readonly', '请先打开一个可写的 Mixed Note，再插入收藏的 Visual'));
      return;
    }
    if (note.isComposing || mixed.state.busy || mixed.state.externalConflict) {
      files.session.notifyError(new MarkdownFileError('busy', '当前 Mixed Note 暂时不能插入 Visual'));
      return;
    }
    const packageValue = await visualLibrary.load(visualId);
    if (!packageValue) return;
    const targetId = crypto.randomUUID();
    const block = {
      id: targetId,
      html: packageValue.item.html,
      originalHtml: packageValue.originalHtml,
      config: JSON.parse(JSON.stringify(packageValue.item.config)),
    };
    let content = '';
    try { content = api.previewHtmlBlock(targetId, 'normal'); }
    catch (cause) { files.session.notifyError(cause); return; }
    const candidate = {
      metadata: { ...current.mixed.metadata, updatedAt: new Date().toISOString() },
      blocks: [...current.mixed.blocks, block],
    };
    const imports: BlockAssetImport[] = packageValue.assets.map(asset => ({
      blockId: targetId,
      path: asset.path,
      bytes: asset.bytes,
    }));
    if (await mixed.commit(content, candidate, imports)) {
      setActiveView('editor');
      selectHtmlBlock(targetId);
    }
  };
  const showSidebar = sidebarOpen && workspaceMode !== 'focus';
  const showInspector = inspectorOpen && workspaceMode !== 'focus';
  const fileActions = <WritingHeader activeView={activeView} note={note} files={files} mixed={mixed} editorRef={editorRef} />;
  const topbarStatus = files.state.busy || mixed.state.busy ? 'Local · Working…' : dirty ? 'Local · Modified' : 'Local · Saved';
  const exportCurrent = () => {
    if (note.currentNote?.metadata.type === 'mixed') void mixed.exportMarkdown();
    else note.exportNote();
  };
  const deleteWorkspaceEntry = async (entry: Parameters<typeof workspace.deleteEntry>[0]) => {
    const active = workspace.activeRelativePath;
    const containsActive = !!active && (active === entry.relativePath || active.startsWith(entry.relativePath + '/'));
    if (containsActive) {
      await files.session.closeDocument();
      if (useNoteStore.getState().currentNote) return;
    }
    await workspace.deleteEntry(entry);
  };

  return <div className="app writing-app" data-view-mode={workspaceMode}
      data-sidebar-open={showSidebar ? 'true' : 'false'} data-inspector-open={showInspector ? 'true' : 'false'}>
    <WorkspaceTopbar mode={workspaceMode} title={title} documentPath={note.currentNote?.path}
      mixed={note.currentNote?.metadata.type === 'mixed'} modified={dirty}
      sidebarOpen={showSidebar} inspectorOpen={showInspector}
      themePreference={themePreference} resolvedTheme={theme}
      searchQuery={workspace.query} searchDisabled={!workspace.snapshot} onSearchQueryChange={workspace.setQuery}
      exportDisabled={!note.currentNote || note.isComposing || !!files.state.busy || !!mixed.state.busy}
      onExport={exportCurrent}
      statusNode={<>
        <span className="workspace-status-copy">{topbarStatus}</span>
        <span className="workspace-file-status-sr"><FileStatus session={files.session} state={files.state}
          hasDocument={!!note.currentNote} dirty={dirty} composing={note.isComposing} ready={files.editorReady} /></span>
      </>}
      onModeChange={setWorkspaceMode} onToggleSidebar={() => setSidebarOpen(value => !value)}
      onToggleInspector={() => setInspectorOpen(value => !value)}
      onToggleTheme={() => setThemePreference(value => nextThemePreference(value))} />
    {showSidebar && <WorkspaceSidebar activeView={activeView} fileActions={fileActions}
      searchQuery={workspace.query} searchDisabled={!workspace.snapshot} view={sidebarView}
      onSearchQueryChange={workspace.setQuery} onViewChange={setSidebarView}
      workspaceContent={sidebarView === 'visuals'
        ? <VisualLibraryPanel items={visualLibrary.items} busy={visualLibrary.busy} error={visualLibrary.error}
            notice={visualLibrary.notice} readAsset={visualLibrary.readAsset}
            insertDisabled={note.currentNote?.metadata.type !== 'mixed' || !mixed.state.file || mixed.state.file.readOnly
              || !!mixed.state.busy || !!mixed.state.externalConflict || note.isComposing || !files.editorReady}
            onRefresh={() => void visualLibrary.refresh()} onInsert={id => void insertVisual(id)}
            onUpdate={value => void visualLibrary.updateMetadata(value)}
            onTrash={id => void visualLibrary.trash(id)} onRestore={id => void visualLibrary.restore(id)} />
        : <WorkspaceNavigation snapshot={workspace.snapshot} busy={workspace.busy} error={workspace.error}
            query={workspace.query} view={sidebarView} results={workspace.results} recent={workspace.recent}
            activeRelativePath={workspace.activeRelativePath} selectedFolder={workspace.selectedFolder}
            expanded={workspace.expanded} renameDisabled={dirty || note.isComposing || !!files.state.busy || !!mixed.state.busy}
            onPick={() => void workspace.pick()} onRefresh={() => void workspace.refresh()}
            onOpen={entry => void workspace.open(entry)} onRename={(entry, name) => void workspace.rename(entry, name)}
            onDelete={entry => void deleteWorkspaceEntry(entry)} />}
      fileActionsDisabled={!!files.state.busy || !!files.state.pending || note.isComposing || !!workspace.busy}
      onNew={() => void workspace.createNote()}
      onOpen={() => void files.session.open().catch(cause => files.session.notifyError(cause))}
      onSelectView={selectView} />}
    <main className="writing-main">
      <div className="writing-feedback-stack">
        {note.error && <p role="alert" className="writing-error">{note.error}</p>}
        {note.notice && <p role="status" className="writing-notice">{note.notice}</p>}
        {!files.state.pending && <FileErrorView error={files.state.error} />}
        {!files.state.pending && files.state.notice && <p role="status" className="writing-notice">{files.state.notice}</p>}
        {mixed.state.error && <FileErrorView error={mixed.state.error} />}
        {mixed.state.notice && !(mixed.state.file?.diagnostics?.length) && <p role="status" className="writing-notice">{mixed.state.notice}</p>}
        {(mixed.state.file?.diagnostics ?? []).map((diagnostic, index) => diagnostic.kind === 'missingBlock' && diagnostic.blockId
          ? <div role="alert" className="writing-error" key={`missing-${index}`}>检测到缺失的 HTML Block 引用。
              <button aria-label="移除缺失 HTML Block 引用" disabled={!!mixed.state.busy} onClick={() => void mixed.repairMissing(diagnostic.blockId!)}>移除缺失引用</button>
            </div>
          : diagnostic.kind === 'orphanBlock' && diagnostic.blockId
            ? <div role="status" className="writing-notice" key={`orphan-${index}`}>检测到未被正文引用的 HTML Block。
                <button aria-label="恢复孤立 HTML Block" disabled={!!mixed.state.busy} onClick={() => void mixed.restoreOrphan(diagnostic.blockId!)}>恢复 Block</button>
              </div>
            : <div role="alert" className="writing-error" key={`diagnostic-${index}`}>Note 结构异常，已保留原始内容并进入安全模式。</div>)}
        {mixed.state.externalConflict && <div role="alert" aria-label="Mixed Note 外部修改冲突" className="writing-error">
          磁盘内容已被外部修改；本地修改尚未覆盖磁盘。
          <button aria-label="采用磁盘版本" disabled={!!mixed.state.busy} onClick={() => void mixed.reloadExternal()}>采用磁盘版本</button>
          <button aria-label="另存本地版本" disabled={!!mixed.state.busy} onClick={() => void mixed.saveLocalAs()}>另存本地版本</button>
        </div>}
      </div>
      <WritingWorkspace activeView={activeView} editorRef={editorRef} note={note} files={files} mixed={mixed}
        workspaceMode={workspaceMode} onHtmlBlockSelect={selectHtmlBlock} onCollectHtmlBlock={collectHtmlBlock}
        onPasteHtmlSource={source => storeHtmlSource(source, files, mixed, editorRef)} />
      <DebugPanel activeView={activeView} />
    </main>
    {showInspector && <WorkspaceInspector tab={inspectorTab} markdown={note.currentNote?.contentMd ?? ''} title={title}
      type={note.currentNote?.metadata.type ?? 'markdown'} dirty={dirty} selectedBlockId={selectedHtmlBlockId}
      selectedBlock={selectedBlock} onTabChange={setInspectorTab}
      onOutlineSelect={index => editorRef.current?.revealHeading(index)}
      onClose={() => setInspectorOpen(false)} />}
    <UnsavedDialog session={files.session} state={files.state} composing={note.isComposing} exportNote={note.exportNote}
      canSave={note.currentNote?.metadata.type === 'mixed' ? true : undefined} />
  </div>;
}

function DebugView() {
  const currentNote = useNoteStore(state => state.currentNote);
  return <div className="demo-view writing-debug">
    <h2>当前笔记状态</h2>
    <section><h3>Metadata</h3><pre>{JSON.stringify(currentNote?.metadata, null, 2)}</pre></section>
    <section><h3>Markdown</h3><pre>{currentNote?.contentMd}</pre></section>
  </div>;
}

export default App;

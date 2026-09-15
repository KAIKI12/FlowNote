import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
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
      throw new Error('当前阶段只导出普通 Markdown，Mixed Note 导出尚未实现');
    }
    downloadText({ content: api.getMarkdown(), fileName: 'FlowNote.md', type: 'text/markdown;charset=utf-8' });
    setNotice('已请求导出 FlowNote.md，请查看下载位置。');
  });
  return { currentNote, onContentChange: updateContent, synchronize, exportNote, isComposing, error, notice };
}

function Sidebar({ activeView, selectView }: { activeView: AppView; selectView: (view: AppView) => void }) {
  return <aside className="writing-sidebar">
    <h1>FlowNote</h1>
    <p className="writing-sidebar-caption">专注写作，清晰记录</p>
    <nav aria-label="应用视图">
      <button className={activeView === 'editor' ? 'active' : ''} onClick={() => selectView('editor')}>Markdown 写作</button>
      {import.meta.env.DEV && <>
        <span className="writing-dev-label">开发工具</span>
        <button className={activeView === 'qualification' ? 'active' : ''} onClick={() => selectView('qualification')}>Markdown Gate</button>
        <button className={activeView === 'demo' ? 'active' : ''} onClick={() => selectView('demo')}>调试状态</button>
      </>}
    </nav>
    <p className="writing-sidebar-help">Ctrl+B 加粗<br />Ctrl+I 斜体<br />Ctrl+Z 撤销<br />Ctrl+O 打开<br />Ctrl+S 保存 / 网页导出</p>
  </aside>;
}

type AppNote = ReturnType<typeof useAppNote>;
type AppFiles = ReturnType<typeof useDocumentFiles>;

function WritingHeader({ activeView, note, files }: { activeView: AppView; note: AppNote; files: AppFiles }) {
  const dirty = useNoteStore(state => state.isDirty);
  const controls = { ...files, hasDocument: !!note.currentNote, dirty, composing: note.isComposing, ready: files.editorReady };
  return <header className="writing-header">
    <div className="writing-file-heading"><h2>Markdown 写作</h2><FileStatus {...controls} /></div>
    <div className="writing-header-actions"><FileToolbar {...controls} />
      <button aria-label="导出 Markdown 笔记" disabled={activeView === 'demo' || note.isComposing || !note.currentNote || !files.editorReady}
        onClick={note.exportNote}>导出 Markdown</button>
    </div>
  </header>;
}

function DebugPanel({ activeView }: { activeView: AppView }) {
  if (!import.meta.env.DEV || activeView !== 'demo') return null;
  return <DebugView />;
}

function useFileEvents({ session, exportNote }: { session: DocumentSession; exportNote: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!(event.ctrlKey || event.metaKey) || !['s', 'o'].includes(key)) return;
      event.preventDefault();
      if (event.isComposing) { session.notifyError(new MarkdownFileError('composing', '请先完成组合输入')); return; }
      if (key === 's' && !session.port.canWrite) { exportNote(); return; }
      void (key === 'o' ? session.open() : session.save(event.shiftKey)).catch(cause => session.notifyError(cause));
    };
    const protect = (event: BeforeUnloadEvent) => {
      const latest = useNoteStore.getState();
      if (!latest.isDirty && !latest.isComposing && !session.getSnapshot().busy) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', protect);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', protect); };
  }, [session, exportNote]);
}

function WritingWorkspace({ activeView, editorRef, note, files }: {
  activeView: AppView; editorRef: RefObject<FlowNoteEditorApi>; note: AppNote; files: AppFiles;
}) {
  if (!note.currentNote) return <p className="file-empty-state">尚未打开笔记。使用「新建」开始写作，或「打开」选择 Markdown 文件。</p>;
  const showQualification = import.meta.env.DEV && activeView === 'qualification';
  return <MilkdownProvider key={files.state.documentKey}>
    <div hidden={activeView === 'demo'} className={'writing-workspace ' + (showQualification ? 'qualification-workspace' : 'editor-workspace')}>
      <FlowNoteEditor ref={editorRef} initialContent={note.currentNote.contentMd} onContentChange={note.onContentChange}
        onReadyChange={files.readyChanged} readLockRef={files.readLockRef} />
      {showQualification && QualificationPanel && <Suspense fallback={<p role="status">正在加载测试面板…</p>}>
        <QualificationPanel editorRef={editorRef} />
      </Suspense>}
    </div>
  </MilkdownProvider>;
}

function viewSwitchBlocked(files: AppFiles): boolean {
  return files.state.busy === 'closing' || useNoteStore.getState().isComposing;
}

function App({ filePort }: { filePort?: MarkdownFilePort } = {}) {
  const [activeView, setActiveView] = useState<AppView>('editor');
  const editorRef = useRef<FlowNoteEditorApi | null>(null);
  const note = useAppNote(editorRef);
  const files = useDocumentFiles({ editorRef, port: filePort, showEditor: () => setActiveView('editor') });
  useFileEvents({ session: files.session, exportNote: note.exportNote });
  const selectView = (view: AppView) => {
    if (viewSwitchBlocked(files)) return;
    if (view === 'demo' && activeView !== 'demo' && !note.synchronize()) return;
    if (view === 'qualification' && activeView !== 'qualification' && (files.state.file || useNoteStore.getState().isDirty || !note.currentNote)) {
      void files.session.newDocument(() => setActiveView(view)).catch(cause => files.session.notifyError(cause));
      return;
    }
    setActiveView(view);
  };
  return <div className="app writing-app">
    <Sidebar activeView={activeView} selectView={selectView} />
    <main className="writing-main">
      <WritingHeader activeView={activeView} note={note} files={files} />
      {note.error && <p role="alert" className="writing-error">{note.error}</p>}
      {note.notice && <p role="status" className="writing-notice">{note.notice}</p>}
      {!files.state.pending && <FileErrorView error={files.state.error} />}
      {!files.state.pending && files.state.notice && <p role="status" className="writing-notice">{files.state.notice}</p>}
      <WritingWorkspace activeView={activeView} editorRef={editorRef} note={note} files={files} />
      <DebugPanel activeView={activeView} />
    </main>
    <UnsavedDialog session={files.session} state={files.state} composing={note.isComposing} exportNote={note.exportNote} />
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

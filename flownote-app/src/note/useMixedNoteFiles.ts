import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { FlowNoteEditorApi } from '../editor/editorTypes';
import { renderBrowserBundle } from '../export/browserBundle';
import { fileError, MarkdownFileError } from '../files/fileTypes';
import { mixedFingerprint, validateHtmlSource } from './htmlBlockData';
import type { MixedNoteData, MixedNoteMetadata } from './mixedTypes';
import { createNativeNotePort } from './nativeNotePort';
import type { BlockAssetEdit, BlockAssetInfo, NativeNotePort, NoteAssetData, NoteProbe, NoteSnapshot } from './nativeNotePort';
import { useNoteStore } from './noteStore';
import type { NoteStructure } from './noteTypes';

interface MixedFileState {
  file: NoteSnapshot | null;
  documentKey: number;
  busy: 'open' | 'save' | 'reload' | 'export' | null;
  error: MarkdownFileError | null;
  notice: string;
  externalConflict: NoteProbe | null;
}

interface Options {
  editorRef: MutableRefObject<FlowNoteEditorApi | null>;
  port?: NativeNotePort;
  showEditor: () => void;
}

function currentMixed(snapshot: NoteSnapshot): MixedNoteData | undefined {
  const metadata = snapshot.mixed.metadata;
  if (metadata.formatVersion !== 1 || metadata.type !== 'mixed') return undefined;
  return { metadata: metadata as unknown as MixedNoteMetadata, blocks: snapshot.mixed.blocks };
}

function noteFromSnapshot(snapshot: NoteSnapshot): NoteStructure {
  const mixed = currentMixed(snapshot);
  const metadata = snapshot.mixed.metadata;
  const now = new Date().toISOString();
  return {
    path: snapshot.path,
    contentMd: snapshot.content,
    htmlBlocks: new Map((mixed?.blocks ?? []).map(block => [block.id, block.html])),
    assets: [],
    metadata: {
      version: Number(metadata.formatVersion) || 1,
      type: 'mixed',
      title: typeof metadata.title === 'string' ? metadata.title : snapshot.name.replace(/\.note$/i, ''),
      createdAt: typeof metadata.createdAt === 'string' ? metadata.createdAt : now,
      updatedAt: typeof metadata.updatedAt === 'string' ? metadata.updatedAt : now,
    },
    mixed,
    diagnostics: snapshot.diagnostics ?? [],
  };
}

function cloneMixed(value: MixedNoteData): MixedNoteData {
  return JSON.parse(JSON.stringify(value)) as MixedNoteData;
}

function defaultName(title: string): string {
  const safe = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().replace(/[. ]+$/g, '') || 'untitled';
  return safe.toLowerCase().endsWith('.note') ? safe : `${safe}.note`;
}

function defaultExportFolder(title: string): string {
  const safe = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim()
    .replace(/^[. ]+|[. ]+$/g, '') || 'FlowNote';
  return `${safe}-export`;
}

export function useMixedNoteFiles(options: Options) {
  const port = useRef(options.port ?? createNativeNotePort()).current;
  const latest = useRef(options);
  latest.current = options;
  const initial: MixedFileState = { file: null, documentKey: 0, busy: null, error: null, notice: '', externalConflict: null };
  const [state, setState] = useState(initial);
  const stateRef = useRef(initial);
  const probing = useRef(false);
  const pendingExternal = useRef(false);
  const disposed = useRef(false);
  const update = (patch: Partial<MixedFileState>) => {
    const next = { ...stateRef.current, ...patch };
    stateRef.current = next;
    setState(next);
  };
  const report = (cause: unknown) => update({ busy: null, error: fileError(cause), notice: '' });

  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      pendingExternal.current = false;
      if (stateRef.current.file) void port.release(stateRef.current.file.id);
    };
  }, [port]);

  const apply = (file: NoteSnapshot) => {
    const next: MixedFileState = { ...stateRef.current, file, documentKey: stateRef.current.documentKey + 1,
      busy: null, error: null, notice: file.notice ?? '', externalConflict: null };
    stateRef.current = next;
    setState(next);
    useNoteStore.getState().setCurrentNote(noteFromSnapshot(file));
    latest.current.showEditor();
  };

  const checkExternal = async () => {
    const file = stateRef.current.file;
    if (disposed.current || !file || !port.probe || stateRef.current.busy || probing.current) return;
    probing.current = true;
    try {
      const probe = await port.probe(file.id);
      if (disposed.current) return;
      if (stateRef.current.file?.id !== file.id || !probe.changed) { pendingExternal.current = false; return; }
      const store = useNoteStore.getState();
      if (store.isComposing) { pendingExternal.current = true; return; }
      pendingExternal.current = false;
      if (store.isDirty) {
        update({ externalConflict: probe, notice: '检测到磁盘外部修改，本地修改尚未覆盖磁盘。' });
        return;
      }
      update({ busy: 'reload', error: null });
      const reloaded = await port.reload(file.id);
      if (disposed.current) return;
      const latestStore = useNoteStore.getState();
      if (latestStore.isComposing || latestStore.isDirty) {
        pendingExternal.current = latestStore.isComposing;
        update({ file: reloaded, busy: null, externalConflict: probe,
          notice: '磁盘内容已更新；本地状态同时发生变化，未自动覆盖。' });
        return;
      }
      apply(reloaded);
      update({ notice: '已从磁盘更新。' });
    } catch (cause) { if (!disposed.current) report(cause); }
    finally { probing.current = false; }
  };

  const composing = useNoteStore(value => value.isComposing);
  useEffect(() => {
    if (!state.file || !port.probe) return;
    const interval = setInterval(() => { void checkExternal(); }, import.meta.env.DEV ? 50 : 1000);
    return () => clearInterval(interval);
  }, [state.file?.id, port]);
  useEffect(() => {
    if (!composing && pendingExternal.current) void checkExternal();
  }, [composing]);

  const openCandidate = async (
    loader: () => Promise<NoteSnapshot | null>,
    beforeApply?: () => Promise<boolean>,
  ): Promise<boolean> => {
    const store = useNoteStore.getState();
    if (store.isDirty || store.isComposing) { report(new MarkdownFileError('dirty', '请先处理当前未保存修改，再打开 Mixed Note')); return false; }
    if (stateRef.current.busy) { report(new MarkdownFileError('busy', '请等待当前 Note 操作完成')); return false; }
    update({ busy: 'open', error: null, notice: '' });
    let candidate: NoteSnapshot | null = null;
    try {
      candidate = await loader();
      if (!candidate) { update({ busy: null }); return false; }
      const current = useNoteStore.getState();
      if (current.isDirty || current.isComposing || beforeApply && !(await beforeApply())) {
        await port.release(candidate.id);
        report(new MarkdownFileError('dirty', '选择 Note 期间当前文档发生变化，未切换文件'));
        return false;
      }
      const previous = stateRef.current.file;
      apply(candidate);
      if (previous && previous.id !== candidate.id) await port.release(previous.id);
      return true;
    } catch (cause) {
      if (candidate) await port.release(candidate.id).catch(() => undefined);
      report(cause);
      return false;
    }
  };

  const open = (beforeApply?: () => Promise<boolean>) => openCandidate(() => port.open(), beforeApply);
  const openWorkspace = (relativePath: string, beforeApply?: () => Promise<boolean>): Promise<boolean> => {
    if (!port.openWorkspace) {
      report(new MarkdownFileError('unsupported', '当前 Note 入口不支持 Workspace 打开'));
      return Promise.resolve(false);
    }
    return openCandidate(() => port.openWorkspace!(relativePath), beforeApply);
  };

  const create = async (content: string, mixed: MixedNoteData, name?: string, beforeApply?: () => Promise<void>, assets: NoteAssetData[] = []): Promise<boolean> => {
    const store = useNoteStore.getState();
    if (stateRef.current.busy) { report(new MarkdownFileError('busy', '请等待当前 Note 操作完成')); return false; }
    if (store.isComposing) { report(new MarkdownFileError('composing', '请先完成组合输入，再创建 Mixed Note')); return false; }
    update({ busy: 'save', error: null, notice: '' });
    try {
      const saved = await port.saveAs({ name: name ?? defaultName(mixed.metadata.title), content, mixed, assets });
      if (!saved) { update({ busy: null }); return false; }
      if (beforeApply) await beforeApply();
      const previous = stateRef.current.file;
      apply(saved);
      if (previous && previous.id !== saved.id) await port.release(previous.id);
      return true;
    } catch (cause) { report(cause); return false; }
  };

  const commit = async (content: string, mixed: MixedNoteData): Promise<boolean> => {
    const store = useNoteStore.getState();
    const file = stateRef.current.file;
    if (stateRef.current.busy) { report(new MarkdownFileError('busy', '请等待当前 Note 操作完成')); return false; }
    if (store.isComposing) { report(new MarkdownFileError('composing', '请先完成组合输入，再修改 Mixed Note')); return false; }
    if (!file || file.readOnly) { report(new MarkdownFileError('readonly', '当前 Mixed Note 不可直接写入')); return false; }
    update({ busy: 'save', error: null, notice: '' });
    try {
      apply(await port.save({ id: file.id, revision: file.revision, content, mixed: cloneMixed(mixed) }));
      return true;
    } catch (cause) { report(cause); return false; }
  };

  const save = async (asNew = false): Promise<boolean> => {
    const store = useNoteStore.getState();
    const note = store.currentNote;
    const api = latest.current.editorRef.current;
    if (stateRef.current.busy) { report(new MarkdownFileError('busy', '请等待当前 Note 操作完成')); return false; }
    if (store.isComposing) { report(new MarkdownFileError('composing', '请先完成组合输入，再保存 Mixed Note')); return false; }
    if (stateRef.current.externalConflict && !asNew) {
      report(new MarkdownFileError('externalConflict', '磁盘内容已被外部修改；请先采用磁盘版本或另存本地版本'));
      return false;
    }
    if (!note?.mixed || note.mixed.metadata.formatVersion !== 1) { report(new MarkdownFileError('unsupported', '当前不是可写的 Format v1 Mixed Note')); return false; }
    if (!api) { report(new MarkdownFileError('notReady', '编辑器尚未准备就绪')); return false; }
    const content = api.getMarkdown();
    const mixed = cloneMixed(note.mixed);
    const fingerprint = mixedFingerprint(mixed);
    const file = stateRef.current.file;
    update({ busy: 'save', error: null, notice: '' });
    try {
      const saved = file && !asNew && !file.readOnly
        ? await port.save({ id: file.id, revision: file.revision, content, mixed })
        : await port.saveAs({ name: file?.name ?? defaultName(note.metadata.title), content, mixed, sourceId: file?.id });
      if (!saved) { update({ busy: null }); return false; }
      const latestStore = useNoteStore.getState();
      const clean = latest.current.editorRef.current?.getMarkdown() === content && !latestStore.isComposing
        && mixedFingerprint(latestStore.currentNote?.mixed) === fingerprint;
      if (clean) apply(saved);
      else update({ file: saved, busy: null, error: null, notice: '本次保存已完成，后续输入尚未保存。' });
      if (file && file.id !== saved.id) await port.release(file.id);
      return true;
    } catch (cause) { report(cause); return false; }
  };

  const reload = async (): Promise<boolean> => {
    const store = useNoteStore.getState();
    const file = stateRef.current.file;
    if (!file) { report(new MarkdownFileError('closed', '尚未打开 Mixed Note')); return false; }
    if (store.isDirty || store.isComposing) { report(new MarkdownFileError('dirty', '存在未保存修改，不能直接重载')); return false; }
    update({ busy: 'reload', error: null, notice: '' });
    try { apply(await port.reload(file.id)); return true; }
    catch (cause) { report(cause); return false; }
  };

  const reloadExternal = async (): Promise<boolean> => {
    const file = stateRef.current.file;
    if (!file || !stateRef.current.externalConflict) return false;
    if (stateRef.current.busy) { report(new MarkdownFileError('busy', '请等待当前 Note 操作完成')); return false; }
    update({ busy: 'reload', error: null });
    try {
      apply(await port.reload(file.id));
      update({ notice: '已采用磁盘版本，本地未保存修改已放弃。' });
      return true;
    } catch (cause) { report(cause); return false; }
  };

  const saveLocalAs = async (): Promise<boolean> => {
    const store = useNoteStore.getState();
    const note = store.currentNote;
    const file = stateRef.current.file;
    const api = latest.current.editorRef.current;
    if (!stateRef.current.externalConflict || !file || !note?.mixed || !api) return false;
    if (stateRef.current.busy || store.isComposing) return false;
    const content = api.getMarkdown();
    const mixed = cloneMixed(note.mixed);
    update({ busy: 'save', error: null });
    try {
      const disk = await port.reload(file.id);
      const saved = await port.saveAs({ name: file.name, content, mixed, sourceId: disk.id });
      if (!saved) { update({ busy: null }); return false; }
      apply(saved);
      if (file.id !== saved.id) await port.release(file.id);
      return true;
    } catch (cause) { report(cause); return false; }
  };

  const duplicateBlock = async (sourceId: string): Promise<boolean> => {
    const store = useNoteStore.getState();
    const note = store.currentNote;
    const file = stateRef.current.file;
    const api = latest.current.editorRef.current;
    if (stateRef.current.busy || store.isComposing || stateRef.current.externalConflict) return false;
    if (!file || file.readOnly || !note?.mixed || note.mixed.metadata.formatVersion !== 1 || !api) return false;
    const sourceIndex = note.mixed.blocks.findIndex(block => block.id === sourceId);
    if (sourceIndex < 0) return false;
    const targetId = crypto.randomUUID();
    const mixed = cloneMixed(note.mixed);
    const target = cloneMixed({ metadata: mixed.metadata, blocks: [mixed.blocks[sourceIndex]] }).blocks[0];
    target.id = targetId;
    mixed.blocks.splice(sourceIndex + 1, 0, target);
    let content = '';
    try { content = api.previewDuplicateHtmlBlock(sourceId, targetId); }
    catch (cause) { report(cause); return false; }
    update({ busy: 'save', error: null, notice: '' });
    try {
      const saved = await port.save({ id: file.id, revision: file.revision, content, mixed,
        blockCopies: [{ sourceId, targetId }] });
      apply(saved);
      return true;
    } catch (cause) { report(cause); return false; }
  };

  const repairMissing = async (blockId: string): Promise<boolean> => {
    const file = stateRef.current.file;
    const store = useNoteStore.getState();
    if (!file || !port.repairRemoveReference) return false;
    if (stateRef.current.busy || store.isDirty || store.isComposing) return false;
    update({ busy: 'reload', error: null });
    try { apply(await port.repairRemoveReference(file.id, file.revision, blockId)); return true; }
    catch (cause) { report(cause); return false; }
  };

  const restoreOrphan = async (blockId: string): Promise<boolean> => {
    const file = stateRef.current.file;
    const store = useNoteStore.getState();
    if (!file || !port.repairRestoreOrphan) return false;
    if (stateRef.current.busy || store.isDirty || store.isComposing) return false;
    update({ busy: 'reload', error: null });
    try { apply(await port.repairRestoreOrphan(file.id, file.revision, blockId)); return true; }
    catch (cause) { report(cause); return false; }
  };


  const listAssets = async (blockId: string): Promise<BlockAssetInfo[]> => {
    const file = stateRef.current.file;
    if (!file) throw new MarkdownFileError('closed', 'Mixed Note 尚未绑定磁盘文件，无法列出 Block 资源');
    return port.listAssets(file.id, blockId);
  };

  const commitFullEditor = async (blockId: string, html: string, blockAssetEdits: BlockAssetEdit[]): Promise<boolean> => {
    const store = useNoteStore.getState();
    const note = store.currentNote;
    const file = stateRef.current.file;
    const api = latest.current.editorRef.current;
    if (stateRef.current.busy) { report(new MarkdownFileError('busy', '请等待当前 Note 操作完成')); return false; }
    if (store.isComposing) { report(new MarkdownFileError('composing', '请先完成组合输入，再保存 Full HTML Editor')); return false; }
    if (stateRef.current.externalConflict) { report(new MarkdownFileError('externalConflict', '磁盘内容已被外部修改，Full HTML Editor 不能直接覆盖')); return false; }
    if (!file || file.readOnly || !note?.mixed || note.mixed.metadata.formatVersion !== 1 || !api) {
      report(new MarkdownFileError('readonly', '当前 Mixed Note 不可通过 Full HTML Editor 写入'));
      return false;
    }
    const index = note.mixed.blocks.findIndex(block => block.id === blockId);
    if (index < 0 || blockAssetEdits.some(edit => edit.blockId !== blockId)) {
      report(new MarkdownFileError('invalidFormat', 'Full HTML Editor Block 状态无效'));
      return false;
    }
    try { validateHtmlSource(html); }
    catch (cause) { report(cause); return false; }
    const content = api.getMarkdown();
    const mixed = cloneMixed(note.mixed);
    mixed.blocks[index].html = html;
    update({ busy: 'save', error: null, notice: '' });
    try {
      const saved = await port.save({ id: file.id, revision: file.revision, content, mixed, blockAssetEdits });
      apply(saved);
      return true;
    } catch (cause) { report(cause); return false; }
  };

  const exportBrowserBundle = async (): Promise<boolean> => {
    const store = useNoteStore.getState();
    const note = store.currentNote;
    const file = stateRef.current.file;
    const api = latest.current.editorRef.current;
    if (stateRef.current.busy) { report(new MarkdownFileError('busy', '请等待当前 Note 操作完成')); return false; }
    if (store.isComposing) { report(new MarkdownFileError('composing', '请先完成组合输入，再导出 Browser Bundle')); return false; }
    if (stateRef.current.externalConflict) {
      report(new MarkdownFileError('externalConflict', '磁盘内容已被外部修改；请先处理冲突再导出 Browser Bundle'));
      return false;
    }
    if (!file || file.readOnly || !note?.mixed || note.mixed.metadata.formatVersion !== 1 || !api) {
      report(new MarkdownFileError('readonly', '当前 Mixed Note 不可导出 Browser Bundle'));
      return false;
    }

    let draft;
    let snapshot;
    try {
      snapshot = api.getBrowserBundleSnapshot();
      draft = await renderBrowserBundle(snapshot, cloneMixed(note.mixed), note.metadata.title,
        (blockId, path) => port.readAsset(file.id, blockId, path));
    } catch (cause) { report(cause); return false; }

    update({ busy: 'export', error: null, notice: '' });
    try {
      const result = await port.exportBrowserBundle({
        id: file.id,
        revision: file.revision,
        folderName: defaultExportFolder(note.metadata.title),
        title: note.metadata.title,
        content: snapshot.markdown,
        indexHtml: draft.indexHtml,
        blocks: draft.blocks,
      });
      if (!result) { update({ busy: null }); return false; }
      update({ busy: null, error: null, notice: `已导出 Browser Bundle：${result.path}` });
      return true;
    } catch (cause) { report(cause); return false; }
  };

  const readAsset = async (blockId: string, path: string) => {
    const file = stateRef.current.file;
    if (!file) throw new MarkdownFileError('closed', 'Mixed Note 尚未绑定磁盘文件，无法读取 Block 资源');
    return port.readAsset(file.id, blockId, path);
  };

  const readNoteImage = async (path: string) => {
    const file = stateRef.current.file;
    if (!file) throw new MarkdownFileError('closed', 'Mixed Note 尚未绑定磁盘文件，无法读取 Markdown 图片');
    return port.readNoteImage(file.id, path);
  };

  const close = async (): Promise<void> => {
    const file = stateRef.current.file;
    if (file) await port.release(file.id);
    useNoteStore.getState().setCurrentNote(null);
    pendingExternal.current = false;
    update({ file: null, busy: null, error: null, notice: '', externalConflict: null,
      documentKey: stateRef.current.documentKey + 1 });
  };

  return { state, open, openWorkspace, create, commit, save, reload, reloadExternal, saveLocalAs, duplicateBlock,
    repairMissing, restoreOrphan, listAssets, commitFullEditor, exportBrowserBundle, readAsset, readNoteImage, close };
}

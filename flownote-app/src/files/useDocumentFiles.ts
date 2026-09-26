import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { MutableRefObject } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import type { FlowNoteEditorApi } from '../editor/editorTypes';
import type { AcquireEditorReadLock } from '../editor/editorSession';
import { useNoteStore } from '../note/noteStore';
import type { NoteStructure } from '../note/noteTypes';
import { defaultFilePort } from './defaultFilePort';
import { DocumentSession } from './documentSession';
import type { MarkdownFile, MarkdownFilePort } from './fileTypes';

function noteFromFile(file: MarkdownFile | null): NoteStructure {
  const now = new Date().toISOString();
  return { path: file?.path ?? 'untitled.md', contentMd: file?.content ?? '', htmlBlocks: new Map(), assets: [],
    metadata: { version: 1, type: 'markdown', title: file?.name.replace(/\.(md|markdown)$/i, '') ?? '未命名', createdAt: now, updatedAt: now } };
}

function useDesktopClose(session: DocumentSession): void {
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const stop = await getCurrentWindow().onCloseRequested(event => {
        event.preventDefault();
        void session.requestWindowClose().catch(cause => session.notifyError(cause));
      });
      if (disposed) stop(); else unlisten = stop;
    }).catch(cause => session.notifyError(cause));
    return () => { disposed = true; unlisten?.(); };
  }, [session]);
}

interface FileHookOptions {
  editorRef: MutableRefObject<FlowNoteEditorApi | null>;
  port?: MarkdownFilePort;
  showEditor: () => void;
  saveAlternate?: (asNew: boolean) => Promise<boolean>;
  closeAlternate?: () => Promise<void>;
}

async function closeDesktopWindow({ acquire, ready, composing }: {
  acquire: AcquireEditorReadLock | null; ready: boolean; composing: boolean;
}): Promise<void> {
  if (ready && !acquire && !composing) throw new Error('编辑器关闭保护尚未就绪，请稍候');
  const release = composing ? undefined : acquire?.();
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().destroy();
  } catch (cause) { release?.(); throw cause; }
}

export function useDocumentFiles(options: FileHookOptions) {
  const latest = useRef(options);
  latest.current = options;
  const ready = useRef(false);
  const readLockRef = useRef<AcquireEditorReadLock | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const readyChanged = useCallback((value: boolean) => { ready.current = value; setEditorReady(value); }, []);
  const [session] = useState(() => createSession({ latest, ready, readyChanged, readLockRef }));
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const composing = useNoteStore(value => value.isComposing);
  useEffect(() => { session.activate(); return () => session.dispose(); }, [session]);
  useEffect(() => { void session.resumePending().catch(cause => session.notifyError(cause)); }, [session, composing, state.pending]);
  useDesktopClose(session);
  return { session, state, editorReady, readyChanged, readLockRef };
}

function createSession({ latest, ready, readyChanged, readLockRef }: {
  latest: MutableRefObject<FileHookOptions>; ready: MutableRefObject<boolean>; readyChanged: (value: boolean) => void;
  readLockRef: MutableRefObject<AcquireEditorReadLock | null>;
}): DocumentSession {
  const apply = (file: MarkdownFile | null, close = false) => {
    readyChanged(false);
    latest.current.editorRef.current = null;
    useNoteStore.getState().setCurrentNote(close ? null : noteFromFile(file));
    latest.current.showEditor();
  };
  return new DocumentSession(latest.current.port ?? defaultFilePort(), {
    read: () => {
      const store = useNoteStore.getState();
      const api = latest.current.editorRef.current;
      const available = ready.current && !!api;
      return { hasDocument: !!store.currentNote, ready: available, composing: store.isComposing,
        dirty: store.isDirty, kind: store.currentNote?.htmlBlocks.size ? 'mixed' : store.currentNote?.metadata.type ?? 'markdown',
        content: available ? api.getMarkdown() : store.currentNote?.contentMd ?? '' };
    },
    apply: file => apply(file), close: () => apply(null, true),
    saved: update => useNoteStore.setState(store => ({
      currentNote: store.currentNote && { ...store.currentNote, path: update.file.path, contentMd: update.content,
        metadata: { ...store.currentNote.metadata, title: update.file.name.replace(/\.(md|markdown)$/i, ''), updatedAt: new Date().toISOString() } },
      isDirty: !update.clean,
    })),
    saveAlternate: asNew => latest.current.saveAlternate?.(asNew) ?? Promise.resolve(false),
    closeAlternate: () => latest.current.closeAlternate?.() ?? Promise.resolve(),
    closeWindow: () => closeDesktopWindow({ acquire: readLockRef.current, ready: ready.current,
      composing: useNoteStore.getState().isComposing }),
  });
}

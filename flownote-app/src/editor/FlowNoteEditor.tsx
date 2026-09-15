import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { MutableRefObject } from 'react';
import { Milkdown, useEditor } from '@milkdown/react';
import { useNoteStore } from '../note/noteStore';
import type { FlowNoteEditorApi, EditorMode } from './editorTypes';
import { EditorToolbar } from './EditorToolbar';
import { EditorSession } from './editorSession';
import type { AcquireEditorReadLock } from './editorSession';
import { createEditorApi, createFlowEditor } from './editorRuntime';
import { EditorModeBar, SourceConflict, SourceEditor } from './SourceEditor';
import type { HtmlBlockHost } from './plugins/htmlBlock/htmlBlockContext';

function createHtmlHost(): HtmlBlockHost {
  const mixed = () => useNoteStore.getState().currentNote?.mixed;
  return {
    knownIds: () => { const note = mixed(); return note?.metadata.formatVersion === 1 ? new Set(note.blocks.map(block => block.id)) : undefined; },
    read: id => mixed()?.blocks.find(block => block.id === id),
    update: block => useNoteStore.getState().setHtmlBlock(block),
    subscribe: listener => useNoteStore.subscribe(listener),
  };
}

interface FlowNoteEditorProps {
  initialContent?: string;
  onContentChange?: (markdown: string) => void;
  mode?: EditorMode;
  onReadyChange?: (ready: boolean) => void;
  readLockRef?: MutableRefObject<AcquireEditorReadLock | null>;
}

export const FlowNoteEditor = forwardRef<FlowNoteEditorApi, FlowNoteEditorProps>(
  ({ initialContent = '', onContentChange, mode = 'edit', onReadyChange, readLockRef }, ref) => {
    const setComposing = useNoteStore((state) => state.setComposing);
    const setDirty = useNoteStore((state) => state.setDirty);
    const inputs = useRef({ onContentChange, setComposing, setDirty });
    inputs.current = { onContentChange, setComposing, setDirty };
    const [session] = useState(() => new EditorSession({ source: initialContent, mode,
      publish: source => inputs.current.onContentChange?.(source),
      dirty: () => inputs.current.setDirty(true),
      composing: value => inputs.current.setComposing(value),
    }));
    const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
    useLayoutEffect(() => {
      if (!readLockRef) return;
      const acquire = () => session.acquireReadLock();
      readLockRef.current = acquire;
      return () => { if (readLockRef.current === acquire) readLockRef.current = null; };
    }, [readLockRef, session]);
    useEffect(() => onReadyChange?.(state.ready), [onReadyChange, state.ready]);
    const previousMode = useRef(mode);
    const { loading, get } = useEditor(root => createFlowEditor(root, session, createHtmlHost()), []);
    useImperativeHandle(ref, () => createEditorApi(session, get), [get, session]);
    useEffect(() => session.receiveExternal(initialContent), [initialContent, session]);
    useEffect(() => {
      if (!state.ready || state.composing || previousMode.current === mode) return;
      try { session.setMode(mode); }
      catch (error) { session.reportNotice(error instanceof Error ? error.message : String(error)); }
      previousMode.current = mode;
    }, [mode, state.ready, state.composing, session]);
    return (
      <div className="flownote-editor" data-mode={state.mode} data-active-editor={state.active} aria-busy={loading || !state.ready}>
        <EditorModeBar session={session} state={state} />
        <SourceConflict session={session} state={state} />
        {state.active === 'source' && <SourceEditor session={session} state={state} />}
        <div className="editor-visual-surface" hidden={state.active !== 'visual'}>
          {state.active === 'visual' && <EditorToolbar />}
          <Milkdown />
        </div>
      </div>
    );
  }
);

FlowNoteEditor.displayName = 'FlowNoteEditor';

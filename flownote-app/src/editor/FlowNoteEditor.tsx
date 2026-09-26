import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { MouseEvent as ReactMouseEvent, MutableRefObject } from 'react';
import { Milkdown, useEditor } from '@milkdown/react';
import { editorViewCtx } from '@milkdown/core';
import { TextSelection } from '@milkdown/prose/state';
import { useNoteStore } from '../note/noteStore';
import type { FlowNoteEditorApi, EditorMode } from './editorTypes';
import { EditorToolbar } from './EditorToolbar';
import { EditorSession } from './editorSession';
import type { AcquireEditorReadLock } from './editorSession';
import { createEditorApi, createFlowEditor } from './editorRuntime';
import { EditorModeBar, SourceConflict, SourceEditor } from './SourceEditor';
import type { HtmlBlockHost } from './plugins/htmlBlock/htmlBlockContext';
import type { ManagedImageReader } from './plugins/managedImageView';
import type { BlockAsset, BlockAssetEdit, BlockAssetInfo } from '../note/nativeNotePort';

function createHtmlHost(
  readAsset?: (blockId: string, path: string) => Promise<BlockAsset>,
  listAssets?: (blockId: string) => Promise<BlockAssetInfo[]>,
  commitFullEditor?: (blockId: string, html: string, edits: BlockAssetEdit[]) => Promise<boolean>,
  duplicate?: (blockId: string) => void | Promise<unknown>,
  collect?: (blockId: string) => void | Promise<unknown>,
  select?: (blockId: string) => void,
): HtmlBlockHost {
  const current = () => useNoteStore.getState().currentNote;
  const mixed = () => current()?.mixed;
  return {
    knownIds: () => {
      const note = current();
      if (note?.mixed?.metadata.formatVersion !== 1) return undefined;
      const ids = new Set(note.mixed.blocks.map(block => block.id));
      for (const diagnostic of note.diagnostics ?? []) {
        if (diagnostic.kind === 'missingBlock' && diagnostic.blockId) ids.add(diagnostic.blockId);
      }
      return ids;
    },
    read: id => mixed()?.blocks.find(block => block.id === id),
    readAsset,
    listAssets,
    commitFullEditor,
    duplicate,
    collect,
    select,
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
  readHtmlAsset?: (blockId: string, path: string) => Promise<BlockAsset>;
  listHtmlAssets?: (blockId: string) => Promise<BlockAssetInfo[]>;
  commitHtmlFullEditor?: (blockId: string, html: string, edits: BlockAssetEdit[]) => Promise<boolean>;
  readManagedImage?: ManagedImageReader;
  onDuplicateHtmlBlock?: (blockId: string) => void | Promise<unknown>;
  onCollectHtmlBlock?: (blockId: string) => void | Promise<unknown>;
  onHtmlBlockSelect?: (blockId: string) => void;
  onPasteHtmlSource?: (html: string) => void | Promise<unknown>;
}

export const FlowNoteEditor = forwardRef<FlowNoteEditorApi, FlowNoteEditorProps>(
  ({ initialContent = '', onContentChange, mode = 'edit', onReadyChange, readLockRef, readHtmlAsset, listHtmlAssets,
    commitHtmlFullEditor, readManagedImage, onDuplicateHtmlBlock, onCollectHtmlBlock, onHtmlBlockSelect, onPasteHtmlSource }, ref) => {
    const setComposing = useNoteStore((state) => state.setComposing);
    const setDirty = useNoteStore((state) => state.setDirty);
    const inputs = useRef({ onContentChange, setComposing, setDirty, onDuplicateHtmlBlock, onCollectHtmlBlock, onHtmlBlockSelect,
      onPasteHtmlSource });
    inputs.current = { onContentChange, setComposing, setDirty, onDuplicateHtmlBlock, onCollectHtmlBlock, onHtmlBlockSelect,
      onPasteHtmlSource };
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
    const duplicate = (id: string) => inputs.current.onDuplicateHtmlBlock?.(id);
    const collect = (id: string) => inputs.current.onCollectHtmlBlock?.(id);
    const select = (id: string) => inputs.current.onHtmlBlockSelect?.(id);
    const pasteHtml = (html: string) => inputs.current.onPasteHtmlSource?.(html);
    const { loading, get } = useEditor(root => createFlowEditor(root, session,
      createHtmlHost(readHtmlAsset, listHtmlAssets, commitHtmlFullEditor, duplicate, collect, select), readManagedImage ?? null,
      pasteHtml), []);
    useImperativeHandle(ref, () => createEditorApi(session, get), [get, session]);
    useEffect(() => session.receiveExternal(initialContent), [initialContent, session]);
    useEffect(() => {
      if (!state.ready || state.composing || previousMode.current === mode) return;
      try { session.setMode(mode); }
      catch (error) { session.reportNotice(error instanceof Error ? error.message : String(error)); }
      previousMode.current = mode;
    }, [mode, state.ready, state.composing, session]);
    const placeCaretFromBlankCanvas = (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0 || state.active !== 'visual' || state.mode !== 'edit') return;
      const target = event.target as Element;
      if (target.closest('.ProseMirror') || target.closest('.editor-toolbar')) return;
      const editor = get();
      if (!editor) return;
      event.preventDefault();
      editor.action(ctx => {
        const view = ctx.get(editorViewCtx);
        let selection = TextSelection.atEnd(view.state.doc);
        try {
          const position = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (position) selection = TextSelection.near(view.state.doc.resolve(position.pos));
        } catch { /* jsdom / blank padding fallback: end of document */ }
        view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
        view.focus();
      });
    };
    return (
      <div className="flownote-editor" data-mode={state.mode} data-active-editor={state.active} aria-busy={loading || !state.ready}>
        <EditorModeBar session={session} state={state} />
        <SourceConflict session={session} state={state} />
        {state.active === 'source' && <SourceEditor session={session} state={state} />}
        <div className="editor-visual-surface" hidden={state.active !== 'visual'} onMouseDown={placeCaretFromBlankCanvas}>
          {state.active === 'visual' && <EditorToolbar />}
          <Milkdown />
        </div>
      </div>
    );
  }
);

FlowNoteEditor.displayName = 'FlowNoteEditor';

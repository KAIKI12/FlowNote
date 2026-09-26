import React, { act, createRef, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { MilkdownProvider, useInstance } from '@milkdown/react';
import { Editor, editorViewCtx } from '@milkdown/core';
import { TextSelection } from '@milkdown/prose/state';
import assert from 'node:assert/strict';
import { FlowNoteEditor } from '../src/editor/FlowNoteEditor';
import type { EditorMode, FlowNoteEditorApi } from '../src/editor/editorTypes';

const SETTLE_MS = 250;
const POLL_MS = 20;
const READY_TIMEOUT_MS = 5000;
const KEY_CODES: Record<string, number> = { Tab: 9, Enter: 13, Backspace: 8, Delete: 46, z: 90, y: 89 };

export async function settle() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, SETTLE_MS)); });
}

export async function waitFor(check: () => boolean) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (!check()) {
    assert.ok(Date.now() < deadline, 'Editor did not become ready');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, POLL_MS)); });
  }
}

export function createHarness() {
  const api = createRef<FlowNoteEditorApi>();
  let root: Root | undefined;
  let getEditor: () => Editor | undefined = () => undefined;
  let changeSource: (text: string) => void = () => { throw new Error('Harness is not mounted'); };
  let changeMode: (mode: EditorMode) => void = () => { throw new Error('Harness is not mounted'); };
  let latest = '';
  let htmlPasteHandler: ((html: string) => void | Promise<unknown>) | undefined;
  function Probe() { const [, get] = useInstance(); getEditor = get; return null; }
  function Host({ source }: { source: string }) {
    const [text, setText] = useState(source);
    const [mode, setMode] = useState<EditorMode>('edit');
    changeSource = setText;
    changeMode = setMode;
    return <MilkdownProvider><FlowNoteEditor ref={api} initialContent={text} mode={mode}
      onContentChange={value => { latest = value; setText(value); }}
      onPasteHtmlSource={html => htmlPasteHandler?.(html)} /><Probe /></MilkdownProvider>;
  }
  const editor = () => { const value = getEditor(); assert.ok(value); return value; };
  const view = () => editor().ctx.get(editorViewCtx);
  const unmount = async () => { if (root) await act(async () => { root!.unmount(); }); };
  return {
    api, editor, view, latest: () => latest, unmount,
    setHtmlPasteHandler(handler: ((html: string) => void | Promise<unknown>) | undefined) { htmlPasteHandler = handler; },
    async mount(source: string) {
      await unmount();
      document.body.innerHTML = '<main id="harness"></main>';
      root = createRoot(document.getElementById('harness')!);
      await act(async () => { root!.render(<React.StrictMode><Host source={source} /></React.StrictMode>); });
      await waitFor(() => getEditor()?.status === 'Created');
      await settle();
    },
    async source(text: string) { await act(async () => changeSource(text)); await settle(); },
    async mode(value: EditorMode) { await act(async () => changeMode(value)); await settle(); },
    async select(text: string, whole = false) {
      let position: number | undefined;
      view().state.doc.descendants((node, pos) => {
        if (position === undefined && node.isText && node.text?.includes(text)) position = pos + node.text.indexOf(text);
      });
      assert.notEqual(position, undefined, `Text not found: ${text}`);
      await act(async () => view().dispatch(view().state.tr.setSelection(TextSelection.create(view().state.doc, position!, whole ? position! + text.length : position!))));
    },
    async key(key: string, options: KeyboardEventInit = {}) {
      await act(async () => { view().dom.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode: KEY_CODES[key] ?? 0, bubbles: true, cancelable: true, ...options })); });
      await settle();
    },
  };
}

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import assert from 'node:assert/strict';
import App from '../src/app/App';
import { useNoteStore } from '../src/note/noteStore';
import { settle, waitFor } from './editorHarness';

async function withApp(action: () => Promise<void>) {
  useNoteStore.getState().setCurrentNote(null);
  document.body.innerHTML = '<main id="app-test"></main>';
  const root = createRoot(document.getElementById('app-test')!);
  try {
    await act(async () => root.render(<React.StrictMode><App /></React.StrictMode>));
    await waitFor(() => document.querySelector('.flownote-editor')?.getAttribute('aria-busy') === 'false');
    await settle();
    await action();
  } finally { await act(async () => root.unmount()); }
}

async function welcome() {
  await withApp(async () => {
    assert.equal(document.querySelector('.ProseMirror h1')?.textContent, '项目周记');
    assert.equal(document.querySelector('.ProseMirror .html-block-container'), null);
    assert.ok(document.querySelector('[role="toolbar"]'));
    assert.ok(document.querySelector('.ProseMirror input[type="checkbox"]'));
    assert.ok(document.querySelector('.ProseMirror .token.keyword'));
    assert.equal(getComputedStyle(document.querySelector('.writing-main')!).display, 'flex');
    assert.equal(getComputedStyle(document.querySelector('.writing-workspace')!).flexGrow, '1');
  });
}

async function exportNote() {
  await withApp(async () => {
    const exporter = document.querySelector<HTMLButtonElement>('[aria-label="导出 Markdown 笔记"]');
    assert.ok(exporter, 'The writing page has no Markdown export action');
    const gate = [...document.querySelectorAll('button')].find(button => button.textContent === 'Markdown Gate');
    assert.ok(gate);
    await act(async () => gate.click());
    await waitFor(() => !!document.querySelector('[data-testid="gate-draft"]'));
    const draft = document.querySelector<HTMLTextAreaElement>('[data-testid="gate-draft"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(draft, '# 最新正文\n');
      draft.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const load = [...document.querySelectorAll('button')].find(button => button.textContent === '装载原文')!;
    await act(async () => load.click());
    let url = '';
    const intercept = (event: Event) => {
      const anchor = event.target as HTMLAnchorElement;
      if (anchor.tagName !== 'A' || !anchor.download) return;
      event.preventDefault(); url = anchor.href;
    };
    document.addEventListener('click', intercept, true);
    try {
      await act(async () => exporter.click());
      assert.ok(url, 'No Markdown download was requested');
      assert.equal((await (await fetch(url)).text()).trim(), '# 最新正文');
    } finally { document.removeEventListener('click', intercept, true); }
  });
}

async function immediateClose() {
  await withApp(async () => {
    assert.equal(useNoteStore.getState().isDirty, false);
    const box = document.querySelector<HTMLInputElement>('.ProseMirror input[type="checkbox"]')!;
    const closing = new Event('beforeunload', { cancelable: true });
    await act(async () => {
      box.click();
      window.dispatchEvent(closing);
      assert.equal(closing.defaultPrevented, true, 'Closing can discard an edit before debounce fires');
    });
  });
}

async function rejectMixedExport() {
  await withApp(async () => {
    const note = useNoteStore.getState().currentNote!;
    await act(async () => useNoteStore.getState().setCurrentNote({ ...note,
      metadata: { ...note.metadata, type: 'mixed' }, htmlBlocks: new Map() }));
    let downloaded = false;
    const intercept = (event: Event) => {
      if ((event.target as HTMLElement).tagName !== 'A') return;
      event.preventDefault(); downloaded = true;
    };
    document.addEventListener('click', intercept, true);
    try {
      await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="导出 Markdown 笔记"]')!.click());
      assert.equal(downloaded, false, 'Mixed Note used the plain Markdown export');
      assert.match(document.querySelector('[role="alert"]')!.textContent!, /Mixed Note/);
    } finally { document.removeEventListener('click', intercept, true); }
  });
}

export const appChecks = [
  { name: '默认首页：打开即为可编辑的普通 Markdown 笔记', run: welcome },
  { name: '笔记导出：读取编辑器最新正文，不使用滞后状态', run: exportNote },
  { name: '关闭保护：首次修改后立即关闭也会提示', run: immediateClose },
  { name: '导出范围：Mixed Note 即使没有 HTML 映射也拒绝简化导出', run: rejectMixedExport },
];

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import assert from 'node:assert/strict';
import App from '../src/app/App';
import { useNoteStore } from '../src/note/noteStore';
import { settle, waitFor } from './editorHarness';
import { changeSource, sourceArea } from './protection.spec';

async function withProtectedApp(source: string, action: () => Promise<void>) {
  useNoteStore.getState().setCurrentNote({ path: 'protected.md', contentMd: source, assets: [], htmlBlocks: new Map(),
    metadata: { version: 1, type: 'markdown', title: '保护验证', createdAt: '2026-09-13', updatedAt: '2026-09-13' } });
  document.body.innerHTML = '<main id="protected-app"></main>';
  const root = createRoot(document.getElementById('protected-app')!);
  try {
    await act(async () => root.render(<React.StrictMode><App /></React.StrictMode>));
    await waitFor(() => document.querySelector('.flownote-editor')?.getAttribute('aria-busy') === 'false');
    await settle();
    await action();
  } finally {
    await act(async () => root.unmount());
    useNoteStore.getState().setCurrentNote(null);
  }
}

function interceptDownloads() {
  const urls: string[] = [];
  const listener = (event: Event) => {
    const anchor = event.target as HTMLAnchorElement;
    if (anchor.tagName !== 'A' || !anchor.download) return;
    event.preventDefault();
    urls.push(anchor.href);
  };
  document.addEventListener('click', listener, true);
  return { urls, close: () => document.removeEventListener('click', listener, true) };
}

function button(text: string): HTMLButtonElement {
  const control = [...document.querySelectorAll('button')].find(item => item.textContent === text);
  assert.ok(control, `Button is missing: ${text}`);
  return control;
}

async function appSourceExport() {
  const original = '\uFEFF---\r\ntitle: 标题\r\n---\r\n\r\n[[原文]] $T_{clk}$\r\n';
  await withProtectedApp(original, async () => {
    assert.equal(useNoteStore.getState().isDirty, false, 'Opening source marked an unchanged document dirty');
    await changeSource(sourceArea().value.replace('标题', '新标题'));
    const edited = original.replace('标题', '新标题');
    const downloads = interceptDownloads();
    try {
      await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="导出 Markdown 笔记"]')!.click());
      assert.equal(downloads.urls.length, 1);
      assert.deepEqual(new Uint8Array(await (await fetch(downloads.urls[0])).arrayBuffer()), new TextEncoder().encode(edited));
      assert.equal(useNoteStore.getState().currentNote!.contentMd, edited);
      const closing = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(closing);
      assert.equal(closing.defaultPrevented, true);
    } finally { downloads.close(); }
  });
}

async function compositionExport() {
  await withProtectedApp('[[原文]]\n', async () => {
    const downloads = interceptDownloads();
    try {
      await act(async () => {
        sourceArea().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
      });
      assert.equal(downloads.urls.length, 0, 'Ctrl+S exported an unfinished composition using stale React state');
      assert.match(document.querySelector('.writing-error')?.textContent ?? '', /组合输入/);
      await act(async () => sourceArea().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
    } finally { downloads.close(); }
  });
}

async function sourceEvidence() {
  const input = '---\ntitle: 元数据\n---\n\n[[双链]] $x_1$\n';
  await withProtectedApp('# 可视化旧文档\n', async () => {
    await act(async () => button('Markdown Gate').click());
    await waitFor(() => !!document.querySelector('[data-testid="gate-draft"]'));
    const draft = document.querySelector<HTMLTextAreaElement>('[data-testid="gate-draft"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(draft, input);
      draft.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button('装载原文').click());
    await waitFor(() => !!document.querySelector('[data-testid="gate-tree"]'));
    assert.equal(document.querySelector<HTMLTextAreaElement>('[data-testid="gate-tree"]')!.value, 'null', 'Hidden rich-text AST was reported as the source document');
    await changeSource(input.replace('元数据', '已修改'));
    await act(async () => button('重载当前输出').click());
    await waitFor(() => !button('导出证据 JSON').disabled);
    const downloads = interceptDownloads();
    try {
      await act(async () => button('导出证据 JSON').click());
      const evidence = await (await fetch(downloads.urls[0])).json();
      assert.equal(evidence.activeEditor, 'source');
      assert.equal(evidence.document, null);
      assert.equal(evidence.markdown, input.replace('元数据', '已修改'));
      assert.match(evidence.dom, /textarea[\s\S]*已修改/);
      assert.equal(evidence.roundTrips, 1);
      assert.equal(evidence.diskSaveVerified, false);
      assert.equal(evidence.decision, 'pending');
    } finally { downloads.close(); }
  });
}

async function importFile(file: File) {
  await act(async () => button('Markdown Gate').click());
  await waitFor(() => !!document.querySelector('.qualification-panel input[type="file"]'));
  const field = document.querySelector<HTMLInputElement>('.qualification-panel input[type="file"]')!;
  Object.defineProperty(field, 'files', { configurable: true, value: [file] });
  await act(async () => field.dispatchEvent(new Event('change', { bubbles: true })));
}

async function bomFileImport() {
  const input = '\uFEFF---\r\ntitle: BOM 文件\r\n---\r\n\r\n[[保留]]\r\n';
  await withProtectedApp('# 初始正文\n', async () => {
    await importFile(new File([new TextEncoder().encode(input)], 'bom.md', { type: 'text/markdown' }));
    await waitFor(() => document.querySelector<HTMLTextAreaElement>('[data-testid="gate-draft"]')!.value.includes('BOM 文件'));
    assert.equal(document.querySelector<HTMLTextAreaElement>('[data-testid="gate-draft"]')!.value.charCodeAt(0), 0xfeff);
    await act(async () => button('装载原文').click());
    await waitFor(() => !!document.querySelector('[data-testid="gate-tree"]'));
    const downloads = interceptDownloads();
    try {
      await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="导出 Markdown 笔记"]')!.click());
      assert.deepEqual(new Uint8Array(await (await fetch(downloads.urls[0])).arrayBuffer()), new TextEncoder().encode(input));
    } finally { downloads.close(); }
  });
}

async function invalidUtf8Import() {
  await withProtectedApp('# 初始正文\n', async () => {
    await importFile(new File([new Uint8Array([0xff, 0xfe, 0x41])], 'invalid.md', { type: 'text/markdown' }));
    await waitFor(() => document.querySelector('[data-testid="gate-status"]')!.textContent!.includes('就绪'));
    assert.ok(document.querySelector('.gate-error'), 'Invalid UTF-8 was silently replaced during import');
    assert.equal(document.querySelector('.ProseMirror h1')!.textContent, '初始正文');
  });
}

export const protectionAppChecks = [
  { name: '产品保护：导出真实源码编辑结果，保留 BOM / CRLF 并提示未保存', run: appSourceExport },
  { name: '产品保护：组合输入开始后立即 Ctrl+S 也不能导出未完成内容', run: compositionExport },
  { name: '产品保护：Gate 记录真实源码模式，不把隐藏 AST 当作当前文档', run: sourceEvidence },
  { name: '文件保护：实际读取 UTF-8 文件保留 BOM 与 CRLF', run: bomFileImport },
  { name: '文件保护：非法 UTF-8 明确报错并保留原有正文', run: invalidUtf8Import },
];

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import assert from 'node:assert/strict';
import App from '../src/app/App';
import { useNoteStore } from '../src/note/noteStore';
import { settle, waitFor } from './editorHarness';
import { documentSessionChecks } from './documentSession.spec';
import { createImportFilePort } from '../src/files/importFilePort';
import { MAX_MARKDOWN_BYTES, markdownBytes } from '../src/files/fileEncoding';
import { loadNote } from '../src/note/noteLoader';
import { saveNote, AutoSaver } from '../src/note/noteSaver';

async function withApp(action: () => Promise<void>) {
  useNoteStore.getState().setCurrentNote(null);
  document.body.innerHTML = '<main id="files-test"></main>';
  const root = createRoot(document.getElementById('files-test')!);
  try {
    await act(async () => root.render(<React.StrictMode><App /></React.StrictMode>));
    await waitFor(() => document.querySelector('.flownote-editor')?.getAttribute('aria-busy') === 'false');
    await settle();
    await action();
  } finally { await act(async () => root.unmount()); }
}

async function fileControls() {
  await withApp(async () => {
    for (const name of ['新建笔记', '打开 Markdown 文件', '保存 Markdown 文件', '另存为 Markdown 文件', '关闭笔记']) {
      assert.ok(document.querySelector(`button[aria-label="${name}"]`), `Missing file action: ${name}`);
    }
    assert.ok(document.querySelector('[aria-label="文件保存状态"]'));
  });
}

async function newNoteGuard() {
  await withApp(async () => {
    await act(async () => document.querySelector<HTMLInputElement>('.ProseMirror input[type="checkbox"]')!.click());
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="新建笔记"]');
    assert.ok(button);
    await act(async () => button.click());
    assert.ok(document.querySelector('[role="dialog"][aria-label="未保存的更改"]'));
    assert.equal(document.querySelector('.ProseMirror h1')?.textContent, '项目周记');
  });
}

async function unsupportedSave() {
  await withApp(async () => {
    const save = document.querySelector<HTMLButtonElement>('button[aria-label="保存 Markdown 文件"]');
    assert.ok(save);
    assert.equal(save.disabled, true, 'Environment without a file handle must not pretend direct saving is available');
    assert.ok(document.querySelector('button[aria-label="导出 Markdown 笔记"]'));
  });
}

async function browserImportKeepsOriginalBytes() {
  const content = '\uFEFF---\r\ntitle: 导入\r\n---\r\n\r\n[[保留]]\r\n';
  await withApp(async () => {
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="打开 Markdown 文件"]')!.click());
    const input = document.querySelector<HTMLInputElement>('input[aria-label="选择 Markdown 文件"]')!;
    assert.ok(input);
    Object.defineProperty(input, 'files', { value: [new File([content], '导入.md')], configurable: true });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    await waitFor(() => useNoteStore.getState().currentNote?.contentMd === content);
    await waitFor(() => document.querySelector('.flownote-editor')?.getAttribute('aria-busy') === 'false');
    assert.equal(useNoteStore.getState().isDirty, false);
    assert.match(document.querySelector('[aria-label="文件保存状态"]')!.textContent!, /网页副本/);
    assert.equal(document.querySelector<HTMLButtonElement>('[aria-label="保存 Markdown 文件"]')!.disabled, true);
  });
}

async function browserPickerCancel() {
  await withApp(async () => {
    const before = useNoteStore.getState().currentNote;
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="打开 Markdown 文件"]')!.click());
    const input = document.querySelector('input[aria-label="选择 Markdown 文件"]')!;
    await act(async () => input.dispatchEvent(new Event('cancel')));
    assert.equal(useNoteStore.getState().currentNote, before);
    assert.equal(document.querySelector('input[aria-label="选择 Markdown 文件"]'), null);
    assert.equal(document.querySelector<HTMLButtonElement>('[aria-label="打开 Markdown 文件"]')!.disabled, false);
  });
}

async function importValidation() {
  const bad = [new File(['text'], 'bad.txt'), new File([new Uint8Array([0xff, 0xfe])], 'bad.md'),
    new File(['NUL\0byte'], 'nul.md'), new File(['x'.repeat(MAX_MARKDOWN_BYTES + 1)], 'large.md')];
  for (const file of bad) await assert.rejects(createImportFilePort(async () => file).open());
  const limit = new File(['x'.repeat(MAX_MARKDOWN_BYTES)], 'limit.markdown');
  assert.equal((await createImportFilePort(async () => limit).open())!.content.length, MAX_MARKDOWN_BYTES);
  assert.throws(() => markdownBytes('\ud800'), /UTF-8/);
  const port = createImportFilePort(async () => null);
  assert.equal(await port.open(), null);
  await assert.rejects(port.saveAs({ name: 'copy.md', content: 'text' }), /导出/);
}

async function legacyFilesCannotPretendSuccess() {
  await assert.rejects(loadNote('unimplemented.note'), /尚未|未实现/);
  await withApp(async () => {
    const note = useNoteStore.getState().currentNote!;
    await assert.rejects(saveNote(note), /尚未|未实现/);
    const autosaver = new AutoSaver();
    assert.throws(() => autosaver.schedule(note), /尚未|未实现/);
    assert.throws(() => autosaver.flush(note), /尚未|未实现/);
  });
}

export async function run(filter: string) {
  const checks = [...documentSessionChecks,
    { name: '文件入口：新建、打开、保存、另存为和关闭笔记', run: fileControls },
    { name: '文件入口：新建不会静默丢弃当前修改', run: newNoteGuard },
    { name: '文件入口：不支持直接保存时明确保留导出', run: unsupportedSave },
    { name: '网页导入：真实 FileReader 保留 BOM / CRLF，明确仅导入副本', run: browserImportKeepsOriginalBytes },
    { name: '网页导入：取消选择结束等待并保留笔记', run: browserPickerCancel },
    { name: '网页导入：后缀、UTF-8、NUL、2 MiB 边界及写入能力校验', run: importValidation },
    { name: '遗留入口：未实现的 Note / 自动保存不能返回假成功', run: legacyFilesCannotPretendSuccess },
  ];
  const results = [];
  for (const check of checks) {
    if (filter && !check.name.includes(filter)) continue;
    try { await check.run(); results.push({ name: check.name, status: 'passed' }); }
    catch (error) { results.push({ name: check.name, status: 'failed', error: error instanceof Error ? error.message : String(error) }); }
  }
  return results;
}

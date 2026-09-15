import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import App from '../src/app/App';
import { useNoteStore } from '../src/note/noteStore';
import { createFileDriver } from './fileDriver';
import { settle, waitFor } from './editorHarness';
import type { MarkdownFile } from '../src/files/fileTypes';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

const PROTECTED = '\uFEFF---\r\ntitle: 原文\r\n---\r\n\r\n[[保留]] $x_1$\r\n';
type DiskFixture = { driver: ReturnType<typeof createFileDriver>; file: string; directory: string };

function button(name: string): HTMLButtonElement {
  const control = [...document.querySelectorAll('button')].find(item => item.getAttribute('aria-label') === name || item.textContent === name);
  assert.ok(control, `Missing button: ${name}`);
  return control;
}

async function click(name: string) { await act(async () => button(name).click()); }
const fileStatus = () => document.querySelector('[aria-label="文件保存状态"]')?.textContent ?? '';
const idle = () => waitFor(() => !fileStatus().includes('正在'));
const ready = () => waitFor(() => document.querySelector('.flownote-editor')?.getAttribute('aria-busy') === 'false');

async function open(h: DiskFixture, selected = h.file) {
  h.driver.open(selected);
  await click('打开 Markdown 文件');
  await idle();
  await ready();
  assert.match(fileStatus(), new RegExp(path.basename(selected).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

async function withDiskApp(content: string, action: (fixture: DiskFixture) => Promise<void>) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'flownote-editor-disk-'));
  const file = path.join(directory, '中文 笔记.md');
  await fs.writeFile(file, content);
  const driver = createFileDriver();
  useNoteStore.getState().setCurrentNote(null);
  document.body.innerHTML = '<main id="disk-app"></main>';
  const root = createRoot(document.getElementById('disk-app')!);
  try {
    await act(async () => root.render(<React.StrictMode><App filePort={driver.port} /></React.StrictMode>));
    await ready();
    await open({ driver, file, directory });
    await action({ driver, file, directory });
  } finally {
    await act(async () => root.unmount());
    await driver.close();
  }
}

async function sourceEdit(from: string, to: string) {
  const area = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Markdown 源码"]');
  assert.ok(area, 'The active source editor is missing');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, area.value.replace(from, to));
    area.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function actualSave() { await click('保存 Markdown 文件'); await idle(); }

async function fixtureRoundTrips() {
  const fixtures = path.resolve('../flownote-markdown-qualification/fixtures');
  const names = (await fs.readdir(fixtures)).filter(name => name.endsWith('.md'));
  assert.equal(names.length, 8);
  for (const name of names) {
    const input = await fs.readFile(path.join(fixtures, name), 'utf8');
    await withDiskApp(input, async h => {
      const before = await fs.stat(h.file);
      assert.equal(useNoteStore.getState().isDirty, false, `${name} became dirty during opening`);
      await actualSave();
      assert.deepEqual(await fs.readFile(h.file), Buffer.from(input), `${name} changed during no-edit save`);
      assert.equal((await fs.stat(h.file)).mtimeMs, before.mtimeMs);
      await click('关闭笔记'); await idle();
      assert.equal(useNoteStore.getState().currentNote, null);
      assert.equal(document.querySelector('.flownote-editor'), null);
      await open(h);
      assert.equal(useNoteStore.getState().currentNote!.contentMd, input);
    });
  }
}

async function editedProtectedReopen() {
  await withDiskApp(PROTECTED, async h => {
    await sourceEdit('原文', '更新');
    await actualSave();
    assert.deepEqual(await fs.readFile(h.file), Buffer.from(PROTECTED.replace('原文', '更新')));
    assert.equal(useNoteStore.getState().isDirty, false);
    await click('关闭笔记'); await idle();
    await open(h);
    assert.equal(useNoteStore.getState().currentNote!.contentMd, PROTECTED.replace('原文', '更新'));
  });
}

async function immediateVisualSave() {
  await withDiskApp('- [ ] 待办\n', async h => {
    await act(async () => {
      document.querySelector<HTMLInputElement>('.ProseMirror input[type="checkbox"]')!.click();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
    });
    await idle();
    assert.match(await fs.readFile(h.file, 'utf8'), /\[x\] 待办/);
    await settle();
    assert.equal(useNoteStore.getState().isDirty, false, 'A delayed editor notification dirtied the already saved content');
    assert.match(fileStatus(), /已保存/);
  });
}

async function saveAndReload() {
  await withDiskApp(PROTECTED, async h => {
    await sourceEdit('原文', '待保存');
    await click('重新载入 Markdown 文件'); await idle();
    assert.ok(document.querySelector('[role="dialog"]'));
    await click('保存并继续'); await idle(); await ready(); await settle();
    const expected = PROTECTED.replace('原文', '待保存');
    assert.equal(await fs.readFile(h.file, 'utf8'), expected);
    assert.equal(useNoteStore.getState().currentNote!.contentMd, expected, 'Reload applied a pre-save candidate');
    assert.equal(document.querySelector('[role="dialog"]'), null);
  });
}

async function conflictAndSaveAs() {
  await withDiskApp(PROTECTED, async h => {
    await sourceEdit('原文', '本地修改');
    await fs.writeFile(h.file, 'EXTERNAL\n');
    await actualSave();
    assert.equal(await fs.readFile(h.file, 'utf8'), 'EXTERNAL\n');
    assert.match(document.querySelector('[role="alert"]')!.textContent!, /修改/);
    assert.match(useNoteStore.getState().currentNote!.contentMd, /本地修改/);
    assert.equal(useNoteStore.getState().isDirty, true);
    await click('关闭笔记'); await click('取消');
    const copy = path.join(h.directory, '副本.markdown');
    h.driver.saveAs(copy);
    await click('另存为 Markdown 文件'); await idle();
    assert.equal(await fs.readFile(copy, 'utf8'), PROTECTED.replace('原文', '本地修改'));
    assert.equal(await fs.readFile(h.file, 'utf8'), 'EXTERNAL\n');
    assert.match(fileStatus(), /副本.markdown.*已保存/);
  });
}

async function delayedReloadDoesNotApplyOldCandidate() {
  await withDiskApp(PROTECTED, async h => {
    await sourceEdit('原文', '待保存');
    const reload = h.driver.port.reload;
    let resolveRefresh!: () => void;
    let refreshStarted = false;
    let reloads = 0;
    h.driver.port.reload = async id => {
      const value = await reload(id);
      if (++reloads === 1) return value;
      refreshStarted = true;
      await new Promise<void>(resolve => { resolveRefresh = resolve; });
      return value;
    };
    await click('重新载入 Markdown 文件'); await idle();
    await click('保存并继续');
    await waitFor(() => refreshStarted);
    await settle();
    const duringRefresh = useNoteStore.getState().currentNote!.contentMd;
    await act(async () => resolveRefresh());
    await idle(); await ready(); await settle();
    assert.match(duringRefresh, /待保存/, 'A pending refresh replaced the editor with its pre-save candidate');
    assert.match(useNoteStore.getState().currentNote!.contentMd, /待保存/);
  });
}

async function inputWhileSaveReplyIsPending() {
  await withDiskApp(PROTECTED, async h => {
    await sourceEdit('原文', '第一次');
    const save = h.driver.port.save;
    let committed: MarkdownFile | undefined;
    let reply!: () => void;
    h.driver.port.save = async request => {
      committed = await save(request);
      await new Promise<void>(resolve => { reply = resolve; });
      return committed;
    };
    await click('保存 Markdown 文件');
    await waitFor(() => !!committed);
    await sourceEdit('第一次', '后续输入');
    const closing = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(closing);
    assert.equal(closing.defaultPrevented, true);
    await act(async () => reply()); await idle();
    assert.equal(await fs.readFile(h.file, 'utf8'), PROTECTED.replace('原文', '第一次'));
    assert.match(useNoteStore.getState().currentNote!.contentMd, /后续输入/);
    assert.equal(useNoteStore.getState().isDirty, true);
    h.driver.port.save = save;
    await actualSave();
    assert.equal(await fs.readFile(h.file, 'utf8'), PROTECTED.replace('原文', '后续输入'));
  });
}

async function cancelledPickerKeepsCurrentChanges() {
  await withDiskApp(PROTECTED, async h => {
    await sourceEdit('原文', '未保存');
    h.driver.open(null);
    await click('打开 Markdown 文件'); await idle();
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.match(useNoteStore.getState().currentNote!.contentMd, /未保存/);
    h.driver.saveAs(null);
    await click('另存为 Markdown 文件'); await idle();
    assert.equal(useNoteStore.getState().isDirty, true);
    assert.equal(await fs.readFile(h.file, 'utf8'), PROTECTED);
  });
}

async function mixedMappingCannotUseMarkdownSave() {
  await withDiskApp(PROTECTED, async h => {
    await act(async () => useNoteStore.getState().addHtmlBlock('mixed', '<p>Unpersisted HTML</p>'));
    const writesBefore = h.driver.calls.filter(command => command === 'markdown_save').length;
    await actualSave();
    assert.match(document.querySelector('[role="alert"]')?.textContent ?? '', /Mixed Note/);
    assert.equal(h.driver.calls.filter(command => command === 'markdown_save').length, writesBefore);
    assert.equal(useNoteStore.getState().isDirty, true);
    assert.equal(await fs.readFile(h.file, 'utf8'), PROTECTED);
  });
}

async function qualificationCannotOverwriteBoundFile() {
  await withDiskApp(PROTECTED, async h => {
    await sourceEdit('原文', '未保存');
    await click('Markdown Gate');
    assert.ok(document.querySelector('[role="dialog"]'));
    assert.equal(document.querySelector('.qualification-panel'), null);
    await click('取消');
    assert.match(useNoteStore.getState().currentNote!.contentMd, /未保存/);
    await click('Markdown Gate'); await click('放弃更改并继续');
    await waitFor(() => !!document.querySelector('[data-testid="gate-draft"]'));
    await ready();
    const draft = document.querySelector<HTMLTextAreaElement>('[data-testid="gate-draft"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(draft, '# Gate sample\n');
      draft.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('装载原文');
    h.driver.saveAs(null);
    await actualSave();
    assert.equal(h.driver.calls[h.driver.calls.length - 1], 'markdown_save_as');
    assert.equal(await fs.readFile(h.file, 'utf8'), PROTECTED);
    assert.equal(useNoteStore.getState().isDirty, true);
  });
}

async function debugViewDoesNotEditMarkdown() {
  const original = '- alpha\n- beta\n';
  await withDiskApp(original, async h => {
    assert.equal(useNoteStore.getState().isDirty, false);
    await click('调试状态');
    assert.equal(useNoteStore.getState().isDirty, false, 'Opening diagnostics marked an unchanged file dirty');
    assert.equal(useNoteStore.getState().currentNote!.contentMd, original);
    await actualSave();
    assert.equal(await fs.readFile(h.file, 'utf8'), original);
  });
}

function markdownMeaning(source: string): unknown {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(source);
  return JSON.parse(JSON.stringify(tree, (key, value) => ['position', 'spread'].includes(key) ? undefined : value));
}

async function mixedListEditSurvivesDisk() {
  const original = await fs.readFile(path.resolve('../flownote-markdown-qualification/fixtures/03-lists-mixed.md'), 'utf8');
  await withDiskApp(original, async h => {
    const item = [...document.querySelectorAll('.ProseMirror li > p')].find(node => node.textContent === 'LSU');
    assert.ok(item?.firstChild);
    await act(async () => { item.firstChild!.nodeValue = 'LSU 已更新'; });
    await waitFor(() => useNoteStore.getState().isDirty);
    await actualSave();
    const saved = await fs.readFile(h.file, 'utf8');
    assert.deepEqual(markdownMeaning(saved), markdownMeaning(original.replace('LSU', 'LSU 已更新')));
    await click('关闭笔记'); await idle(); await open(h);
    assert.ok([...document.querySelectorAll('.ProseMirror li > p')].some(node => node.textContent === 'LSU 已更新'));
    assert.deepEqual(markdownMeaning(useNoteStore.getState().currentNote!.contentMd), markdownMeaning(saved));
  });
}

async function originalProtectedFixtureEditsSurviveDisk() {
  for (const name of ['05-unsupported-syntax.md', '08-roundtrip-stress.md']) {
    const original = await fs.readFile(path.resolve('../flownote-markdown-qualification/fixtures', name), 'utf8');
    const title = original.split(/\r?\n/).find(line => line.startsWith('title:'))!;
    assert.ok(title);
    await withDiskApp(original, async h => {
      await sourceEdit(title, title + ' 已更新');
      await actualSave();
      const expected = original.replace(title, title + ' 已更新');
      assert.equal(await fs.readFile(h.file, 'utf8'), expected);
      await click('关闭笔记'); await idle(); await open(h);
      assert.equal(useNoteStore.getState().currentNote!.contentMd, expected);
      assert.equal(document.querySelector('.flownote-editor')?.getAttribute('data-active-editor'), 'source');
    });
  }
}

export async function run(filter: string) {
  const checks = [
    { name: '真实文件：八份资格样例打开、无编辑保存、关闭、重开保持原字节', run: fixtureRoundTrips },
    { name: '真实文件：源码局部编辑保存并重开保留 BOM / CRLF', run: editedProtectedReopen },
    { name: '真实文件：视觉输入后立即 Ctrl+S 保存最新内容且延迟通知不标脏', run: immediateVisualSave },
    { name: '真实文件：保存并重载使用保存后的版本', run: saveAndReload },
    { name: '真实文件：外部冲突保留本地修改，另存为后绑定新文件', run: conflictAndSaveAs },
    { name: '真实文件：重载刷新等待期间不能应用旧候选', run: delayedReloadDoesNotApplyOldCandidate },
    { name: '真实文件：保存回执等待期间继续输入保留 Dirty 并可再次保存', run: inputWhileSaveReplyIsPending },
    { name: '真实文件：取消打开和另存为保持当前未保存内容', run: cancelledPickerKeepsCurrentChanges },
    { name: '真实文件：包含 HTML 映射时拒绝普通 Markdown 保存', run: mixedMappingCannotUseMarkdownSave },
    { name: '真实文件：Markdown Gate 测试与原绑定文件隔离并检查未保存内容', run: qualificationCannotOverwriteBoundFile },
    { name: '真实文件：查看调试状态不会改写未编辑文件', run: debugViewDoesNotEditMarkdown },
    { name: 'R02 真实文件：03 混合列表只修改 LSU 后保存并重开语义不变', run: mixedListEditSurvivesDisk },
    { name: 'R02 真实文件：05 / 08 原件局部源码编辑保存并重开保留其他字节', run: originalProtectedFixtureEditsSurviveDisk },
  ];
  const results = [];
  for (const check of checks) {
    if (filter && !check.name.includes(filter)) continue;
    try { await check.run(); results.push({ name: check.name, status: 'passed' }); }
    catch (error) { results.push({ name: check.name, status: 'failed', error: error instanceof Error ? error.message : String(error) }); }
  }
  return results;
}

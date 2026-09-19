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
const BLOCK_A = '0199a111-0000-7000-8000-000000000001';
const BLOCK_B = '0199a111-0000-7000-8000-000000000002';
type DiskFixture = { driver: ReturnType<typeof createFileDriver>; file: string; directory: string };

function blockAnchor(id: string) { return `\`\`\`flownote-html\n{"id":"${id}"}\n\`\`\`\n`; }

async function writeMixedPackage(parent: string, name: string, html = '<section>Source Disk</section>') {
  const notePath = path.join(parent, name);
  const block = path.join(notePath, 'blocks', BLOCK_A);
  await fs.mkdir(path.join(block, 'assets'), { recursive: true });
  await fs.writeFile(path.join(notePath, 'note.json'), JSON.stringify({ formatVersion: 1, type: 'mixed', title: 'Slice 3 Disk',
    createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z' }, null, 2) + '\n');
  await fs.writeFile(path.join(notePath, 'content.md'), `Before\n\n${blockAnchor(BLOCK_A)}\nAfter\n`);
  await fs.writeFile(path.join(block, 'block.json'), JSON.stringify({ kind: 'html', inputKind: 'fragment', scriptPolicy: 'sandbox', viewport: { heightPx: 480 } }, null, 2) + '\n');
  await fs.writeFile(path.join(block, 'index.html'), html);
  await fs.writeFile(path.join(block, 'original.html'), html);
  await fs.writeFile(path.join(block, 'assets/style.css'), '.source{color:red}');
  await fs.writeFile(path.join(block, 'assets/image.png'), Buffer.from([1, 2, 3, 4]));
  return notePath;
}

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

async function withDiskApp(content: string, action: (fixture: DiskFixture) => Promise<void>, fileName = '中文 笔记.md') {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'flownote-editor-disk-'));
  const file = path.join(directory, fileName);
  await fs.writeFile(file, content);
  const driver = createFileDriver();
  useNoteStore.getState().setCurrentNote(null);
  document.body.innerHTML = '<main id="disk-app"></main>';
  const root = createRoot(document.getElementById('disk-app')!);
  try {
    await act(async () => root.render(<React.StrictMode><App filePort={driver.port} notePort={driver.notePort} /></React.StrictMode>));
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

async function mixedNoteConversionSurvivesDisk() {
  const original = '# Markdown A\n\n![plot](Timing.assets/plot.png)\n\n```text\nTiming.assets/plot.png\n```\n\nMarkdown B\n';
  await withDiskApp(original, async h => {
    const sourceAssets = path.join(h.directory, 'Timing.assets');
    await fs.mkdir(sourceAssets);
    await fs.writeFile(path.join(sourceAssets, 'plot.png'), Buffer.from([137, 80, 78, 71, 9]));
    const target = path.join(h.directory, 'Converted.note');
    h.driver.noteSaveAs(target);
    await click('导入 HTML Block');
    const source = document.querySelector<HTMLTextAreaElement>('[aria-label="HTML 导入源码"]')!;
    assert.ok(source);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(source, '<section><h2>原始 HTML</h2></section>');
      source.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('确认导入 HTML');
    await waitFor(() => useNoteStore.getState().currentNote?.metadata.type === 'mixed');
    await ready();
    assert.equal(await fs.readFile(h.file, 'utf8'), original, 'Markdown source was overwritten during conversion');
    const savedContent = await fs.readFile(path.join(target, 'content.md'), 'utf8');
    assert.match(savedContent, /flownote-html/);
    assert.match(savedContent, /!\[plot\]\(assets\/images\/plot\.png\)/);
    assert.match(savedContent, /```text\nTiming\.assets\/plot\.png\n```/);
    assert.deepEqual(await fs.readFile(path.join(target, 'assets/images/plot.png')), Buffer.from([137, 80, 78, 71, 9]));
    assert.deepEqual(await fs.readFile(path.join(sourceAssets, 'plot.png')), Buffer.from([137, 80, 78, 71, 9]));
    assert.ok(savedContent.indexOf('Markdown A') < savedContent.indexOf('Markdown B'));
    const blocks = await fs.readdir(path.join(target, 'blocks'));
    assert.equal(blocks.length, 1);
    const blockDir = path.join(target, 'blocks', blocks[0]);
    assert.equal(await fs.readFile(path.join(blockDir, 'index.html'), 'utf8'), '<section><h2>原始 HTML</h2></section>');
    assert.equal(await fs.readFile(path.join(blockDir, 'original.html'), 'utf8'), '<section><h2>原始 HTML</h2></section>');

    await click('编辑 HTML Block');
    const current = document.querySelector<HTMLTextAreaElement>('[aria-label="HTML 源码"]')!;
    const assetHtml = '<link rel="stylesheet" href="./assets/style.css"><section><h2>更新 HTML</h2><img src="./assets/pic.png"></section><script src="./assets/app.js"></script>';
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(current, assetHtml);
      current.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true })));
    await waitFor(() => !useNoteStore.getState().isDirty);
    assert.equal(await fs.readFile(path.join(blockDir, 'index.html'), 'utf8'), assetHtml);
    assert.equal(await fs.readFile(path.join(blockDir, 'original.html'), 'utf8'), '<section><h2>原始 HTML</h2></section>');
    const assets = path.join(blockDir, 'assets');
    await fs.mkdir(assets);
    await fs.writeFile(path.join(assets, 'style.css'), '.card{color:rgb(1,2,3)}');
    await fs.writeFile(path.join(assets, 'app.js'), 'window.__diskAsset=1;');
    await fs.writeFile(path.join(assets, 'pic.png'), Buffer.from([137, 80, 78, 71]));

    await click('关闭笔记');
    await waitFor(() => useNoteStore.getState().currentNote === null);
    h.driver.noteOpen(target);
    await click('打开 Mixed Note');
    await waitFor(() => useNoteStore.getState().currentNote?.metadata.type === 'mixed');
    await ready();
    await waitFor(() => /data:text\/css;base64,/.test(document.querySelector<HTMLIFrameElement>('.ProseMirror iframe')?.srcdoc ?? ''));
    const preview = document.querySelector<HTMLIFrameElement>('.ProseMirror iframe')!.srcdoc;
    assert.match(preview, /data:text\/javascript;base64,/);
    assert.match(preview, /data:image\/png;base64,/);
    const reopened = useNoteStore.getState().currentNote!;
    assert.equal(reopened.mixed!.blocks[0].html, assetHtml);
    assert.equal(reopened.mixed!.blocks[0].originalHtml, '<section><h2>原始 HTML</h2></section>');
    assert.equal(reopened.contentMd, savedContent, 'content.md order changed across close/reopen');

    await click('导入 HTML Block');
    const secondSource = document.querySelector<HTMLTextAreaElement>('[aria-label="HTML 导入源码"]')!;
    const secondHtml = '<section><h2>Second Block</h2><img src="./assets/second.png"></section>';
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(secondSource, secondHtml);
      secondSource.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('确认导入 HTML');
    try {
      await waitFor(() => useNoteStore.getState().currentNote?.mixed?.blocks.length === 2);
    } catch (cause) {
      const alerts = [...document.querySelectorAll('[role="alert"]')].map(node => node.textContent).filter(Boolean);
      throw new Error(`${cause instanceof Error ? cause.message : String(cause)}; blocks=${useNoteStore.getState().currentNote?.mixed?.blocks.length ?? -1}; alerts=${JSON.stringify(alerts)}`);
    }
    const secondId = useNoteStore.getState().currentNote!.mixed!.blocks[1].id;
    const secondDir = path.join(target, 'blocks', secondId);
    assert.equal(await fs.readFile(path.join(secondDir, 'index.html'), 'utf8'), secondHtml);
    assert.equal(await fs.readFile(path.join(secondDir, 'original.html'), 'utf8'), secondHtml);
    await fs.mkdir(path.join(secondDir, 'assets'));
    await fs.writeFile(path.join(secondDir, 'assets/second.png'), Buffer.from([137, 80, 78, 71, 5]));
    const twoBlockContent = await fs.readFile(path.join(target, 'content.md'), 'utf8');
    assert.equal((twoBlockContent.match(/```flownote-html/g) ?? []).length, 2);

    await click('关闭笔记');
    await waitFor(() => useNoteStore.getState().currentNote === null);
    const movedParent = path.join(h.directory, 'moved');
    await fs.mkdir(movedParent);
    const movedTarget = path.join(movedParent, 'Moved.note');
    await fs.rename(target, movedTarget);
    assert.equal(await fs.readFile(path.join(movedTarget, 'content.md'), 'utf8'), twoBlockContent);
    assert.deepEqual(await fs.readFile(path.join(movedTarget, 'assets/images/plot.png')), Buffer.from([137, 80, 78, 71, 9]));
    assert.deepEqual(await fs.readFile(path.join(movedTarget, 'blocks', secondId, 'assets/second.png')), Buffer.from([137, 80, 78, 71, 5]));
    assert.equal(await fs.readFile(path.join(movedTarget, 'blocks', blocks[0], 'index.html'), 'utf8'), assetHtml);
    assert.equal(await fs.readFile(path.join(movedTarget, 'blocks', secondId, 'index.html'), 'utf8'), secondHtml);

    h.driver.noteOpen(movedTarget);
    await click('打开 Mixed Note');
    await waitFor(() => useNoteStore.getState().currentNote?.mixed?.blocks.length === 2);
    await ready();
    await waitFor(() => document.querySelectorAll<HTMLIFrameElement>('.ProseMirror iframe').length === 2);
    await waitFor(() => {
      const frames = [...document.querySelectorAll<HTMLIFrameElement>('.ProseMirror iframe')];
      const first = frames.find(frame => frame.srcdoc.includes('更新 HTML'));
      const second = frames.find(frame => frame.srcdoc.includes('Second Block'));
      return !!first && !!second && /data:text\/css;base64,/.test(first.srcdoc)
        && /data:text\/javascript;base64,/.test(first.srcdoc) && /data:image\/png;base64,/.test(first.srcdoc)
        && /data:image\/png;base64,/.test(second.srcdoc);
    });
    const movedFrames = [...document.querySelectorAll<HTMLIFrameElement>('.ProseMirror iframe')];
    const movedFirst = movedFrames.find(frame => frame.srcdoc.includes('更新 HTML'))!;
    const movedSecond = movedFrames.find(frame => frame.srcdoc.includes('Second Block'))!;
    assert.match(movedFirst.srcdoc, /data:text\/css;base64,/);
    assert.match(movedFirst.srcdoc, /data:text\/javascript;base64,/);
    assert.match(movedFirst.srcdoc, /data:image\/png;base64,/);
    assert.match(movedSecond.srcdoc, /data:image\/png;base64,/);
    assert.ok(!movedFirst.srcdoc.includes(movedTarget), 'runtime HTML leaked the host Note path');
    assert.ok(!movedSecond.srcdoc.includes(movedTarget), 'runtime HTML leaked the host Note path');
    assert.equal(useNoteStore.getState().currentNote!.contentMd, twoBlockContent);
  }, 'Timing.md');
}

async function sliceThreeExternalConflictAndDeepCopySurviveDisk() {
  await withDiskApp('# bootstrap\n', async h => {
    const html = '<link rel="stylesheet" href="./assets/style.css"><section>Source Disk</section><img src="./assets/image.png">';
    const notePath = await writeMixedPackage(h.directory, 'Slice3.note', html);
    h.driver.noteOpen(notePath);
    await click('打开 Mixed Note');
    await waitFor(() => useNoteStore.getState().currentNote?.metadata.type === 'mixed');
    await ready();
    const sourceDir = path.join(notePath, 'blocks', BLOCK_A);

    const cleanExternal = '<link rel="stylesheet" href="./assets/style.css"><section>External Clean</section><img src="./assets/image.png">';
    await fs.writeFile(path.join(sourceDir, 'index.html'), cleanExternal);
    await waitFor(() => useNoteStore.getState().currentNote?.mixed?.blocks[0].html === cleanExternal);
    assert.equal(useNoteStore.getState().isDirty, false);

    await click('编辑 HTML Block');
    const area = document.querySelector<HTMLTextAreaElement>('[aria-label="HTML 源码"]')!;
    const local = '<link rel="stylesheet" href="./assets/style.css"><section>Local Dirty</section><img src="./assets/image.png">';
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, local);
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await waitFor(() => useNoteStore.getState().isDirty);
    const diskConflict = '<link rel="stylesheet" href="./assets/style.css"><section>External Conflict</section><img src="./assets/image.png">';
    await fs.writeFile(path.join(sourceDir, 'index.html'), diskConflict);
    await waitFor(() => !!document.querySelector('[aria-label="Mixed Note 外部修改冲突"]'));
    assert.equal(useNoteStore.getState().currentNote!.mixed!.blocks[0].html, local);
    assert.equal(await fs.readFile(path.join(sourceDir, 'index.html'), 'utf8'), diskConflict);

    const localCopy = path.join(h.directory, 'Local Copy.note');
    h.driver.noteSaveAs(localCopy);
    await click('另存本地版本');
    try {
      await waitFor(() => useNoteStore.getState().currentNote?.path.endsWith('Local Copy.note') === true);
    } catch (cause) {
      const alerts = [...document.querySelectorAll('[role="alert"]')].map(node => node.textContent).filter(Boolean);
      const statuses = [...document.querySelectorAll('[role="status"]')].map(node => node.textContent).filter(Boolean);
      throw new Error(`${cause instanceof Error ? cause.message : String(cause)}; path=${useNoteStore.getState().currentNote?.path}; alerts=${JSON.stringify(alerts)}; statuses=${JSON.stringify(statuses)}`);
    }
    await waitFor(() => !useNoteStore.getState().isDirty);
    assert.equal(await fs.readFile(path.join(sourceDir, 'index.html'), 'utf8'), diskConflict, 'Save Local As overwrote the externally changed Note');
    assert.equal(await fs.readFile(path.join(localCopy, 'blocks', BLOCK_A, 'index.html'), 'utf8'), local);

    const copyButton = button('复制 HTML Block');
    assert.equal(copyButton.disabled, false, 'Deep Copy action is disabled after Save Local As');
    await click('复制 HTML Block');
    try {
      await waitFor(() => useNoteStore.getState().currentNote?.mixed?.blocks.length === 2);
    } catch (cause) {
      const alerts = [...document.querySelectorAll('[role="alert"]')].map(node => node.textContent).filter(Boolean);
      const statuses = [...document.querySelectorAll('[role="status"]')].map(node => node.textContent).filter(Boolean);
      throw new Error(`${cause instanceof Error ? cause.message : String(cause)}; blocks=${useNoteStore.getState().currentNote?.mixed?.blocks.length}; alerts=${JSON.stringify(alerts)}; statuses=${JSON.stringify(statuses)}`);
    }
    const targetId = useNoteStore.getState().currentNote!.mixed!.blocks[1].id;
    assert.notEqual(targetId, BLOCK_A);
    const copiedAssets = path.join(localCopy, 'blocks', targetId, 'assets');
    assert.equal(await fs.readFile(path.join(copiedAssets, 'style.css'), 'utf8'), '.source{color:red}');
    assert.deepEqual(await fs.readFile(path.join(copiedAssets, 'image.png')), Buffer.from([1, 2, 3, 4]));
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(useNoteStore.getState().isDirty, false, 'Deep Copy save was re-dirtied by a delayed editor/probe echo');

    const closeButton = button('关闭笔记');
    assert.equal(closeButton.disabled, false, `close disabled; dirty=${useNoteStore.getState().isDirty} composing=${useNoteStore.getState().isComposing}`);
    await click('关闭笔记');
    try {
      await waitFor(() => useNoteStore.getState().currentNote === null);
    } catch (cause) {
      throw new Error(`${cause instanceof Error ? cause.message : String(cause)}; dirty=${useNoteStore.getState().isDirty}; composing=${useNoteStore.getState().isComposing}; dialog=${!!document.querySelector('[role="dialog"]')}; alerts=${JSON.stringify([...document.querySelectorAll('[role="alert"]')].map(node => node.textContent))}`);
    }
    h.driver.noteOpen(localCopy);
    await click('打开 Mixed Note');
    await waitFor(() => useNoteStore.getState().currentNote?.mixed?.blocks.length === 2);
    await ready();
    assert.equal(document.querySelectorAll('.ProseMirror iframe').length, 2);

    await fs.writeFile(path.join(copiedAssets, 'style.css'), 'COPY ONLY');
    assert.equal(await fs.readFile(path.join(localCopy, 'blocks', BLOCK_A, 'assets/style.css'), 'utf8'), '.source{color:red}');
    assert.equal(await fs.readFile(path.join(copiedAssets, 'style.css'), 'utf8'), 'COPY ONLY');
  }, 'bootstrap.md');
}

async function sliceThreeMissingAndOrphanRepairsSurviveDisk() {
  await withDiskApp('# bootstrap\n', async h => {
    const notePath = await writeMixedPackage(h.directory, 'Repair.note');
    h.driver.noteOpen(notePath);
    await click('打开 Mixed Note');
    await waitFor(() => useNoteStore.getState().currentNote?.metadata.type === 'mixed');
    await ready();

    const validContent = await fs.readFile(path.join(notePath, 'content.md'), 'utf8');
    const missingContent = `${validContent}\n${blockAnchor(BLOCK_B)}`;
    await fs.writeFile(path.join(notePath, 'content.md'), missingContent);
    await waitFor(() => !!document.querySelector('[aria-label="移除缺失 HTML Block 引用"]'));
    if ((document.body.textContent ?? '').includes(BLOCK_B)) {
      const leaks = [...document.querySelectorAll('*')].filter(node => (node.textContent ?? '').includes(BLOCK_B))
        .slice(-10).map(node => `${node.tagName}.${(node as HTMLElement).className || ''}:${(node.textContent ?? '').slice(0, 240)}`);
      throw new Error(`Missing Block UUID leaked into normal UI: ${JSON.stringify(leaks)}`);
    }
    await click('移除缺失 HTML Block 引用');
    await waitFor(() => !document.querySelector('[aria-label="移除缺失 HTML Block 引用"]'));
    const repairedContent = await fs.readFile(path.join(notePath, 'content.md'), 'utf8');
    assert.ok(repairedContent.includes(BLOCK_A));
    assert.ok(!repairedContent.includes(BLOCK_B));
    assert.ok(!await fs.stat(path.join(notePath, 'blocks', BLOCK_B)).then(() => true).catch(() => false), 'Missing repair fabricated a Block directory');

    const source = path.join(notePath, 'blocks', BLOCK_A);
    const orphan = path.join(notePath, 'blocks', BLOCK_B);
    await fs.mkdir(path.join(orphan, 'assets'), { recursive: true });
    for (const name of ['block.json', 'index.html', 'original.html']) await fs.copyFile(path.join(source, name), path.join(orphan, name));
    await fs.writeFile(path.join(orphan, 'assets/private.css'), 'ORPHAN PRIVATE');
    await waitFor(() => !!document.querySelector('[aria-label="恢复孤立 HTML Block"]'));
    await click('恢复孤立 HTML Block');
    await waitFor(() => useNoteStore.getState().currentNote?.mixed?.blocks.length === 2);
    const restoredContent = await fs.readFile(path.join(notePath, 'content.md'), 'utf8');
    assert.ok(restoredContent.includes(BLOCK_A) && restoredContent.includes(BLOCK_B));
    assert.equal(await fs.readFile(path.join(orphan, 'assets/private.css'), 'utf8'), 'ORPHAN PRIVATE');

    await click('关闭笔记');
    await waitFor(() => useNoteStore.getState().currentNote === null);
    h.driver.noteOpen(notePath);
    await click('打开 Mixed Note');
    await waitFor(() => useNoteStore.getState().currentNote?.mixed?.blocks.length === 2);
    assert.equal(useNoteStore.getState().currentNote?.diagnostics?.length ?? 0, 0);
  }, 'repair-bootstrap.md');
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
    { name: 'Mixed Note 真实磁盘：Markdown 转 .note、编辑 Current、关闭重开保持 Original 与顺序', run: mixedNoteConversionSurvivesDisk },
    { name: 'Slice 3 真实磁盘：外部冲突另存本地后 Deep Copy 私有资源独立', run: sliceThreeExternalConflictAndDeepCopySurviveDisk },
    { name: 'Slice 3 真实磁盘：Missing / Orphan 显式修复后关闭重开有效', run: sliceThreeMissingAndOrphanRepairsSurviveDisk },
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

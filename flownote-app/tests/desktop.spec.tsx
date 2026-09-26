import { act } from 'react';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { useNoteStore } from '../src/note/noteStore';
import { waitFor } from './editorHarness';
import { clickDesktop, closeEvent, DESKTOP_SOURCE, desktopButton, desktopIdle, editDesktop, withDesktop } from './desktopHarness';

async function cleanWindowClosesOnce() {
  await withDesktop(async ({ boundary }) => {
    await closeEvent();
    await waitFor(() => boundary.destroyed === 1);
    assert.equal(boundary.destroyRequests, 1, 'StrictMode installed duplicate close handlers');
    assert.equal(document.querySelector('[role="dialog"]'), null);
  });
}

async function cancelDirtyClose() {
  await withDesktop(async ({ boundary, file }) => {
    await editDesktop('桌面测试', '未保存');
    await closeEvent();
    assert.ok(document.querySelector('[role="dialog"]'));
    assert.equal(boundary.destroyed, 0);
    await clickDesktop('取消');
    assert.equal(useNoteStore.getState().isDirty, true);
    assert.match(useNoteStore.getState().currentNote!.contentMd, /未保存/);
    assert.equal(await fs.readFile(file, 'utf8'), DESKTOP_SOURCE);
  });
}

async function explicitDiscardCloses() {
  await withDesktop(async ({ boundary, file }) => {
    await editDesktop('桌面测试', '放弃的内容');
    await closeEvent(); await clickDesktop('放弃更改并继续');
    await waitFor(() => boundary.destroyed === 1);
    assert.equal(await fs.readFile(file, 'utf8'), DESKTOP_SOURCE);
    assert.equal(boundary.destroyRequests, 1);
  });
}

async function saveBeforeClosing() {
  await withDesktop(async ({ boundary, file }) => {
    await editDesktop('桌面测试', '已保存');
    await closeEvent(); await clickDesktop('保存并继续');
    await waitFor(() => boundary.destroyed === 1);
    assert.equal(await fs.readFile(file, 'utf8'), DESKTOP_SOURCE.replace('桌面测试', '已保存'));
    assert.equal(useNoteStore.getState().isDirty, false);
  });
}

async function failedSaveKeepsWindow() {
  await withDesktop(async ({ boundary, file }) => {
    await editDesktop('桌面测试', '本地修改');
    await fs.writeFile(file, 'EXTERNAL\n');
    await closeEvent(); await clickDesktop('保存并继续'); await desktopIdle();
    assert.equal(boundary.destroyRequests, 0);
    assert.equal(useNoteStore.getState().isDirty, true);
    assert.match(useNoteStore.getState().currentNote!.contentMd, /本地修改/);
    assert.match(document.querySelector('[role="alert"]')!.textContent!, /修改/);
    assert.equal(await fs.readFile(file, 'utf8'), 'EXTERNAL\n');
  });
}

async function inputDuringClosingSaveStaysOpen() {
  await withDesktop(async ({ boundary, file }) => {
    await editDesktop('桌面测试', '第一次');
    let finish!: () => void;
    let committed = false;
    boundary.afterSave = () => new Promise<void>(resolve => { committed = true; finish = resolve; });
    await closeEvent(); await clickDesktop('保存并继续');
    await waitFor(() => committed);
    await editDesktop('第一次', '后续输入');
    await act(async () => finish()); await desktopIdle();
    assert.equal(boundary.destroyRequests, 0);
    assert.equal(useNoteStore.getState().isDirty, true);
    assert.equal(await fs.readFile(file, 'utf8'), DESKTOP_SOURCE.replace('桌面测试', '第一次'));
    boundary.afterSave = undefined;
    await clickDesktop('保存并继续'); await waitFor(() => boundary.destroyed === 1);
    assert.equal(await fs.readFile(file, 'utf8'), DESKTOP_SOURCE.replace('桌面测试', '后续输入'));
  });
}

async function compositionCloseRemainsRecoverable() {
  await withDesktop(async ({ boundary }) => {
    const area = document.querySelector('textarea[aria-label="Markdown 源码"]')!;
    await act(async () => area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
    await editDesktop('桌面测试', '组合输入中');
    await closeEvent();
    assert.equal(boundary.destroyRequests, 0);
    assert.ok(document.querySelector('[role="dialog"]'), 'IME close request should expose an explicit close decision');
    await clickDesktop('取消');
    assert.equal(boundary.destroyRequests, 0);
    await act(async () => area.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
    await closeEvent();
    assert.ok(document.querySelector('[role="dialog"]'));
    assert.equal(boundary.destroyRequests, 0);
    await clickDesktop('取消');
  });
}

async function repeatedCloseIsSerialized() {
  await withDesktop(async ({ boundary }) => {
    let finish!: () => void;
    boundary.beforeDestroy = () => new Promise<void>(resolve => { finish = resolve; });
    await closeEvent();
    await waitFor(() => boundary.destroyRequests === 1);
    await closeEvent();
    assert.equal(boundary.destroyRequests, 1);
    await act(async () => finish());
    await waitFor(() => boundary.destroyed === 1);
  });
}

async function failedDestructionIsVisible() {
  await withDesktop(async ({ boundary }) => {
    boundary.destroyError = new Error('系统拒绝关闭窗口');
    await closeEvent(); await desktopIdle();
    assert.equal(boundary.destroyed, 0);
    assert.match(document.querySelector('[role="alert"]')!.textContent!, /系统拒绝/);
    assert.equal(useNoteStore.getState().currentNote!.contentMd, DESKTOP_SOURCE);
    boundary.destroyError = undefined;
    await closeEvent(); await waitFor(() => boundary.destroyed === 1);
  });
}

async function finalCloseLocksSourceInput() {
  await withDesktop(async ({ boundary }) => {
    let finish!: () => void;
    boundary.beforeDestroy = () => new Promise<void>(resolve => { finish = resolve; });
    await closeEvent(); await waitFor(() => boundary.destroyRequests === 1);
    const locked = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Markdown 源码"]')!.readOnly;
    await act(async () => finish()); await waitFor(() => boundary.destroyed === 1);
    assert.equal(locked, true, 'Input was still accepted after final window destruction started');
    assert.equal(desktopButton('打开 Markdown 文件').disabled, true, 'A completed destruction request re-enabled file operations');
  });
}

async function failedFinalCloseRestoresSourceMode() {
  await withDesktop(async ({ boundary }) => {
    await clickDesktop('源码');
    let rejectClose!: (error: Error) => void;
    boundary.beforeDestroy = () => new Promise<void>((_resolve, reject) => { rejectClose = reject; });
    await closeEvent(); await waitFor(() => boundary.destroyRequests === 1);
    const locked = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Markdown 源码"]')!.readOnly;
    await act(async () => rejectClose(new Error('关闭失败'))); await desktopIdle();
    assert.equal(locked, true);
    assert.equal(document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Markdown 源码"]')!.readOnly, false);
    assert.equal(desktopButton('源码').getAttribute('aria-pressed'), 'true');
    await editDesktop('alpha', 'alpha updated');
    assert.match(useNoteStore.getState().currentNote!.contentMd, /alpha updated/);
  }, '- alpha\n');
}

async function finalCloseLocksVisualInput() {
  await withDesktop(async ({ boundary, file }) => {
    let finish!: () => void;
    boundary.beforeDestroy = () => new Promise<void>(resolve => { finish = resolve; });
    await closeEvent(); await waitFor(() => boundary.destroyRequests === 1);
    const editable = document.querySelector('.ProseMirror')!.getAttribute('contenteditable');
    await act(async () => document.querySelector<HTMLInputElement>('.ProseMirror input[type="checkbox"]')!.click());
    const dirty = useNoteStore.getState().isDirty;
    await act(async () => finish()); await waitFor(() => boundary.destroyed === 1);
    assert.equal(editable, 'false', 'Visual editor was still editable during destruction');
    assert.equal(dirty, false);
    assert.equal(await fs.readFile(file, 'utf8'), '- [ ] Task\n');
  }, '- [ ] Task\n');
}

export async function run(filter: string) {
  const checks = [
    { name: '桌面关闭：干净笔记只销毁一次，StrictMode 监听不重复', run: cleanWindowClosesOnce },
    { name: '桌面关闭：取消保留未保存正文和窗口', run: cancelDirtyClose },
    { name: '桌面关闭：明确放弃后关闭，磁盘保持原文', run: explicitDiscardCloses },
    { name: '桌面关闭：内容真实写入磁盘后再关闭', run: saveBeforeClosing },
    { name: '桌面关闭：保存失败保留窗口、Dirty 和本地输入', run: failedSaveKeepsWindow },
    { name: '桌面关闭：保存期间有新输入时继续保留窗口', run: inputDuringClosingSaveStaysOpen },
    { name: '桌面关闭：组合输入期间显示可恢复关闭决策', run: compositionCloseRemainsRecoverable },
    { name: '桌面关闭：重复关闭事件不能重复销毁窗口', run: repeatedCloseIsSerialized },
    { name: '桌面关闭：系统销毁失败可见且允许重试', run: failedDestructionIsVisible },
    { name: '最终关闭：请求销毁前锁定源码，回执后继续保持关闭状态', run: finalCloseLocksSourceInput },
    { name: '最终关闭：销毁失败恢复原来的源码模式和编辑能力', run: failedFinalCloseRestoresSourceMode },
    { name: '最终关闭：请求销毁前锁定可视化输入和任务勾选', run: finalCloseLocksVisualInput },
  ];
  const results = [];
  for (const check of checks) {
    if (filter && !check.name.includes(filter)) continue;
    try { await check.run(); results.push({ name: check.name, status: 'passed' }); }
    catch (error) { results.push({ name: check.name, status: 'failed', error: error instanceof Error ? error.message : String(error) }); }
  }
  return results;
}

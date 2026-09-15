import { act } from 'react';
import assert from 'node:assert/strict';
import { createHarness, settle } from './editorHarness';

type Harness = ReturnType<typeof createHarness>;

function control(label: string): HTMLButtonElement {
  const value = document.querySelector<HTMLButtonElement>(`[role="toolbar"] button[aria-label="${label}"]`);
  assert.ok(value, `Toolbar control is missing: ${label}`);
  return value;
}

async function formats(h: Harness) {
  await h.mount('选择这些文字\n');
  await h.select('这些文字', true);
  await act(async () => control('加粗').click());
  assert.match(h.api.current!.getMarkdown(), /\*\*这些文字\*\*/);
  await act(async () => control('斜体').click());
  assert.ok(document.querySelector('.ProseMirror em strong, .ProseMirror strong em'));
  await act(async () => control('撤销').click());
  assert.equal(document.querySelector('.ProseMirror em'), null);
}

async function tableControls(h: Harness) {
  await h.mount('');
  await act(async () => control('插入表格').click());
  assert.equal(document.querySelectorAll('.ProseMirror tr').length, 3);
  await act(async () => control('增加一行').click());
  assert.equal(document.querySelectorAll('.ProseMirror tr').length, 4);
  await act(async () => control('增加一列').click());
  assert.equal(document.querySelectorAll('.ProseMirror tr:first-child th').length, 4);
}

async function taskToggle(h: Harness) {
  await h.mount('记录待办\n');
  await h.select('记录待办');
  await act(async () => control('任务列表').click());
  assert.ok(document.querySelector('.ProseMirror input[type="checkbox"]'));
  assert.match(h.api.current!.getMarkdown(), /\[ \] 记录待办/);
}

async function linkEditor(h: Harness) {
  await h.mount('打开链接\n');
  await h.select('链接', true);
  await act(async () => control('插入链接').click());
  const input = document.querySelector<HTMLInputElement>('[aria-label="链接地址"]');
  assert.ok(input);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'javascript:alert(1)');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => document.querySelector<HTMLFormElement>('[aria-label="链接设置"]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  assert.ok(document.querySelector('[role="alert"]'));
  assert.equal(document.querySelector('.ProseMirror a'), null);
}

async function guarded(h: Harness) {
  await h.mount('中文输入\n');
  await act(async () => h.view().dom.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  assert.equal(control('加粗').disabled, true);
  await act(async () => h.view().dom.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await settle();
  assert.equal(control('加粗').disabled, false);
}

export function toolbarChecks(h: Harness) {
  return [
    ['工具栏：加粗、斜体和独立撤销', formats],
    ['工具栏：插入表格与增加行列', tableControls],
    ['工具栏：普通段落转为任务列表', taskToggle],
    ['工具栏：拒绝危险链接并保留正文', linkEditor],
    ['工具栏：组合输入期间禁用格式操作', guarded],
  ].map(([name, run]) => ({ name: name as string, run: () => (run as typeof formats)(h) }));
}

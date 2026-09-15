import { act } from 'react';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { undo, redo } from '@milkdown/prose/history';
import { TextSelection } from '@milkdown/prose/state';
import { createHarness, settle } from './editorHarness';
import { imageQualificationChecks } from './imageQualification.spec';
import { listQualificationChecks } from './listQualification.spec';
import { clipboardRegressionChecks } from './clipboardRegressions.spec';
import type { TestContext } from './editorRegressions.spec';

export type Harness = ReturnType<typeof createHarness>;
export type QualificationCheck = { name: string; run: () => Promise<void> };
export const IMAGE_PATH = 'qualification.assets/list-image.png';
export const fixture = (name: string) => readFileSync(resolve('../flownote-markdown-qualification/fixtures', name), 'utf8');

export async function paste(h: Harness, text: string, html = '') {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { files: [], getData: (type: string) =>
    type === 'text/plain' ? text : type === 'text/html' ? html : '' } });
  await act(async () => h.view().dom.dispatchEvent(event));
  await settle();
}

async function imageAsset() {
  const path = resolve('../flownote-markdown-qualification/fixtures', IMAGE_PATH);
  assert.ok(existsSync(path), 'L11 PNG fixture is missing');
  const bytes = readFileSync(path);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(bytes.readUInt32BE(16) >= 32 && bytes.readUInt32BE(20) >= 32);
}

async function insertImage(h: Harness) {
  await h.mount('1. 第一项\n2. 替换这里并保留后文\n3. 第三项\n');
  await h.select('替换这里', true);
  await act(async () => h.api.current!.insertImage(IMAGE_PATH, '列表中的图片'));
  const items = document.querySelectorAll('.ProseMirror > ol > li');
  const image = items[1].querySelector('img');
  assert.equal(image?.getAttribute('src'), IMAGE_PATH);
  assert.equal(image?.getAttribute('alt'), '列表中的图片');
  assert.equal(items[1].textContent, '并保留后文');
  assert.equal(items.length, 3);
  const source = h.api.current!.getMarkdown();
  await act(async () => h.api.current!.setMarkdown(source));
  assert.equal(document.querySelectorAll('.ProseMirror > ol > li')[1].querySelector('img')?.getAttribute('src'), IMAGE_PATH);
  assert.equal(h.api.current!.getMarkdown(), source);
}

async function imageUndo(h: Harness) {
  await h.mount('原有内容\n');
  await h.select('原有内容');
  await act(async () => h.api.current!.insertImage(IMAGE_PATH, '插图'));
  await act(async () => assert.equal(undo(h.view().state, h.view().dispatch), true));
  assert.equal(h.api.current!.getMarkdown().trim(), '原有内容');
  await act(async () => assert.equal(redo(h.view().state, h.view().dispatch), true));
  assert.equal(document.querySelectorAll('.ProseMirror img').length, 1);
}

async function imageToolbar(h: Harness) {
  await h.mount('- 插入位置\n- 保留项\n');
  await h.select('插入位置', true);
  const button = document.querySelector<HTMLButtonElement>('button[aria-label="插入图片"]');
  assert.ok(button, 'Image toolbar action is missing');
  await act(async () => button.click());
  for (const [label, value] of [['图片地址', IMAGE_PATH], ['图片替代文字', '时钟树示意']]) {
    const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    assert.ok(input);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  await act(async () => document.querySelector<HTMLFormElement>('form[aria-label="图片设置"]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  assert.equal(document.querySelector('.ProseMirror li img')?.getAttribute('alt'), '时钟树示意');
}

async function nestedMarkdownPaste(h: Harness) {
  await h.mount(fixture('07-paste-target.md'));
  await h.select('PASTE_HERE', true);
  await paste(h, '1. CPU\n   - Frontend\n     1. Fetch\n     2. Decode\n2. GPU');
  assert.ok(document.querySelector('.ProseMirror > ol > li > ul > li > ol'), 'Plain Markdown paste lost mixed list nesting');
  assert.match(h.api.current!.getMarkdown(), /Paste Qualification[\s\S]*CPU[\s\S]*Fetch[\s\S]*GPU[\s\S]*Verify the next item/);
  const before = h.view().state.doc.toJSON();
  await act(async () => h.api.current!.setMarkdown(h.api.current!.getMarkdown()));
  assert.deepEqual(h.view().state.doc.toJSON(), before);
}

async function codeInListPaste(h: Harness) {
  await h.mount('1. Step 1 说明\n2. Step 2 保留\n');
  await h.select('说明');
  const position = h.view().state.selection.from + '说明'.length;
  await act(async () => h.view().dispatch(h.view().state.tr.setSelection(TextSelection.create(h.view().state.doc, position))));
  await paste(h, '```javascript\nconst timing = 42;\n```');
  const items = document.querySelectorAll('.ProseMirror > ol > li');
  assert.equal(items.length, 2);
  assert.equal(items[0].querySelector('pre code')?.textContent, 'const timing = 42;', h.api.current!.getMarkdown());
  assert.equal(items[1].textContent, 'Step 2 保留');
  await act(async () => h.api.current!.setMarkdown(h.api.current!.getMarkdown()));
  assert.equal(document.querySelector('.ProseMirror > ol > li:first-child pre code')?.textContent, 'const timing = 42;');
}

function checks(h: Harness): QualificationCheck[] {
  return [
    { name: 'L11 资源：提供有效的 PNG 测试图片', run: imageAsset },
    { name: 'L11 图片：既有 API 替换选区并保留列表归属和路径', run: () => insertImage(h) },
    { name: 'L11 图片：插入可独立撤销和重做', run: () => imageUndo(h) },
    { name: 'L11 图片：工具栏可输入地址和替代文字', run: () => imageToolbar(h) },
    { name: 'P02 粘贴：纯 Markdown 混合嵌套保留结构与前后正文', run: () => nestedMarkdownPaste(h) },
    { name: 'P03 粘贴：代码块属于原列表项且后续项不合并', run: () => codeInListPaste(h) },
  ];
}

export async function run(filter: string, context: TestContext) {
  const h = createHarness();
  const results = [];
  for (const check of [...checks(h), ...imageQualificationChecks(h, context), ...listQualificationChecks(h), ...clipboardRegressionChecks(h)]) {
    if (filter && !check.name.includes(filter)) continue;
    try { await check.run(); results.push({ name: check.name, status: 'passed' }); }
    catch (error) { results.push({ name: check.name, status: 'failed', error: error instanceof Error ? error.message : String(error) }); }
  }
  await h.unmount();
  return results;
}

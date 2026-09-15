import { act } from 'react';
import assert from 'node:assert/strict';
import { remarkCtx } from '@milkdown/core';
import { TextSelection } from '@milkdown/prose/state';
import { runEditorAction } from '../src/editor/editorActions';
import type { Harness, QualificationCheck } from './qualification.spec';
import { fixture, paste, IMAGE_PATH } from './qualification.spec';

function meaning(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (key, child) => ['position', 'spread'].includes(key) ? undefined : child));
}

async function roundTrip(h: Harness, expected: string) {
  const parser = h.editor().ctx.get(remarkCtx);
  const output = h.api.current!.getMarkdown();
  assert.deepEqual(meaning(parser.parse(output)), meaning(parser.parse(expected)));
  await act(async () => h.api.current!.setMarkdown(output));
  assert.equal(h.view().editable, true, 'Ordinary list was moved to source mode');
  assert.deepEqual(meaning(parser.parse(h.api.current!.getMarkdown())), meaning(parser.parse(expected)));
}

async function select(h: Harness, options: { text: string; occurrence?: number; atEnd?: boolean; offset?: number }) {
  const positions: number[] = [];
  h.view().state.doc.descendants((node, position) => {
    if (node.isText && node.text?.includes(options.text)) positions.push(position + node.text.indexOf(options.text));
  });
  const base = positions[options.occurrence ?? 0];
  assert.notEqual(base, undefined, `Missing text: ${options.text}`);
  const position = base + (options.atEnd ? options.text.length : options.offset ?? 0);
  await act(async () => h.view().dispatch(h.view().state.tr.setSelection(TextSelection.create(h.view().state.doc, position))));
}

function listPath(h: Harness): string[] {
  const resolved = h.view().state.selection.$from;
  return Array.from({ length: resolved.depth }, (_, index) => resolved.node(index + 1).type.name)
    .filter(name => name === 'bullet_list' || name === 'ordered_list');
}

async function basicList(h: Harness) {
  const source = fixture('01-lists-basic.md');
  await h.mount(source);
  await select(h, { text: 'Beta', atEnd: true });
  await act(async () => h.view().dispatch(h.view().state.tr.insertText(' 已更新')));
  await roundTrip(h, source.replace('- Beta', '- Beta 已更新'));
  assert.equal(document.querySelectorAll('.ProseMirror > ol > li').length, 3);
}

async function deepList(h: Harness, ordered: boolean) {
  const source = fixture('02-lists-deep.md');
  await h.mount(source);
  await select(h, { text: 'Level 5 A', occurrence: ordered ? 1 : 0, atEnd: true });
  assert.deepEqual(listPath(h), Array(5).fill(ordered ? 'ordered_list' : 'bullet_list'));
  await act(async () => h.view().dispatch(h.view().state.tr.insertText(' 已更新')));
  const index = ordered ? source.lastIndexOf('Level 5 A') : source.indexOf('Level 5 A');
  const expected = source.slice(0, index) + source.slice(index).replace('Level 5 A', 'Level 5 A 已更新');
  await roundTrip(h, expected);
}

async function mixedList(h: Harness, ordered: boolean) {
  const source = fixture('03-lists-mixed.md');
  await h.mount(source);
  await select(h, { text: ordered ? 'Decode' : 'NDR' });
  const path = ordered ? ['ordered_list', 'bullet_list', 'ordered_list'] : ['bullet_list', 'ordered_list', 'bullet_list'];
  assert.deepEqual(listPath(h), path);
  await h.key('Tab');
  assert.deepEqual(listPath(h), [...path, path[2]]);
  await h.key('Tab', { shiftKey: true });
  assert.deepEqual(listPath(h), path);
  await roundTrip(h, source);
}

async function emptyItem(h: Harness) {
  const source = fixture('03-lists-mixed.md');
  await h.mount(source);
  await select(h, { text: 'LSU', atEnd: true });
  const before = document.querySelectorAll('.ProseMirror li').length;
  await h.key('Enter');
  assert.equal(document.querySelectorAll('.ProseMirror li').length, before + 1);
  await h.key('Backspace');
  await roundTrip(h, source);
}

async function splitBlockItem(h: Harness) {
  const source = fixture('03-lists-mixed.md');
  await h.mount(source);
  await select(h, { text: 'Backend', offset: 4 });
  await h.key('Enter');
  assert.equal(h.view().state.selection.$from.parent.textContent, 'end');
  await h.key('Backspace');
  await roundTrip(h, source);
}

async function inlineFormatting(h: Harness) {
  const source = fixture('01-lists-basic.md');
  await h.mount(source);
  await h.select('Gamma', true);
  await act(async () => runEditorAction(h.editor(), 'bold'));
  await h.select('Alpha', true);
  await act(async () => runEditorAction(h.editor(), 'inlineCode'));
  await roundTrip(h, source.replace('- Gamma', '- **Gamma**').replace('- Alpha', '- `Alpha`'));
  assert.equal(document.querySelector('.ProseMirror a')?.getAttribute('href'), 'https://openai.com');
}

async function multiBlock(h: Harness) {
  const source = fixture('04-list-block-content.md');
  await h.mount(source);
  await select(h, { text: 'second paragraph inside Step 1.', atEnd: true });
  await act(async () => h.view().dispatch(h.view().state.tr.insertText(' 已编辑。')));
  await roundTrip(h, source.replace('second paragraph inside Step 1.', 'second paragraph inside Step 1. 已编辑。'));
  const item = document.querySelector('.ProseMirror > ol > li')!;
  assert.ok(item.querySelector('pre[data-language="tcl"]'));
  assert.equal(item.querySelectorAll(':scope > ul > li').length, 2);
  assert.equal(item.querySelectorAll(':scope > p').length, 2);
}

async function quotedList(h: Harness) {
  const source = '> 引用\n>\n> 1. 步骤一\n>    - 子项\n> 2. 步骤二\n\n外部正文\n';
  await h.mount(source);
  await select(h, { text: '子项', atEnd: true });
  await act(async () => h.view().dispatch(h.view().state.tr.insertText(' 已编辑')));
  await roundTrip(h, source.replace('子项', '子项 已编辑'));
  assert.ok(document.querySelector('.ProseMirror > blockquote > ol > li > ul'));
}

async function imageItem(h: Harness) {
  const source = fixture('04-list-block-content.md');
  await h.mount(source);
  await select(h, { text: 'Step 3' });
  await h.key('Tab');
  assert.deepEqual(listPath(h), ['ordered_list', 'ordered_list']);
  const image = document.querySelector(`.ProseMirror img[src="${IMAGE_PATH}"]`)!;
  assert.ok(image.closest('li')?.querySelector(':scope > p')?.textContent?.includes('Step 3'));
  await h.key('Tab', { shiftKey: true });
  await roundTrip(h, source);
  assert.ok(document.querySelector('.ProseMirror > ol > li:nth-child(3) img'));
}

async function tasks(h: Harness) {
  const source = '- [ ] 发布\n  1. 编译\n     - 普通子项\n  2. 校验\n- 普通项目\n- [x] 已完成\n';
  await h.mount(source);
  const checkbox = document.querySelector<HTMLInputElement>('.ProseMirror input[type="checkbox"]')!;
  await act(async () => checkbox.click());
  await roundTrip(h, source.replace('[ ]', '[x]'));
  await select(h, { text: '普通子项' });
  assert.deepEqual(listPath(h), ['bullet_list', 'ordered_list', 'bullet_list']);
}

async function localEdit(h: Harness) {
  const source = fixture('03-lists-mixed.md');
  await h.mount(source);
  await h.select('LSU', true);
  await act(async () => h.view().dispatch(h.view().state.tr.insertText('LSU 已更新')));
  await roundTrip(h, source.replace('LSU', 'LSU 已更新'));
}

async function richPaste(h: Harness) {
  await h.mount(fixture('07-paste-target.md'));
  await h.select('PASTE_HERE', true);
  await paste(h, 'Bold and Italic\nCPU\nALU\nGPU', '<p><strong>Bold</strong> and <em>Italic</em> <code>n=1</code></p><ol><li>CPU<ul><li>ALU</li></ul></li><li>GPU</li></ol>');
  assert.ok(document.querySelector('.ProseMirror strong'));
  assert.ok(document.querySelector('.ProseMirror em'));
  assert.ok(document.querySelector('.ProseMirror p code'));
  assert.ok(document.querySelector('.ProseMirror > ol > li > ul'));
  assert.match(h.view().state.doc.textContent, /Paste Qualification[\s\S]*Verify the next item/);
  await roundTrip(h, h.api.current!.getMarkdown());
}

async function pasteInCode(h: Harness) {
  await h.mount('```javascript\nTARGET\n```\n');
  await h.select('TARGET', true);
  await paste(h, '# 字面标题\n- 字面列表');
  assert.equal(document.querySelector('.ProseMirror pre code')?.textContent, '# 字面标题\n- 字面列表');
  assert.equal(document.querySelector('.ProseMirror h1'), null);
}

async function pastePlain(h: Harness) {
  await h.mount('TARGET\n');
  await h.select('TARGET', true);
  await act(async () => h.view().dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'V', keyCode: 86, ctrlKey: true, shiftKey: true, bubbles: true })));
  await paste(h, '1. 字面编号\n   - 字面子项');
  assert.equal(document.querySelector('.ProseMirror ol'), null);
  assert.equal(document.querySelector('.ProseMirror ul'), null);
  assert.match(h.view().state.doc.textContent, /1\. 字面编号/);
}

export function listQualificationChecks(h: Harness): QualificationCheck[] {
  return [
    { name: 'L01 基本列表：局部修改后内容、类型和顺序保持', run: () => basicList(h) },
    { name: 'L02 五层无序：编辑最深子项后仍保留全部层级', run: () => deepList(h, false) },
    { name: 'L03 五层有序：编辑最深子项后仍保留全部层级', run: () => deepList(h, true) },
    { name: 'L04/L06 混合列表：有序→无序→有序缩进与退回', run: () => mixedList(h, true) },
    { name: 'L05/L06 混合列表：无序→有序→无序缩进与退回', run: () => mixedList(h, false) },
    { name: 'L07 空项：嵌套列表 Enter 和 Backspace 不改变其他项', run: () => emptyItem(h) },
    { name: 'L07 分合：含子列表的项目拆分合并后结构恢复', run: () => splitBlockItem(h) },
    { name: 'L08 行内格式：修改粗体与代码不会损坏列表及链接', run: () => inlineFormatting(h) },
    { name: 'L09 多块列表：第二段、代码和子列表保持同一父项', run: () => multiBlock(h) },
    { name: 'L10 引用列表：编辑后引用与混合列表保持嵌套', run: () => quotedList(h) },
    { name: 'L11 图片归属：含图片列表项缩进退回后仍属于原项', run: () => imageItem(h) },
    { name: 'L12 任务混合：勾选任务保留其普通和有序子项', run: () => tasks(h) },
    { name: 'R02 局部编辑：混合列表只修改 LSU，其他语义不变', run: () => localEdit(h) },
    { name: 'P01 富文本：强调、代码与嵌套列表仍为 Markdown 节点', run: () => richPaste(h) },
    { name: '粘贴边界：代码块中的 Markdown 保持字面文本', run: () => pasteInCode(h) },
    { name: '粘贴边界：Ctrl+Shift+V 按纯文本粘贴', run: () => pastePlain(h) },
  ];
}

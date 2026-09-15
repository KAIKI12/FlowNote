import { act } from 'react';
import assert from 'node:assert/strict';
import { TextSelection } from '@milkdown/prose/state';
import { closeHistory, undo } from '@milkdown/prose/history';
import { createHarness, settle } from './editorHarness';

type Harness = ReturnType<typeof createHarness>;

async function listIndent(h: Harness) {
  await h.mount('1. 第一项\n2. 第二项\n3. 第三项\n');
  await h.select('第二项');
  await h.key('Tab');
  assert.ok(document.querySelector('.ProseMirror ol > li > ol'), 'Tab did not nest the item');
  await h.key('Tab', { shiftKey: true });
  assert.equal(document.querySelectorAll('.ProseMirror > ol > li').length, 3);
  assert.equal(document.querySelectorAll('.ProseMirror ol ol').length, 0);
}

async function listEnter(h: Harness) {
  await h.mount('- 第一项\n- 第二项\n');
  await h.select('第二项');
  const end = h.view().state.selection.from + '第二项'.length;
  await act(async () => h.view().dispatch(h.view().state.tr.setSelection(TextSelection.create(h.view().state.doc, end))));
  await h.key('Enter');
  assert.equal(document.querySelectorAll('.ProseMirror > ul > li').length, 3);
  await h.key('Backspace');
  assert.match(h.api.current!.getMarkdown(), /第一项/);
  assert.match(h.api.current!.getMarkdown(), /第二项/);
  assert.equal(document.querySelectorAll('.ProseMirror li').length, 2);
}

async function codeIndent(h: Harness) {
  await h.mount('```javascript\nconst n = 1;\n```\n');
  await h.select('const');
  await h.key('Tab');
  assert.match(h.api.current!.getMarkdown(), /\n  const n/);
  await h.key('Tab', { shiftKey: true });
  assert.match(h.api.current!.getMarkdown(), /\nconst n/);
}

async function tableTab(h: Harness) {
  await h.mount('| 列一 | 列二 |\n| --- | --- |\n| 值一 | 末格 |\n');
  await h.select('值一');
  await h.key('Tab');
  assert.equal(h.view().state.selection.$from.parent.textContent, '末格');
  await h.key('Tab');
  assert.equal(document.querySelectorAll('.ProseMirror tr').length, 3, 'Tab at final cell should add a row');
  await h.key('Tab', { shiftKey: true });
  assert.equal(h.view().state.selection.$from.parent.textContent, '末格');
}

async function richPaste(h: Harness) {
  await h.mount('');
  await act(async () => { h.view().pasteHTML('<ol><li>CPU<ul><li>ALU</li><li>LSU</li></ul></li><li>GPU</li></ol>', new Event('paste') as ClipboardEvent); });
  await settle();
  assert.ok(document.querySelector('.ProseMirror ol li ul'));
  assert.match(h.api.current!.getMarkdown(), /CPU[\s\S]*ALU[\s\S]*LSU[\s\S]*GPU/);
  assert.equal(document.querySelectorAll('.html-block-container').length, 0);
}

async function undoAfterLoad(h: Harness) {
  await h.mount('旧文档\n');
  await act(async () => h.api.current!.setMarkdown('新文档\n'));
  await act(async () => h.view().dispatch(h.view().state.tr.insertText('添加', 1)));
  await act(async () => { assert.equal(undo(h.view().state, h.view().dispatch), true); });
  await settle();
  assert.equal(h.api.current!.getMarkdown().trim(), '新文档');
}

async function composition(h: Harness) {
  await h.mount('原文\n');
  const editor = h.editor();
  const dom = h.view().dom;
  await act(async () => dom.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  await h.source('外部更新\n');
  assert.equal(h.api.current!.getMarkdown().trim(), '原文');
  assert.equal(h.editor(), editor);
  await act(async () => dom.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await settle();
  assert.equal(h.api.current!.getMarkdown().trim(), '外部更新');
  assert.equal(h.editor(), editor);
}

async function chineseTyping(h: Harness) {
  await h.mount('- 中文列表\n');
  await h.select('中文列表');
  const dom = h.view().dom;
  await act(async () => dom.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  await act(async () => h.view().dispatch(h.view().state.tr.insertText('时钟树优化，', h.view().state.selection.from)));
  await settle();
  assert.equal(h.view().dom, dom);
  await act(async () => dom.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await settle();
  assert.equal(h.api.current!.getMarkdown().match(/时钟树优化/g)?.length, 1);
  assert.match(h.latest(), /时钟树优化，中文列表/);
}

async function keyboardUndo(h: Harness) {
  await h.mount('原文\n');
  await act(async () => h.view().dispatch(closeHistory(h.view().state.tr.insertText('键盘', 1))));
  await h.key('z', { ctrlKey: true });
  assert.equal(h.api.current!.getMarkdown().trim(), '原文');
  await h.key('y', { ctrlKey: true });
  assert.equal(h.api.current!.getMarkdown().trim(), '键盘原文');
}

export function interactionChecks(h: Harness) {
  const cases = [
    ['列表操作：Tab 缩进及 Shift+Tab 还原层级', listIndent],
    ['列表操作：Enter 新建及 Backspace 保留内容', listEnter],
    ['代码操作：Tab / Shift+Tab 缩进源码', codeIndent],
    ['表格操作：Tab 换格及末格新增行', tableTab],
    ['粘贴操作：富文本嵌套列表保留层级', richPaste],
    ['撤销边界：装载后的首次输入独立撤销', undoAfterLoad],
    ['中文保护：composition 期间延迟外部更新', composition],
    ['中文保护：输入内容不重复且编辑器不重建', chineseTyping],
    ['键盘撤销：Ctrl+Z / Ctrl+Y', keyboardUndo],
  ] as const;
  return cases.map(([name, action]) => ({ name, run: () => action(h) }));
}

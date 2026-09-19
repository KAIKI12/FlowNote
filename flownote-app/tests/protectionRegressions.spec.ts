import { act } from 'react';
import assert from 'node:assert/strict';
import { remarkCtx } from '@milkdown/core';
import { createHarness, settle } from './editorHarness';
import { changeSource, sourceArea } from './protection.spec';

type Harness = ReturnType<typeof createHarness>;

async function enter(h: Harness, text: string) {
  await act(async () => {
    const view = h.view();
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', handler => handler(view, from, to, text, () => view.state.tr.insertText(text)));
    if (!handled) view.dispatch(view.state.tr.insertText(text, from, to));
  });
}

async function partialWikiPaste(h: Harness) {
  await h.mount('开头 尾部\n');
  await h.select('尾部');
  await enter(h, '[');
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => type === 'text/plain' ? '[Page]]' : '', files: [] } });
  await act(async () => h.view().dom.dispatchEvent(event));
  assert.equal(h.api.current!.getMarkdown(), '开头 [[Page]]尾部\n');
  assert.equal(sourceArea().value, h.api.current!.getMarkdown());
}

async function repeatedExternal(h: Harness) {
  await h.mount('[[A]]\n');
  await changeSource('[[B]]\n');
  await h.source('[[A]]\n');
  await h.source('[[B]]\n');
  assert.equal(h.api.current!.getMarkdown(), '[[B]]\n');
  await h.source('[[A]]\n');
  await changeSource('[[B]]\n');
  await settle();
  assert.equal(h.latest(), '[[B]]\n');
  assert.equal(sourceArea().value, '[[B]]\n');
}

async function priorCurrency(h: Harness) {
  await h.mount('Price $5; formula: tail\n');
  await h.select('tail');
  await enter(h, '$');
  assert.match(sourceArea().value, /formula: \$tail/);
  assert.equal(h.view().editable, false);
}

async function emptyFrontmatter(h: Harness) {
  for (const source of ['---\n---\n\n# Body\n', '+++\n+++\n\n# Body\n', '---\n...\n\n# Body\n']) {
    await h.mount(source);
    assert.equal(h.view().editable, true);
    assert.equal(document.querySelector('.ProseMirror h1')?.textContent, 'Body');
    assert.equal(h.api.current!.getMarkdown(), source);
  }
}

async function modeHistory(h: Harness) {
  await h.mount('[[A]]\n');
  await changeSource('[[B]]\n');
  await act(async () => h.api.current!.setMode('source'));
  await act(async () => h.api.current!.setMode('read'));
  await act(async () => h.api.current!.setMode('source'));
  await act(async () => sourceArea().dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })));
  assert.equal(h.api.current!.getMarkdown(), '[[A]]\n');
}

async function mathDelimiters(h: Harness) {
  for (const source of ['$ x $\n', '$x\n+y$\n', '$x$1\n']) {
    await h.mount(source);
    assert.equal(h.api.current!.getMarkdown(), source);
    assert.equal(sourceArea().value, source);
  }
}

async function externalMode(h: Harness) {
  await h.mount('[[保留]]\n');
  const field = sourceArea();
  await act(async () => field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  await changeSource('[[保留]]输入中\n');
  await h.mode('read');
  assert.equal(sourceArea(), field);
  assert.equal(field.readOnly, false);
  await act(async () => field.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await settle();
  assert.equal(sourceArea().readOnly, true);
  assert.equal(h.api.current!.getMarkdown(), '[[保留]]输入中\n');
  await h.mode('edit');
  assert.ok(sourceArea());
  assert.match(document.querySelector('.editor-source-notice')?.textContent ?? '', /保护/);
}

async function sourceTypingCost(h: Harness) {
  await h.mount('[[A]]\n');
  const parser = h.editor().ctx.get(remarkCtx);
  const original = parser.parse;
  let parses = 0;
  parser.parse = function (...args) { parses += 1; return original.apply(this, args); };
  try {
    await changeSource('[[A]]立即写入\n');
    assert.equal(h.api.current!.getMarkdown(), '[[A]]立即写入\n');
    assert.equal(h.latest(), '[[A]]立即写入\n');
    assert.equal(parses, 0, 'Source keystrokes synchronously reparse the entire document');
    await act(async () => h.api.current!.setMarkdown('$新公式$\n'));
    await settle();
    assert.match(document.querySelector('.editor-source-notice')?.textContent ?? '', /LaTeX/);
    assert.equal(h.api.current!.getMarkdown(), '$新公式$\n');
  } finally { parser.parse = original; }
}

async function compositionUndo(h: Harness) {
  await h.mount('[[原文]]\n');
  await act(async () => sourceArea().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  await changeSource('[[原文]]时\n');
  await changeSource('[[原文]]时间\n');
  await act(async () => sourceArea().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await act(async () => sourceArea().dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })));
  assert.equal(h.api.current!.getMarkdown(), '[[原文]]\n');
}

async function cancelledExternal(h: Harness) {
  await h.mount('[[原文]]\n');
  await act(async () => sourceArea().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  await h.source('[[短暂外部版本]]\n');
  await h.source('[[原文]]\n');
  await act(async () => sourceArea().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  assert.equal(h.api.current!.getMarkdown(), '[[原文]]\n');
  assert.equal(document.querySelector('.editor-source-conflict'), null);
}

export function protectionRegressionChecks(h: Harness) {
  return [
    { name: '保护回归：先输入左括号再粘贴双链尾部不会残留转义', run: () => partialWikiPaste(h) },
    { name: '保护回归：相同内容的后续外部更新不会被误认成旧回传', run: () => repeatedExternal(h) },
    { name: '保护回归：已有货币符号不会遮蔽新输入的公式', run: () => priorCurrency(h) },
    { name: '保护回归：空 Frontmatter 与 YAML 结束标记也保留原文', run: () => emptyFrontmatter(h) },
    { name: '保护回归：重复选择源码和临时只读不会清空撤销栈', run: () => modeHistory(h) },
    { name: '保护回归：公式内空白、换行和数字后缀均保留', run: () => mathDelimiters(h) },
    { name: '保护回归：组合输入期间模式属性更新不会卸载正文', run: () => externalMode(h) },
    { name: '源码输入：即时更新正文，延后语法提示且旧分析不覆盖新文档', run: () => sourceTypingCost(h) },
    { name: '源码输入：一次中文组合输入可完整撤销', run: () => compositionUndo(h) },
    { name: '保护回归：组合输入期间已撤回的外部更新不会延后复活', run: () => cancelledExternal(h) },
  ];
}

import assert from 'node:assert/strict';
import { act } from 'react';
import type { Harness, QualificationCheck } from './qualification.spec';
import { paste } from './qualification.spec';

async function spaces(h: Harness) {
  for (const text of [' gap', 'gap ', ' gap ', ' ', '\t']) {
    await h.mount('headTARGETtail\n');
    await h.select('TARGET', true);
    await paste(h, text);
    assert.equal(h.view().state.doc.textContent, 'head' + text + 'tail');
  }
}

async function inheritedMarks(h: Harness) {
  await h.mount('**bold target text**\n');
  await h.select('target', true);
  await paste(h, 'new');
  assert.equal(document.querySelector('.ProseMirror strong')?.textContent, 'bold new text');
  assert.equal(h.api.current!.getMarkdown().trim(), '**bold new text**');
}

async function inlineCode(h: Harness) {
  await h.mount('`example` rest\n');
  await h.select('example', true);
  await paste(h, '**literal**');
  assert.equal(document.querySelector('.ProseMirror code')?.textContent, '**literal**');
  assert.equal(document.querySelector('.ProseMirror strong'), null);
  assert.equal(h.api.current!.getMarkdown().trim(), '`**literal**` rest');
}

async function markedSpaces(h: Harness) {
  await h.mount('headTARGETtail\n');
  await h.select('TARGET', true);
  await paste(h, ' **bold** ');
  assert.equal(h.view().state.doc.textContent, 'head bold tail');
  assert.equal(document.querySelector('.ProseMirror strong')?.textContent, 'bold');
}

async function codeMath(h: Harness) {
  await h.mount('`example` rest\n');
  await h.select('example', true);
  await paste(h, '$x_1$');
  assert.equal(h.view().editable, true, 'Code text unexpectedly activated source protection');
  assert.equal(h.api.current!.getMarkdown().trim(), '`$x_1$` rest');
}

async function decodedMarkdown(h: Harness) {
  for (const [source, expected] of [['Tom &amp; Jerry', 'Tom & Jerry'], [' \\*literal\\* ', ' *literal* '], ['&#x4e2d;文', '中文']]) {
    await h.mount('headTARGETtail\n');
    await h.select('TARGET', true);
    await paste(h, source);
    assert.equal(h.view().state.doc.textContent, 'head' + expected + 'tail');
    await act(async () => h.api.current!.setMarkdown(h.api.current!.getMarkdown()));
    assert.equal(h.view().state.doc.textContent, 'head' + expected + 'tail');
  }
}

async function decodedMarks(h: Harness) {
  await h.mount('**headTARGETtail**\n');
  await h.select('TARGET', true);
  await paste(h, ' &amp; ');
  assert.equal(document.querySelector('.ProseMirror strong')?.textContent, 'head & tail');
}

async function literalEntities(h: Harness) {
  await h.mount('TARGET\n');
  await h.select('TARGET', true);
  await act(async () => h.view().dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'V', keyCode: 86, ctrlKey: true, shiftKey: true, bubbles: true })));
  await paste(h, 'Tom &amp; Jerry \\*literal\\*');
  assert.equal(h.view().state.doc.textContent, 'Tom &amp; Jerry \\*literal\\*');
}

export function clipboardRegressionChecks(h: Harness): QualificationCheck[] {
  return [
    { name: '粘贴回归：普通文本保留首尾空格、单空格和 Tab', run: () => spaces(h) },
    { name: '粘贴回归：普通文字继承当前加粗上下文', run: () => inheritedMarks(h) },
    { name: '粘贴回归：行内代码中的 Markdown 保持字面内容', run: () => inlineCode(h) },
    { name: '粘贴回归：带格式的行内 Markdown 保留边缘空格', run: () => markedSpaces(h) },
    { name: '粘贴回归：替换整个代码跨度时公式仍是字面文本', run: () => codeMath(h) },
    { name: '粘贴回归：Markdown 实体和转义按原语义解码并可重载', run: () => decodedMarkdown(h) },
    { name: '粘贴回归：解码的文字及边缘空白继承当前格式', run: () => decodedMarks(h) },
    { name: '粘贴回归：纯文本快捷键保留实体与转义原样', run: () => literalEntities(h) },
  ];
}

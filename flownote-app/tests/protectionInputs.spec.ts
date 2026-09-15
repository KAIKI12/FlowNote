import { act } from 'react';
import assert from 'node:assert/strict';
import { parserCtx } from '@milkdown/core';
import { createHarness, settle } from './editorHarness';
import { changeSource, sourceArea } from './protection.spec';
import { useNoteStore } from '../src/note/noteStore';

type Harness = ReturnType<typeof createHarness>;

async function pasteRisk(h: Harness) {
  await h.mount('开头 替换这里 结尾\n\n- 子项\n');
  await h.select('替换这里', true);
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) =>
    type === 'text/plain' ? '[[Useful Skew]] 与 $T_{clk}$' : '', files: [] } });
  await act(async () => h.view().dom.dispatchEvent(event));
  const output = h.api.current!.getMarkdown();
  assert.match(sourceArea().value, /开头 \[\[Useful Skew\]\] 与 \$T_\{clk\}\$ 结尾/);
  assert.match(output, /[\-*] 子项/);
  assert.equal(output.includes('替换这里'), false);
  await settle();
  assert.equal(h.latest(), output);
}

async function typedRisk(h: Harness) {
  await h.mount('开头 尾部\n');
  await h.select('尾部');
  await act(async () => {
    for (const text of ['[', '[']) {
      const view = h.view();
      const { from, to } = view.state.selection;
      const handled = view.someProp('handleTextInput', handler => handler(view, from, to, text, () => view.state.tr.insertText(text)));
      if (!handled) view.dispatch(view.state.tr.insertText(text, from, to));
    }
  });
  assert.match(sourceArea().value, /开头 \[\[尾部/);
  assert.equal(sourceArea().value.includes('\\['), false, 'New WikiLink was escaped before protection');
}

async function codePaste(h: Harness) {
  await h.mount('```javascript\nconst a = 1;\n```\n');
  await h.select('const');
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => type === 'text/plain' ? '[[x]] $y$' : '', files: [] } });
  await act(async () => h.view().dom.dispatchEvent(event));
  assert.equal(h.view().editable, true);
  assert.match(h.api.current!.getMarkdown(), /\[\[x\]\] \$y\$/);
}

async function sourceComposition(h: Harness) {
  await h.mount('[[原文]]\n');
  const field = sourceArea();
  await act(async () => field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  await changeSource('[[原文]]中文输入\n');
  await h.source('[[外部版本]]\n');
  assert.equal(h.api.current!.getMarkdown(), '[[原文]]中文输入\n');
  assert.equal(sourceArea(), field);
  await act(async () => assert.throws(() => h.api.current!.setMarkdown('覆盖'), /组合输入/));
  await act(async () => field.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  assert.equal(useNoteStore.getState().isComposing, false);
  assert.equal(h.latest(), '[[原文]]中文输入\n');
  assert.match(document.querySelector('.editor-source-conflict')?.textContent ?? '', /外部更新/);
  assert.equal(document.querySelector<HTMLTextAreaElement>('[aria-label="冲突的外部 Markdown"]')?.value, '[[外部版本]]\n');
  const accept = [...document.querySelectorAll('button')].find(button => button.textContent === '采用外部内容')!;
  await act(async () => accept.click());
  assert.equal(h.api.current!.getMarkdown(), '[[外部版本]]\n');
  assert.equal(document.querySelector('.editor-source-conflict'), null);
}

async function sourceEchoUndo(h: Harness) {
  await h.mount('[[原文]]\n');
  const field = sourceArea();
  await changeSource('[[改后]]\n');
  field.setSelectionRange(2, 2);
  await settle();
  assert.equal(sourceArea(), field);
  assert.equal(field.selectionStart, 2);
  await act(async () => field.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })));
  assert.equal(h.api.current!.getMarkdown(), '[[原文]]\n');
  await act(async () => field.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true, cancelable: true })));
  assert.equal(h.api.current!.getMarkdown(), '[[改后]]\n');
}

async function readonlySource(h: Harness) {
  await h.mount('<script>window.untrustedCode = true</script>\n');
  assert.equal(document.querySelector('script'), null);
  await act(async () => h.api.current!.setMode('read'));
  assert.equal(sourceArea().readOnly, true);
  await act(async () => assert.throws(() => h.api.current!.insertHtmlBlock('id'), /源码保护|只读/));
  assert.equal(h.api.current!.getMarkdown(), '<script>window.untrustedCode = true</script>\n');
  await act(async () => h.api.current!.setMode('source'));
  assert.equal(sourceArea().readOnly, false);
}

async function parserFailure(h: Harness) {
  await h.mount('旧文档\n');
  const parser = h.editor().ctx.get(parserCtx);
  try {
    h.editor().ctx.set(parserCtx, () => { throw new Error('Parser regression probe'); });
    await act(async () => h.api.current!.setMarkdown('必须保留的原文\n'));
    assert.equal(sourceArea().value, '必须保留的原文\n');
    assert.equal(h.api.current!.getMarkdown(), '必须保留的原文\n');
    assert.match(document.querySelector('.editor-source-notice')?.textContent ?? '', /Parser regression probe/);
  } finally { h.editor().ctx.set(parserCtx, parser); }
}

export function protectionInputChecks(h: Harness) {
  return [
    { name: '输入保护：粘贴扩展源码保留选区前后正文', run: () => pasteRisk(h) },
    { name: '输入保护：逐字输入 WikiLink 在转义前切换源码', run: () => typedRisk(h) },
    { name: '输入保护：代码中的 WikiLink 和公式示例仍作为代码', run: () => codePaste(h) },
    { name: '输入保护：源码 IME 与外部更新冲突保留两个版本', run: () => sourceComposition(h) },
    { name: '输入保护：源码回传不重建、不移动光标，并支持撤销重做', run: () => sourceEchoUndo(h) },
    { name: '输入保护：HTML 原文不执行，源码只读与命令隔离', run: () => readonlySource(h) },
    { name: '输入保护：解析异常可见，仍可编辑和导出原文', run: () => parserFailure(h) },
  ];
}

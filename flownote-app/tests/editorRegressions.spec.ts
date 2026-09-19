import { act } from 'react';
import assert from 'node:assert/strict';
import { undo } from '@milkdown/prose/history';
import { createHarness, settle } from './editorHarness';
import { insertLink, runEditorAction } from '../src/editor/editorActions';
import { EditorSession } from '../src/editor/editorSession';
import type { MarkdownBridge } from '../src/editor/markdownBridge';

type Harness = ReturnType<typeof createHarness>;
export interface TestContext { setUrl: (url: string) => void }

async function historyBoundary(h: Harness) {
  await h.mount('original\n');
  await act(async () => {
    h.view().dispatch(h.view().state.tr.insertText('typed-', 1));
    h.api.current!.setMarkdown('replacement\n');
  });
  await act(async () => { assert.equal(undo(h.view().state, h.view().dispatch), true); });
  await settle();
  assert.equal(h.api.current!.getMarkdown().trim(), 'typed-original');
}

async function taskComposition(h: Harness) {
  await h.mount('- [ ] 任务\n');
  await h.select('任务');
  await act(async () => h.view().dom.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  await act(async () => h.view().dispatch(h.view().state.tr.insertText('中文', h.view().state.selection.from)));
  await act(async () => h.view().dom.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await settle();
  const box = document.querySelector<HTMLInputElement>('.ProseMirror input[type="checkbox"]')!;
  assert.equal(box.disabled, false, 'Task checkbox stayed disabled after composition');
  await act(async () => box.click());
  assert.match(h.api.current!.getMarkdown(), /\[x\] 中文任务/);
}

async function preserveTableHeader(h: Harness) {
  await h.mount('| 名称 | 数值 |\n| --- | ---: |\n| A | 1 |\n| B | 2 |\n');
  await h.select('名称');
  const before = h.api.current!.getMarkdown();
  await act(async () => { assert.throws(() => runEditorAction(h.editor(), 'deleteRow'), /表头/); });
  assert.equal(h.api.current!.getMarkdown(), before);
  assert.equal(document.querySelectorAll('.ProseMirror tr').length, 3);
}

async function relativeLink(h: Harness, context: TestContext) {
  context.setUrl('tauri://localhost/');
  try {
    await h.mount('查看\n');
    await h.select('查看', true);
    await act(async () => insertLink(h.editor(), '../another.md'));
    assert.equal(document.querySelector('.ProseMirror a')?.getAttribute('href'), '../another.md');
  } finally { context.setUrl('http://127.0.0.1:1420/'); }
}


async function externalHydrationDoesNotEchoAsLocalEdit() {
  const published: string[] = [];
  let current = 'initial\n';
  const identity = {};
  const bridge: MarkdownBridge = {
    identity,
    inspect: () => [],
    read: () => current,
    replace: source => { current = source.replace(/\n?$/, '\n\n'); },
    editable: () => undefined,
    focus: () => undefined,
  };
  const session = new EditorSession({
    source: 'initial\n',
    mode: 'edit',
    publish: source => published.push(source),
    dirty: () => undefined,
    composing: () => undefined,
  });
  session.connect(bridge);
  published.length = 0;

  session.receiveExternal('disk snapshot\n');
  const hydrated = session.getMarkdown();
  assert.notEqual(hydrated, 'disk snapshot\n', 'fixture must simulate visual serializer normalization');
  session.acceptVisual(identity, hydrated);
  assert.deepEqual(published, [], 'external hydration echo was published as a local edit');

  current = hydrated + 'user edit\n';
  session.acceptVisual(identity, current);
  assert.deepEqual(published, [current], 'real user edit stopped publishing after hydration baseline');
}

export function regressionChecks(h: Harness, context: TestContext) {
  return [
    { name: '回归：装载之前的最近输入不会被合并撤销', run: () => historyBoundary(h) },
    { name: '回归：中文组合输入结束后任务框仍可点击', run: () => taskComposition(h) },
    { name: '回归：不能单独删除必需表头并破坏列对齐', run: () => preserveTableHeader(h) },
    { name: '回归：Tauri 协议下可插入相对链接', run: () => relativeLink(h, context) },
    { name: '回归：外部装载后的 Markdown 规范化回声不能重新标成本地编辑', run: externalHydrationDoesNotEchoAsLocalEdit },
  ];
}

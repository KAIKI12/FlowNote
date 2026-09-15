import { act } from 'react';
import assert from 'node:assert/strict';
import { createHarness, settle } from './editorHarness';
import { useNoteStore } from '../src/note/noteStore';

const ID = '0199a111-0000-7000-8000-000000000001';
const HTML = '<div class="card"><style>.card{color:teal}</style><button>Count</button></div>';
const ANCHOR = '```flownote-html\n' + JSON.stringify({ id: ID }) + '\n```';
const SOURCE = 'Markdown A\n\n' + ANCHOR + '\n\nMarkdown B\n';

function note(markdown = SOURCE) {
  const metadata = { formatVersion: 1, type: 'mixed' as const, title: 'HTML Test', createdAt: '2026-09-14T00:00:00Z', updatedAt: '2026-09-14T00:00:00Z' };
  useNoteStore.getState().setCurrentNote({ path: 'Test.note', contentMd: markdown, assets: [],
    metadata: { version: 1, type: 'mixed', title: metadata.title, createdAt: metadata.createdAt, updatedAt: metadata.updatedAt },
    htmlBlocks: new Map([[ID, HTML]]),
    mixed: { metadata, blocks: [{ id: ID, html: HTML, originalHtml: HTML,
      config: { kind: 'html', inputKind: 'fragment', scriptPolicy: 'sandbox', viewport: { heightPx: 480 } } }] },
  });
}

async function onlyIdInAnchor() {
  const h = createHarness();
  note('Markdown A\n\nMarkdown B\n');
  try {
    await h.mount('Markdown A\n\nMarkdown B\n');
    await h.select('Markdown B');
    await act(async () => h.api.current!.insertHtmlBlock(ID));
    const output = h.api.current!.getMarkdown();
    const match = output.match(/```flownote-html\s*\n([^\n]+)\n```/);
    assert.ok(match);
    assert.deepEqual(JSON.parse(match[1]), { id: ID }, 'Format v1 Anchor contains UI-only fields');
    assert.ok(output.indexOf('Markdown A') < output.indexOf('```flownote-html'));
    assert.ok(output.indexOf('```flownote-html') < output.indexOf('Markdown B'));
  } finally { await h.unmount(); }
}

async function inlineHtmlView() {
  const h = createHarness(); note();
  try {
    await h.mount(SOURCE);
    assert.equal(document.querySelector('.flownote-editor')!.getAttribute('data-active-editor'), 'visual');
    const frame = document.querySelector<HTMLIFrameElement>('.ProseMirror iframe');
    assert.ok(frame, 'HTML NodeView is not connected');
    assert.match(frame.srcdoc, /class="card"/);
    assert.equal(frame.getAttribute('sandbox'), 'allow-scripts');
    assert.ok(!document.querySelector('.ProseMirror')!.textContent!.includes(ID), 'Internal UUID is visible');
    assert.match(frame.srcdoc, /connect-src 'none'/);
    assert.match(frame.srcdoc, /Content-Security-Policy/);
    assert.equal(document.querySelectorAll('.ProseMirror > p').length, 2);
  } finally { await h.unmount(); }
}

async function duplicateAnchorsAreProtected() {
  const source = SOURCE + '\n' + ANCHOR + '\n';
  const h = createHarness(); note(source);
  try {
    await h.mount(source);
    assert.equal(h.api.current!.getMarkdown(), source);
    assert.match(document.querySelector('.editor-source-notice')!.textContent!, /重复/);
    assert.equal(document.querySelectorAll('.ProseMirror iframe').length, 0);
  } finally { await h.unmount(); }
}

async function invalidAndMissingAnchorsKeepSource() {
  const h = createHarness();
  for (const value of ['{"id":"../outside"}', JSON.stringify({ id: ID, width: 'wide' }), '{invalid']) {
    const source = 'Before\n\n```flownote-html\n' + value + '\n```\n\nAfter\n';
    note(source);
    try {
      await h.mount(source);
      assert.equal(h.api.current!.getMarkdown(), source);
      assert.match(document.querySelector('.editor-source-notice')!.textContent!, /引用无效|Invalid/);
    } finally { await h.unmount(); }
  }
}

async function editsKeepOriginal() {
  const h = createHarness(); note();
  try {
    await h.mount(SOURCE);
    const edit = document.querySelector<HTMLButtonElement>('[aria-label="编辑 HTML Block"]');
    assert.ok(edit);
    await act(async () => edit.click());
    const area = document.querySelector<HTMLTextAreaElement>('[aria-label="HTML 源码"]')!;
    assert.ok(area);
    await act(async () => { area.value = '<p>Updated</p>'; area.dispatchEvent(new Event('input', { bubbles: true })); });
    await settle();
    assert.equal(useNoteStore.getState().currentNote!.mixed!.blocks[0].html, '<p>Updated</p>');
    assert.equal(useNoteStore.getState().currentNote!.mixed!.blocks[0].originalHtml, HTML);
    assert.equal(useNoteStore.getState().isDirty, true);
    assert.match(h.api.current!.getMarkdown(), /Markdown B/);
  } finally { await h.unmount(); }
}

export async function run(filter: string) {
  const checks = [
    { name: 'HTML 格式：Anchor 只包含 id，并保留 Markdown 前后顺序', run: onlyIdInAnchor },
    { name: 'HTML 展示：真正的隔离 iframe 位于 Markdown 中间，默认断网', run: inlineHtmlView },
    { name: 'HTML 保护：重复 Anchor 保留源码并提示', run: duplicateAnchorsAreProtected },
    { name: 'HTML 保护：无效引用和扩展字段保留原 fence', run: invalidAndMissingAnchorsKeepSource },
    { name: 'HTML 编辑：Current 更新标脏，Original 保持不变', run: editsKeepOriginal },
  ];
  const results = [];
  for (const check of checks) {
    if (filter && !check.name.includes(filter)) continue;
    try { await check.run(); results.push({ name: check.name, status: 'passed' }); }
    catch (error) { results.push({ name: check.name, status: 'failed', error: error instanceof Error ? error.message : String(error) }); }
  }
  useNoteStore.getState().setCurrentNote(null);
  return results;
}

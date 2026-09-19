import { act } from 'react';
import assert from 'node:assert/strict';
import { createHarness, settle } from './editorHarness';
import { useNoteStore } from '../src/note/noteStore';
import { createNativeNotePort } from '../src/note/nativeNotePort';
import { resolveHtmlResources } from '../src/html/htmlResources';
import { NodeSelection } from '@milkdown/prose/state';
import { renderBrowserBundle } from '../src/export/browserBundle';

const ID = '0199a111-0000-7000-8000-000000000001';
const SECOND_ID = '0199a111-0000-7000-8000-000000000002';
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

async function previewInsertionDoesNotMutateEditor() {
  const h = createHarness();
  note('Markdown A\n\nMarkdown B\n');
  try {
    await h.mount('Markdown A\n\nMarkdown B\n');
    await h.select('Markdown B');
    const before = h.api.current!.getMarkdown();
    const candidate = h.api.current!.previewHtmlBlock(ID);
    assert.equal(h.api.current!.getMarkdown(), before, 'Candidate generation mutated the live editor');
    assert.ok(candidate.indexOf('Markdown A') < candidate.indexOf('```flownote-html'));
    assert.ok(candidate.indexOf('```flownote-html') < candidate.indexOf('Markdown B'));
    assert.deepEqual(JSON.parse(candidate.match(/```flownote-html\s*\n([^\n]+)\n```/)![1]), { id: ID });
  } finally { await h.unmount(); }
}

async function previewInsertionPreservesSelectedHtmlBlock() {
  const h = createHarness();
  note();
  try {
    await h.mount(SOURCE);
    let blockPos: number | undefined;
    h.view().state.doc.descendants((node, pos) => { if (blockPos === undefined && node.type.name === 'html_block') blockPos = pos; });
    assert.notEqual(blockPos, undefined, 'existing HTML Block was not parsed');
    await act(async () => h.view().dispatch(h.view().state.tr.setSelection(NodeSelection.create(h.view().state.doc, blockPos!))));
    const candidate = h.api.current!.previewHtmlBlock(SECOND_ID);
    const refs = [...candidate.matchAll(/```flownote-html\s*\n([^\n]+)\n```/g)].map(match => JSON.parse(match[1]).id);
    assert.deepEqual(refs, [ID, SECOND_ID], 'adding a Block replaced the selected existing Block');
    assert.equal(h.api.current!.getMarkdown(), SOURCE, 'candidate insertion mutated the live editor');
  } finally { await h.unmount(); }
}

async function previewDeepCopyInsertsAfterSourceWithoutMutatingEditor() {
  const h = createHarness();
  note();
  try {
    await h.mount(SOURCE);
    const before = h.api.current!.getMarkdown();
    const candidate = h.api.current!.previewDuplicateHtmlBlock(ID, SECOND_ID);
    const refs = [...candidate.matchAll(/```flownote-html\s*\n([^\n]+)\n```/g)].map(match => JSON.parse(match[1]).id);
    assert.deepEqual(refs, [ID, SECOND_ID]);
    assert.equal(h.api.current!.getMarkdown(), before, 'Deep Copy candidate mutated the live editor');
  } finally { await h.unmount(); }
}

async function localResourcesResolveInsideSandbox() {
  const reads: string[] = [];
  const assets: Record<string, { path: string; mime: string; bytes: number[] }> = {
    'assets/style.css': { path: 'assets/style.css', mime: 'text/css', bytes: [...Buffer.from(".card{background:url('./bg.png')}")] },
    'assets/app.js': { path: 'assets/app.js', mime: 'text/javascript', bytes: [...Buffer.from('window.__flowAsset = 1;')] },
    'assets/pic.png': { path: 'assets/pic.png', mime: 'image/png', bytes: [137, 80, 78, 71] },
    'assets/bg.png': { path: 'assets/bg.png', mime: 'image/png', bytes: [137, 80, 78, 71, 1] },
  };
  const source = '<link rel="stylesheet" href="./assets/style.css"><div class="card"><img src="assets/pic.png"><img src="../outside.png"><script src="./assets/app.js"></script></div>';
  const resolved = await resolveHtmlResources(source, async path => {
    reads.push(path);
    const asset = assets[path];
    if (!asset) throw new Error(`missing ${path}`);
    return asset;
  });
  assert.deepEqual(reads.sort(), ['assets/app.js', 'assets/bg.png', 'assets/pic.png', 'assets/style.css']);
  assert.doesNotMatch(resolved, /\.\/assets\/(style\.css|app\.js)/);
  assert.match(resolved, /data:image\/png;base64,/);
  assert.match(resolved, /data:text\/javascript;base64,/);
  assert.match(resolved, /src="\.\.\/outside\.png"/);
  const css = resolved.match(/href="data:text\/css;base64,([^"]+)"/);
  assert.ok(css, 'stylesheet was not converted to a data URL');
  assert.match(Buffer.from(css[1], 'base64').toString('utf8'), /data:image\/png;base64,/);
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

function noteData() {
  return { metadata: { formatVersion: 1, type: 'mixed' as const, title: 'HTML Test', createdAt: '2026-09-14T00:00:00Z', updatedAt: '2026-09-14T00:00:00Z' },
    blocks: [{ id: ID, html: HTML, originalHtml: HTML,
      config: { kind: 'html' as const, inputKind: 'fragment' as const, scriptPolicy: 'sandbox' as const, viewport: { heightPx: 480 } } }] };
}


async function browserBundleRendererUsesSemanticVisualDocumentAndCurrentBlocks() {
  const h = createHarness();
  note();
  try {
    await h.mount(SOURCE);
    const snapshot = h.api.current!.getBrowserBundleSnapshot();
    assert.equal(snapshot.protected, false);
    assert.match(snapshot.bodyHtml, /Markdown A/);
    assert.match(snapshot.bodyHtml, /data-type="html-block"/);

    const mixed = noteData();
    mixed.blocks[0].html = '<div>CURRENT EXPORT</div>';
    mixed.blocks[0].originalHtml = '<div>ORIGINAL MUST STAY PRIVATE</div>';
    const bundle = await renderBrowserBundle(snapshot, mixed, 'HTML Test');
    const before = bundle.indexHtml.indexOf('Markdown A');
    const frame = bundle.indexHtml.indexOf('./blocks/' + ID + '/index.html');
    const after = bundle.indexHtml.indexOf('Markdown B');
    assert.ok(before >= 0 && frame > before && after > frame, 'Browser Bundle changed document order');
    assert.doesNotMatch(bundle.indexHtml, /editor-toolbar|html-visual-toolbar|Open Full Editor/);
    assert.match(bundle.indexHtml, /sandbox="allow-scripts"/);
    assert.equal(bundle.blocks.length, 1);
    assert.equal(bundle.blocks[0].id, ID);
    assert.match(bundle.blocks[0].html, /CURRENT EXPORT/);
    assert.doesNotMatch(bundle.blocks[0].html, /ORIGINAL MUST STAY PRIVATE/);
    assert.match(bundle.blocks[0].html, /connect-src 'none'/);
  } finally { await h.unmount(); }
}

async function browserBundleProtectedSourceFallsBackWithoutLosingMarkdown() {
  const source = '---\ntitle: protected\n---\n\n[[WikiLink]]\n';
  const h = createHarness();
  note(source);
  try {
    await h.mount(source);
    const snapshot = h.api.current!.getBrowserBundleSnapshot();
    assert.equal(snapshot.protected, true);
    assert.equal(snapshot.markdown, source);
    const mixed = noteData();
    mixed.blocks = [];
    const bundle = await renderBrowserBundle(snapshot, mixed, 'Protected');
    assert.deepEqual(bundle.blocks, []);
    assert.match(bundle.indexHtml, /WikiLink/);
    assert.match(bundle.indexHtml, /protected-source/);
    assert.doesNotMatch(bundle.indexHtml, /<iframe/);
  } finally { await h.unmount(); }
}

async function nativeNotePortUsesRegisteredCommands() {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const snapshot = { id: 'note:capability', path: 'E:\\Notes\\Test.note', name: 'Test.note', content: SOURCE,
    revision: 'rev-1', readOnly: false, mixed: noteData() };
  const port = createNativeNotePort(async (command, args) => {
    calls.push({ command, args });
    if (command === 'note_open') return snapshot;
    if (command === 'note_save') return { ...snapshot, revision: 'rev-2' };
    if (command === 'note_reload') return snapshot;
    if (command === 'note_list_assets') return [
      { path: 'assets/app.js', mime: 'text/javascript', size: 12, editable: true },
      { path: 'assets/image.png', mime: 'image/png', size: 4, editable: false },
    ];
    if (command === 'note_read_asset') return { path: 'assets/style.css', mime: 'text/css', bytes: [98, 111, 100, 121] };
    if (command === 'note_export_browser_bundle') return { path: 'E:\\Exports\\HTML Test-export', name: 'HTML Test-export' };
    return null;
  });
  const opened = await port.open();
  assert.equal(opened?.mixed.blocks[0].originalHtml, HTML);
  await port.save({ id: snapshot.id, revision: snapshot.revision, content: SOURCE, mixed: snapshot.mixed,
    blockAssetEdits: [{ blockId: ID, path: 'assets/app.js', content: 'window.v=2;' }] });
  await port.reload(snapshot.id);
  const listed = await port.listAssets(snapshot.id, ID);
  assert.deepEqual(listed, [
    { path: 'assets/app.js', mime: 'text/javascript', size: 12, editable: true },
    { path: 'assets/image.png', mime: 'image/png', size: 4, editable: false },
  ]);
  const asset = await port.readAsset(snapshot.id, ID, 'assets/style.css');
  assert.deepEqual(asset, { path: 'assets/style.css', mime: 'text/css', bytes: [98, 111, 100, 121] });
  const exported = await port.exportBrowserBundle({
    id: snapshot.id, revision: snapshot.revision, folderName: 'HTML Test-export', title: 'HTML Test',
    content: SOURCE, indexHtml: '<!doctype html><p>Export</p>', blocks: [{ id: ID, html: '<!doctype html><p>Block</p>' }],
  });
  assert.deepEqual(exported, { path: 'E:\\Exports\\HTML Test-export', name: 'HTML Test-export' });
  await port.release(snapshot.id);
  assert.deepEqual(calls.map(value => value.command),
    ['note_open', 'note_save', 'note_reload', 'note_list_assets', 'note_read_asset', 'note_export_browser_bundle', 'note_release']);
  assert.deepEqual(calls[1].args, { request: { id: snapshot.id, revision: snapshot.revision, content: SOURCE, mixed: snapshot.mixed,
    blockAssetEdits: [{ blockId: ID, path: 'assets/app.js', content: 'window.v=2;' }] } });
  assert.deepEqual(calls[3].args, { request: { id: snapshot.id, blockId: ID } });
  assert.deepEqual(calls[4].args, { request: { id: snapshot.id, blockId: ID, path: 'assets/style.css' } });
  assert.deepEqual(calls[5].args, { request: { id: snapshot.id, revision: snapshot.revision,
    folderName: 'HTML Test-export', title: 'HTML Test', content: SOURCE, indexHtml: '<!doctype html><p>Export</p>',
    blocks: [{ id: ID, html: '<!doctype html><p>Block</p>' }] } });
}

async function invalidNativeNoteSnapshotIsRejected() {
  const port = createNativeNotePort(async () => ({ id: 'note:x', path: 'x.note', name: 'x.note', content: SOURCE,
    revision: 'r', readOnly: false, mixed: { metadata: { formatVersion: 1, type: 'mixed' }, blocks: [] } }));
  await assert.rejects(() => port.open(), /Note|字段|格式|metadata/i);
}


async function fullscreenPresentationOpensAndEscCloses() {
  const h = createHarness(); note();
  try {
    await h.mount(SOURCE);
    const fullscreen = document.querySelector<HTMLButtonElement>('[aria-label="全屏 HTML Block"]');
    assert.ok(fullscreen, 'Fullscreen HTML action is missing');
    fullscreen.focus();
    assert.equal(document.activeElement, fullscreen);
    await act(async () => fullscreen.click());
    const overlay = document.querySelector<HTMLElement>('[role="dialog"][aria-label="HTML 全屏展示"]');
    assert.ok(overlay, 'Fullscreen presentation overlay did not open');
    assert.ok(overlay.querySelector('iframe'), 'Fullscreen presentation did not render the HTML visual');
    const close = overlay.querySelector<HTMLButtonElement>('[aria-label="退出 HTML 全屏"]');
    assert.ok(close, 'Fullscreen exit action is missing');
    assert.equal(document.activeElement === close, true, 'Fullscreen must move keyboard focus to its exit action');
    assert.equal(document.body.style.overflow, 'hidden', 'Fullscreen must lock background scrolling');
    assert.equal(document.getElementById('harness')?.hasAttribute('inert'), true,
      'Fullscreen must make the background editor inert');

    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(document.querySelector('[role="dialog"][aria-label="HTML 全屏展示"]'), null);
    assert.equal(document.body.style.overflow, '', 'Fullscreen exit did not restore background scrolling');
    assert.equal(document.getElementById('harness')?.hasAttribute('inert'), false,
      'Fullscreen exit did not restore background interaction');
    assert.equal(document.activeElement === fullscreen, true, 'Fullscreen exit did not restore the invoking control focus');
  } finally { await h.unmount(); }
}

export async function run(filter: string) {
  const checks = [
    { name: 'HTML 格式：Anchor 只包含 id，并保留 Markdown 前后顺序', run: onlyIdInAnchor },
    { name: 'HTML 导入：候选 Anchor 按当前选区生成且不修改实时编辑器', run: previewInsertionDoesNotMutateEditor },
    { name: 'HTML 导入：新增 Block 不会替换已选中的现有 HTML Block', run: previewInsertionPreservesSelectedHtmlBlock },
    { name: 'HTML Deep Copy：候选副本紧随源 Block 且不修改实时编辑器', run: previewDeepCopyInsertsAfterSourceWithoutMutatingEditor },
    { name: 'HTML 资源：Block 私有 CSS / JS / 图片相对路径转换为 sandbox 内部资源', run: localResourcesResolveInsideSandbox },
    { name: 'HTML 展示：真正的隔离 iframe 位于 Markdown 中间，默认断网', run: inlineHtmlView },
    { name: 'HTML 保护：重复 Anchor 保留源码并提示', run: duplicateAnchorsAreProtected },
    { name: 'HTML 保护：无效引用和扩展字段保留原 fence', run: invalidAndMissingAnchorsKeepSource },
    { name: 'HTML 编辑：Current 更新标脏，Original 保持不变', run: editsKeepOriginal },
    { name: 'HTML 全屏：展示当前 Visual 并支持 Esc 退出', run: fullscreenPresentationOpensAndEscCloses },
    { name: 'Browser Bundle：语义正文与 Current HTML 按文档顺序导出', run: browserBundleRendererUsesSemanticVisualDocumentAndCurrentBlocks },
    { name: 'Browser Bundle：受保护 Markdown 使用源码保真 fallback', run: browserBundleProtectedSourceFallsBackWithoutLosingMarkdown },
    { name: 'Note 端口：前端使用已注册的原生 .note 命令并保留 Mixed 数据', run: nativeNotePortUsesRegisteredCommands },
    { name: 'Note 端口：拒绝字段不完整的原生快照', run: invalidNativeNoteSnapshotIsRejected },
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

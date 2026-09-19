import assert from 'node:assert/strict';
import { DocumentSession } from '../src/files/documentSession';
import { MarkdownFileError } from '../src/files/fileTypes';
import type { MarkdownFile, MarkdownFilePort } from '../src/files/fileTypes';

function file(content = 'original\n', id = 'file-a'): MarkdownFile {
  return { id, path: 'C:/notes/a.md', name: 'a.md', content, revision: 'v1', readOnly: false };
}

function fixture() {
  let current = { hasDocument: true, content: 'welcome\n', dirty: false, composing: false, kind: 'markdown' };
  let disk = file();
  let next = disk;
  const writes: string[] = [];
  const released: string[] = [];
  const port: MarkdownFilePort = { mode: 'desktop', canWrite: true,
    open: async () => ({ ...next }),
    openWorkspace: async relativePath => ({ ...next, id: 'workspace-' + relativePath, path: 'C:/notes/' + relativePath, name: relativePath.split('/').at(-1)! }),
    save: async request => { writes.push(request.content); disk = { ...disk, content: request.content, revision: disk.revision + 'x' }; return { ...disk }; },
    saveAs: async request => { disk = { ...file(request.content, 'copy'), path: 'C:/notes/copy.md', name: 'copy.md' }; return { ...disk }; },
    reload: async id => ({ ...disk, id }), release: async id => { released.push(id); },
  };
  const session = new DocumentSession(port, {
    read: () => ({ ...current }),
    apply: selected => { current = { hasDocument: true, content: selected?.content ?? '', dirty: false, composing: false, kind: 'markdown' }; },
    close: () => { current = { ...current, hasDocument: false, dirty: false }; },
    saved: update => { current = { ...current, content: update.content, dirty: !update.clean }; },
    closeWindow: async () => {},
  });
  return { session, port, writes, released, current: () => current,
    edit: (content: string) => { current = { ...current, content, dirty: true }; },
    view: (content: string) => { current = { ...current, content }; },
    composing: (value: boolean) => { current = { ...current, composing: value }; },
    disk: (value: MarkdownFile) => { disk = value; next = value; },
  };
}

async function preserveOriginal() {
  const h = fixture();
  const original = '\uFEFF# 标题\r\n\r\n- 内容\r\n';
  h.disk(file(original));
  await h.session.open();
  h.view('# 标题\n\n* 内容\n');
  assert.equal(await h.session.save(), true);
  assert.equal(h.writes[0], original);
  h.edit('# 更新\n\n* 内容\n');
  await h.session.save();
  assert.equal(h.writes[1], '\uFEFF# 更新\r\n\r\n* 内容\r\n');
}

async function saveDuringInput() {
  const h = fixture();
  await h.session.open();
  h.edit('first\n');
  let finish!: (value: MarkdownFile) => void;
  h.port.save = async request => { h.writes.push(request.content); return new Promise(resolve => { finish = resolve; }); };
  const saving = h.session.save();
  assert.equal(h.session.getSnapshot().busy, 'save');
  h.edit('newer input\n');
  finish({ ...file('first\n'), revision: 'v2' });
  assert.equal(await saving, true);
  assert.equal(h.current().content, 'newer input\n');
  assert.equal(h.current().dirty, true);
}

async function serialSave() {
  const h = fixture();
  await h.session.open();
  h.edit('first\n');
  const normal = h.port.save;
  let finish!: (value: MarkdownFile) => void;
  h.port.save = request => {
    if (h.writes.length) return normal(request);
    h.writes.push(request.content);
    return new Promise(resolve => { finish = resolve; });
  };
  const first = h.session.save();
  h.edit('latest\n');
  const second = h.session.save();
  finish({ ...file('first\n'), revision: 'v2' });
  await Promise.all([first, second]);
  assert.deepEqual(h.writes, ['first\n', 'latest\n']);
  assert.equal(h.current().dirty, false);
}

async function keepOnFailure() {
  const h = fixture();
  await h.session.open();
  h.edit('local\n');
  h.port.save = async () => { throw new MarkdownFileError('conflict', 'external changed'); };
  assert.equal(await h.session.save(), false);
  assert.equal(h.current().content, 'local\n');
  assert.equal(h.current().dirty, true);
  assert.equal(h.session.getSnapshot().error?.code, 'conflict');
}

async function switchGuard() {
  const h = fixture();
  await h.session.open();
  h.edit('unsaved\n');
  await h.session.newDocument();
  assert.ok(h.session.getSnapshot().pending);
  await h.session.resolvePending('cancel');
  assert.equal(h.current().content, 'unsaved\n');
  await h.session.newDocument();
  await h.session.resolvePending('discard');
  assert.equal(h.current().content, '');
  assert.equal(h.current().dirty, false);
  assert.equal(h.session.getSnapshot().file, null);
}

async function saveThenReload() {
  const h = fixture();
  await h.session.open();
  h.edit('local edit\n');
  await h.session.reload();
  assert.ok(h.session.getSnapshot().pending);
  await h.session.resolvePending('save');
  assert.equal(h.current().content, 'local edit\n', 'Reload used a candidate read before the save');
  assert.equal(h.current().dirty, false);
}

async function compositionGuard() {
  const h = fixture();
  await h.session.open();
  h.edit('输入中\n');
  h.composing(true);
  assert.equal(await h.session.save(), false);
  assert.equal(h.writes.length, 0);
  await h.session.newDocument();
  assert.equal(h.current().content, '输入中\n');
  assert.equal(h.session.getSnapshot().pending, null);
}

async function postSaveRefreshStaysSerialized() {
  const h = fixture();
  await h.session.open();
  h.edit('local edit\n');
  await h.session.reload();
  let finish!: (value: MarkdownFile) => void;
  let started!: () => void;
  const refreshing = new Promise<void>(resolve => { started = resolve; });
  h.port.reload = async () => { started(); return new Promise(resolve => { finish = resolve; }); };
  const continuation = h.session.resolvePending('save');
  await refreshing;
  const busy = h.session.getSnapshot().busy;
  await h.session.resolvePending('cancel');
  await h.session.newDocument();
  finish(file('local edit\n'));
  await continuation;
  assert.equal(busy, 'reload', 'The post-save refresh escaped the serialized operation');
  assert.equal(h.current().content, 'local edit\n');
  assert.equal(h.session.getSnapshot().pending, null);
}

async function disposedRefreshCannotApply() {
  const h = fixture();
  await h.session.open();
  h.edit('local edit\n');
  await h.session.reload();
  let finish!: (value: MarkdownFile) => void;
  let started!: () => void;
  const refreshing = new Promise<void>(resolve => { started = resolve; });
  h.port.reload = async () => { started(); return new Promise(resolve => { finish = resolve; }); };
  const continuation = h.session.resolvePending('save');
  await refreshing;
  h.session.dispose();
  finish(file('stale response after unmount\n'));
  await continuation;
  assert.equal(h.current().content, 'local edit\n', 'An unmounted session replaced the document');
}

async function detachKeepsDocumentButReleasesBinding() {
  const h = fixture();
  await h.session.open();
  const before = h.current().content;
  assert.ok(h.session.getSnapshot().file);
  await h.session.detachCurrent();
  assert.equal(h.session.getSnapshot().file, null);
  assert.equal(h.current().content, before, 'Detaching Markdown binding replaced the current document');
  assert.deepEqual(h.released, ['file-a']);
}


async function workspaceOpenUsesExistingDirtyAndImeSwitchGuard() {
  const h = fixture();
  await h.session.open();
  h.edit('unsaved workspace edit\n');
  await h.session.openWorkspace('folder/next.md');
  const pending = h.session.getSnapshot().pending;
  assert.ok(pending, 'Workspace switch bypassed the unsaved-change gate');
  assert.equal(h.current().content, 'unsaved workspace edit\n');
  assert.equal(pending?.file?.name, 'next.md');
  await h.session.resolvePending('discard');
  assert.equal(h.current().content, 'original\n');
  assert.equal(h.session.getSnapshot().file?.name, 'next.md');

  h.edit('IME text\n');
  h.composing(true);
  await h.session.openWorkspace('other.md');
  assert.equal(h.current().content, 'IME text\n');
  assert.equal(h.session.getSnapshot().file?.name, 'next.md');
}

export const documentSessionChecks = [
  { name: '文件会话：无编辑保留原字节，编辑保存保留编码与换行', run: preserveOriginal },
  { name: '文件会话：保存回执不能清除保存期间的新输入', run: saveDuringInput },
  { name: '文件会话：连续保存按序写入最新内容', run: serialSave },
  { name: '文件会话：保存失败或冲突保留正文和 Dirty', run: keepOnFailure },
  { name: '文件会话：新建的取消和放弃行为明确', run: switchGuard },
  { name: '文件会话：保存并重载不能应用保存前的旧候选', run: saveThenReload },
  { name: '文件会话：组合输入期间不保存或切换正文', run: compositionGuard },
  { name: '文件会话：保存后的重载仍保持操作串行', run: postSaveRefreshStaysSerialized },
  { name: '文件会话：卸载后的迟到重载不能替换正文', run: disposedRefreshCannotApply },
  { name: 'Workspace 切换：沿用 Dirty / IME 文件会话保护', run: workspaceOpenUsesExistingDirtyAndImeSwitchGuard },
  { name: '文件会话：切换到 Mixed Note 时仅释放 Markdown 绑定，不替换当前文档', run: detachKeepsDocumentButReleasesBinding },
];

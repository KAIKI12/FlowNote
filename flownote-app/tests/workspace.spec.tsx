import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import assert from 'node:assert/strict';
import App from '../src/app/App';
import { useNoteStore } from '../src/note/noteStore';
import type { MarkdownFilePort } from '../src/files/fileTypes';
import type { WorkspacePort } from '../src/workspace/workspaceTypes';
import { settle, waitFor } from './editorHarness';
import { createNativeWorkspacePort } from '../src/workspace/nativeWorkspacePort';
import { loadRecent, recordRecent, renameRecent } from '../src/workspace/workspaceRecent';
import type { WorkspaceSnapshot } from '../src/workspace/workspaceTypes';
import type { NativeNotePort, NoteSnapshot } from '../src/note/nativeNotePort';

export const workspaceChecks = [
  { name: 'Workspace 协议：解析真实树并拒绝无效 kind / 路径字段', run: async () => {
    const calls: { command: string; args?: Record<string, unknown> }[] = [];
    const port = createNativeWorkspacePort(async (command, args) => {
      calls.push({ command, args });
      return { workspaceId: 'abc123', name: 'Notes', entries: [
        { name: 'Research', relativePath: 'Research', kind: 'folder', children: [
          { name: 'a.md', relativePath: 'Research/a.md', kind: 'markdown', children: [] },
        ] },
        { name: 'visual.note', relativePath: 'visual.note', kind: 'note', children: [] },
      ] };
    });
    const restored = await port.restore();
    assert.equal(restored?.entries[0].children[0].relativePath, 'Research/a.md');
    assert.equal(calls[0].command, 'workspace_restore');

    const invalid = createNativeWorkspacePort(async () =>
      ({ workspaceId: 'x', name: 'Bad', entries: [{ name: 'x', relativePath: '../x.md', kind: 'markdown', children: [] }] }));
    await assert.rejects(() => invalid.restore(), /Workspace.*响应|相对路径/);
  } },
  { name: 'Workspace 协议：命令 request shape 与搜索响应严格校验', run: async () => {
    const calls: { command: string; args?: Record<string, unknown> }[] = [];
    const port = createNativeWorkspacePort(async (command, args) => {
      calls.push({ command, args });
      if (command === 'workspace_restore' || command === 'workspace_pick' || command === 'workspace_scan') {
        return { workspaceId: 'ws', name: 'Notes', entries: [] };
      }
      if (command === 'workspace_search') {
        return [{ relativePath: 'a.md', kind: 'markdown', title: 'A', snippet: 'needle' }];
      }
      return { relativePath: command === 'workspace_create_markdown' ? 'Drafts/Untitled.md' : 'renamed.md' };
    });
    await port.restore(); await port.pick(); await port.scan();
    assert.deepEqual(await port.search('needle'), [{ relativePath: 'a.md', kind: 'markdown', title: 'A', snippet: 'needle' }]);
    await port.createMarkdown('Drafts');
    await port.rename('a.md', 'renamed');
    assert.deepEqual(calls.map(call => [call.command, call.args]), [
      ['workspace_restore', undefined],
      ['workspace_pick', undefined],
      ['workspace_scan', undefined],
      ['workspace_search', { request: { query: 'needle' } }],
      ['workspace_create_markdown', { request: { folder: 'Drafts' } }],
      ['workspace_rename', { request: { relativePath: 'a.md', newName: 'renamed' } }],
    ]);

    const childrenOnNote = createNativeWorkspacePort(async () => ({
      workspaceId: 'bad', name: 'Bad', entries: [
        { name: 'x.note', relativePath: 'x.note', kind: 'note',
          children: [{ name: 'inside.md', relativePath: 'x.note/inside.md', kind: 'markdown', children: [] }] },
      ],
    }));
    await assert.rejects(() => childrenOnNote.restore(), /不能包含 children/);

    for (const invalidPath of ['/absolute.md', 'C:/drive.md', 'folder\\escape.md', '../parent.md']) {
      const invalid = createNativeWorkspacePort(async () => ({
        workspaceId: 'bad', name: 'Bad',
        entries: [{ name: 'x', relativePath: invalidPath, kind: 'markdown', children: [] }],
      }));
      await assert.rejects(() => invalid.restore(), /相对路径/);
    }

    const invalidSearch = createNativeWorkspacePort(async command =>
      command === 'workspace_search'
        ? [{ relativePath: 'a.md', kind: 'folder', title: 'Bad', snippet: '' }]
        : { workspaceId: 'ws', name: 'Notes', entries: [] });
    await assert.rejects(() => invalidSearch.search('x'), /搜索结果字段/);
  } },
  { name: 'Workspace Recent：同一路径去重、最多十条并支持重命名更新', run: async () => {
    window.localStorage.clear();
    for (let index = 0; index < 12; index++) {
      recordRecent('ws-a', { relativePath: `n${index}.md`, kind: 'markdown' }, 1000 + index);
    }
    recordRecent('ws-a', { relativePath: 'n5.md', kind: 'markdown' }, 9999);
    recordRecent('ws-b', { relativePath: 'other.md', kind: 'markdown' }, 10000);
    const recent = loadRecent('ws-a');
    assert.equal(recent.length, 10);
    assert.equal(recent[0].relativePath, 'n5.md');
    assert.equal(new Set(recent.map(item => item.relativePath)).size, recent.length);
    renameRecent('ws-a', 'n5.md', 'renamed.md');
    assert.equal(loadRecent('ws-a')[0].relativePath, 'renamed.md');
    recordRecent('ws-a', { relativePath: 'Folder/Child.md', kind: 'markdown' }, 10001);
    recordRecent('ws-a', { relativePath: 'Folder/Sub/Visual.note', kind: 'note' }, 10002);
    renameRecent('ws-a', 'Folder', 'Archive');
    const migrated = loadRecent('ws-a').map(item => item.relativePath);
    assert.ok(migrated.includes('Archive/Child.md'));
    assert.ok(migrated.includes('Archive/Sub/Visual.note'));
    assert.ok(!migrated.some(value => value.startsWith('Folder/')));
    assert.equal(loadRecent('ws-b')[0].relativePath, 'other.md');
  } },
];


async function realWorkspaceSidebarDrivesOpenCreateAndSearch() {
  const opened: string[] = [];
  const searched: string[] = [];
  const created: string[] = [];
  const snapshot = {
    workspaceId: 'ws-real',
    name: 'My Notes',
    entries: [
      { name: 'PD', relativePath: 'PD', kind: 'folder' as const, children: [
        { name: 'Timing.md', relativePath: 'PD/Timing.md', kind: 'markdown' as const, children: [] },
      ] },
      { name: 'Cislunar.md', relativePath: 'Cislunar.md', kind: 'markdown' as const, children: [] },
    ],
  };
  const workspacePort: WorkspacePort = {
    restore: async () => snapshot,
    pick: async () => snapshot,
    scan: async () => snapshot,
    search: async query => {
      searched.push(query);
      return [{ relativePath: 'PD/Timing.md', kind: 'markdown', title: 'Timing Closure', snippet: 'useful skew' }];
    },
    createMarkdown: async folder => {
      created.push(folder);
      return { relativePath: folder ? folder + '/Untitled.md' : 'Untitled.md' };
    },
    rename: async (_path, newName) => ({ relativePath: newName }),
  };
  const filePort: MarkdownFilePort = {
    mode: 'desktop', canWrite: true,
    open: async () => null,
    openWorkspace: async relativePath => {
      opened.push(relativePath);
      return { id: 'ws:' + relativePath, path: 'C:/workspace/' + relativePath, name: relativePath.split('/').at(-1)!,
        content: '# ' + relativePath.replace(/\.md$/i, '') + '\n', revision: 'r1', readOnly: false };
    },
    save: async request => ({ id: request.id, path: 'C:/workspace/current.md', name: 'current.md',
      content: request.content, revision: 'r2', readOnly: false }),
    saveAs: async () => null,
    reload: async id => ({ id, path: 'C:/workspace/current.md', name: 'current.md',
      content: '# reload\n', revision: 'r2', readOnly: false }),
    release: async () => undefined,
  };

  useNoteStore.getState().setCurrentNote(null);
  useNoteStore.getState().setDirty(false);
  useNoteStore.getState().setComposing(false);
  document.body.innerHTML = '<main id="workspace-app"></main>';
  const root = createRoot(document.getElementById('workspace-app')!);
  try {
    await act(async () => root.render(<React.StrictMode><App filePort={filePort} workspacePort={workspacePort} /></React.StrictMode>));
    await settle();
    assert.ok(useNoteStore.getState().currentNote,
      'Workspace App did not create the initial note: ' + document.body.innerHTML.slice(0, 500));
    const initialEditor = document.querySelector('.flownote-editor');
    assert.ok(initialEditor, 'Workspace App did not render FlowNoteEditor: ' + document.body.innerHTML.slice(0, 500));
    if (initialEditor.getAttribute('aria-busy') !== 'false') {
      await settle();
      assert.equal(initialEditor.getAttribute('aria-busy'), 'false',
        'Workspace App editor stayed busy: ' + initialEditor.outerHTML.slice(0, 400));
    }
    await waitFor(() => document.querySelector('[aria-label="当前 Workspace"]')?.textContent?.includes('My Notes') === true);

    assert.equal(document.body.textContent?.includes('Research'), false, 'Static fake folder is still rendered');
    assert.equal(document.body.textContent?.includes('Tags'), false, 'Unimplemented Tags placeholder is still rendered');
    assert.equal(document.body.textContent?.includes('Trash'), false, 'Unimplemented Trash placeholder is still rendered');
    const folder = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('PD'));
    assert.ok(folder, 'Real workspace folder missing');
    const contextualRename = document.querySelector<HTMLButtonElement>('[aria-label="重命名 PD"]')!;
    assert.equal(getComputedStyle(contextualRename).opacity, '0', 'Tree row actions should stay hidden until contextual hover/focus');
    await act(async () => folder.click());
    const timing = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('Timing.md'));
    assert.ok(timing, 'Nested Markdown note missing');
    await act(async () => timing.click());
    await waitFor(() => opened.includes('PD/Timing.md'));
    assert.equal(useNoteStore.getState().currentNote?.metadata.title, 'Timing');

    const search = document.querySelector<HTMLInputElement>('[aria-label="搜索笔记"]')!;
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })));
    assert.equal(document.activeElement, search, 'Ctrl+K should focus the visible workspace search field');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'useful');
      search.dispatchEvent(new Event('input', { bubbles: true }));
      search.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await waitFor(() => searched.includes('useful'));
    assert.ok(document.body.textContent?.includes('Timing Closure'), 'Search result not rendered');

    const newNote = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('New Note'))!;
    await act(async () => newNote.click());
    await waitFor(() => created.length === 1);
    assert.ok(opened.some(path => path.endsWith('Untitled.md')), 'New workspace note was not opened');
  } finally {
    await act(async () => root.unmount());
    await settle();
  }
}



function workspaceMarkdownPort(opened: string[]): MarkdownFilePort {
  return {
    mode: 'desktop', canWrite: true,
    open: async () => null,
    openWorkspace: async relativePath => {
      opened.push(relativePath);
      return { id: 'ws:' + relativePath, path: 'C:/workspace/' + relativePath, name: relativePath.split('/').at(-1)!,
        content: '# ' + relativePath.replace(/\.md$/i, '') + '\n', revision: 'r1', readOnly: false };
    },
    save: async request => ({ id: request.id, path: 'C:/workspace/current.md', name: 'current.md',
      content: request.content, revision: 'r2', readOnly: false }),
    saveAs: async () => null,
    reload: async id => ({ id, path: 'C:/workspace/current.md', name: 'current.md',
      content: '# reload\n', revision: 'r2', readOnly: false }),
    release: async () => undefined,
  };
}

async function folderRenameMigratesActiveExpandedAndRecentPaths() {
  window.localStorage.clear();
  const opened: string[] = [];
  let snapshot: WorkspaceSnapshot = {
    workspaceId: 'ws-rename', name: 'Rename Notes', entries: [
      { name: 'Folder', relativePath: 'Folder', kind: 'folder', children: [
        { name: 'Child.md', relativePath: 'Folder/Child.md', kind: 'markdown', children: [] },
      ] },
    ],
  };
  const workspacePort: WorkspacePort = {
    restore: async () => snapshot,
    pick: async () => snapshot,
    scan: async () => snapshot,
    search: async () => [],
    createMarkdown: async () => ({ relativePath: 'Untitled.md' }),
    rename: async (relativePath, newName) => {
      assert.equal(relativePath, 'Folder');
      assert.equal(newName, 'Archive');
      snapshot = {
        ...snapshot,
        entries: [{ name: 'Archive', relativePath: 'Archive', kind: 'folder', children: [
          { name: 'Child.md', relativePath: 'Archive/Child.md', kind: 'markdown', children: [] },
        ] }],
      };
      return { relativePath: 'Archive' };
    },
  };
  useNoteStore.getState().setCurrentNote(null);
  useNoteStore.getState().setDirty(false);
  useNoteStore.getState().setComposing(false);
  document.body.innerHTML = '<main id="workspace-rename-app"></main>';
  const root = createRoot(document.getElementById('workspace-rename-app')!);
  try {
    await act(async () => root.render(<App filePort={workspaceMarkdownPort(opened)} workspacePort={workspacePort} />));
    await waitFor(() => document.querySelector('[aria-label="当前 Workspace"]')?.textContent?.includes('Rename Notes') === true);

    const folder = document.querySelector<HTMLButtonElement>('[aria-label="打开文件夹 Folder"]')!;
    await act(async () => folder.click());
    const child = document.querySelector<HTMLButtonElement>('[aria-label="打开 Workspace 笔记 Folder/Child.md"]')!;
    await act(async () => child.click());
    await waitFor(() => opened.includes('Folder/Child.md'));
    assert.ok(loadRecent('ws-rename').some(item => item.relativePath === 'Folder/Child.md'));

    const rename = document.querySelector<HTMLButtonElement>('[aria-label="重命名 Folder"]')!;
    await act(async () => rename.click());
    const input = document.querySelector<HTMLInputElement>('[aria-label="重命名输入 Folder"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Archive');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));

    await waitFor(() => !!document.querySelector('[aria-label="打开文件夹 Archive"]'));
    await waitFor(() => opened.includes('Archive/Child.md'));
    assert.ok(document.querySelector('[aria-label="打开 Workspace 笔记 Archive/Child.md"]'),
      'Renamed folder should remain expanded');
    assert.ok(loadRecent('ws-rename').some(item => item.relativePath === 'Archive/Child.md'));
    assert.ok(!loadRecent('ws-rename').some(item => item.relativePath.startsWith('Folder/')));
  } finally {
    await act(async () => root.unmount());
    await settle();
  }
}

async function staleSearchCannotOverwriteNewerResults() {
  const opened: string[] = [];
  const resolvers = new Map<string, (value: any[]) => void>();
  const workspacePort: WorkspacePort = {
    restore: async () => ({ workspaceId: 'ws-search', name: 'Search Notes', entries: [] }),
    pick: async () => null,
    scan: async () => ({ workspaceId: 'ws-search', name: 'Search Notes', entries: [] }),
    search: query => new Promise(resolve => resolvers.set(query, resolve)),
    createMarkdown: async () => ({ relativePath: 'Untitled.md' }),
    rename: async (_path, newName) => ({ relativePath: newName }),
  };
  useNoteStore.getState().setCurrentNote(null);
  useNoteStore.getState().setDirty(false);
  useNoteStore.getState().setComposing(false);
  document.body.innerHTML = '<main id="workspace-search-app"></main>';
  const root = createRoot(document.getElementById('workspace-search-app')!);
  try {
    await act(async () => root.render(<App filePort={workspaceMarkdownPort(opened)} workspacePort={workspacePort} />));
    await waitFor(() => document.querySelector('[aria-label="当前 Workspace"]')?.textContent?.includes('Search Notes') === true);
    const search = document.querySelector<HTMLInputElement>('[aria-label="搜索笔记"]')!;
    const type = async (value: string) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, value);
        search.dispatchEvent(new Event('input', { bubbles: true }));
        search.dispatchEvent(new Event('change', { bubbles: true }));
      });
    };
    await type('old');
    await waitFor(() => resolvers.has('old'));
    await type('new');
    await waitFor(() => resolvers.has('new'));
    await act(async () => resolvers.get('new')!([
      { relativePath: 'new.md', kind: 'markdown', title: 'New Result', snippet: 'new snippet' },
    ]));
    await waitFor(() => document.body.textContent?.includes('New Result') === true);
    await act(async () => resolvers.get('old')!([
      { relativePath: 'old.md', kind: 'markdown', title: 'Old Result', snippet: 'old snippet' },
    ]));
    await settle();
    assert.ok(document.body.textContent?.includes('New Result'));
    assert.equal(document.body.textContent?.includes('Old Result'), false);
  } finally {
    await act(async () => root.unmount());
    await settle();
  }
}



function mixedSnapshot(relativePath: string): NoteSnapshot {
  const name = relativePath.split('/').at(-1) ?? relativePath;
  const title = name.replace(/\.note$/i, '');
  return {
    id: 'note:' + relativePath,
    path: 'C:/workspace/' + relativePath,
    name,
    content: '# ' + title + '\n',
    revision: 'n1',
    readOnly: false,
    mixed: {
      metadata: {
        formatVersion: 1,
        type: 'mixed',
        title,
        createdAt: '2026-09-19T00:00:00.000Z',
        updatedAt: '2026-09-19T00:00:00.000Z',
      },
      blocks: [],
    },
  };
}

async function workspaceSwitchingRespectsDirtyAndCapabilityRelease() {
  const waitSwitch = async (label: string, check: () => boolean) => {
    try { await waitFor(check); }
    catch (cause) { throw new Error(label + ': ' + (cause instanceof Error ? cause.message : String(cause))); }
  };
  window.localStorage.clear();
  const markdownOpenCount = new Map<string, number>();
  const markdownReleased: string[] = [];
  const noteOpened: string[] = [];
  const noteReleased: string[] = [];
  const snapshot: WorkspaceSnapshot = {
    workspaceId: 'ws-switch', name: 'Switch Notes', entries: [
      { name: 'a.md', relativePath: 'a.md', kind: 'markdown', children: [] },
      { name: 'b.md', relativePath: 'b.md', kind: 'markdown', children: [] },
      { name: 'visual.note', relativePath: 'visual.note', kind: 'note', children: [] },
    ],
  };
  const workspacePort: WorkspacePort = {
    restore: async () => snapshot,
    pick: async () => snapshot,
    scan: async () => snapshot,
    search: async () => [],
    createMarkdown: async () => ({ relativePath: 'Untitled.md' }),
    rename: async (_path, newName) => ({ relativePath: newName }),
  };
  const filePort: MarkdownFilePort = {
    ...workspaceMarkdownPort([]),
    openWorkspace: async relativePath => {
      const count = (markdownOpenCount.get(relativePath) ?? 0) + 1;
      markdownOpenCount.set(relativePath, count);
      return {
        id: 'md:' + relativePath + ':' + count,
        path: 'C:/workspace/' + relativePath,
        name: relativePath,
        content: '# ' + relativePath.replace(/\.md$/i, '') + '\n',
        revision: 'm1',
        readOnly: false,
      };
    },
    release: async id => { markdownReleased.push(id); },
  };
  const notePort: NativeNotePort = {
    mode: 'desktop', canWrite: true,
    open: async () => null,
    openWorkspace: async relativePath => {
      noteOpened.push(relativePath);
      return mixedSnapshot(relativePath);
    },
    save: async request => ({ ...mixedSnapshot('visual.note'), content: request.content, revision: 'n2', mixed: request.mixed }),
    saveAs: async () => null,
    reload: async id => ({ ...mixedSnapshot('visual.note'), id }),
    probe: async () => ({ revision: 'n1', changed: false }),
    readAsset: async (_id, _blockId, assetPath) => ({ path: assetPath, mime: 'text/plain', bytes: [] }),
    readNoteImage: async (_id, assetPath) => ({ path: assetPath, mime: 'image/png', bytes: [] }),
    release: async id => { noteReleased.push(id); },
  };

  useNoteStore.getState().setCurrentNote(null);
  useNoteStore.getState().setDirty(false);
  useNoteStore.getState().setComposing(false);
  document.body.innerHTML = '<main id="workspace-switch-app"></main>';
  const root = createRoot(document.getElementById('workspace-switch-app')!);
  try {
    await act(async () => root.render(<App filePort={filePort} notePort={notePort} workspacePort={workspacePort} />));
    await waitSwitch('workspace restore', () => document.querySelector('[aria-label="当前 Workspace"]')?.textContent?.includes('Switch Notes') === true);

    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="打开 Workspace 笔记 a.md"]')!.click());
    await waitSwitch('open a.md', () => useNoteStore.getState().currentNote?.metadata.title === 'a');

    await act(async () => useNoteStore.getState().setDirty(true));
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="打开 Workspace 笔记 visual.note"]')!.click());
    await waitSwitch('dirty Markdown prompt', () => !!document.querySelector('[role="dialog"][aria-label="未保存的更改"]'));
    assert.equal(noteOpened.length, 0, 'Note candidate must not open before dirty Markdown is resolved');

    const cancel = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(button => button.textContent === '取消')!;
    await act(async () => cancel.click());
    await waitSwitch('cancel Markdown prompt', () => !document.querySelector('[role="dialog"][aria-label="未保存的更改"]'));
    assert.equal(useNoteStore.getState().currentNote?.metadata.title, 'a');
    assert.equal(noteOpened.length, 0);

    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="打开 Workspace 笔记 visual.note"]')!.click());
    await waitFor(() => !!document.querySelector('[role="dialog"][aria-label="未保存的更改"]'));
    const discard = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(button => button.textContent === '放弃更改并继续')!;
    await act(async () => discard.click());
    await waitSwitch('apply visual.note', () => useNoteStore.getState().currentNote?.metadata.type === 'mixed');
    assert.deepEqual(noteOpened, ['visual.note']);
    assert.equal(markdownReleased.filter(id => id.startsWith('md:a.md:')).length, 1);

    await act(async () => useNoteStore.getState().setDirty(true));
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="打开 Workspace 笔记 b.md"]')!.click());
    await waitFor(() => !!document.querySelector('[role="dialog"][aria-label="未保存的更改"]'));
    assert.equal(markdownOpenCount.get('b.md'), 1, 'Markdown candidate should be acquired before dirty prompt');
    const firstCandidate = 'md:b.md:1';
    const cancelMixed = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(button => button.textContent === '取消')!;
    await act(async () => cancelMixed.click());
    await waitFor(() => !document.querySelector('[role="dialog"][aria-label="未保存的更改"]'));
    assert.ok(markdownReleased.includes(firstCandidate), 'Cancelled Markdown candidate capability was not released');
    assert.equal(useNoteStore.getState().currentNote?.metadata.type, 'mixed');
    assert.equal(noteReleased.length, 0);

    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="打开 Workspace 笔记 b.md"]')!.click());
    await waitFor(() => !!document.querySelector('[role="dialog"][aria-label="未保存的更改"]'));
    const discardMixed = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(button => button.textContent === '放弃更改并继续')!;
    await act(async () => discardMixed.click());
    await waitSwitch('apply b.md', () => useNoteStore.getState().currentNote?.metadata.title === 'b');
    assert.equal(noteReleased.filter(id => id === 'note:visual.note').length, 1,
      'Old Mixed Note capability should be released exactly once after successful switch');
  } finally {
    await act(async () => {
      useNoteStore.getState().setDirty(false);
      useNoteStore.getState().setComposing(false);
    });
    await act(async () => root.unmount());
    await settle();
  }
}



async function newNoteChoosesWorkspaceThenCreatesImmediately() {
  const opened: string[] = [];
  const created: string[] = [];
  const snapshot: WorkspaceSnapshot = {
    workspaceId: 'ws-first', name: 'First Workspace', entries: [],
  };
  const workspacePort: WorkspacePort = {
    restore: async () => null,
    pick: async () => snapshot,
    scan: async () => snapshot,
    search: async () => [],
    createMarkdown: async folder => {
      created.push(folder);
      snapshot.entries = [{ name: 'Untitled.md', relativePath: 'Untitled.md', kind: 'markdown', children: [] }];
      return { relativePath: 'Untitled.md' };
    },
    rename: async (_path, newName) => ({ relativePath: newName }),
  };
  useNoteStore.getState().setCurrentNote(null);
  useNoteStore.getState().setDirty(false);
  useNoteStore.getState().setComposing(false);
  document.body.innerHTML = '<main id="workspace-first-app"></main>';
  const root = createRoot(document.getElementById('workspace-first-app')!);
  try {
    await act(async () => root.render(<App filePort={workspaceMarkdownPort(opened)} workspacePort={workspacePort} />));
    await waitFor(() => document.body.textContent?.includes('Choose Workspace') === true);
    const newNote = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('New Note'))!;
    await act(async () => newNote.click());
    await waitFor(() => created.length === 1);
    await waitFor(() => opened.includes('Untitled.md'));
    assert.equal(created[0], '');
    assert.equal(useNoteStore.getState().currentNote?.metadata.title, 'Untitled');
  } finally {
    await act(async () => root.unmount());
    await settle();
  }
}

export const workspaceAppChecks = [
  { name: 'Workspace UI：真实树驱动打开、新建与正文搜索', run: realWorkspaceSidebarDrivesOpenCreateAndSearch },
  { name: 'Workspace state：文件夹重命名迁移 active / expanded / Recent 子路径', run: folderRenameMigratesActiveExpandedAndRecentPaths },
  { name: 'Workspace state：旧搜索结果不能覆盖新查询', run: staleSearchCannotOverwriteNewerResults },
  { name: 'Workspace switching：Dirty 跨 .md/.note 切换复用 pending 保护并正确释放 capability', run: workspaceSwitchingRespectsDirtyAndCapabilityRelease },
  { name: 'Workspace UI：首次 New Note 选择 Workspace 后立即创建并打开', run: newNoteChoosesWorkspaceThenCreatesImmediately },
];

export async function run(filter: string) {
  const results: { name: string; status: 'passed' | 'failed'; error?: string }[] = [];
  for (const check of [...workspaceChecks, ...workspaceAppChecks]) {
    if (filter && !check.name.includes(filter)) continue;
    try { await check.run(); results.push({ name: check.name, status: 'passed' }); }
    catch (error) { results.push({ name: check.name, status: 'failed', error: error instanceof Error ? error.message : String(error) }); }
  }
  return results;
}

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import assert from 'node:assert/strict';
import App from '../src/app/App';
import { useNoteStore } from '../src/note/noteStore';
import type { NativeNotePort, NoteSnapshot } from '../src/note/nativeNotePort';
import type { MarkdownFilePort } from '../src/files/fileTypes';
import { settle, waitFor } from './editorHarness';

async function withApp(action: () => Promise<void>, props: { notePort?: NativeNotePort; filePort?: MarkdownFilePort } = {}) {
  useNoteStore.getState().setCurrentNote(null);
  useNoteStore.getState().setComposing(false);
  useNoteStore.getState().setDirty(false);
  document.body.innerHTML = '<main id="app-test"></main>';
  const root = createRoot(document.getElementById('app-test')!);
  try {
    await act(async () => root.render(<React.StrictMode><App {...props} /></React.StrictMode>));
    await waitFor(() => document.querySelector('.flownote-editor')?.getAttribute('aria-busy') === 'false');
    await settle();
    await action();
  } finally { await act(async () => root.unmount()); }
}

async function welcome() {
  await withApp(async () => {
    assert.equal(document.querySelector('.ProseMirror h1')?.textContent, '项目周记');
    assert.equal(document.querySelector('.ProseMirror .html-block-container'), null);
    assert.ok(document.querySelector('[role="toolbar"]'));
    assert.ok(document.querySelector('.ProseMirror input[type="checkbox"]'));
    assert.ok(document.querySelector('.ProseMirror .token.keyword'));
    assert.equal(getComputedStyle(document.querySelector('.writing-main')!).display, 'flex');
    assert.equal(getComputedStyle(document.querySelector('.writing-workspace')!).flexGrow, '1');
  });
}

async function exportNote() {
  await withApp(async () => {
    const exporter = document.querySelector<HTMLButtonElement>('[aria-label="导出 Markdown 笔记"]');
    assert.ok(exporter, 'The writing page has no Markdown export action');
    const gate = [...document.querySelectorAll('button')].find(button => button.textContent === 'Markdown Gate');
    assert.ok(gate);
    await act(async () => gate.click());
    await waitFor(() => !!document.querySelector('[data-testid="gate-draft"]'));
    const draft = document.querySelector<HTMLTextAreaElement>('[data-testid="gate-draft"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(draft, '# 最新正文\n');
      draft.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const load = [...document.querySelectorAll('button')].find(button => button.textContent === '装载原文')!;
    await act(async () => load.click());
    let url = '';
    const intercept = (event: Event) => {
      const anchor = event.target as HTMLAnchorElement;
      if (anchor.tagName !== 'A' || !anchor.download) return;
      event.preventDefault(); url = anchor.href;
    };
    document.addEventListener('click', intercept, true);
    try {
      await act(async () => exporter.click());
      assert.ok(url, 'No Markdown download was requested');
      assert.equal((await (await fetch(url)).text()).trim(), '# 最新正文');
    } finally { document.removeEventListener('click', intercept, true); }
  });
}

async function immediateClose() {
  await withApp(async () => {
    assert.equal(useNoteStore.getState().isDirty, false);
    const box = document.querySelector<HTMLInputElement>('.ProseMirror input[type="checkbox"]')!;
    const closing = new Event('beforeunload', { cancelable: true });
    await act(async () => {
      box.click();
      window.dispatchEvent(closing);
      assert.equal(closing.defaultPrevented, true, 'Closing can discard an edit before debounce fires');
    });
  });
}

async function rejectMixedExport() {
  await withApp(async () => {
    const note = useNoteStore.getState().currentNote!;
    await act(async () => useNoteStore.getState().setCurrentNote({ ...note,
      metadata: { ...note.metadata, type: 'mixed' }, htmlBlocks: new Map() }));
    let downloaded = false;
    const intercept = (event: Event) => {
      if ((event.target as HTMLElement).tagName !== 'A') return;
      event.preventDefault(); downloaded = true;
    };
    document.addEventListener('click', intercept, true);
    try {
      await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="导出 Markdown 笔记"]')!.click());
      assert.equal(downloaded, false, 'Mixed Note used the plain Markdown export');
      assert.match(document.querySelector('[role="alert"]')!.textContent!, /Mixed Note/);
    } finally { document.removeEventListener('click', intercept, true); }
  });
}

async function importHtmlConvertsMarkdownWithoutPreMutating() {
  let created: Parameters<NativeNotePort['saveAs']>[0] | undefined;
  const notePort: NativeNotePort = { mode: 'desktop', canWrite: true,
    open: async () => null,
    save: async () => { throw new Error('conversion must use saveAs'); },
    saveAs: async request => {
      created = request;
      return { id: 'note:converted', path: 'E:\\Notes\\项目周记.note', name: request.name, content: request.content,
        revision: 'r1', readOnly: false, mixed: request.mixed };
    },
    reload: async () => { throw new Error('not used'); },
    release: async () => undefined,
  };
  await withApp(async () => {
    const original = useNoteStore.getState().currentNote!.contentMd;
    const importButton = document.querySelector<HTMLButtonElement>('[aria-label="导入 HTML Block"]');
    assert.ok(importButton, 'HTML import action is missing');
    await act(async () => importButton.click());
    const source = document.querySelector<HTMLTextAreaElement>('[aria-label="HTML 导入源码"]');
    assert.ok(source, 'HTML import source is missing');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(source, '<section><h2>AI 图表</h2></section>');
      source.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.equal(useNoteStore.getState().currentNote!.contentMd, original, 'Import draft mutated Markdown before save');
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="确认导入 HTML"]')!.click());
    await waitFor(() => !!created);
    assert.equal(created!.sourceId, undefined, 'Markdown conversion must not rewrite the original file binding');
    assert.equal(created!.mixed.blocks.length, 1);
    assert.equal(created!.mixed.blocks[0].html, '<section><h2>AI 图表</h2></section>');
    assert.equal(created!.mixed.blocks[0].originalHtml, '<section><h2>AI 图表</h2></section>');
    assert.match(created!.content, /```flownote-html/);
    assert.equal(useNoteStore.getState().currentNote?.metadata.type, 'mixed');
    assert.ok(document.querySelector('.ProseMirror iframe'), 'Converted HTML was not rendered');
    assert.equal(useNoteStore.getState().isDirty, false);
  }, { notePort });
}

async function ctrlSSavesMixedNoteThroughNotePort() {
  const blockId = '0199a111-0000-7000-8000-000000000001';
  const html = '<div><button>原始 HTML</button></div>';
  const content = `Markdown A\n\n\`\`\`flownote-html\n{"id":"${blockId}"}\n\`\`\`\n\nMarkdown B\n`;
  const mixed = { metadata: { formatVersion: 1, type: 'mixed' as const, title: 'Mixed Test',
    createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z' },
    blocks: [{ id: blockId, html, originalHtml: html,
      config: { kind: 'html' as const, inputKind: 'fragment' as const, scriptPolicy: 'sandbox' as const, viewport: { heightPx: 480 } } }] };
  const initial: NoteSnapshot = { id: 'note:shortcut', path: 'E:\\Notes\\Shortcut.note', name: 'Shortcut.note', content,
    revision: 'r1', readOnly: false, mixed };
  let saves = 0;
  const notePort: NativeNotePort = { mode: 'desktop', canWrite: true,
    open: async () => initial,
    save: async request => { saves += 1; return { ...initial, ...request, revision: 'r2', readOnly: false, name: initial.name, path: initial.path }; },
    saveAs: async request => ({ ...initial, content: request.content, mixed: request.mixed }),
    reload: async () => initial,
    release: async () => undefined,
  };
  await withApp(async () => {
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="打开 Mixed Note"]')!.click());
    await waitFor(() => useNoteStore.getState().currentNote?.metadata.type === 'mixed');
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true })));
    await waitFor(() => saves === 1);
    assert.equal(saves, 1, 'Ctrl+S did not route to the Mixed Note port');
  }, { notePort });
}

async function markdownManagedImagesMigrateDuringConversion() {
  const markdown = '# Timing\n\n![plot](Timing.assets/plot.png)\n\n```text\nTiming.assets/plot.png\n```\n';
  const reads: string[] = [];
  let released = 0;
  const filePort = { mode: 'desktop', canWrite: true,
    open: async () => ({ id: 'file:timing', path: 'E:\\Notes\\Timing.md', name: 'Timing.md', content: markdown,
      revision: 'm1', readOnly: false }),
    save: async () => { throw new Error('original Markdown must not be saved'); },
    saveAs: async () => { throw new Error('Markdown saveAs not used'); },
    reload: async () => { throw new Error('not used'); },
    readAsset: async (_id: string, assetPath: string) => {
      reads.push(assetPath);
      return { path: assetPath, mime: 'image/png', bytes: [137, 80, 78, 71] };
    },
    release: async () => { released += 1; },
  } as unknown as MarkdownFilePort;
  let created: Parameters<NativeNotePort['saveAs']>[0] | undefined;
  const notePort: NativeNotePort = { mode: 'desktop', canWrite: true,
    open: async () => null,
    save: async () => { throw new Error('conversion must use saveAs'); },
    saveAs: async request => {
      created = request;
      return { id: 'note:migrated', path: 'E:\\Notes\\Timing.note', name: request.name, content: request.content,
        revision: 'n1', readOnly: false, mixed: request.mixed };
    },
    reload: async () => { throw new Error('not used'); },
    readAsset: async () => { throw new Error('not used'); },
    release: async () => undefined,
  };
  await withApp(async () => {
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="打开 Markdown 文件"]')!.click());
    await waitFor(() => useNoteStore.getState().currentNote?.metadata.title === 'Timing.md'.replace(/\.md$/, ''));
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="导入 HTML Block"]')!.click());
    const source = document.querySelector<HTMLTextAreaElement>('[aria-label="HTML 导入源码"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(source, '<section>Visual</section>');
      source.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="确认导入 HTML"]')!.click());
    await waitFor(() => !!created);
    assert.deepEqual([...new Set(reads)], ['Timing.assets/plot.png']);
    assert.ok(reads.length >= 1, 'managed Markdown image was never read through the file capability');
    assert.deepEqual((created as any).assets, [{ path: 'assets/images/plot.png', bytes: [137, 80, 78, 71] }]);
    assert.match(created!.content, /!\[plot\]\(assets\/images\/plot\.png\)/);
    assert.match(created!.content, /```text\nTiming\.assets\/plot\.png\n```/);
    assert.equal(released, 1, 'source Markdown capability was not released after successful conversion');
  }, { filePort, notePort });
}

async function markdownLocalImageRendersThroughFileCapability() {
  const markdown = '# Timing\n\n![plot](Timing.assets/plot.png)\n';
  const reads: string[] = [];
  const filePort = { mode: 'desktop', canWrite: true,
    open: async () => ({ id: 'file:image', path: 'E:\\Notes\\Timing.md', name: 'Timing.md', content: markdown,
      revision: 'm1', readOnly: false }),
    save: async () => { throw new Error('not used'); }, saveAs: async () => null,
    reload: async () => { throw new Error('not used'); },
    readAsset: async (_id: string, assetPath: string) => { reads.push(assetPath); return { path: assetPath, mime: 'image/png', bytes: [137, 80, 78, 71] }; },
    release: async () => undefined,
  } as unknown as MarkdownFilePort;
  await withApp(async () => {
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="打开 Markdown 文件"]')!.click());
    await waitFor(() => document.querySelector<HTMLImageElement>('.ProseMirror img')?.src.startsWith('data:image/png;base64,') === true);
    assert.deepEqual(reads, ['Timing.assets/plot.png']);
    assert.match(useNoteStore.getState().currentNote!.contentMd, /Timing\.assets\/plot\.png/);
  }, { filePort });
}

async function mixedMarkdownImageRendersThroughNoteCapability() {
  const blockId = '0199a111-0000-7000-8000-000000000001';
  const html = '<div>Visual</div>';
  const content = `![plot](assets/images/plot.png)\n\n\`\`\`flownote-html\n{"id":"${blockId}"}\n\`\`\`\n`;
  const mixed = { metadata: { formatVersion: 1, type: 'mixed' as const, title: 'Images',
    createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z' },
    blocks: [{ id: blockId, html, originalHtml: html,
      config: { kind: 'html' as const, inputKind: 'fragment' as const, scriptPolicy: 'sandbox' as const, viewport: { heightPx: 480 } } }] };
  const initial: NoteSnapshot = { id: 'note:images', path: 'E:\\Notes\\Images.note', name: 'Images.note', content,
    revision: 'r1', readOnly: false, mixed };
  const reads: string[] = [];
  const notePort = { mode: 'desktop', canWrite: true,
    open: async () => initial,
    save: async (request: any) => ({ ...initial, content: request.content, mixed: request.mixed }),
    saveAs: async (request: any) => ({ ...initial, content: request.content, mixed: request.mixed }),
    reload: async () => initial,
    readAsset: async () => { throw new Error('no block assets'); },
    readNoteImage: async (_id: string, assetPath: string) => { reads.push(assetPath); return { path: assetPath, mime: 'image/png', bytes: [137, 80, 78, 71, 2] }; },
    release: async () => undefined,
  } as unknown as NativeNotePort;
  await withApp(async () => {
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="打开 Mixed Note"]')!.click());
    try {
      await waitFor(() => document.querySelector<HTMLImageElement>('.ProseMirror img')?.src.startsWith('data:image/png;base64,') === true);
    } catch (cause) {
      const image = document.querySelector<HTMLImageElement>('.ProseMirror img');
      throw new Error(`${cause instanceof Error ? cause.message : String(cause)}; reads=${JSON.stringify(reads)}; source=${image?.dataset.source ?? ''}; resourceError=${image?.dataset.resourceError ?? ''}; src=${image?.getAttribute('src') ?? ''}`);
    }
    assert.deepEqual(reads, ['assets/images/plot.png']);
    assert.match(useNoteStore.getState().currentNote!.contentMd, /assets\/images\/plot\.png/);
  }, { notePort });
}

function externalMixedFixture() {
  const blockId = '0199a111-0000-7000-8000-000000000001';
  const html = '<div>Disk A</div>';
  const content = `Before\n\n\`\`\`flownote-html\n{"id":"${blockId}"}\n\`\`\`\n\nAfter\n`;
  const mixed = { metadata: { formatVersion: 1, type: 'mixed' as const, title: 'External',
    createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z' },
    blocks: [{ id: blockId, html, originalHtml: html,
      config: { kind: 'html' as const, inputKind: 'fragment' as const, scriptPolicy: 'sandbox' as const, viewport: { heightPx: 480 } } }] };
  const initial: NoteSnapshot = { id: 'note:external', path: 'E:\\Notes\\External.note', name: 'External.note', content,
    revision: 'r1', readOnly: false, mixed };
  return { blockId, html, content, mixed, initial };
}

async function cleanExternalMixedChangeAutoReloads() {
  const { initial } = externalMixedFixture();
  let changed = false;
  let reloads = 0;
  const disk = () => ({ ...initial, revision: 'r2', content: initial.content.replace('Before', 'Disk Before'),
    mixed: { ...initial.mixed, blocks: [{ ...initial.mixed.blocks[0], html: '<div>Disk B</div>' }] } });
  const notePort = { mode: 'desktop', canWrite: true,
    open: async () => initial,
    probe: async () => ({ revision: changed ? 'r2' : 'r1', changed }),
    reload: async () => { reloads += 1; changed = false; return disk(); },
    save: async () => { throw new Error('not used'); }, saveAs: async () => null,
    readAsset: async () => { throw new Error('no assets'); }, readNoteImage: async () => { throw new Error('no images'); },
    release: async () => undefined,
  } as unknown as NativeNotePort;
  await withApp(async () => {
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="打开 Mixed Note"]')!.click());
    await waitFor(() => useNoteStore.getState().currentNote?.metadata.type === 'mixed');
    changed = true;
    await waitFor(() => reloads === 1);
    await waitFor(() => useNoteStore.getState().currentNote?.mixed?.blocks[0].html === '<div>Disk B</div>');
    assert.equal(useNoteStore.getState().isDirty, false);
    assert.ok([...document.querySelectorAll('[role="status"]')].some(node => /磁盘|外部|更新/.test(node.textContent ?? '')),
      'clean external reload did not surface a disk-update notice');
  }, { notePort });
}

async function dirtyExternalMixedChangeEntersConflictWithoutReload() {
  const { initial } = externalMixedFixture();
  let changed = false;
  let reloads = 0;
  const notePort = { mode: 'desktop', canWrite: true,
    open: async () => initial,
    probe: async () => ({ revision: changed ? 'r2' : 'r1', changed }),
    reload: async () => { reloads += 1; return { ...initial, revision: 'r2' }; },
    save: async () => { throw new Error('not used'); }, saveAs: async () => null,
    readAsset: async () => { throw new Error('no assets'); }, readNoteImage: async () => { throw new Error('no images'); },
    release: async () => undefined,
  } as unknown as NativeNotePort;
  await withApp(async () => {
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="打开 Mixed Note"]')!.click());
    await waitFor(() => !!document.querySelector('[aria-label="编辑 HTML Block"]'));
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="编辑 HTML Block"]')!.click());
    const source = document.querySelector<HTMLTextAreaElement>('[aria-label="HTML 源码"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(source, '<div>Local</div>');
      source.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await waitFor(() => useNoteStore.getState().isDirty);
    changed = true;
    await waitFor(() => !!document.querySelector('[aria-label="Mixed Note 外部修改冲突"]'));
    assert.equal(reloads, 0);
    assert.equal(useNoteStore.getState().currentNote!.mixed!.blocks[0].html, '<div>Local</div>');
    assert.equal(useNoteStore.getState().isDirty, true);
  }, { notePort });
}

async function externalConflictCanExplicitlyReloadDisk() {
  const { initial } = externalMixedFixture();
  let changed = false;
  let reloads = 0;
  const disk = { ...initial, revision: 'r2', content: initial.content.replace('Before', 'Disk Wins'),
    mixed: { ...initial.mixed, blocks: [{ ...initial.mixed.blocks[0], html: '<div>External Disk</div>' }] } };
  const notePort = { mode: 'desktop', canWrite: true,
    open: async () => initial, probe: async () => ({ revision: changed ? 'r2' : 'r1', changed }),
    reload: async () => { reloads += 1; changed = false; return disk; },
    save: async () => { throw new Error('normal save must not run during external conflict'); }, saveAs: async () => null,
    readAsset: async () => { throw new Error('no assets'); }, readNoteImage: async () => { throw new Error('no images'); }, release: async () => undefined,
  } as unknown as NativeNotePort;
  await withApp(async () => {
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="打开 Mixed Note"]')!.click());
    await waitFor(() => !!document.querySelector('[aria-label="编辑 HTML Block"]'));
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="编辑 HTML Block"]')!.click());
    const source = document.querySelector<HTMLTextAreaElement>('[aria-label="HTML 源码"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(source, '<div>Local Dirty</div>');
      source.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await waitFor(() => useNoteStore.getState().isDirty);
    changed = true;
    await waitFor(() => !!document.querySelector('[aria-label="Mixed Note 外部修改冲突"]'));
    const before = reloads;
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="采用磁盘版本"]')!.click());
    await waitFor(() => reloads === before + 1);
    await waitFor(() => useNoteStore.getState().currentNote?.mixed?.blocks[0].html === '<div>External Disk</div>');
    assert.equal(useNoteStore.getState().isDirty, false);
    assert.equal(document.querySelector('[aria-label="Mixed Note 外部修改冲突"]'), null);
  }, { notePort });
}

async function externalConflictCanSaveLocalAsWithoutOverwritingOriginal() {
  const { initial } = externalMixedFixture();
  let changed = false;
  let normalSaves = 0;
  let saveAsRequest: any;
  const disk = { ...initial, revision: 'r2', mixed: { ...initial.mixed,
    blocks: [{ ...initial.mixed.blocks[0], html: '<div>External Disk</div>' }] } };
  const notePort = { mode: 'desktop', canWrite: true,
    open: async () => initial, probe: async () => ({ revision: changed ? 'r2' : 'r1', changed }),
    reload: async () => { changed = false; return disk; },
    save: async () => { normalSaves += 1; throw new Error('must not overwrite original'); },
    saveAs: async (request: any) => {
      saveAsRequest = request;
      return { ...initial, id: 'note:local-copy', path: 'E:\\Notes\\Local Copy.note', name: 'Local Copy.note',
        revision: 'copy-r1', content: request.content, mixed: request.mixed };
    },
    readAsset: async () => { throw new Error('no assets'); }, readNoteImage: async () => { throw new Error('no images'); }, release: async () => undefined,
  } as unknown as NativeNotePort;
  await withApp(async () => {
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="打开 Mixed Note"]')!.click());
    await waitFor(() => !!document.querySelector('[aria-label="编辑 HTML Block"]'));
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="编辑 HTML Block"]')!.click());
    const source = document.querySelector<HTMLTextAreaElement>('[aria-label="HTML 源码"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(source, '<div>Local Copy</div>');
      source.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await waitFor(() => useNoteStore.getState().isDirty);
    changed = true;
    await waitFor(() => !!document.querySelector('[aria-label="Mixed Note 外部修改冲突"]'));
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="另存本地版本"]')!.click());
    await waitFor(() => !!saveAsRequest);
    assert.equal(normalSaves, 0);
    assert.equal(saveAsRequest.sourceId, initial.id);
    assert.equal(saveAsRequest.mixed.blocks[0].html, '<div>Local Copy</div>');
    assert.equal(useNoteStore.getState().currentNote!.mixed!.blocks[0].html, '<div>Local Copy</div>');
    assert.equal(useNoteStore.getState().currentNote!.path, 'E:\\Notes\\Local Copy.note');
    assert.equal(useNoteStore.getState().isDirty, false);
  }, { notePort });
}

async function externalMixedChangeWaitsForImeThenRechecks() {
  const { initial } = externalMixedFixture();
  let changed = false;
  let reloads = 0;
  const notePort = { mode: 'desktop', canWrite: true,
    open: async () => initial,
    probe: async () => ({ revision: changed ? 'r2' : 'r1', changed }),
    reload: async () => { reloads += 1; changed = false; return { ...initial, revision: 'r2', content: initial.content.replace('Before', 'After IME') }; },
    save: async () => { throw new Error('not used'); }, saveAs: async () => null,
    readAsset: async () => { throw new Error('no assets'); }, readNoteImage: async () => { throw new Error('no images'); },
    release: async () => undefined,
  } as unknown as NativeNotePort;
  await withApp(async () => {
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="打开 Mixed Note"]')!.click());
    await waitFor(() => !!document.querySelector('.ProseMirror'));
    const editor = document.querySelector('.ProseMirror')!;
    await act(async () => editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
    assert.equal(useNoteStore.getState().isComposing, true);
    changed = true;
    await new Promise(resolve => setTimeout(resolve, 160));
    assert.equal(reloads, 0, 'external Note reloaded during IME composition');
    await act(async () => editor.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
    await waitFor(() => reloads === 1);
    await waitFor(() => useNoteStore.getState().currentNote?.contentMd.includes('After IME') === true);
  }, { notePort });
}

async function mixedResourcesResolveThroughNotePort() {
  const blockId = '0199a111-0000-7000-8000-000000000001';
  const html = '<link rel="stylesheet" href="./assets/style.css"><img src="./assets/pic.png"><script src="./assets/app.js"></script>';
  const content = `A\n\n\`\`\`flownote-html\n{"id":"${blockId}"}\n\`\`\`\n\nB\n`;
  const mixed = { metadata: { formatVersion: 1, type: 'mixed' as const, title: 'Assets',
    createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z' },
    blocks: [{ id: blockId, html, originalHtml: html,
      config: { kind: 'html' as const, inputKind: 'document' as const, scriptPolicy: 'sandbox' as const, viewport: { heightPx: 480 } } }] };
  const initial: NoteSnapshot = { id: 'note:assets', path: 'E:\\Notes\\Assets.note', name: 'Assets.note', content,
    revision: 'r1', readOnly: false, mixed };
  const reads: string[] = [];
  const notePort: NativeNotePort = { mode: 'desktop', canWrite: true,
    open: async () => initial,
    save: async request => ({ ...initial, content: request.content, mixed: request.mixed }),
    saveAs: async request => ({ ...initial, content: request.content, mixed: request.mixed }),
    reload: async () => initial,
    readAsset: async (_id, _blockId, assetPath) => {
      reads.push(assetPath);
      if (assetPath === 'assets/style.css') return { path: assetPath, mime: 'text/css', bytes: [...Buffer.from('body{color:red}')] };
      if (assetPath === 'assets/app.js') return { path: assetPath, mime: 'text/javascript', bytes: [...Buffer.from('window.assetLoaded=1')] };
      return { path: assetPath, mime: 'image/png', bytes: [137, 80, 78, 71] };
    },
    release: async () => undefined,
  };
  await withApp(async () => {
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="打开 Mixed Note"]')!.click());
    await waitFor(() => /data:text\/css;base64,/.test(document.querySelector<HTMLIFrameElement>('.ProseMirror iframe')?.srcdoc ?? ''));
    const preview = document.querySelector<HTMLIFrameElement>('.ProseMirror iframe')!.srcdoc;
    assert.match(preview, /data:text\/javascript;base64,/);
    assert.match(preview, /data:image\/png;base64,/);
    assert.match(preview, /script-src 'unsafe-inline' data:/);
    assert.match(preview, /style-src 'unsafe-inline' data:/);
    assert.deepEqual(reads.sort(), ['assets/app.js', 'assets/pic.png', 'assets/style.css']);
  }, { notePort });
}

async function missingBlockDiagnosticCanBeRepairedFromUi() {
  const id = '0199a111-0000-7000-8000-000000000002';
  const metadata = { formatVersion: 1, type: 'mixed', title: 'Missing', createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z' };
  const initial = { id: 'note:missing', path: 'E:\\Notes\\Missing.note', name: 'Missing.note', content: `A\n\n\`\`\`flownote-html\n{"id":"${id}"}\n\`\`\`\n`,
    revision: 'r1', readOnly: true, notice: 'HTML Block Missing', diagnostics: [{ kind: 'missingBlock', blockId: id, message: 'HTML Block Missing' }],
    mixed: { metadata, blocks: [] } } as NoteSnapshot;
  let repair: any;
  const notePort = { mode: 'desktop', canWrite: true, open: async () => initial,
    save: async () => { throw new Error('not used'); }, saveAs: async () => null, reload: async () => initial,
    repairRemoveReference: async (noteId: string, revision: string, blockId: string) => {
      repair = { noteId, revision, blockId };
      return { ...initial, content: 'A\n', revision: 'r2', readOnly: false, notice: undefined, diagnostics: [], mixed: { metadata, blocks: [] } };
    },
    readAsset: async () => { throw new Error('no assets'); }, readNoteImage: async () => { throw new Error('no images'); }, release: async () => undefined,
  } as unknown as NativeNotePort;
  await withApp(async () => {
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="打开 Mixed Note"]')!.click());
    await waitFor(() => !!document.querySelector<HTMLButtonElement>('[aria-label="移除缺失 HTML Block 引用"]'));
    assert.ok(!(document.body.textContent ?? '').includes(id), 'internal Block ID leaked into normal repair UI');
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="移除缺失 HTML Block 引用"]')!.click());
    await waitFor(() => !!repair);
    assert.deepEqual(repair, { noteId: initial.id, revision: initial.revision, blockId: id });
    assert.equal(useNoteStore.getState().currentNote!.contentMd, 'A\n');
  }, { notePort });
}

async function orphanBlockDiagnosticCanBeRestoredFromUi() {
  const first = '0199a111-0000-7000-8000-000000000001';
  const orphan = '0199a111-0000-7000-8000-000000000002';
  const html = '<div>Block</div>';
  const metadata = { formatVersion: 1, type: 'mixed', title: 'Orphan', createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z' };
  const block = { id: first, html, originalHtml: html, config: { kind: 'html' as const, inputKind: 'fragment' as const, scriptPolicy: 'sandbox' as const, viewport: { heightPx: 480 } } };
  const orphanBlock = { ...block, id: orphan };
  const content = `A\n\n\`\`\`flownote-html\n{"id":"${first}"}\n\`\`\`\n`;
  const initial = { id: 'note:orphan', path: 'E:\\Notes\\Orphan.note', name: 'Orphan.note', content, revision: 'r1', readOnly: false,
    diagnostics: [{ kind: 'orphanBlock', blockId: orphan, message: 'Orphan HTML Block' }], mixed: { metadata, blocks: [block] } } as NoteSnapshot;
  let repair: any;
  const notePort = { mode: 'desktop', canWrite: true, open: async () => initial,
    save: async () => { throw new Error('not used'); }, saveAs: async () => null, reload: async () => initial,
    repairRestoreOrphan: async (noteId: string, revision: string, blockId: string) => {
      repair = { noteId, revision, blockId };
      return { ...initial, revision: 'r2', diagnostics: [], content: `${content}\n\`\`\`flownote-html\n{"id":"${orphan}"}\n\`\`\`\n`,
        mixed: { metadata, blocks: [block, orphanBlock] } };
    },
    readAsset: async () => { throw new Error('no assets'); }, readNoteImage: async () => { throw new Error('no images'); }, release: async () => undefined,
  } as unknown as NativeNotePort;
  await withApp(async () => {
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="打开 Mixed Note"]')!.click());
    await waitFor(() => !!document.querySelector<HTMLButtonElement>('[aria-label="恢复孤立 HTML Block"]'));
    assert.ok(!(document.body.textContent ?? '').includes(orphan), 'internal orphan Block ID leaked into normal repair UI');
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="恢复孤立 HTML Block"]')!.click());
    await waitFor(() => !!repair);
    assert.deepEqual(repair, { noteId: initial.id, revision: initial.revision, blockId: orphan });
    await waitFor(() => useNoteStore.getState().currentNote?.mixed?.blocks.length === 2);
  }, { notePort });
}

async function missingBlockResourcePreservesSourceAndShowsDiagnostic() {
  const blockId = '0199a111-0000-7000-8000-000000000001';
  const html = '<section><img src="./assets/missing.png"></section>';
  const content = `A\n\n\`\`\`flownote-html\n{"id":"${blockId}"}\n\`\`\`\n\nB\n`;
  const mixed = { metadata: { formatVersion: 1, type: 'mixed' as const, title: 'Missing Resource',
    createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z' },
    blocks: [{ id: blockId, html, originalHtml: html,
      config: { kind: 'html' as const, inputKind: 'fragment' as const, scriptPolicy: 'sandbox' as const, viewport: { heightPx: 480 } } }] };
  const initial: NoteSnapshot = { id: 'note:missing-resource', path: 'E:\\Notes\\Missing.note', name: 'Missing.note', content,
    revision: 'r1', readOnly: false, mixed };
  const notePort = { mode: 'desktop', canWrite: true,
    open: async () => initial,
    save: async request => ({ ...initial, content: request.content, mixed: request.mixed }),
    saveAs: async request => ({ ...initial, content: request.content, mixed: request.mixed }),
    reload: async () => initial,
    readAsset: async () => { throw { code: 'notFound', message: 'managed resource is missing' }; },
    readNoteImage: async () => { throw new Error('not used'); }, release: async () => undefined,
  } as NativeNotePort;
  await withApp(async () => {
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="打开 Mixed Note"]')!.click());
    await waitFor(() => !!document.querySelector('.html-block-resource-error'));
    assert.match(document.querySelector('.html-block-resource-error')!.textContent ?? '', /missing|notFound|资源/i);
    assert.match(document.querySelector<HTMLIFrameElement>('.ProseMirror iframe')!.srcdoc, /\.\/assets\/missing\.png/);
    assert.equal(useNoteStore.getState().currentNote!.mixed!.blocks[0].html, html);
    assert.equal(useNoteStore.getState().isDirty, false);
  }, { notePort });
}

async function addSecondHtmlBlockPersistsAfterSuccessfulSave() {
  const first = '0199a111-0000-7000-8000-000000000001';
  const firstHtml = '<div>First</div>';
  const content = `Before\n\n\`\`\`flownote-html\n{"id":"${first}"}\n\`\`\`\n\nAfter\n`;
  const mixed = { metadata: { formatVersion: 1, type: 'mixed' as const, title: 'Two Blocks',
    createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z' },
    blocks: [{ id: first, html: firstHtml, originalHtml: firstHtml,
      config: { kind: 'html' as const, inputKind: 'fragment' as const, scriptPolicy: 'sandbox' as const, viewport: { heightPx: 480 } } }] };
  const initial: NoteSnapshot = { id: 'note:two', path: 'E:\\Notes\\Two.note', name: 'Two.note', content,
    revision: 'r1', readOnly: false, mixed };
  let saved: Parameters<NativeNotePort['save']>[0] | undefined;
  const notePort: NativeNotePort = { mode: 'desktop', canWrite: true,
    open: async () => initial,
    save: async request => { saved = request; return { ...initial, content: request.content, mixed: request.mixed, revision: 'r2' }; },
    saveAs: async request => ({ ...initial, content: request.content, mixed: request.mixed }),
    reload: async () => initial,
    readAsset: async () => { throw new Error('no assets'); },
    release: async () => undefined,
  };
  await withApp(async () => {
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="打开 Mixed Note"]')!.click());
    await waitFor(() => document.querySelectorAll('.ProseMirror iframe').length === 1);
    const importButton = document.querySelector<HTMLButtonElement>('[aria-label="导入 HTML Block"]')!;
    assert.equal(importButton.disabled, false, 'Mixed Note cannot add another HTML Block');
    await act(async () => importButton.click());
    const source = document.querySelector<HTMLTextAreaElement>('[aria-label="HTML 导入源码"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(source, '<section>Second</section>');
      source.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="确认导入 HTML"]')!.click());
    await waitFor(() => !!saved);
    assert.equal(saved!.mixed.blocks.length, 2);
    assert.equal(saved!.mixed.blocks[0].originalHtml, firstHtml);
    assert.equal(saved!.mixed.blocks[1].html, '<section>Second</section>');
    assert.equal(saved!.mixed.blocks[1].originalHtml, '<section>Second</section>');
    assert.notEqual(saved!.mixed.blocks[0].id, saved!.mixed.blocks[1].id);
    assert.equal((saved!.content.match(/```flownote-html/g) ?? []).length, 2);
    await waitFor(() => document.querySelectorAll('.ProseMirror iframe').length === 2);
    assert.equal(useNoteStore.getState().currentNote!.mixed!.blocks.length, 2);
    assert.equal(useNoteStore.getState().isDirty, false);
  }, { notePort });
}

async function failedSecondHtmlBlockSaveLeavesLiveNoteUntouched() {
  const first = '0199a111-0000-7000-8000-000000000001';
  const firstHtml = '<div>First</div>';
  const content = `Before\n\n\`\`\`flownote-html\n{"id":"${first}"}\n\`\`\`\n\nAfter\n`;
  const mixed = { metadata: { formatVersion: 1, type: 'mixed' as const, title: 'Rollback',
    createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z' },
    blocks: [{ id: first, html: firstHtml, originalHtml: firstHtml,
      config: { kind: 'html' as const, inputKind: 'fragment' as const, scriptPolicy: 'sandbox' as const, viewport: { heightPx: 480 } } }] };
  const initial: NoteSnapshot = { id: 'note:rollback', path: 'E:\\Notes\\Rollback.note', name: 'Rollback.note', content,
    revision: 'r1', readOnly: false, mixed };
  let attempts = 0;
  const notePort = { mode: 'desktop', canWrite: true,
    open: async () => initial,
    save: async () => { attempts += 1; throw { code: 'io', message: 'simulated save failure' }; },
    saveAs: async () => { throw new Error('not used'); }, reload: async () => initial,
    readAsset: async () => { throw new Error('no assets'); }, readNoteImage: async () => { throw new Error('no images'); },
    release: async () => undefined,
  } as NativeNotePort;
  await withApp(async () => {
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="打开 Mixed Note"]')!.click());
    await waitFor(() => document.querySelectorAll('.ProseMirror iframe').length === 1);
    const before = useNoteStore.getState().currentNote!;
    const beforeContent = before.contentMd;
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="导入 HTML Block"]')!.click());
    const source = document.querySelector<HTMLTextAreaElement>('[aria-label="HTML 导入源码"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(source, '<section>Must Roll Back</section>');
      source.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="确认导入 HTML"]')!.click());
    await waitFor(() => attempts === 1);
    await settle();
    const after = useNoteStore.getState().currentNote!;
    assert.equal(after.contentMd, beforeContent);
    assert.equal(after.mixed!.blocks.length, 1);
    assert.equal(after.mixed!.blocks[0].id, first);
    assert.equal(document.querySelectorAll('.ProseMirror iframe').length, 1);
    assert.equal(useNoteStore.getState().isDirty, false);
  }, { notePort });
}

async function deepCopyHtmlBlockPersistsOnlyAfterSuccessfulSave() {
  const first = '0199a111-0000-7000-8000-000000000001';
  const html = '<section>Source Block</section>';
  const content = `Before\n\n\`\`\`flownote-html\n{"id":"${first}"}\n\`\`\`\n\nAfter\n`;
  const config = { kind: 'html' as const, inputKind: 'fragment' as const, scriptPolicy: 'sandbox' as const, viewport: { heightPx: 480 } };
  const mixed = { metadata: { formatVersion: 1, type: 'mixed' as const, title: 'Deep Copy',
    createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z' },
    blocks: [{ id: first, html, originalHtml: html, config }] };
  const initial: NoteSnapshot = { id: 'note:copy', path: 'E:\\Notes\\Copy.note', name: 'Copy.note', content,
    revision: 'r1', readOnly: false, mixed };
  let saved: any;
  let observedLiveCountDuringSave = -1;
  const notePort = { mode: 'desktop', canWrite: true,
    open: async () => initial,
    save: async (request: any) => {
      observedLiveCountDuringSave = useNoteStore.getState().currentNote!.mixed!.blocks.length;
      saved = request;
      return { ...initial, revision: 'r2', content: request.content, mixed: request.mixed };
    },
    saveAs: async () => null, reload: async () => initial,
    readAsset: async () => { throw new Error('no assets'); }, readNoteImage: async () => { throw new Error('no images'); }, release: async () => undefined,
  } as unknown as NativeNotePort;
  await withApp(async () => {
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="打开 Mixed Note"]')!.click());
    await waitFor(() => document.querySelectorAll('.ProseMirror iframe').length === 1);
    const copy = document.querySelector<HTMLButtonElement>('[aria-label="复制 HTML Block"]');
    assert.ok(copy, 'HTML Block Deep Copy action is missing');
    await act(async () => copy.click());
    await waitFor(() => !!saved);
    assert.equal(observedLiveCountDuringSave, 1, 'Deep Copy mutated live Note before save success');
    assert.equal(saved.mixed.blocks.length, 2);
    const target = saved.mixed.blocks[1];
    assert.notEqual(target.id, first);
    assert.equal(target.html, html);
    assert.equal(target.originalHtml, html);
    assert.deepEqual(target.config, config);
    assert.deepEqual(saved.blockCopies, [{ sourceId: first, targetId: target.id }]);
    const refs = [...saved.content.matchAll(/```flownote-html\s*\n([^\n]+)\n```/g)].map((match: RegExpMatchArray) => JSON.parse(match[1]).id);
    assert.deepEqual(refs, [first, target.id]);
    await waitFor(() => useNoteStore.getState().currentNote?.mixed?.blocks.length === 2);
    assert.equal(document.querySelectorAll('.ProseMirror iframe').length, 2);
    assert.equal(useNoteStore.getState().isDirty, false);
  }, { notePort });
}

async function failedDeepCopySaveLeavesLiveNoteUntouched() {
  const first = '0199a111-0000-7000-8000-000000000001';
  const html = '<section>Source Block</section>';
  const content = `Before\n\n\`\`\`flownote-html\n{"id":"${first}"}\n\`\`\`\n\nAfter\n`;
  const mixed = { metadata: { formatVersion: 1, type: 'mixed' as const, title: 'Deep Copy Rollback',
    createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z' },
    blocks: [{ id: first, html, originalHtml: html,
      config: { kind: 'html' as const, inputKind: 'fragment' as const, scriptPolicy: 'sandbox' as const, viewport: { heightPx: 480 } } }] };
  const initial: NoteSnapshot = { id: 'note:copy-fail', path: 'E:\\Notes\\CopyFail.note', name: 'CopyFail.note', content,
    revision: 'r1', readOnly: false, mixed };
  let attempts = 0;
  const notePort = { mode: 'desktop', canWrite: true, open: async () => initial,
    save: async () => { attempts += 1; throw { code: 'io', message: 'simulated deep copy failure' }; },
    saveAs: async () => null, reload: async () => initial,
    readAsset: async () => { throw new Error('no assets'); }, readNoteImage: async () => { throw new Error('no images'); }, release: async () => undefined,
  } as unknown as NativeNotePort;
  await withApp(async () => {
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="打开 Mixed Note"]')!.click());
    await waitFor(() => document.querySelectorAll('.ProseMirror iframe').length === 1);
    const before = useNoteStore.getState().currentNote!;
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="复制 HTML Block"]')!.click());
    await waitFor(() => attempts === 1);
    await settle();
    const after = useNoteStore.getState().currentNote!;
    assert.equal(after.contentMd, before.contentMd);
    assert.equal(after.mixed!.blocks.length, 1);
    assert.equal(after.mixed!.blocks[0].id, first);
    assert.equal(document.querySelectorAll('.ProseMirror iframe').length, 1);
    assert.equal(useNoteStore.getState().isDirty, false);
  }, { notePort });
}

async function dirtyMixedCloseSavesThroughNotePort() {
  const blockId = '0199a111-0000-7000-8000-000000000001';
  const html = '<div>Original</div>';
  const content = `Before\n\n\`\`\`flownote-html\n{"id":"${blockId}"}\n\`\`\`\n\nAfter\n`;
  const mixed = { metadata: { formatVersion: 1, type: 'mixed' as const, title: 'Close Test',
    createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z' },
    blocks: [{ id: blockId, html, originalHtml: html,
      config: { kind: 'html' as const, inputKind: 'fragment' as const, scriptPolicy: 'sandbox' as const, viewport: { heightPx: 480 } } }] };
  const initial: NoteSnapshot = { id: 'note:close', path: 'E:\\Notes\\Close.note', name: 'Close.note', content,
    revision: 'r1', readOnly: false, mixed };
  let saves = 0;
  let releases = 0;
  const notePort: NativeNotePort = { mode: 'desktop', canWrite: true,
    open: async () => initial,
    save: async request => { saves += 1; return { ...initial, content: request.content, mixed: request.mixed, revision: 'r2' }; },
    saveAs: async request => ({ ...initial, content: request.content, mixed: request.mixed, revision: 'r2' }),
    reload: async () => initial,
    release: async () => { releases += 1; },
  };
  await withApp(async () => {
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="打开 Mixed Note"]')!.click());
    await waitFor(() => !!document.querySelector('[aria-label="编辑 HTML Block"]'));
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="编辑 HTML Block"]')!.click());
    const source = document.querySelector<HTMLTextAreaElement>('[aria-label="HTML 源码"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(source, '<div>Changed</div>');
      source.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await settle();
    assert.equal(useNoteStore.getState().isDirty, true);
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="关闭笔记"]')!.click());
    await waitFor(() => !!document.querySelector('[role="dialog"]'));
    const saveContinue = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
      .find(button => button.textContent === '保存并继续');
    assert.ok(saveContinue);
    await act(async () => saveContinue.click());
    await waitFor(() => useNoteStore.getState().currentNote === null);
    assert.equal(saves, 1, 'Closing a dirty Mixed Note did not save through Note Port');
    assert.ok(releases >= 1, 'Closing a Mixed Note did not release its capability');
  }, { notePort });
}

async function openEditAndSaveMixedNote() {
  const blockId = '0199a111-0000-7000-8000-000000000001';
  const html = '<div><button>原始 HTML</button></div>';
  const content = `Markdown A\n\n\`\`\`flownote-html\n{"id":"${blockId}"}\n\`\`\`\n\nMarkdown B\n`;
  const mixed = { metadata: { formatVersion: 1, type: 'mixed' as const, title: 'Mixed Test',
    createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z' },
    blocks: [{ id: blockId, html, originalHtml: html,
      config: { kind: 'html' as const, inputKind: 'fragment' as const, scriptPolicy: 'sandbox' as const, viewport: { heightPx: 480 } } }] };
  const initial: NoteSnapshot = { id: 'note:test', path: 'E:\\Notes\\Mixed.note', name: 'Mixed.note', content,
    revision: 'r1', readOnly: false, mixed };
  let saved: Parameters<NativeNotePort['save']>[0] | undefined;
  const notePort: NativeNotePort = { mode: 'desktop', canWrite: true,
    open: async () => initial,
    save: async request => { saved = request; return { ...initial, content: request.content, mixed: request.mixed, revision: 'r2' }; },
    saveAs: async request => ({ ...initial, name: request.name, content: request.content, mixed: request.mixed, revision: 'r2' }),
    reload: async () => initial,
    release: async () => undefined,
  };
  await withApp(async () => {
    const open = document.querySelector<HTMLButtonElement>('[aria-label="打开 Mixed Note"]');
    assert.ok(open, 'Mixed Note open action is missing');
    await act(async () => open.click());
    await waitFor(() => !!document.querySelector('.ProseMirror iframe'));
    assert.equal(useNoteStore.getState().currentNote?.metadata.type, 'mixed');
    const edit = document.querySelector<HTMLButtonElement>('[aria-label="编辑 HTML Block"]')!;
    await act(async () => edit.click());
    const source = document.querySelector<HTMLTextAreaElement>('[aria-label="HTML 源码"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(source, '<p>更新后的 HTML</p>');
      source.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await settle();
    assert.equal(useNoteStore.getState().isDirty, true);
    const save = document.querySelector<HTMLButtonElement>('[aria-label="保存 Mixed Note"]');
    assert.ok(save, 'Mixed Note save action is missing');
    await act(async () => save.click());
    await waitFor(() => !!saved);
    assert.equal(saved!.mixed.blocks[0].html, '<p>更新后的 HTML</p>');
    assert.equal(saved!.mixed.blocks[0].originalHtml, html);
    assert.equal(useNoteStore.getState().isDirty, false);
  }, { notePort });
}


async function workspaceModesKeepFocusEditableAndReadOnlyWhenRequested() {
  await withApp(async () => {
    const read = document.querySelector<HTMLButtonElement>('[aria-label="阅读模式"]');
    const focus = document.querySelector<HTMLButtonElement>('[aria-label="专注模式"]');
    const edit = document.querySelector<HTMLButtonElement>('[aria-label="编辑模式"]');
    assert.ok(read && focus && edit, 'Workspace mode controls are missing');

    await act(async () => read.click());
    await waitFor(() => document.querySelector('.flownote-editor')?.getAttribute('data-mode') === 'read');
    assert.equal(document.querySelector('.writing-app')?.getAttribute('data-view-mode'), 'read');

    await act(async () => focus.click());
    await waitFor(() => document.querySelector('.writing-app')?.getAttribute('data-view-mode') === 'focus');
    assert.equal(document.querySelector('.flownote-editor')?.getAttribute('data-mode'), 'edit',
      'Focus must remain an editable Markdown mode');

    await act(async () => edit.click());
    await waitFor(() => document.querySelector('.writing-app')?.getAttribute('data-view-mode') === 'edit');
  });
}

export const appChecks = [
  { name: '默认首页：打开即为可编辑的普通 Markdown 笔记', run: welcome },
  { name: '工作区模式：Read 只读，Focus 保持连续可编辑', run: workspaceModesKeepFocusEditableAndReadOnlyWhenRequested },
  { name: '笔记导出：读取编辑器最新正文，不使用滞后状态', run: exportNote },
  { name: '关闭保护：首次修改后立即关闭也会提示', run: immediateClose },
  { name: '导出范围：Mixed Note 即使没有 HTML 映射也拒绝简化导出', run: rejectMixedExport },
  { name: 'HTML 导入：普通 Markdown 只在 .note 创建成功后切换为 Mixed Note', run: importHtmlConvertsMarkdownWithoutPreMutating },
  { name: 'HTML 导入：Markdown 管理图片复制到 .note 且代码示例不被改写', run: markdownManagedImagesMigrateDuringConversion },
  { name: 'Markdown 图片：普通 .md 通过文件 capability 显示本地图片', run: markdownLocalImageRendersThroughFileCapability },
  { name: 'Markdown 图片：Mixed Note 通过 Note capability 显示 assets/images 图片', run: mixedMarkdownImageRendersThroughNoteCapability },
  { name: 'Mixed Note 外部修改：Clean 状态自动重载磁盘版本', run: cleanExternalMixedChangeAutoReloads },
  { name: 'Mixed Note 外部修改：Dirty 状态进入冲突且不覆盖本地', run: dirtyExternalMixedChangeEntersConflictWithoutReload },
  { name: 'Mixed Note 外部修改：冲突后可明确采用磁盘版本', run: externalConflictCanExplicitlyReloadDisk },
  { name: 'Mixed Note 外部修改：冲突后另存本地版本且不覆盖原 Note', run: externalConflictCanSaveLocalAsWithoutOverwritingOriginal },
  { name: 'Mixed Note 外部修改：IME 期间延迟并在结束后重检', run: externalMixedChangeWaitsForImeThenRechecks },
  { name: 'Mixed Note：Block 私有 CSS / JS / 图片通过 Note Port 解析到 iframe', run: mixedResourcesResolveThroughNotePort },
  { name: 'Mixed Note 修复：缺失 Block 引用可从 UI 显式移除', run: missingBlockDiagnosticCanBeRepairedFromUi },
  { name: 'Mixed Note 修复：Orphan Block 可从 UI 显式恢复', run: orphanBlockDiagnosticCanBeRestoredFromUi },
  { name: 'Mixed Note：私有资源缺失时显示诊断并保留 Current Source', run: missingBlockResourcePreservesSourceAndShowsDiagnostic },
  { name: 'Mixed Note：新增第二 HTML Block 保存成功后才应用且身份独立', run: addSecondHtmlBlockPersistsAfterSuccessfulSave },
  { name: 'Mixed Note：第二 HTML Block 保存失败时不污染实时文档', run: failedSecondHtmlBlockSaveLeavesLiveNoteUntouched },
  { name: 'Mixed Note Deep Copy：保存成功后才应用新身份和副本', run: deepCopyHtmlBlockPersistsOnlyAfterSuccessfulSave },
  { name: 'Mixed Note Deep Copy：保存失败时实时 Note 完全不变', run: failedDeepCopySaveLeavesLiveNoteUntouched },
  { name: 'Mixed Note：Ctrl+S 路由到 Note Port，不走 Markdown 保存链路', run: ctrlSSavesMixedNoteThroughNotePort },
  { name: 'Mixed Note：关闭 Dirty Note 时保存并继续走 Note Port 并释放绑定', run: dirtyMixedCloseSavesThroughNotePort },
  { name: 'Mixed Note：从界面打开、编辑 Current 并保存到 Note Port', run: openEditAndSaveMixedNote },
];

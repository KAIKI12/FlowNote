import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { clearMocks, mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { emit, TauriEvent } from '@tauri-apps/api/event';
import App from '../src/app/App';
import { useNoteStore } from '../src/note/noteStore';
import { createFileDriver } from './fileDriver';
import { settle, waitFor } from './editorHarness';

export const DESKTOP_SOURCE = '---\ntitle: 桌面测试\n---\n\n[[保留]]\n';
export interface WindowBoundary {
  destroyRequests: number;
  destroyed: number;
  destroyError?: Error;
  beforeDestroy?: () => Promise<void>;
  afterSave?: () => Promise<void>;
}

function eventTransport() {
  // Match the real eventId contract; the bundled mock helper currently removes args.id instead.
  const listeners = new Map<number, { event: string; handler: number }>();
  let sequence = 0;
  const call = (command: string, args: Record<string, unknown>) => {
    if (command === 'plugin:event|listen') {
      const id = ++sequence;
      listeners.set(id, { event: String(args.event), handler: Number(args.handler) });
      return id;
    }
    if (command === 'plugin:event|unlisten') { listeners.delete(Number(args.eventId)); return; }
    if (command !== 'plugin:event|emit') throw new Error(`Unexpected event command: ${command}`);
    const internals = (window as unknown as { __TAURI_INTERNALS__: { runCallback: (id: number, event: unknown) => void } }).__TAURI_INTERNALS__;
    for (const [id, listener] of listeners) {
      if (listener.event === args.event) internals.runCallback(listener.handler, { event: args.event, id, payload: args.payload });
    }
  };
  return { call, count: () => listeners.size };
}

function installBridge(driver: ReturnType<typeof createFileDriver>, boundary: WindowBoundary) {
  const flag = Object.getOwnPropertyDescriptor(globalThis, 'isTauri');
  Object.defineProperty(globalThis, 'isTauri', { configurable: true, value: true });
  mockWindows('main');
  const events = eventTransport();
  mockIPC(async (command, args) => {
    if (command.startsWith('plugin:event|')) return events.call(command, args ?? {});
    if (command === 'plugin:window|destroy') {
      boundary.destroyRequests += 1;
      if (boundary.destroyError) throw boundary.destroyError;
      await boundary.beforeDestroy?.();
      boundary.destroyed += 1;
      return;
    }
    if (command === 'workspace_restore') return null;
    if (!command.startsWith('markdown_')) throw new Error(`Unexpected desktop command: ${command}`);
    const result = await driver.invoke(command, args);
    if (command === 'markdown_save') await boundary.afterSave?.();
    return result;
  });
  return () => {
    try { assert.equal(events.count(), 0, 'Window close listeners survived unmount'); }
    finally {
      clearMocks();
      if (flag) Object.defineProperty(globalThis, 'isTauri', flag);
      else Reflect.deleteProperty(globalThis, 'isTauri');
    }
  };
}

export function desktopButton(name: string): HTMLButtonElement {
  const button = [...document.querySelectorAll('button')].find(value => value.getAttribute('aria-label') === name || value.textContent === name);
  assert.ok(button, `Missing desktop control: ${name}`);
  return button;
}

export async function clickDesktop(name: string) { await act(async () => desktopButton(name).click()); }
export async function closeEvent() { await act(async () => emit(TauriEvent.WINDOW_CLOSE_REQUESTED)); }
export const desktopIdle = () => waitFor(() => !document.querySelector('[aria-label="文件保存状态"]')?.textContent?.includes('正在'));

export async function editDesktop(from: string, to: string) {
  const area = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Markdown 源码"]')!;
  assert.ok(area);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, area.value.replace(from, to));
    area.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

export async function withDesktop(action: (value: { boundary: WindowBoundary; file: string }) => Promise<void>, content = DESKTOP_SOURCE) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'flownote-close-events-'));
  const file = path.join(directory, 'desktop.md');
  await fs.writeFile(file, content);
  const driver = createFileDriver();
  const boundary: WindowBoundary = { destroyRequests: 0, destroyed: 0 };
  const clearBridge = installBridge(driver, boundary);
  useNoteStore.getState().setCurrentNote(null);
  document.body.innerHTML = '<main id="desktop-app"></main>';
  const root = createRoot(document.getElementById('desktop-app')!);
  try {
    await act(async () => root.render(<React.StrictMode><App /></React.StrictMode>));
    await waitFor(() => document.querySelector('.flownote-editor')?.getAttribute('aria-busy') === 'false');
    driver.open(file);
    await clickDesktop('打开 Markdown 文件'); await desktopIdle();
    await waitFor(() => useNoteStore.getState().currentNote?.contentMd === content);
    await waitFor(() => document.querySelector('.flownote-editor')?.getAttribute('aria-busy') === 'false');
    await action({ boundary, file });
  } finally {
    await act(async () => root.unmount());
    await settle();
    await driver.close();
    clearBridge();
  }
}

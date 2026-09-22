import { useEffect, useRef, useState } from 'react';
import { fileError, type MarkdownFileError } from '../files/fileTypes';
import { defaultVisualLibraryPort } from './defaultVisualLibraryPort';
import type { VisualLibraryItem, VisualLibraryPackage, VisualLibraryPort, VisualLocalizeRequest, VisualMetadataUpdate } from './types';

interface Options { port?: VisualLibraryPort | null }

export function useVisualLibrary(options: Options = {}) {
  const portRef = useRef<VisualLibraryPort | null>(options.port === undefined ? defaultVisualLibraryPort() : options.port);
  const [items, setItems] = useState<VisualLibraryItem[]>([]);
  const [busy, setBusy] = useState<'list' | 'collect' | 'load' | 'update' | 'trash' | 'restore' | 'localize' | null>(null);
  const [error, setError] = useState<MarkdownFileError | null>(null);
  const [notice, setNotice] = useState('');

  const refresh = async (): Promise<VisualLibraryItem[]> => {
    const port = portRef.current;
    if (!port) return [];
    setBusy('list'); setError(null);
    try {
      const next = await port.list();
      setItems(next);
      return next;
    } catch (cause) {
      setError(fileError(cause));
      return [];
    } finally { setBusy(null); }
  };

  useEffect(() => { void refresh(); }, []);

  const collect = async (request: { noteId: string; revision: string; blockId: string; title: string }) => {
    const port = portRef.current;
    if (!port) return null;
    setBusy('collect'); setError(null); setNotice('');
    try {
      const item = await port.collect(request);
      setItems(previous => [item, ...previous.filter(value => value.id !== item.id)]);
      setNotice(`已收藏 Visual：${item.title}`);
      return item;
    } catch (cause) {
      setError(fileError(cause));
      return null;
    } finally { setBusy(null); }
  };

  const load = async (id: string): Promise<VisualLibraryPackage | null> => {
    const port = portRef.current;
    if (!port) return null;
    setBusy('load'); setError(null); setNotice('');
    try { return await port.load(id); }
    catch (cause) { setError(fileError(cause)); return null; }
    finally { setBusy(null); }
  };

  const replace = (item: VisualLibraryItem) => {
    setItems(previous => previous.map(value => value.id === item.id ? item : value));
  };

  const updateMetadata = async (value: VisualMetadataUpdate) => {
    const port = portRef.current;
    if (!port) return null;
    setBusy('update'); setError(null); setNotice('');
    try {
      const item = await port.update(value);
      replace(item);
      setNotice(`已更新 Visual：${item.title}`);
      return item;
    } catch (cause) {
      setError(fileError(cause));
      return null;
    } finally { setBusy(null); }
  };

  const trash = async (id: string) => {
    const port = portRef.current;
    if (!port) return null;
    setBusy('trash'); setError(null); setNotice('');
    try {
      const item = await port.trash(id);
      replace(item);
      setNotice(`已移到 Trash：${item.title}`);
      return item;
    } catch (cause) {
      setError(fileError(cause));
      return null;
    } finally { setBusy(null); }
  };

  const restore = async (id: string) => {
    const port = portRef.current;
    if (!port) return null;
    setBusy('restore'); setError(null); setNotice('');
    try {
      const item = await port.restore(id);
      replace(item);
      setNotice(`已恢复 Visual：${item.title}`);
      return item;
    } catch (cause) {
      setError(fileError(cause));
      return null;
    } finally { setBusy(null); }
  };

  const localize = async (request: VisualLocalizeRequest) => {
    const port = portRef.current;
    if (!port) return null;
    setBusy('localize'); setError(null); setNotice('');
    try {
      const item = await port.localize(request);
      replace(item);
      setNotice(`已本地化 Visual 资源：${item.title}`);
      return item;
    } catch (cause) {
      setError(fileError(cause));
      return null;
    } finally { setBusy(null); }
  };

  return {
    available: !!portRef.current,
    items, busy, error, notice,
    refresh, collect, load, updateMetadata, trash, restore, localize,
    readAsset: async (id: string, path: string) => {
      const port = portRef.current;
      if (!port) throw new Error('Visual Library 仅在桌面版可用');
      return port.readAsset(id, path);
    },
    clearNotice: () => setNotice(''),
  };
}

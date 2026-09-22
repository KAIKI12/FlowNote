import { useEffect, useMemo, useRef, useState } from 'react';
import { HtmlSandbox } from '../../../html/HtmlSandbox';
import { resolveHtmlResources } from '../../../html/htmlResources';
import type { HtmlBlockData } from '../../../note/mixedTypes';
import type { BlockAsset, BlockAssetEdit, BlockAssetInfo } from '../../../note/nativeNotePort';
import type { HtmlBlockHost } from './htmlBlockContext';

type Selection =
  | { kind: 'current' }
  | { kind: 'original' }
  | { kind: 'asset'; path: string };

interface HtmlFullEditorProps {
  block: HtmlBlockData;
  host: HtmlBlockHost;
  onCancel(): void;
  onSaved(): void;
}

function textAsset(asset: BlockAsset): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(asset.bytes));
}

function assetMime(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase();
  if (extension === 'css') return 'text/css';
  if (extension === 'js' || extension === 'mjs') return 'text/javascript';
  if (extension === 'json') return 'application/json';
  return 'text/plain';
}

function validTextAsset(path: string): boolean {
  return /^assets\/(?:[^/]+\/)*[^/.][^/]*\.(?:css|js|mjs|json|txt)$/i.test(path)
    && !path.includes('..') && !path.includes('\\') && !path.includes(':') && !path.includes('\0');
}

export function HtmlFullEditor({ block, host, onCancel, onSaved }: HtmlFullEditorProps) {
  const [selection, setSelection] = useState<Selection>({ kind: 'current' });
  const [currentDraft, setCurrentDraft] = useState(block.html);
  const [assets, setAssets] = useState<BlockAssetInfo[]>([]);
  const [assetBase, setAssetBase] = useState<Record<string, string>>({});
  const [assetDrafts, setAssetDrafts] = useState<Record<string, string>>({});
  const [newAssets, setNewAssets] = useState<string[]>([]);
  const [newPath, setNewPath] = useState('');
  const [preview, setPreview] = useState(block.html);
  const [error, setError] = useState('');
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [saving, setSaving] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    setLoadingAssets(true);
    setError('');
    void host.listAssets?.(block.id).then(items => {
      if (active) setAssets(items);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => {
      if (active) setLoadingAssets(false);
    });
    return () => { active = false; };
  }, [block.id, host]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onCancel]);

  useEffect(() => {
    let active = true;
    setError('');
    if (!host.readAsset) {
      setPreview(currentDraft);
      return () => { active = false; };
    }
    void resolveHtmlResources(currentDraft, async path => {
      if (Object.prototype.hasOwnProperty.call(assetDrafts, path)) {
        return { path, mime: assets.find(item => item.path === path)?.mime ?? assetMime(path),
          bytes: [...new TextEncoder().encode(assetDrafts[path])] };
      }
      return host.readAsset!(block.id, path);
    }, block.config).then(html => {
      if (active) setPreview(html);
    }).catch(cause => {
      if (active) {
        setPreview(currentDraft);
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    });
    return () => { active = false; };
  }, [assetDrafts, assets, block.id, currentDraft, host]);

  const selectedAsset = selection.kind === 'asset' ? assets.find(item => item.path === selection.path) : undefined;
  const sourceValue = selection.kind === 'current' ? currentDraft
    : selection.kind === 'original' ? block.originalHtml
      : selection.kind === 'asset' ? assetDrafts[selection.path] ?? '' : '';
  const sourceReadOnly = selection.kind === 'original' || selection.kind === 'asset' && selectedAsset?.editable === false;
  const sourceLabel = selection.kind === 'current' ? 'Current HTML'
    : selection.kind === 'original' ? 'Original HTML'
      : selection.kind === 'asset' ? selection.path : '';

  const dirtyAssetEdits = useMemo(() => {
    const paths = new Set([...Object.keys(assetDrafts), ...newAssets]);
    const edits: BlockAssetEdit[] = [];
    for (const path of paths) {
      const draft = assetDrafts[path] ?? '';
      if (newAssets.includes(path) || draft !== assetBase[path]) edits.push({ blockId: block.id, path, content: draft });
    }
    return edits;
  }, [assetBase, assetDrafts, block.id, newAssets]);

  const selectAsset = async (asset: BlockAssetInfo) => {
    setSelection({ kind: 'asset', path: asset.path });
    setError('');
    if (!asset.editable || Object.prototype.hasOwnProperty.call(assetDrafts, asset.path) || !host.readAsset) return;
    try {
      const source = textAsset(await host.readAsset(block.id, asset.path));
      setAssetBase(values => ({ ...values, [asset.path]: source }));
      setAssetDrafts(values => ({ ...values, [asset.path]: source }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const updateSource = (value: string) => {
    if (selection.kind === 'current') setCurrentDraft(value);
    else if (selection.kind === 'asset' && selectedAsset?.editable !== false) {
      setAssetDrafts(values => ({ ...values, [selection.path]: value }));
    }
  };

  const createTextAsset = () => {
    const path = newPath.trim().startsWith('assets/') ? newPath.trim() : `assets/${newPath.trim()}`;
    if (!validTextAsset(path)) {
      setError('文本资源必须位于 assets/ 下，并使用 css/js/mjs/json/txt 扩展名。');
      return;
    }
    if (assets.some(item => item.path === path)) {
      setError('同名资源已经存在。');
      return;
    }
    const info: BlockAssetInfo = { path, mime: assetMime(path), size: 0, editable: true };
    setAssets(items => [...items, info].sort((left, right) => left.path.localeCompare(right.path)));
    setAssetBase(values => ({ ...values, [path]: '' }));
    setAssetDrafts(values => ({ ...values, [path]: '' }));
    setNewAssets(items => [...items, path]);
    setSelection({ kind: 'asset', path });
    setNewPath('');
    setError('');
  };

  const save = async () => {
    if (!host.commitFullEditor || saving) return;
    setSaving(true);
    setError('');
    try {
      if (await host.commitFullEditor(block.id, currentDraft, dirtyAssetEdits)) onSaved();
      else setError('保存失败，live Note 与磁盘未被 Full Editor draft 覆盖。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return <div className="html-full-editor-backdrop" role="presentation">
    <section className="html-full-editor" role="dialog" aria-modal="true" aria-label="HTML Full Editor">
      <header className="html-full-editor-header">
        <div><strong>HTML Full Editor</strong><span>Current + block-private assets · Sandboxed preview</span></div>
        <div>
          <button ref={closeRef} type="button" aria-label="取消 HTML Full Editor" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary" aria-label="保存 HTML Full Editor"
            disabled={saving || !host.commitFullEditor} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </header>

      <div className="html-full-editor-body">
        <aside className="html-full-editor-rail" aria-label="HTML Full Editor 文件">
          <div className="html-full-editor-section">
            <button type="button" className={selection.kind === 'current' ? 'is-active' : ''}
              aria-label="编辑 Current HTML" onClick={() => setSelection({ kind: 'current' })}>Current HTML</button>
            <button type="button" className={selection.kind === 'original' ? 'is-active' : ''}
              aria-label="查看 Original HTML" onClick={() => setSelection({ kind: 'original' })}>Original HTML <span>read-only</span></button>
          </div>
          <div className="html-full-editor-assets">
            <div className="html-full-editor-rail-title"><strong>Assets</strong><span>{loadingAssets ? 'Loading…' : assets.length}</span></div>
            {assets.map(asset => <button key={asset.path} type="button"
              className={selection.kind === 'asset' && selection.path === asset.path ? 'is-active' : ''}
              aria-label={(asset.editable ? '编辑资源 ' : '查看资源 ') + asset.path} onClick={() => void selectAsset(asset)}>
              <span>{asset.path.replace(/^assets\//, '')}</span><small>{asset.editable ? 'text' : 'binary · read-only'}</small>
            </button>)}
          </div>
          <div className="html-full-editor-new-asset">
            <input aria-label="新建文本资源路径" placeholder="styles/theme.css" value={newPath}
              onChange={event => setNewPath(event.currentTarget.value)} />
            <button type="button" aria-label="创建文本资源" disabled={!newPath.trim()} onClick={createTextAsset}>New text asset</button>
          </div>
        </aside>

        <section className="html-full-editor-source-pane">
          <div className="html-full-editor-pane-title">
            <strong>{sourceLabel}</strong>
            <span>{sourceReadOnly ? 'Read only' : selection.kind === 'asset' && newAssets.includes(selection.path) ? 'New asset' : 'Draft'}</span>
          </div>
          {selection.kind === 'asset' && selectedAsset?.editable === false
            ? <div className="html-full-editor-binary"><strong>{selectedAsset.path}</strong><span>{selectedAsset.mime} · {selectedAsset.size} bytes</span><p>Binary assets are available to the preview but are not text-editable in V1.</p></div>
            : <textarea aria-label="Full Editor 源码" value={sourceValue} readOnly={sourceReadOnly}
              onInput={event => updateSource(event.currentTarget.value)} spellCheck={false} />}
        </section>

        <section className="html-full-editor-preview">
          <div className="html-full-editor-pane-title"><strong>Live Preview</strong><span>Sandboxed · Network off</span></div>
          <div className="html-full-editor-preview-canvas"><HtmlSandbox content={preview} config={block.config} /></div>
        </section>
      </div>
      <footer className="html-full-editor-footer">
        <span>{error || (currentDraft !== block.html || dirtyAssetEdits.length ? 'Unsaved Full Editor draft' : 'No unsaved Full Editor changes')}</span>
        <span>Original is protected · {dirtyAssetEdits.length} asset change{dirtyAssetEdits.length === 1 ? '' : 's'}</span>
      </footer>
    </section>
  </div>;
}

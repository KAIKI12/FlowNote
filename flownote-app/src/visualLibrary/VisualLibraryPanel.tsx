import { useEffect, useState } from 'react';
import { LibraryBig, Plus, RefreshCw } from 'lucide-react';
import { HtmlSandbox } from '../html/HtmlSandbox';
import { resolveHtmlResources } from '../html/htmlResources';
import type { MarkdownFileError } from '../files/fileTypes';
import type { BlockAsset } from '../note/nativeNotePort';
import type { VisualLibraryItem } from './types';

function VisualPreview({ item, readAsset }: {
  item: VisualLibraryItem;
  readAsset(id: string, path: string): Promise<BlockAsset>;
}) {
  const [html, setHtml] = useState(item.html);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setHtml(item.html);
    setError('');
    void resolveHtmlResources(item.html, path => readAsset(item.id, path)).then(value => {
      if (active) setHtml(value);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => { active = false; };
  }, [item.id, item.html, readAsset]);
  return <div className="visual-library-preview">
    <HtmlSandbox content={html} config={item.config} />
    {error && <span className="visual-library-preview-error">Assets unavailable</span>}
  </div>;
}

function dateLabel(value: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));
  } catch { return ''; }
}

export function VisualLibraryPanel({ items, busy, error, notice, readAsset, insertDisabled, onRefresh, onInsert }: {
  items: VisualLibraryItem[];
  busy: string | null;
  error: MarkdownFileError | null;
  notice: string;
  readAsset(id: string, path: string): Promise<BlockAsset>;
  insertDisabled: boolean;
  onRefresh(): void;
  onInsert(id: string): void;
}) {
  return <section className="visual-library" aria-label="Visual Library">
    <div className="visual-library-heading">
      <div><LibraryBig size={14} /><span>Visual Library</span><small>{items.length}</small></div>
      <button type="button" aria-label="刷新 Visual Library" disabled={!!busy} onClick={onRefresh}>
        <RefreshCw size={13} />
      </button>
    </div>
    {notice && <p className="visual-library-notice" role="status">{notice}</p>}
    {error && <p className="visual-library-error" role="alert">{error.message}</p>}
    {!items.length && !busy && <div className="visual-library-empty">
      <LibraryBig size={20} />
      <strong>还没有收藏的 Visual</strong>
      <span>在任意 HTML Visual 上点击 Collect，即可在其他 Mixed Note 中复用。</span>
    </div>}
    <div className="visual-library-list">
      {items.map(item => <article className="visual-library-card" key={item.id}>
        <VisualPreview item={item} readAsset={readAsset} />
        <div className="visual-library-card-body">
          <div className="visual-library-card-title">
            <strong title={item.title}>{item.title}</strong>
            <span>{dateLabel(item.createdAtMs)}</span>
          </div>
          <div className="visual-library-card-meta">
            <span>{item.assetCount ? `${item.assetCount} assets` : 'Self-contained'}</span>
            <button type="button" aria-label={`插入 Visual：${item.title}`} disabled={insertDisabled || !!busy}
              onClick={() => onInsert(item.id)}>
              <Plus size={12} /> Insert
            </button>
          </div>
        </div>
      </article>)}
    </div>
    {busy === 'list' && <p className="visual-library-loading">Loading Visual Library…</p>}
  </section>;
}

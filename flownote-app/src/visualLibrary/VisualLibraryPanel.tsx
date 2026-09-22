import { useEffect, useMemo, useState } from 'react';
import { Check, Download, LibraryBig, Pencil, Plus, RefreshCw, RotateCcw, Search, Star, Tag, Trash2, X } from 'lucide-react';
import { HtmlSandbox } from '../html/HtmlSandbox';
import { resolveHtmlResources } from '../html/htmlResources';
import { inspectRemoteResources } from '../html/remoteResources';
import type { MarkdownFileError } from '../files/fileTypes';
import type { BlockAsset } from '../note/nativeNotePort';
import type { VisualLibraryItem, VisualLocalizeRequest, VisualMetadataUpdate } from './types';

type LibraryView = 'all' | 'favorites' | 'trash';

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
    void resolveHtmlResources(item.html, path => readAsset(item.id, path), item.config).then(value => {
      if (active) setHtml(value);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => { active = false; };
  }, [item.config, item.id, item.html, readAsset]);
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

function parseTags(value: string): string[] {
  return value.split(',').map(tag => tag.trim()).filter(Boolean);
}

function resourceStateLabel(status: ReturnType<typeof inspectRemoteResources>['status']): string | null {
  if (status === 'remote') return 'Remote';
  if (status === 'partial') return 'Partially Local';
  if (status === 'local') return 'Local';
  return null;
}

function VisualMetadataEditor({ item, disabled, onCancel, onSave }: {
  item: VisualLibraryItem;
  disabled: boolean;
  onCancel(): void;
  onSave(value: VisualMetadataUpdate): void;
}) {
  const [title, setTitle] = useState(item.title);
  const [tags, setTags] = useState(item.tags.join(', '));
  return <div className="visual-library-editor" aria-label={`编辑 Visual metadata：${item.title}`}>
    <label>Title<input value={title} maxLength={160} autoFocus onChange={event => setTitle(event.target.value)} /></label>
    <label>Tags<input value={tags} placeholder="diagram, report, dark" onChange={event => setTags(event.target.value)} /></label>
    <div>
      <button type="button" disabled={disabled || !title.trim()} onClick={() => onSave({
        id: item.id, title: title.trim(), favorite: item.favorite, tags: parseTags(tags),
      })}><Check size={12} />Save</button>
      <button type="button" disabled={disabled} onClick={onCancel}><X size={12} />Cancel</button>
    </div>
  </div>;
}

export function VisualLibraryPanel({
  items, busy, error, notice, readAsset, insertDisabled, onRefresh, onInsert, onUpdate, onTrash, onRestore, onLocalize,
}: {
  items: VisualLibraryItem[];
  busy: string | null;
  error: MarkdownFileError | null;
  notice: string;
  readAsset(id: string, path: string): Promise<BlockAsset>;
  insertDisabled: boolean;
  onRefresh(): void;
  onInsert(id: string): void;
  onUpdate(value: VisualMetadataUpdate): void;
  onTrash(id: string): void;
  onRestore(id: string): void;
  onLocalize(request: VisualLocalizeRequest): void;
}) {
  const [view, setView] = useState<LibraryView>('all');
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const activeCount = items.filter(item => !item.trashed).length;
  const trashCount = items.filter(item => item.trashed).length;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = useMemo(() => items.filter(item => {
    if (view === 'trash' ? !item.trashed : item.trashed) return false;
    if (view === 'favorites' && !item.favorite) return false;
    if (!normalizedQuery) return true;
    return [item.title, ...item.tags].some(value => value.toLocaleLowerCase().includes(normalizedQuery));
  }), [items, normalizedQuery, view]);

  return <section className="visual-library" aria-label="Visual Library">
    <div className="visual-library-heading">
      <div><LibraryBig size={14} /><span>Visual Library</span><small>{activeCount}</small></div>
      <button type="button" aria-label="刷新 Visual Library" disabled={!!busy} onClick={onRefresh}>
        <RefreshCw size={13} />
      </button>
    </div>

    <label className="visual-library-search">
      <Search size={12} aria-hidden="true" />
      <input aria-label="搜索 Visual Library" value={query} placeholder="Search title or tags…"
        onChange={event => setQuery(event.target.value)} />
      {query && <button type="button" aria-label="清除 Visual 搜索" onClick={() => setQuery('')}><X size={11} /></button>}
    </label>

    <div className="visual-library-filters" role="tablist" aria-label="Visual Library filters">
      <button type="button" role="tab" aria-selected={view === 'all'} onClick={() => setView('all')}>All</button>
      <button type="button" role="tab" aria-selected={view === 'favorites'} onClick={() => setView('favorites')}>
        <Star size={11} />Favorites
      </button>
      <button type="button" role="tab" aria-selected={view === 'trash'} onClick={() => setView('trash')}>
        <Trash2 size={11} />Trash{trashCount ? <small>{trashCount}</small> : null}
      </button>
    </div>

    {notice && <p className="visual-library-notice" role="status">{notice}</p>}
    {error && <p className="visual-library-error" role="alert">{error.message}</p>}

    {!visible.length && !busy && <div className="visual-library-empty">
      <LibraryBig size={20} />
      <strong>{normalizedQuery ? '没有匹配的 Visual' : view === 'trash' ? 'Trash 为空' : view === 'favorites' ? '还没有 Favorite' : '还没有收藏的 Visual'}</strong>
      <span>{normalizedQuery ? '搜索只匹配 Library title 与 tags，不扫描 Note 正文。'
        : view === 'trash' ? '移到 Trash 的 Visual 可在这里恢复。'
          : view === 'favorites' ? '点击卡片上的星标即可加入 Favorites。'
            : '在任意 HTML Visual 上点击 Collect，即可在其他 Mixed Note 中复用。'}</span>
    </div>}

    <div className="visual-library-list">
      {visible.map(item => {
        const resources = inspectRemoteResources(item.html, item.config);
        const resourceLabel = resourceStateLabel(resources.status);
        const canMakeLocal = !item.trashed && resources.dependencies.length > resources.localizedCount;
        return <article className="visual-library-card" data-trashed={item.trashed ? 'true' : 'false'} key={item.id}>
          <VisualPreview item={item} readAsset={readAsset} />
          <div className="visual-library-card-body">
            <div className="visual-library-card-title">
              <strong title={item.title}>{item.title}</strong>
              <span>{dateLabel(item.updatedAtMs)}</span>
            </div>
            {!!item.tags.length && <div className="visual-library-tags" aria-label="Visual tags">
              {item.tags.map(tag => <span key={tag}><Tag size={9} />{tag}</span>)}
            </div>}
            {editingId === item.id && !item.trashed
              ? <VisualMetadataEditor item={item} disabled={!!busy} onCancel={() => setEditingId(null)}
                  onSave={value => { onUpdate(value); setEditingId(null); }} />
              : <div className="visual-library-card-meta">
                  <div className="visual-library-resource-summary">
                    <span>{item.assetCount ? `${item.assetCount} assets` : 'Self-contained'}</span>
                    {resourceLabel && <span className="visual-library-resource-state" data-state={resources.status}
                      aria-label={`资源状态：${resourceLabel}`}>{resourceLabel}</span>}
                  </div>
                  <div className="visual-library-card-actions">
                    {item.trashed
                      ? <button type="button" aria-label={`恢复 Visual：${item.title}`} disabled={!!busy}
                          onClick={() => onRestore(item.id)}><RotateCcw size={12} />Restore</button>
                      : <>
                          <button type="button" className={item.favorite ? 'is-favorite' : ''} aria-pressed={item.favorite}
                            aria-label={item.favorite ? `取消 Favorite：${item.title}` : `Favorite Visual：${item.title}`}
                            disabled={!!busy} onClick={() => onUpdate({
                              id: item.id, title: item.title, favorite: !item.favorite, tags: item.tags,
                            })}><Star size={12} /></button>
                          <button type="button" aria-label={`编辑 Visual：${item.title}`} disabled={!!busy}
                            onClick={() => setEditingId(item.id)}><Pencil size={12} /></button>
                          <button type="button" aria-label={`移到 Trash：${item.title}`} disabled={!!busy}
                            onClick={() => onTrash(item.id)}><Trash2 size={12} /></button>
                          {canMakeLocal && <button type="button" className="visual-library-make-local"
                            aria-label={`Make Local：${item.title}`} disabled={!!busy}
                            onClick={() => onLocalize({
                              id: item.id,
                              dependencies: resources.dependencies.map(dependency => ({
                                source: dependency.source, kind: dependency.type,
                              })),
                            })}><Download size={12} />Make Local</button>}
                          <button type="button" className="visual-library-insert" aria-label={`插入 Visual：${item.title}`}
                            disabled={insertDisabled || !!busy} onClick={() => onInsert(item.id)}>
                            <Plus size={12} />Insert
                          </button>
                        </>}
                  </div>
                </div>}
          </div>
        </article>;
      })}
    </div>
    {busy === 'list' && <p className="visual-library-loading">Loading Visual Library…</p>}
  </section>;
}

import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { HtmlSandbox } from '../../../html/HtmlSandbox';
import { resolveHtmlResources } from '../../../html/htmlResources';
import type { HtmlBlockHost } from './htmlBlockContext';

interface HtmlBlockViewProps {
  blockId: string;
  width: 'normal' | 'wide' | 'full';
  host?: HtmlBlockHost;
}

/**
 * HTML Block React view. Markdown stays a continuous document; only HTML Visuals
 * expose object-level chrome.
 */
export function HtmlBlockView({ blockId, width, host }: HtmlBlockViewProps) {
  const block = useSyncExternalStore(
    host?.subscribe ?? (() => () => undefined),
    () => host?.read(blockId),
    () => host?.read(blockId),
  );
  const [editing, setEditing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [selected, setSelected] = useState(false);
  const [layout, setLayout] = useState<'normal' | 'wide' | 'full'>(width);
  const [draft, setDraft] = useState(block?.html ?? '');
  const [editBase, setEditBase] = useState(block?.html ?? '');
  const [preview, setPreview] = useState(block?.html ?? '');
  const [resourceError, setResourceError] = useState('');

  useEffect(() => setLayout(width), [width]);
  useEffect(() => {
    if (!editing) {
      setDraft(block?.html ?? '');
      setEditBase(block?.html ?? '');
    }
  }, [block?.html, editing]);
  useEffect(() => {
    if (!block) { setPreview(''); setResourceError(''); return; }
    if (!host?.readAsset) { setPreview(block.html); setResourceError(''); return; }
    let active = true;
    setPreview(block.html);
    setResourceError('');
    void resolveHtmlResources(block.html, path => host.readAsset!(blockId, path)).then(html => {
      if (active) setPreview(html);
    }).catch(cause => {
      if (active) setResourceError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => { active = false; };
  }, [block, blockId, host]);
  useEffect(() => {
    if (!fullscreen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [fullscreen]);

  const select = () => {
    setSelected(true);
    host?.select?.(blockId);
  };
  const openEditor = () => {
    select();
    setEditBase(block?.html ?? '');
    setDraft(block?.html ?? '');
    setEditing(true);
  };
  const updateCurrent = (html: string) => {
    setDraft(html);
    if (block && host) host.update({ ...block, html });
  };
  const cancelEditing = () => {
    if (block && host && block.html !== editBase) host.update({ ...block, html: editBase });
    setDraft(editBase);
    setEditing(false);
  };
  const cycleLayout = () => setLayout(value => value === 'normal' ? 'wide' : value === 'wide' ? 'full' : 'normal');

  return (
    <div className={'html-visual html-visual--' + layout + (selected ? ' is-selected' : '')}
      onClick={select} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSelected(false);
      }}>
      <div className="html-visual-toolbar" role="group" aria-label="HTML Visual 操作">
        <button type="button" aria-label="编辑 HTML Block" title="Edit" onClick={event => { event.stopPropagation(); openEditor(); }}>Edit</button>
        <button type="button" aria-label="切换 HTML Block 宽度" title="Width" onClick={event => { event.stopPropagation(); cycleLayout(); }}>
          {layout === 'normal' ? 'Normal' : layout === 'wide' ? 'Wide' : 'Full'}
        </button>
        <button type="button" aria-label="全屏 HTML Block" title="Fullscreen" onClick={event => { event.stopPropagation(); select(); setFullscreen(true); }}>Fullscreen</button>
        <button type="button" aria-label="更多 HTML Block 操作" title="More" onClick={event => event.stopPropagation()}>More</button>
        <button type="button" className="html-visual-duplicate" aria-label="复制 HTML Block" title="Duplicate"
          disabled={!block || !host?.duplicate}
          onClick={event => { event.stopPropagation(); if (block && host?.duplicate) void host.duplicate(blockId); }}>Duplicate</button>
      </div>

      {!block && <div className="html-block-placeholder">HTML Visual 缺失</div>}
      {resourceError && <div className="html-block-resource-error" role="status">资源加载失败：{resourceError}</div>}
      {block && <div className="html-visual-frame"><HtmlSandbox content={preview} config={block.config} /></div>}
      {block && <div className="html-visual-caption">
        <span>HTML Visual</span><span>{layout === 'normal' ? 'Normal' : layout === 'wide' ? 'Wide' : 'Full Width'}</span>
      </div>}

      {editing && block && createPortal(
        <div className="html-quick-edit-backdrop" role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget) cancelEditing();
        }}>
          <section className="html-quick-edit" role="dialog" aria-modal="true" aria-label="HTML Quick Edit">
            <header className="html-quick-edit-header">
              <div><strong>HTML Visual</strong><span>Quick Edit · Live Preview</span></div>
              <button type="button" aria-label="关闭 HTML Quick Edit" onClick={cancelEditing}>Close</button>
            </header>
            <div className="html-quick-edit-body">
              <div className="html-quick-edit-source">
                <div className="html-quick-edit-pane-title"><strong>HTML Source</strong><span>Current</span></div>
                <textarea className="html-block-source" aria-label="HTML 源码" value={draft}
                  onInput={event => updateCurrent(event.currentTarget.value)} spellCheck={false} />
              </div>
              <div className="html-quick-edit-preview">
                <div className="html-quick-edit-pane-title"><strong>Live Preview</strong><span>Sandboxed · Network off</span></div>
                <div className="html-quick-edit-preview-canvas"><HtmlSandbox content={preview} config={block.config} /></div>
              </div>
            </div>
            <footer className="html-quick-edit-footer">
              <span>{draft === editBase ? 'No unsaved changes' : 'Unsaved changes'}</span>
              <div>
                <button type="button" onClick={cancelEditing}>Cancel</button>
                <button type="button" disabled title="Full Editor will be connected after the first-wave prototype">Open Full Editor</button>
                <button type="button" className="primary" onClick={() => setEditing(false)}>Save</button>
              </div>
            </footer>
          </section>
        </div>, document.body)}

      {fullscreen && block && createPortal(
        <div className="html-fullscreen" role="dialog" aria-modal="true" aria-label="HTML 全屏展示">
          <div className="html-fullscreen-exit">
            <span>HTML Visual</span><span>Esc to exit</span>
            <button type="button" aria-label="退出 HTML 全屏" onClick={() => setFullscreen(false)}>Close</button>
          </div>
          <div className="html-fullscreen-canvas"><HtmlSandbox content={preview} config={block.config} /></div>
        </div>, document.body)}
    </div>
  );
}

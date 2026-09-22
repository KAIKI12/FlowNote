import { HTML_DEFAULT_HEIGHT, HTML_MAX_HEIGHT, HTML_MIN_HEIGHT, validBlockId } from '../note/htmlBlockData';
import { resolveHtmlResources } from '../html/htmlResources';
import type { HtmlBlockData, MixedNoteData } from '../note/mixedTypes';
import type { BlockAsset, BrowserBundleBlock } from '../note/nativeNotePort';
import type { BrowserBundleEditorSnapshot } from '../editor/editorTypes';

export interface BrowserBundleDraft {
  indexHtml: string;
  blocks: BrowserBundleBlock[];
}

const ROOT_STYLE = `
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#252932;background:#f7f7f5}
*{box-sizing:border-box}
body{margin:0;background:#f7f7f5}
main{width:min(100% - 48px,900px);margin:0 auto;padding:56px 0 96px;background:#fff}
article{padding:0 56px}
h1,h2,h3,h4{line-height:1.25;color:#1f232b}
p,li,blockquote{line-height:1.75}
pre{overflow:auto;padding:14px 16px;border:1px solid #e7e9ee;border-radius:9px;background:#f6f7f9}
code{font-family:"Cascadia Code",Consolas,monospace}
img{max-width:100%;height:auto}
table{width:100%;border-collapse:collapse}
th,td{padding:7px 9px;border:1px solid #e4e7ec;text-align:left}
blockquote{margin-left:0;padding-left:16px;border-left:3px solid #dfe3ea;color:#69717d}
.flownote-html-block{margin:28px 0}
.flownote-html-block iframe{display:block;width:100%;border:1px solid #e3e6eb;border-radius:10px;background:#fff}
.flownote-html-block--wide{width:min(1140px,calc(100vw - 48px));margin-left:50%;transform:translateX(-50%)}
.flownote-html-block--full{width:calc(100vw - 24px);margin-left:50%;transform:translateX(-50%)}
.flownote-protected-notice{margin-bottom:14px;padding:10px 12px;border:1px solid #e3e6eb;border-radius:8px;color:#6d7480;background:#fafafa;font-size:13px}
.protected-source{white-space:pre-wrap;word-break:break-word}
@media(max-width:760px){main{width:100%;padding-top:32px}article{padding:0 22px}.flownote-html-block--wide,.flownote-html-block--full{width:100%;margin-left:0;transform:none}}
`;

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function blockPolicy(block: HtmlBlockData): string {
  const script = block.config.scriptPolicy === 'off' ? "'none'" : "'self' 'unsafe-inline' data:";
  return [
    "default-src 'none'",
    `script-src ${script}`,
    "style-src 'self' 'unsafe-inline' data:",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

export function renderExportBlockDocument(block: HtmlBlockData): string {
  return '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'
    + blockPolicy(block) + '"><meta name="referrer" content="no-referrer">' + block.html;
}

function rootDocument(title: string, body: string): string {
  const policy = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "frame-src 'self'",
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta http-equiv="Content-Security-Policy" content="' + policy + '">'
    + '<meta name="referrer" content="no-referrer"><title>' + escapeHtml(title) + '</title><style>' + ROOT_STYLE
    + '</style></head><body><main><article>' + body + '</article></main></body></html>';
}

function protectedBody(snapshot: BrowserBundleEditorSnapshot): string {
  const reasons = snapshot.reasons.length ? ' · ' + snapshot.reasons.map(escapeHtml).join('、') : '';
  return '<div class="flownote-protected-notice">This document contains Markdown FlowNote preserved in source mode'
    + reasons + '.</div><pre class="protected-source"><code>' + escapeHtml(snapshot.markdown) + '</code></pre>';
}

function blockHeight(block: HtmlBlockData): number {
  const value = Number(block.config.viewport?.heightPx ?? HTML_DEFAULT_HEIGHT);
  return Math.max(HTML_MIN_HEIGHT, Math.min(HTML_MAX_HEIGHT, Number.isFinite(value) ? value : HTML_DEFAULT_HEIGHT));
}

export type BrowserBundleAssetReader = (blockId: string, path: string) => Promise<BlockAsset>;

export async function renderBrowserBundle(
  snapshot: BrowserBundleEditorSnapshot,
  mixed: MixedNoteData,
  title: string,
  readAsset: BrowserBundleAssetReader = async (_blockId, path) => {
    throw new Error(`Browser Bundle 缺少受管资源读取能力：${path}`);
  },
): Promise<BrowserBundleDraft> {
  if (snapshot.protected) return { indexHtml: rootDocument(title, protectedBody(snapshot)), blocks: [] };

  const byId = new Map(mixed.blocks.map(block => [block.id, block]));
  const document = new DOMParser().parseFromString('<!doctype html><html><body>' + snapshot.bodyHtml + '</body></html>', 'text/html');
  const blocks: BrowserBundleBlock[] = [];
  const seen = new Set<string>();

  for (const placeholder of document.querySelectorAll<HTMLElement>('[data-type="html-block"][data-id]')) {
    const id = placeholder.getAttribute('data-id') ?? '';
    if (!validBlockId(id) || seen.has(id)) throw new Error('Browser Bundle 包含无效或重复 HTML Block 引用');
    const block = byId.get(id);
    if (!block) throw new Error('Browser Bundle 引用了当前 Mixed Note 中不存在的 HTML Block');
    seen.add(id);
    const width = ['normal', 'wide', 'full'].includes(placeholder.getAttribute('data-width') ?? '')
      ? placeholder.getAttribute('data-width')! : 'normal';

    const section = document.createElement('section');
    section.className = 'flownote-html-block flownote-html-block--' + width;
    section.dataset.blockId = id;
    const frame = document.createElement('iframe');
    frame.src = './blocks/' + id + '/index.html';
    frame.setAttribute('sandbox', block.config.scriptPolicy === 'off' ? '' : 'allow-scripts');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.setAttribute('loading', 'lazy');
    frame.setAttribute('title', 'HTML Visual');
    frame.style.height = blockHeight(block) + 'px';
    section.append(frame);
    placeholder.replaceWith(section);

    const resolved = await resolveHtmlResources(block.html, path => readAsset(block.id, path), block.config);
    blocks.push({ id, html: renderExportBlockDocument({ ...block, html: resolved }) });
  }

  return { indexHtml: rootDocument(title, document.body.innerHTML), blocks };
}

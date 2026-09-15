import { HTML_DEFAULT_HEIGHT, HTML_MAX_HEIGHT, HTML_MIN_HEIGHT, validateHtmlSource } from '../note/htmlBlockData';
import type { HtmlBlockConfig } from '../note/mixedTypes';

export interface HtmlPreviewOptions { html: string; config?: HtmlBlockConfig; networkAllowed?: boolean }

export function previewPolicy(options: HtmlPreviewOptions): string {
  const network = options.networkAllowed ? ' http: https:' : '';
  const script = options.config?.scriptPolicy === 'off' ? "'none'" : "'unsafe-inline'" + network;
  const connect = options.networkAllowed ? 'http: https: ws: wss:' : "'none'";
  return ["default-src 'none'", `script-src ${script}`, `style-src 'unsafe-inline'${network}`,
    `img-src data: blob:${network}`, `font-src data:${network}`, `media-src data: blob:${network}`,
    `connect-src ${connect}`, "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"].join('; ');
}

export function sandboxDocument(options: HtmlPreviewOptions): string {
  validateHtmlSource(options.html);
  // The first parsed node establishes policy before any untrusted markup is processed.
  return '<!doctype html><meta http-equiv="Content-Security-Policy" content="' + previewPolicy(options)
    + '"><meta name="referrer" content="no-referrer">' + options.html;
}

export function configureSandbox(frame: HTMLIFrameElement, options: HtmlPreviewOptions): void {
  const height = options.config?.viewport.heightPx ?? HTML_DEFAULT_HEIGHT;
  frame.setAttribute('sandbox', options.config?.scriptPolicy === 'off' ? '' : 'allow-scripts');
  frame.setAttribute('allow', "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'");
  frame.referrerPolicy = 'no-referrer';
  frame.title = 'HTML Block 内容';
  frame.className = 'html-sandbox';
  frame.style.height = Math.max(HTML_MIN_HEIGHT, Math.min(HTML_MAX_HEIGHT, height)) + 'px';
  frame.srcdoc = sandboxDocument(options);
}

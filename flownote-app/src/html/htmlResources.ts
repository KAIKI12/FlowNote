import type { BlockAsset } from '../note/nativeNotePort';

export type BlockAssetReader = (path: string) => Promise<BlockAsset>;

function managedPath(reference: string, base = ''): string | null {
  const source = reference.trim();
  if (!source || source.includes('\\') || /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(source)) return null;
  const pathname = source.split(/[?#]/, 1)[0];
  const parts = base ? base.split('/').slice(0, -1) : [];
  for (const part of pathname.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.length > 1 && parts[0] === 'assets' ? parts.join('/') : null;
}

function dataUrl(asset: BlockAsset): string {
  let binary = '';
  for (let offset = 0; offset < asset.bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...asset.bytes.slice(offset, offset + 0x8000));
  }
  return `data:${asset.mime};base64,${btoa(binary)}`;
}

function utf8(asset: BlockAsset): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(asset.bytes));
}

async function rewriteCss(css: string, base: string, load: BlockAssetReader): Promise<string> {
  const pattern = /url\(\s*(['"]?)([^'"\)]+)\1\s*\)/gi;
  let output = '';
  let cursor = 0;
  for (const match of css.matchAll(pattern)) {
    const index = match.index ?? 0;
    output += css.slice(cursor, index);
    const path = managedPath(match[2], base);
    if (!path) output += match[0];
    else output += `url("${dataUrl(await load(path))}")`;
    cursor = index + match[0].length;
  }
  return output + css.slice(cursor);
}

function serialize(document: Document): string {
  return document.documentElement?.outerHTML ?? '';
}

export async function resolveHtmlResources(html: string, readAsset: BlockAssetReader): Promise<string> {
  const cache = new Map<string, Promise<BlockAsset>>();
  const load = (path: string) => {
    let pending = cache.get(path);
    if (!pending) { pending = readAsset(path); cache.set(path, pending); }
    return pending;
  };
  const document = new DOMParser().parseFromString(html, 'text/html');

  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]')) {
    const path = managedPath(link.getAttribute('href') ?? '');
    if (!path) continue;
    const asset = await load(path);
    const css = await rewriteCss(utf8(asset), path, load);
    link.href = dataUrl({ path, mime: 'text/css', bytes: [...new TextEncoder().encode(css)] });
  }
  for (const script of document.querySelectorAll<HTMLScriptElement>('script[src]')) {
    const path = managedPath(script.getAttribute('src') ?? '');
    if (path) script.src = dataUrl(await load(path));
  }
  for (const image of document.querySelectorAll<HTMLImageElement>('img[src]')) {
    const path = managedPath(image.getAttribute('src') ?? '');
    if (path) image.src = dataUrl(await load(path));
  }
  for (const style of document.querySelectorAll<HTMLStyleElement>('style')) {
    style.textContent = await rewriteCss(style.textContent ?? '', '', load);
  }
  for (const element of document.querySelectorAll<HTMLElement>('[style]')) {
    const value = element.getAttribute('style');
    if (value) element.setAttribute('style', await rewriteCss(value, '', load));
  }
  return serialize(document);
}

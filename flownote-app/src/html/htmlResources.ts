import type { HtmlBlockConfig, LocalizedResource } from '../note/mixedTypes';
import type { BlockAsset } from '../note/nativeNotePort';
import { localizedResources } from './remoteResources';

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

function normalizedRemote(reference: string, base?: string): string | null {
  const source = reference.trim();
  if (!source) return null;
  try {
    const url = base ? new URL(source, base) : new URL(source);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function mappingFor(reference: string, mappings: LocalizedResource[], base?: string): LocalizedResource | null {
  const source = normalizedRemote(reference, base);
  if (!source) return null;
  return mappings.find(item => item.source === source) ?? null;
}

async function rewriteCss(
  css: string,
  baseLocal: string,
  load: BlockAssetReader,
  mappings: LocalizedResource[],
  remoteBase?: string,
): Promise<string> {
  const pattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  let output = '';
  let cursor = 0;
  for (const match of css.matchAll(pattern)) {
    const index = match.index ?? 0;
    output += css.slice(cursor, index);
    const reference = match[2];
    const mapped = mappingFor(reference, mappings, remoteBase);
    if (mapped) {
      output += `url("${dataUrl(await load(mapped.path))}")`;
    } else {
      const path = managedPath(reference, baseLocal);
      output += path ? `url("${dataUrl(await load(path))}")` : match[0];
    }
    cursor = index + match[0].length;
  }
  return output + css.slice(cursor);
}

function serialize(document: Document): string {
  return document.documentElement?.outerHTML ?? '';
}

export async function resolveHtmlResources(
  html: string,
  readAsset: BlockAssetReader,
  config?: HtmlBlockConfig,
): Promise<string> {
  const cache = new Map<string, Promise<BlockAsset>>();
  const load = (path: string) => {
    let pending = cache.get(path);
    if (!pending) { pending = readAsset(path); cache.set(path, pending); }
    return pending;
  };
  const mappings = localizedResources(config);
  const document = new DOMParser().parseFromString(html, 'text/html');

  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]')) {
    const reference = link.getAttribute('href') ?? '';
    const local = managedPath(reference);
    if (local) {
      const asset = await load(local);
      const css = await rewriteCss(utf8(asset), local, load, mappings);
      link.href = dataUrl({ path: local, mime: 'text/css', bytes: [...new TextEncoder().encode(css)] });
      continue;
    }
    const mapped = mappingFor(reference, mappings);
    if (!mapped || mapped.type !== 'stylesheet') continue;
    const asset = await load(mapped.path);
    const css = await rewriteCss(utf8(asset), mapped.path, load, mappings, mapped.source);
    link.href = dataUrl({ path: mapped.path, mime: 'text/css', bytes: [...new TextEncoder().encode(css)] });
  }

  for (const script of document.querySelectorAll<HTMLScriptElement>('script[src]')) {
    const reference = script.getAttribute('src') ?? '';
    const local = managedPath(reference);
    if (local) {
      script.src = dataUrl(await load(local));
      continue;
    }
    const mapped = mappingFor(reference, mappings);
    if (mapped?.type === 'script') script.src = dataUrl(await load(mapped.path));
  }

  for (const image of document.querySelectorAll<HTMLImageElement>('img[src]')) {
    const reference = image.getAttribute('src') ?? '';
    const local = managedPath(reference);
    if (local) {
      image.src = dataUrl(await load(local));
      continue;
    }
    const mapped = mappingFor(reference, mappings);
    if (mapped?.type === 'image') image.src = dataUrl(await load(mapped.path));
  }

  for (const style of document.querySelectorAll<HTMLStyleElement>('style')) {
    style.textContent = await rewriteCss(style.textContent ?? '', '', load, mappings);
  }
  for (const element of document.querySelectorAll<HTMLElement>('[style]')) {
    const value = element.getAttribute('style');
    if (value) element.setAttribute('style', await rewriteCss(value, '', load, mappings));
  }
  return serialize(document);
}

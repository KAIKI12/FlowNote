import { markdownBytes } from '../files/fileEncoding';
import type { HtmlBlockData, MixedNoteData } from './mixedTypes';

export const HTML_DEFAULT_HEIGHT = 480;
export const HTML_MIN_HEIGHT = 120;
export const HTML_MAX_HEIGHT = 1600;
const BLOCK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function validBlockId(value: unknown): value is string {
  return typeof value === 'string' && BLOCK_ID.test(value);
}

export function parseHtmlReference(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const data: unknown = JSON.parse(value);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const entry = data as Record<string, unknown>;
    return Object.keys(entry).length === 1 && validBlockId(entry.id) ? entry.id : null;
  } catch { return null; }
}

export function validateHtmlSource(html: string): void {
  try { markdownBytes(html); }
  catch (cause) { throw new Error((cause instanceof Error ? cause.message : String(cause)).replace(/Markdown/g, 'HTML')); }
}

export function htmlInputKind(source: string): 'fragment' | 'document' {
  let cursor = 0;
  while (cursor < source.length) {
    const text = source.slice(cursor).replace(/^\uFEFF/, '').trimStart();
    if (!text.startsWith('<!--')) return /^(<!doctype\s+html\b|<html\b)/i.test(text) ? 'document' : 'fragment';
    const end = text.indexOf('-->');
    if (end < 0) return 'fragment';
    cursor = source.length - text.length + end + '-->'.length;
  }
  return 'fragment';
}

export function createHtmlBlock(html: string): HtmlBlockData {
  validateHtmlSource(html);
  return { id: crypto.randomUUID(), html, originalHtml: html, config: { kind: 'html',
    inputKind: htmlInputKind(html), scriptPolicy: 'sandbox', viewport: { heightPx: HTML_DEFAULT_HEIGHT } } };
}

export function newMixedNote(title: string, block: HtmlBlockData): MixedNoteData {
  const now = new Date().toISOString();
  return { metadata: { formatVersion: 1, type: 'mixed', title, createdAt: now, updatedAt: now }, blocks: [block] };
}

export function mixedFingerprint(mixed: MixedNoteData | undefined): string {
  if (!mixed) return '';
  return JSON.stringify({ metadata: mixed.metadata, blocks: [...mixed.blocks].sort((left, right) => left.id.localeCompare(right.id)) });
}

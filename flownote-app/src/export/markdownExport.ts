import { parseHtmlReference } from '../note/htmlBlockData';
import type { MixedNoteData } from '../note/mixedTypes';
import type { BrowserBundleBlock } from '../note/nativeNotePort';
import { renderExportBlockDocument } from './browserBundle';

export interface MarkdownExportDraft {
  content: string;
  blocks: BrowserBundleBlock[];
}

const HTML_ANCHOR = /```flownote-html[ \t]*\r?\n([\s\S]*?)\r?\n```/g;

export function renderMarkdownExport(markdown: string, mixed: MixedNoteData): MarkdownExportDraft {
  const byId = new Map(mixed.blocks.map(block => [block.id, block]));
  const seen = new Set<string>();
  const blocks: BrowserBundleBlock[] = [];

  const content = markdown.replace(HTML_ANCHOR, (source, rawReference: string) => {
    const id = parseHtmlReference(rawReference.trim());
    if (!id) return source;
    if (seen.has(id)) throw new Error('Markdown 导出包含重复 HTML Block 引用');
    const block = byId.get(id);
    if (!block) throw new Error('Markdown 导出引用了当前 Mixed Note 中不存在的 HTML Block');
    seen.add(id);
    blocks.push({ id, html: renderExportBlockDocument(block) });
    return `[HTML Visual](./blocks/${id}/index.html)`;
  });

  return { content, blocks };
}

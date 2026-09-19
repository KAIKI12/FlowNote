import { parseHtmlReference } from '../note/htmlBlockData';

export interface MarkdownTree {
  type: string;
  children?: MarkdownTree[];
  position?: { start: { offset?: number }; end: { offset?: number } };
  lang?: string | null;
  meta?: string | null;
  [key: string]: unknown;
}

const FOOTNOTES = new Set(['footnote', 'footnoteDefinition', 'footnoteReference']);
const LITERAL_NODES = new Set(['code', 'inlineCode', 'image', 'imageReference', 'definition']);
const AST_METADATA = new Set(['position', 'spread', 'data']);

function flatten(tree: MarkdownTree): MarkdownTree[] {
  return [tree, ...(tree.children ?? []).flatMap(flatten)];
}

function maskLiteralNodes(source: string, nodes: MarkdownTree[]): string {
  const characters = source.split('');
  for (const node of nodes.filter(item => LITERAL_NODES.has(item.type))) {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) continue;
    characters.fill(' ', start, end);
  }
  return characters.join('');
}

function codeReason(node: MarkdownTree, htmlIds?: ReadonlySet<string>): string | undefined {
  if (node.type !== 'code') return;
  if (node.lang === 'flownote-html') {
    const id = parseHtmlReference(node.value);
    if (!id || node.meta) return 'HTML Block 引用无效（Invalid Reference）';
    if (!htmlIds?.has(id)) return 'HTML Block Missing / 当前文件未绑定 HTML';
    return;
  }
  if (node.lang === 'mermaid') return 'Mermaid 图表源码';
  if (node.meta) return '代码块附加信息';
}

function textReasons(text: string): string[] {
  const unescaped = text.replace(/\\[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g, '  ');
  const patterns: [RegExp, string][] = [
    [/\[\[/, 'WikiLink / 双链源码'],
    [/\[\^[^\]\r\n]+\]/, '脚注源码'],
    [/\$\$|\$[^$]*\$/, 'LaTeX 公式源码'],
    [/(^|\s):{2,}[a-zA-Z]/m, '自定义 Markdown 指令'],
    [/(^|\s)\{[.#][^}\r\n]+\}/m, '扩展 Markdown 属性'],
  ];
  const reasons = patterns.filter(([pattern]) => pattern.test(unescaped)).map(([, reason]) => reason);
  if (/(^|[^\\])(?:\\\\)*\\\([\s\S]*?\\\)|(^|[^\\])(?:\\\\)*\\\[[\s\S]*?\\\]/.test(text)) {
    reasons.push('LaTeX 公式源码');
  }
  return reasons;
}

export function protectionReasons(source: string, tree: MarkdownTree, htmlIds?: ReadonlySet<string>): string[] {
  const nodes = flatten(tree);
  const reasons = textReasons(maskLiteralNodes(source, nodes));
  if (nodes.some(node => node.type === 'html')) reasons.push('HTML 原文');
  if (nodes.some(node => FOOTNOTES.has(node.type))) reasons.push('脚注源码');
  reasons.push(...nodes.map(node => codeReason(node, htmlIds)).filter((reason): reason is string => !!reason));
  const references = nodes.filter(node => node.type === 'code' && node.lang === 'flownote-html')
    .map(node => parseHtmlReference(node.value)).filter((id): id is string => !!id);
  if (new Set(references).size !== references.length) reasons.push('HTML Block 重复引用');
  return [...new Set(reasons)];
}

function normalizeAst(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeAst);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !AST_METADATA.has(key))
    .map(([key, child]) => [key, normalizeAst(child)]));
}

export function sameMarkdownMeaning(before: MarkdownTree, after: MarkdownTree): boolean {
  return JSON.stringify(normalizeAst(before)) === JSON.stringify(normalizeAst(after));
}

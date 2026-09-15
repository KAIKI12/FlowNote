import type { Ctx } from '@milkdown/ctx';
import { editorViewOptionsCtx, parserCtx, remarkCtx } from '@milkdown/core';
import { Fragment, Slice } from '@milkdown/prose/model';
import type { Mark, Node, ResolvedPos } from '@milkdown/prose/model';
import type { EditorView } from '@milkdown/prose/view';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { $prose } from '@milkdown/utils';
import type { MarkdownTree } from './markdownProtection';
import { inputMarks } from './inputContext';

interface ClipboardInput { ctx: Ctx; text: string; context: ResolvedPos; plain: boolean; view: EditorView }

function textWasDecoded(node: MarkdownTree, source: string): boolean {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  return start !== undefined && end !== undefined && source.slice(start, end) !== node.value;
}

function hasMarkdownStructure(tree: MarkdownTree, source: string): boolean {
  return (tree.children ?? []).some(node => node.type !== 'paragraph'
    || (node.children ?? []).some(child => child.type !== 'text' || textWasDecoded(child, source)));
}

function inlineSlice(node: Node, text: string, marks: readonly Mark[]): Slice {
  const leading = text.match(/^[ \t]+/)?.[0];
  const trailing = text.match(/[ \t]+$/)?.[0];
  let content = node.content;
  const first = node.firstChild;
  if (node.childCount === 1 && first?.isText && first.marks.length === 0) content = Fragment.from(first.mark(marks));
  if (leading) content = Fragment.from(node.type.schema.text(leading, marks)).append(content);
  if (trailing) content = content.append(Fragment.from(node.type.schema.text(trailing, marks)));
  return new Slice(Fragment.from(node.copy(content)), 1, 1);
}

function textSlice({ text, context, marks }: { text: string; context: ResolvedPos; marks: readonly Mark[] }): Slice {
  const schema = context.parent.type.schema;
  const paragraphs = text.split(/(?:\r\n?|\n)+/).map(line =>
    schema.nodes.paragraph.create(null, line ? schema.text(line, marks) : undefined));
  return Slice.maxOpen(Fragment.fromArray(paragraphs));
}

function parseMarkdownPaste({ ctx, text, context, plain, view }: ClipboardInput): Slice {
  if (!text) return Slice.empty;
  const marks = inputMarks(view, context);
  if (plain || context.parent.type.spec.code || marks.some(mark => mark.type.spec.code)) return textSlice({ text, context, marks });
  const tree = ctx.get(remarkCtx).parse(text) as unknown as MarkdownTree;
  if (!hasMarkdownStructure(tree, text)) return textSlice({ text, context, marks });
  const document = ctx.get(parserCtx)(text);
  if (!document) throw new Error('粘贴的 Markdown 未能解析为文档');
  // Keep explicit Markdown blocks closed so fitting cannot unwrap lists or code.
  const inline = document.childCount === 1 && document.firstChild?.type.name === 'paragraph';
  return inline ? inlineSlice(document.firstChild!, text, marks) : new Slice(document.content, 0, 0);
}

export const preservePastedCodeBlocks = $prose(() => new Plugin({
  key: new PluginKey('flownote-pasted-code-blocks'),
  props: { transformPasted(slice) {
    // ProseMirror reopens clipboard slices; an open code block can become prose.
    const openStart = slice.content.firstChild?.type.spec.code ? 0 : slice.openStart;
    const openEnd = slice.content.lastChild?.type.spec.code ? 0 : slice.openEnd;
    return new Slice(slice.content, openStart, openEnd);
  } },
}));

export function configureMarkdownClipboard(ctx: Ctx): void {
  ctx.update(editorViewOptionsCtx, previous => ({ ...previous,
    clipboardTextParser(...args) {
      const [text, context, plain, view] = args;
      return parseMarkdownPaste({ ctx, text, context, plain, view });
    },
  }));
}

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import type { Node as ProseNode } from '@milkdown/prose/model';
import type { NodeView, ViewMutationRecord } from '@milkdown/prose/view';
import { $view } from '@milkdown/utils';
import { htmlBlockNode } from './HtmlBlockNode';
import { htmlBlockContext } from './htmlBlockContext';
import type { HtmlBlockHost } from './htmlBlockContext';
import { HtmlBlockView } from './HtmlBlockView';

type HtmlBlockWidth = 'normal' | 'wide' | 'full';

function widthOf(node: ProseNode): HtmlBlockWidth {
  const value = node.attrs.width;
  return value === 'wide' || value === 'full' ? value : 'normal';
}

class FlowNoteHtmlBlockView implements NodeView {
  readonly dom = document.createElement('div');
  private readonly root: Root;
  private current: ProseNode;
  private readonly host?: HtmlBlockHost;

  constructor(node: ProseNode, host?: HtmlBlockHost) {
    this.current = node;
    this.host = host;
    this.dom.dataset.type = 'html-block';
    this.dom.setAttribute('contenteditable', 'false');
    this.root = createRoot(this.dom);
    this.render();
  }

  private render(): void {
    const id = String(this.current.attrs.id ?? '');
    const width = widthOf(this.current);
    this.dom.dataset.id = id;
    this.dom.dataset.width = width;
    this.root.render(createElement(HtmlBlockView, { blockId: id, width, host: this.host }));
  }

  update(node: ProseNode): boolean {
    if (node.type !== this.current.type) return false;
    this.current = node;
    this.render();
    return true;
  }

  stopEvent(event: Event): boolean {
    const target = event.target;
    return target instanceof Element && !!target.closest('button, textarea, iframe, input, select, a');
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    return mutation.type !== 'selection';
  }

  destroy(): void {
    this.root.unmount();
  }
}

export const htmlBlockView = $view(htmlBlockNode, ctx => {
  const host = ctx.get(htmlBlockContext.key)?.host;
  return node => new FlowNoteHtmlBlockView(node, host);
});

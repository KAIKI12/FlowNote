import type { Node as ProseNode } from '@milkdown/prose/model';
import type { NodeView, ViewMutationRecord } from '@milkdown/prose/view';
import { imageSchema } from '@milkdown/preset-commonmark';
import { $ctx, $view } from '@milkdown/utils';
import { bytesDataUrl } from '../../utils/dataUrl';

export interface ManagedImageAsset { mime: string; bytes: number[] }
export type ManagedImageReader = (path: string) => Promise<ManagedImageAsset>;
export const managedImageContext = $ctx<ManagedImageReader | null, 'flowNoteManagedImageReader'>(null, 'flowNoteManagedImageReader');

function localCandidate(src: string): boolean {
  return !!src && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(src) && !src.includes('\\');
}

class FlowNoteImageView implements NodeView {
  readonly dom = document.createElement('img');
  private current: ProseNode;
  private generation = 0;

  constructor(node: ProseNode, private readonly reader: ManagedImageReader | null) {
    this.current = node;
    this.dom.draggable = true;
    this.render();
  }

  private render(): void {
    const src = typeof this.current.attrs.src === 'string' ? this.current.attrs.src : '';
    const alt = typeof this.current.attrs.alt === 'string' ? this.current.attrs.alt : '';
    const title = typeof this.current.attrs.title === 'string' ? this.current.attrs.title : '';
    const generation = ++this.generation;
    this.dom.alt = alt;
    if (title) this.dom.title = title; else this.dom.removeAttribute('title');
    this.dom.dataset.source = src;
    this.dom.removeAttribute('data-resource-error');
    if (!this.reader || !localCandidate(src)) { this.dom.src = src; return; }
    this.dom.removeAttribute('src');
    void this.reader(src).then(asset => {
      if (generation !== this.generation || !asset.mime.startsWith('image/')) return;
      this.dom.src = bytesDataUrl(asset.mime, asset.bytes);
    }).catch(() => {
      if (generation !== this.generation) return;
      this.dom.dataset.resourceError = 'true';
      this.dom.src = src;
    });
  }

  update(node: ProseNode): boolean {
    if (node.type !== this.current.type) return false;
    this.current = node;
    this.render();
    return true;
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    return mutation.type !== 'selection';
  }

  destroy(): void { this.generation += 1; }
}

export const managedImageView = $view(imageSchema.node, ctx => {
  const reader = ctx.get(managedImageContext.key);
  return node => new FlowNoteImageView(node, reader);
});

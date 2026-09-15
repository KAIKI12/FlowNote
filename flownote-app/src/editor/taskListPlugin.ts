import type { Node as ProseNode } from '@milkdown/prose/model';
import type { EditorView, NodeView, ViewMutationRecord } from '@milkdown/prose/view';
import { listItemSchema } from '@milkdown/preset-commonmark';
import { $view } from '@milkdown/utils';

interface ListItemContext {
  node: ProseNode;
  view: EditorView;
  getPos: () => number | undefined;
}

function isTask(node: ProseNode): boolean {
  return typeof node.attrs.checked === 'boolean';
}

class ListItemView implements NodeView {
  readonly dom = document.createElement('li');
  readonly contentDOM: HTMLElement;
  private readonly checkbox: HTMLInputElement | null;
  private current: ProseNode;
  private readonly view: EditorView;
  private readonly getPos: () => number | undefined;

  constructor({ node, view, getPos }: ListItemContext) {
    this.current = node;
    this.view = view;
    this.getPos = getPos;
    this.checkbox = isTask(node) ? document.createElement('input') : null;
    this.contentDOM = this.checkbox ? document.createElement('div') : this.dom;
    if (this.checkbox) {
      this.checkbox.type = 'checkbox';
      this.checkbox.className = 'task-checkbox';
      this.checkbox.setAttribute('contenteditable', 'false');
      this.checkbox.addEventListener('change', this.toggle);
      this.contentDOM.className = 'task-content';
      this.dom.append(this.checkbox, this.contentDOM);
    }
    this.renderAttributes();
  }

  private renderAttributes(): void {
    const { label, listType, spread, checked } = this.current.attrs;
    this.dom.dataset.label = String(label);
    this.dom.dataset.listType = String(listType);
    this.dom.dataset.spread = String(spread);
    if (!this.checkbox) return;
    this.dom.dataset.itemType = 'task';
    this.dom.dataset.checked = String(checked);
    this.checkbox.checked = checked;
    this.checkbox.disabled = !this.view.editable;
    this.checkbox.setAttribute('aria-label', `完成任务：${this.current.firstChild?.textContent ?? ''}`);
  }

  private toggle = (): void => {
    const pos = this.getPos();
    if (!this.checkbox || pos === undefined || !this.view.editable || this.view.composing) {
      this.renderAttributes();
      return;
    }
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined,
      { ...this.current.attrs, checked: this.checkbox.checked }));
    this.view.focus();
  };

  update(node: ProseNode): boolean {
    if (node.type !== this.current.type || isTask(node) !== isTask(this.current)) return false;
    this.current = node;
    this.renderAttributes();
    return true;
  }

  stopEvent(event: Event): boolean {
    return event.target === this.checkbox;
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    if (mutation.type === 'selection') return false;
    return mutation.target === this.dom && mutation.type === 'attributes'
      || !this.contentDOM.contains(mutation.target);
  }

  destroy(): void {
    this.checkbox?.removeEventListener('change', this.toggle);
  }
}

export const taskListView = $view(listItemSchema.node, () =>
  (node, view, getPos) => new ListItemView({ node, view, getPos }));

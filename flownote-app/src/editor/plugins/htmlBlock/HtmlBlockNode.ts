import { $node } from '@milkdown/utils';
import { parseHtmlReference, validBlockId } from '../../../note/htmlBlockData';

/**
 * FlowNote HTML Block Node
 */
export const htmlBlockNode = $node('html_block', () => ({
  group: 'block',
  atom: true,
  isolating: true,
  attrs: {
    id: { default: '' },
    width: { default: 'normal' },
  },
  parseDOM: [
    {
      tag: 'div[data-type="html-block"]',
      getAttrs: (dom) => {
        if (typeof dom === 'string') return false;
        const element = dom as HTMLElement;
        if (!validBlockId(element.getAttribute('data-id'))) return false;
        return {
          id: element.getAttribute('data-id') || '',
          width: element.getAttribute('data-width') || 'normal',
        };
      },
    },
  ],
  toDOM: (node) => {
    const { id, width } = node.attrs;
    return [
      'div',
      {
        'data-type': 'html-block',
        'data-id': id,
        'data-width': width,
        class: `html-block-container html-block-container--${width}`,
      },
      ['div', { class: 'html-block-header' }, ['span', { class: 'html-block-label' }, 'HTML']],
      ['div', { class: 'html-block-content' }, 'HTML Block'],
    ];
  },
  parseMarkdown: {
    match: node => node.type === 'code' && node.lang === 'flownote-html' && !node.meta && !!parseHtmlReference(node.value),
    runner: (state, node, type) => {
      const id = parseHtmlReference(node.value);
      if (!id) throw new Error('Invalid FlowNote Block Reference');
      state.addNode(type, { id });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'html_block',
    runner: (state, node) => {
      if (!validBlockId(node.attrs.id)) throw new Error('Invalid FlowNote Block Reference');
      state.addNode('code', undefined, undefined, {
        lang: 'flownote-html',
        value: JSON.stringify({ id: node.attrs.id }),
      });
    },
  },
}));

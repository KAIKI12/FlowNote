import { $node } from '@milkdown/utils';

/**
 * FlowNote HTML Block Node
 */
export const htmlBlockNode = $node('html_block', () => ({
  group: 'block',
  atom: true,
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
      [
        'div',
        { class: 'html-block-header' },
        ['span', { class: 'html-block-label' }, 'HTML'],
        ['span', { class: 'html-block-id' }, id],
      ],
      [
        'div',
        { class: 'html-block-content' },
        ['div', { class: 'html-block-placeholder' }, `HTML Block: ${id}`],
      ],
    ];
  },
  parseMarkdown: {
    match: (node) => node.type === 'code' && node.lang === 'flownote-html',
    runner: (state, node, type) => {
      const value = node.value as string;
      try {
        const data = JSON.parse(value);
        state.addNode(type, {
          id: data.id || '',
          width: data.width || 'normal',
        });
      } catch (e) {
        console.error('解析 HTML Block 失败:', e);
      }
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'html_block',
    runner: (state, node) => {
      state.addNode('code', undefined, undefined, {
        lang: 'flownote-html',
        value: JSON.stringify({
          id: node.attrs.id,
          width: node.attrs.width,
        }),
      });
    },
  },
}));

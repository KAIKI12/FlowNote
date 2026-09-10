import { $node } from '@milkdown/utils';

/**
 * FlowNote HTML Block Node Schema
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
        return {
          id: element.getAttribute('data-id') || '',
          width: element.getAttribute('data-width') || 'normal',
        };
      },
    },
  ],
  toDOM: (node) => {
    return [
      'div',
      {
        'data-type': 'html-block',
        'data-id': node.attrs.id,
        'data-width': node.attrs.width,
        class: `flownote-html-block flownote-html-block--${node.attrs.width}`,
      },
      0,
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

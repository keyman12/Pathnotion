// Custom TipTap node for callouts (info / warn tone).
// Stores a `tone` attribute; renders a div.callout.callout--<tone> with the paragraph inside.

import { Node, mergeAttributes } from '@tiptap/core';

export interface CalloutAttributes {
  tone: 'info' | 'warn';
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'paragraph+',
  defining: true,

  addAttributes() {
    return {
      tone: {
        default: 'info',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-tone') || 'info',
        renderHTML: (attrs) => ({ 'data-tone': attrs.tone }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const tone = node.attrs.tone === 'warn' ? 'warn' : 'info';
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-callout': '', class: `callout callout--${tone}` }),
      0,
    ];
  },
});

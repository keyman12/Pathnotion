// Read-only passthrough node for blocks the v1 editor can't author (file, table).
// Round-trips the original JSON via an `original` attribute so saving never loses them.

import { Node, mergeAttributes } from '@tiptap/core';

export const PreservedBlock = Node.create({
  name: 'preservedBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      original: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-preserved]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    let label = 'Preserved block';
    try {
      const parsed = JSON.parse(node.attrs.original);
      if (parsed?.type === 'file') label = `File · ${parsed.name}`;
      else if (parsed?.type === 'table') label = `Table · ${parsed.columns?.join(' / ') ?? ''}`;
    } catch { /* leave default label */ }
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-preserved': '',
        class: 'doc-preserved',
        contenteditable: 'false',
      }),
      label,
    ];
  },
});

import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { Icon } from './Icon';

interface Props {
  editor: Editor | null;
  containerRef: React.RefObject<HTMLElement | null>;
}

/**
 * Small floating toolbar that appears above the table the cursor is inside.
 * Gives quick access to add-/delete-row / column and delete-table.
 */
export function TableToolbar({ editor, containerRef }: Props) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      if (!editor.isActive('table')) { setPos(null); return; }
      try {
        const view = editor.view;
        const { $from } = view.state.selection;
        // Walk up to the table node.
        let depth = $from.depth;
        while (depth > 0 && $from.node(depth).type.name !== 'table') depth--;
        if (depth < 1 || $from.node(depth).type.name !== 'table') { setPos(null); return; }
        const tablePos = $from.before(depth);
        const dom = view.nodeDOM(tablePos) as HTMLElement | null;
        if (!dom || !containerRef.current) { setPos(null); return; }
        const tableRect = dom.getBoundingClientRect();
        const container = containerRef.current;
        const containerRect = container.getBoundingClientRect();
        const style = getComputedStyle(container);
        const paddingTop = parseFloat(style.paddingTop) || 0;
        const paddingLeft = parseFloat(style.paddingLeft) || 0;
        setPos({
          top: tableRect.top - containerRect.top - paddingTop + container.scrollTop - 42,
          left: tableRect.left - containerRect.left - paddingLeft + container.scrollLeft,
        });
      } catch {
        setPos(null);
      }
    };
    update();
    editor.on('selectionUpdate', update);
    editor.on('update', update);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('update', update);
    };
  }, [editor, containerRef]);

  if (!editor || !pos) return null;

  const btn = (title: string, onClick: () => void, content: React.ReactNode) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        height: 26,
        padding: '0 8px',
        border: 0,
        borderRadius: 4,
        background: 'transparent',
        color: 'var(--fg-2)',
        fontSize: 11.5,
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-active)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {content}
    </button>
  );

  return (
    <div
      style={{
        position: 'absolute',
        top: pos.top,
        left: pos.left,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        padding: 3,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 6,
        boxShadow: '0 6px 18px rgba(0,0,0,0.28)',
        zIndex: 20,
        fontFamily: 'var(--font-primary)',
      }}
    >
      {btn('Add column after',  () => editor.chain().focus().addColumnAfter().run(),  <>+ Col</>)}
      {btn('Delete column',     () => editor.chain().focus().deleteColumn().run(),    <>− Col</>)}
      <span style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 2px' }} />
      {btn('Add row below',     () => editor.chain().focus().addRowAfter().run(),     <>+ Row</>)}
      {btn('Delete row',        () => editor.chain().focus().deleteRow().run(),       <>− Row</>)}
      <span style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 2px' }} />
      {btn('Toggle header row', () => editor.chain().focus().toggleHeaderRow().run(), <>Header row</>)}
      <span style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 2px' }} />
      {btn('Delete table', () => {
        if (confirm('Delete the whole table?')) editor.chain().focus().deleteTable().run();
      }, <span style={{ color: 'var(--danger-fg)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="close" size={11} /> Table</span>)}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';

interface Props {
  editor: Editor | null;
  containerRef: React.RefObject<HTMLElement | null>;
}

interface BlockRow {
  pos: number;
  top: number;
  height: number;
}

/**
 * A static rail of block handles, one per top-level block.
 * Each handle is draggable (move) and clickable (menu: duplicate / delete / turn into).
 */
export function BlockHandles({ editor, containerRef }: Props) {
  const [rows, setRows] = useState<BlockRow[]>([]);
  const [dropLineTop, setDropLineTop] = useState<number | null>(null);
  const [openPos, setOpenPos] = useState<number | null>(null);

  // Measure every top-level block's top/height relative to the drawer's content origin.
  useEffect(() => {
    if (!editor) return;
    const container = containerRef.current;
    if (!container) return;

    let ro: ResizeObserver | null = null;
    let measureFn: (() => void) | null = null;

    // TipTap's view + view.dom accessors both throw until the view has mounted — bind happens then.
    const tryBind = (): boolean => {
      let view;
      let editorDom: HTMLElement;
      try {
        view = editor.view;
        editorDom = view.dom as HTMLElement;
      } catch { return false; }

      const measure = () => {
        try {
          const v = editor.view;
          const crect = container.getBoundingClientRect();
          // Absolute-positioned children are placed relative to the padding edge,
          // so we strip the container's paddingTop from our measurements.
          const style = getComputedStyle(container);
          const paddingTop = parseFloat(style.paddingTop) || 0;
          const list: BlockRow[] = [];
          editor.state.doc.forEach((_node, offset) => {
            const dom = v.nodeDOM(offset) as HTMLElement | null;
            if (!dom?.getBoundingClientRect) return;
            const r = dom.getBoundingClientRect();
            list.push({
              pos: offset,
              top: r.top - crect.top - paddingTop + container.scrollTop,
              height: r.height,
            });
          });
          setRows(list);
        } catch { /* transient — ignore */ }
      };

      measure();
      editor.on('update', measure);
      ro = new ResizeObserver(() => measure());
      ro.observe(container);
      ro.observe(editorDom);
      measureFn = measure;
      return true;
    };

    if (tryBind()) {
      return () => {
        if (measureFn) editor.off('update', measureFn);
        ro?.disconnect();
      };
    }

    // View not ready yet — bind when it mounts.
    const onCreate = () => { tryBind(); };
    editor.on('create', onCreate);
    return () => {
      editor.off('create', onCreate);
      if (measureFn) editor.off('update', measureFn);
      ro?.disconnect();
    };
  }, [editor, containerRef]);

  // Close the open menu when clicking elsewhere.
  useEffect(() => {
    if (openPos == null) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-block-menu]') && !t.closest('[data-block-handle]')) {
        setOpenPos(null);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [openPos]);

  const dropLine = dropLineTop !== null ? (
    <div
      style={{
        position: 'absolute',
        top: dropLineTop - 1,
        left: 16,
        right: 16,
        height: 2,
        background: 'var(--path-primary)',
        borderRadius: 1,
        zIndex: 9,
        pointerEvents: 'none',
      }}
    />
  ) : null;

  if (!editor) return null;

  return (
    <>
      {rows.map((row) => (
        <SingleHandle
          key={row.pos}
          editor={editor}
          containerRef={containerRef}
          row={row}
          isMenuOpen={openPos === row.pos}
          onMenuToggle={() => setOpenPos((v) => (v === row.pos ? null : row.pos))}
          onMenuClose={() => setOpenPos(null)}
          onDropLine={setDropLineTop}
        />
      ))}
      {dropLine}
    </>
  );
}

// Keep a legacy alias so any previous import still works during refactor.
export const BlockHandle = BlockHandles;

// ─── Single handle per block ───────────────────────────────────────────────

interface SingleProps {
  editor: Editor;
  containerRef: React.RefObject<HTMLElement | null>;
  row: BlockRow;
  isMenuOpen: boolean;
  onMenuToggle: () => void;
  onMenuClose: () => void;
  onDropLine: (top: number | null) => void;
}

function SingleHandle({ editor, containerRef, row, isMenuOpen, onMenuToggle, onMenuClose, onDropLine }: SingleProps) {
  const dragRef = useRef<{
    startX: number;
    startY: number;
    active: boolean;
    dropPos: number | null;
  } | null>(null);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);

  const runTurnInto = (type: 'p' | 'h1' | 'h2' | 'h3' | 'ul' | 'ol' | 'todo' | 'quote') => {
    const tr = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, row.pos));
    editor.view.dispatch(tr);
    const chain = editor.chain().focus();
    if (type === 'p')         chain.setParagraph().run();
    else if (type === 'h1')   chain.setHeading({ level: 1 }).run();
    else if (type === 'h2')   chain.setHeading({ level: 2 }).run();
    else if (type === 'h3')   chain.setHeading({ level: 3 }).run();
    else if (type === 'ul')   chain.toggleBulletList().run();
    else if (type === 'ol')   chain.toggleOrderedList().run();
    else if (type === 'todo') chain.toggleTaskList().run();
    else if (type === 'quote') chain.toggleBlockquote().run();
    onMenuClose();
  };

  const doBlockAction = (cmd: 'move-up' | 'move-down' | 'duplicate' | 'delete') => {
    const { state, view } = editor;
    const node = state.doc.nodeAt(row.pos);
    if (!node) return;
    const size = node.nodeSize;
    if (cmd === 'delete') {
      view.dispatch(state.tr.delete(row.pos, row.pos + size));
    } else if (cmd === 'duplicate') {
      view.dispatch(state.tr.insert(row.pos + size, node.copy(node.content)));
    } else {
      const $pos = state.doc.resolve(row.pos);
      const index = $pos.index(0);
      const parent = state.doc;
      if (cmd === 'move-up') {
        if (index === 0) { onMenuClose(); return; }
        let prevStart = 0;
        for (let i = 0; i < index - 1; i++) prevStart += parent.child(i).nodeSize;
        view.dispatch(state.tr.delete(row.pos, row.pos + size).insert(prevStart, node.copy(node.content)));
      } else {
        if (index === parent.childCount - 1) { onMenuClose(); return; }
        const next = parent.child(index + 1);
        view.dispatch(state.tr.delete(row.pos, row.pos + size).insert(row.pos + next.nodeSize, node.copy(node.content)));
      }
    }
    editor.commands.focus();
    onMenuClose();
  };

  return (
    <div
      data-block-handle
      style={{
        position: 'absolute',
        top: row.top + 2,
        left: -2,
        transform: 'translateX(-100%)',
        height: 22,
        display: 'flex',
        alignItems: 'center',
        zIndex: 10,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        title="Drag to move · click for options"
        aria-label="Block actions"
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            active: false,
            dropPos: null,
          };
          e.preventDefault();

          const onMove = (me: MouseEvent) => {
            const d = dragRef.current;
            if (!d) return;
            const dx = me.clientX - d.startX;
            const dy = me.clientY - d.startY;
            if (!d.active) {
              if (dx * dx + dy * dy < 16) return;
              d.active = true;
              setDragging(true);
              onMenuClose();
            }
            try {
              const view = editor.view;
              const editorRect = (view.dom as HTMLElement).getBoundingClientRect();
              const probeX = Math.max(editorRect.left + 8, Math.min(me.clientX, editorRect.right - 8));
              const probeY = Math.max(editorRect.top + 2, Math.min(me.clientY, editorRect.bottom - 2));
              const hit = view.posAtCoords({ left: probeX, top: probeY });
              if (!hit) return;
              const $pos = view.state.doc.resolve(hit.pos);
              if ($pos.depth < 1) return;
              const blockPos = $pos.before(1);
              const blockNode = view.state.doc.nodeAt(blockPos);
              if (!blockNode) return;
              const dom = view.nodeDOM(blockPos) as HTMLElement | null;
              if (!dom) return;
              const rect = dom.getBoundingClientRect();
              const below = me.clientY > rect.top + rect.height / 2;
              const container = containerRef.current;
              if (!container) return;
              const crect = container.getBoundingClientRect();
              const paddingTop = parseFloat(getComputedStyle(container).paddingTop) || 0;
              d.dropPos = below ? blockPos + blockNode.nodeSize : blockPos;
              const lineClientY = below ? rect.bottom : rect.top;
              onDropLine(lineClientY - crect.top - paddingTop + container.scrollTop);
            } catch { /* ignore */ }
          };

          const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            const d = dragRef.current;
            dragRef.current = null;
            onDropLine(null);
            setDragging(false);
            if (!d) return;
            if (!d.active) {
              // Pure click — toggle the menu for THIS block.
              onMenuToggle();
              return;
            }
            if (d.dropPos == null) return;
            const view = editor.view;
            const state = view.state;
            const node = state.doc.nodeAt(row.pos);
            if (!node) return;
            const size = node.nodeSize;
            if (d.dropPos >= row.pos && d.dropPos <= row.pos + size) return;
            let dropPos = d.dropPos;
            if (dropPos > row.pos + size) dropPos -= size;
            view.dispatch(state.tr.delete(row.pos, row.pos + size).insert(dropPos, node));
          };

          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 18,
          height: 22,
          marginRight: 6,
          padding: 0,
          border: 0,
          borderRadius: 4,
          background: isMenuOpen ? 'var(--bg-active)' : 'transparent',
          color: 'var(--fg-4)',
          cursor: dragging ? 'grabbing' : 'grab',
          opacity: hovered || isMenuOpen || dragging ? 1 : 0.35,
          transition: 'opacity 120ms ease',
        }}
      >
        <DragDots />
      </button>
      {isMenuOpen && (
        <div
          data-block-menu
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            minWidth: 220,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 6,
            boxShadow: '0 10px 32px rgba(0,0,0,0.35)',
            padding: 4,
            zIndex: 100,
          }}
        >
          <MenuRow label="Move up"   hint="⌥↑" onClick={() => doBlockAction('move-up')} />
          <MenuRow label="Move down" hint="⌥↓" onClick={() => doBlockAction('move-down')} />
          <MenuRow label="Duplicate"            onClick={() => doBlockAction('duplicate')} />
          <MenuRow label="Delete"    hint="⌫"  onClick={() => doBlockAction('delete')} />
          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 2px' }} />
          <div className="mono" style={{ fontSize: 10, color: 'var(--fg-4)', padding: '4px 8px' }}>TURN INTO</div>
          <MenuRow label="Text"          onClick={() => runTurnInto('p')} />
          <MenuRow label="Heading 1"     onClick={() => runTurnInto('h1')} />
          <MenuRow label="Heading 2"     onClick={() => runTurnInto('h2')} />
          <MenuRow label="Heading 3"     onClick={() => runTurnInto('h3')} />
          <MenuRow label="Bulleted list" onClick={() => runTurnInto('ul')} />
          <MenuRow label="Numbered list" onClick={() => runTurnInto('ol')} />
          <MenuRow label="To-do list"    onClick={() => runTurnInto('todo')} />
          <MenuRow label="Quote"         onClick={() => runTurnInto('quote')} />
        </div>
      )}
    </div>
  );
}

function MenuRow({ label, hint, onClick }: { label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        width: '100%',
        padding: '6px 10px',
        border: 0,
        borderRadius: 4,
        background: 'transparent',
        color: 'var(--fg-1)',
        fontSize: 12.5,
        cursor: 'pointer',
        textAlign: 'left',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-active)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span>{label}</span>
      {hint && <span className="mono" style={{ fontSize: 10, color: 'var(--fg-4)' }}>{hint}</span>}
    </button>
  );
}

function DragDots() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
      <circle cx="2" cy="3" r="1.3" />
      <circle cx="8" cy="3" r="1.3" />
      <circle cx="2" cy="8" r="1.3" />
      <circle cx="8" cy="8" r="1.3" />
      <circle cx="2" cy="13" r="1.3" />
      <circle cx="8" cy="13" r="1.3" />
    </svg>
  );
}

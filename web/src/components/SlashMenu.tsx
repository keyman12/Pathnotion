import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';

export type SlashCommand =
  | 'p' | 'h1' | 'h2' | 'h3' | 'ul' | 'ol' | 'todo' | 'quote' | 'code' | 'divider' | 'callout-info' | 'callout-warn' | 'table';

interface Entry {
  id: SlashCommand;
  label: string;
  hint: string;
  icon: React.ReactNode;
  keywords: string;
}

const ENTRIES: Entry[] = [
  { id: 'p',       label: 'Text',           hint: 'Plain paragraph',       icon: <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg-3)' }}>¶</span>,                        keywords: 'text paragraph p' },
  { id: 'h1',      label: 'Heading 1',      hint: 'Big section title',     icon: <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-2)' }}>H1</span>,                                       keywords: 'heading h1 title big' },
  { id: 'h2',      label: 'Heading 2',      hint: 'Section title',         icon: <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-2)' }}>H2</span>,                                       keywords: 'heading h2 subtitle' },
  { id: 'h3',      label: 'Heading 3',      hint: 'Sub-section',           icon: <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-2)' }}>H3</span>,                                       keywords: 'heading h3' },
  { id: 'ul',      label: 'Bulleted list',  hint: 'Dots',                  icon: <Icon name="list" size={14} />,                                                                                         keywords: 'bullet list ul unordered' },
  { id: 'ol',      label: 'Numbered list',  hint: '1, 2, 3',               icon: <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg-3)' }}>1.</span>,                        keywords: 'numbered ordered list ol' },
  { id: 'todo',    label: 'To-do list',     hint: 'Checkable items',       icon: <Icon name="check" size={12} />,                                                                                        keywords: 'todo checkbox task list tick check' },
  { id: 'quote',   label: 'Quote',          hint: 'Set apart',             icon: <span style={{ fontSize: 14, color: 'var(--fg-3)' }}>❝</span>,                                                          keywords: 'quote blockquote' },
  { id: 'code',    label: 'Code block',     hint: 'Monospace, no markup',  icon: <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{'</>'}</span>,                                  keywords: 'code monospace' },
  { id: 'divider', label: 'Divider',        hint: 'Horizontal line',       icon: <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>—</span>,                                                          keywords: 'divider separator hr line' },
  { id: 'table',   label: 'Table',          hint: '3 × 3 grid',             icon: <Icon name="table" size={13} />,                                                                                        keywords: 'table grid rows columns' },
  { id: 'callout-info', label: 'Callout',     hint: 'Highlighted note',   icon: <Icon name="sparkle" size={13} color="var(--fg-3)" />,                                                                  keywords: 'callout info note highlight' },
  { id: 'callout-warn', label: 'Warning callout', hint: 'Attention please', icon: <Icon name="flag" size={13} color="var(--warn-fg)" />,                                                                 keywords: 'callout warn warning attention caution' },
];

interface Props {
  position: { top: number; left: number };
  onPick: (cmd: SlashCommand) => void;
  onClose: () => void;
}

export function SlashMenu({ position, onPick, onClose }: Props) {
  const [selected, setSelected] = useState(0);
  // In v1, the trigger is always an empty paragraph with just "/" — no query yet.
  const filtered = useMemo(() => ENTRIES, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => (s + 1) % filtered.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => (s - 1 + filtered.length) % filtered.length); }
      else if (e.key === 'Enter') { e.preventDefault(); onPick(filtered[selected].id); }
      else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [filtered, selected, onPick, onClose]);

  // Click-away closes.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-slash-menu]')) onClose();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [onClose]);

  return (
    <div
      data-slash-menu
      style={{
        position: 'fixed',
        top: Math.min(position.top, window.innerHeight - 320),
        left: Math.min(position.left, window.innerWidth - 280),
        width: 260,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        boxShadow: '0 10px 32px rgba(0,0,0,0.35)',
        zIndex: 80,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Insert block</span>
      </div>
      <div style={{ maxHeight: 280, overflow: 'auto', padding: 4 }}>
        {filtered.map((e, i) => (
          <button
            key={e.id}
            type="button"
            onMouseDown={(ev) => { ev.preventDefault(); onPick(e.id); }}
            onMouseEnter={() => setSelected(i)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: '6px 8px',
              border: 0,
              borderRadius: 6,
              background: selected === i ? 'var(--bg-active)' : 'transparent',
              color: 'var(--fg-1)',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <span style={{
              width: 28, height: 28, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--border-subtle)', borderRadius: 6,
            }}>{e.icon}</span>
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{e.label}</span>
              <span style={{ fontSize: 10.5, color: 'var(--fg-3)' }}>{e.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

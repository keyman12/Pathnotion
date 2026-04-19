import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export interface DropdownOption<V extends string | number = string> {
  value: V;
  label: string;
}

interface Props<V extends string | number> {
  value: V;
  onChange: (v: V) => void;
  options: DropdownOption<V>[];
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
  /** Render the selected value differently if desired */
  renderValue?: (opt: DropdownOption<V> | null) => React.ReactNode;
  /** Render each option differently if desired */
  renderOption?: (opt: DropdownOption<V>, selected: boolean) => React.ReactNode;
  ariaLabel?: string;
}

/**
 * Theme-aware dropdown that replaces <select>. Native <option> ignores most
 * CSS in Chromium/macOS, so dark-mode popups were rendering white. This
 * component uses a styled button + absolute-positioned list, so both the
 * closed and open states follow --bg-surface / --fg-1.
 */
export function Dropdown<V extends string | number>({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  style,
  className,
  renderValue,
  renderOption,
  ariaLabel,
}: Props<V>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={className} style={{ position: 'relative', ...style }}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          height: 34,
          padding: '0 10px',
          background: 'var(--bg-surface)',
          color: 'var(--fg-1)',
          border: '1px solid var(--border-default)',
          borderRadius: 6,
          fontSize: 13,
          fontFamily: 'inherit',
          cursor: disabled ? 'not-allowed' : 'pointer',
          textAlign: 'left',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {renderValue ? renderValue(selected) : (selected?.label ?? <span style={{ color: 'var(--fg-4)' }}>{placeholder ?? '—'}</span>)}
        </span>
        <Icon name="chevron-down" size={12} color="var(--fg-3)" />
      </button>

      {open && (
        <ul
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 50,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 6,
            boxShadow: 'var(--shadow-3)',
            listStyle: 'none',
            margin: 0,
            padding: 4,
            maxHeight: 260,
            overflowY: 'auto',
          }}
        >
          {options.map((o) => {
            const isSelected = o.value === value;
            return (
              <li
                key={String(o.value)}
                role="option"
                aria-selected={isSelected}
                onClick={() => { onChange(o.value); setOpen(false); buttonRef.current?.focus(); }}
                className="row-hover"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 4,
                  fontSize: 13,
                  color: 'var(--fg-1)',
                  background: isSelected ? 'var(--path-primary-tint)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {renderOption ? renderOption(o, isSelected) : o.label}
                </span>
                {isSelected && <Icon name="check" size={12} color="var(--path-primary)" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

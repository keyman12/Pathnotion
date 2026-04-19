import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { FOUNDERS, PRODUCTS } from '../lib/seed';
import type { BacklogItem, FounderKey, Stage } from '../lib/types';
import { Icon } from './Icon';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  as?: any;
  draggable?: boolean;
};

export function Card({ children, style, className, as: As = 'div', ...rest }: CardProps) {
  return (
    <As
      className={className}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--dens-card-pad)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </As>
  );
}

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  style?: CSSProperties;
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
}

export function Button({ children, onClick, variant = 'ghost', size = 'md', icon, style, disabled, type = 'button', title }: ButtonProps) {
  const pad = size === 'sm' ? '6px 10px' : size === 'lg' ? '10px 16px' : '8px 12px';
  const fs = size === 'sm' ? 12 : size === 'lg' ? 14 : 13;

  let bg = 'transparent';
  let color = 'var(--fg-1)';
  let border = '1px solid transparent';

  if (variant === 'primary') {
    bg = 'var(--path-primary)';
    color = 'var(--fg-on-primary)';
  } else if (variant === 'danger') {
    bg = 'var(--danger-bg)';
    color = 'var(--danger-fg)';
  } else if (variant === 'outline') {
    bg = 'var(--bg-surface)';
    border = '1px solid var(--border-default)';
    color = 'var(--fg-1)';
  } else {
    color = 'var(--fg-2)';
  }

  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: pad,
        background: bg,
        color,
        border,
        borderRadius: 'var(--radius-sm)',
        fontSize: fs,
        fontWeight: 500,
        lineHeight: 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        whiteSpace: 'nowrap',
        transition: 'background 120ms ease, color 120ms ease, border-color 120ms ease',
        ...style,
      }}
      onMouseDown={(e) => e.currentTarget.style.transform = 'translateY(0.5px)'}
      onMouseUp={(e) => e.currentTarget.style.transform = ''}
      onMouseLeave={(e) => { e.currentTarget.style.transform = ''; if (variant === 'ghost') e.currentTarget.style.background = 'transparent'; }}
      onMouseEnter={(e) => { if (variant === 'ghost') e.currentTarget.style.background = 'var(--bg-hover)'; }}
    >
      {icon}
      {children}
    </button>
  );
}

export function Badge({ children, tone = 'neutral', style }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand'; style?: CSSProperties }) {
  const map: Record<string, { bg: string; fg: string }> = {
    neutral: { bg: 'var(--bg-hover)', fg: 'var(--fg-2)' },
    success: { bg: 'var(--success-bg)', fg: 'var(--success-fg)' },
    warning: { bg: 'var(--warning-bg)', fg: 'var(--warning-fg)' },
    danger: { bg: 'var(--danger-bg)', fg: 'var(--danger-fg)' },
    info: { bg: 'var(--info-bg)', fg: 'var(--info-fg)' },
    brand: { bg: 'var(--success-bg)', fg: 'var(--path-primary)' },
  };
  const c = map[tone];
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '2px 8px',
      borderRadius: 'var(--radius-pill)',
      background: c.bg,
      color: c.fg,
      fontSize: 11,
      fontWeight: 500,
      letterSpacing: 0.1,
      lineHeight: 1.6,
      ...style,
    }}>{children}</span>
  );
}

export function Dot({ color, size = 8, square = true }: { color: string; size?: number; square?: boolean }) {
  return <span style={{ display: 'inline-block', width: size, height: size, borderRadius: square ? 2 : '50%', background: color, flex: '0 0 auto' }} />;
}

export function Avatar({ who, size = 24, style, className }: { who: FounderKey | 'J' | 'A'; size?: number; style?: CSSProperties; className?: string }) {
  const themeClass = who === 'D' ? 'av-dave' : who === 'R' ? 'av-raj' : 'av-agent';
  const label = who === 'J' || who === 'A' ? 'Jeff' : who;
  const isWord = label.length > 1;
  return (
    <span className={`avatar ${themeClass} ${className ?? ''}`}
      title={who === 'J' || who === 'A' ? 'Jeff' : FOUNDERS[who as FounderKey]?.name}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        fontSize: isWord ? Math.max(9, size * 0.34) : size * 0.42,
        fontWeight: isWord ? 500 : 600,
        letterSpacing: isWord ? 0 : 0.2,
        flex: '0 0 auto',
        ...style,
      }}>{label}</span>
  );
}

type ChipKey = Stage | 'overdue' | 'due-soon';

export function StageChip({ stage, label }: { stage: ChipKey; label?: string }) {
  const cls = stage === 'due-soon' ? 'chip chip-due' : `chip chip-${stage}`;
  const text = label ?? (stage === 'now' ? 'Now' : stage === 'next' ? 'Next' : stage === 'later' ? 'Later' : stage === 'overdue' ? 'Overdue' : 'Due soon');
  return <span className={cls}>{text}</span>;
}

export function ProductTag({ id, label, color }: { id: string; label: string; color: string }) {
  return (
    <span title={id} style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 11.5,
      color: 'var(--fg-2)',
      fontWeight: 500,
    }}>
      <Dot color={color} />
      {label}
    </span>
  );
}

export function Tile({ children, onClick, style }: { children: ReactNode; onClick?: () => void; style?: CSSProperties }) {
  return (
    <Card
      onClick={onClick}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minHeight: 110,
        transition: 'background 120ms ease',
        ...style,
      }}
    >
      {children}
    </Card>
  );
}

export function MetaLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span className="mono" style={{
      fontSize: 10.5,
      fontWeight: 500,
      color: 'var(--fg-3)',
      letterSpacing: 0.08 + 'em',
      textTransform: 'uppercase',
      ...style,
    }}>{children}</span>
  );
}

export function HeadlineCard({ label, value, foot, tone = 'default', onClick }: { label: string; value: string | number; foot: string; tone?: 'default' | 'warn' | 'accent'; onClick?: () => void }) {
  const color = tone === 'warn' ? 'var(--danger-fg)' : tone === 'accent' ? 'var(--path-primary)' : 'var(--fg-1)';
  return (
    <div onClick={onClick} style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 8,
      padding: '16px 18px',
      cursor: onClick ? 'pointer' : 'default',
    }}>
      <div className="meta" style={{ fontSize: 10, marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 34, fontWeight: 600, color, lineHeight: 1, fontFamily: 'var(--font-primary)', letterSpacing: '-0.01em' }}>{value}</div>
      <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginTop: 10 }}>{foot}</div>
    </div>
  );
}

export function BacklogRow({ item, onClick }: { item: BacklogItem; onClick?: () => void }) {
  const p = PRODUCTS.find((x) => x.id === item.product);
  const stage: ChipKey = item.flag ?? item.stage;
  return (
    <div onClick={onClick} className="row-hover" style={{
      position: 'relative',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '10px 12px 10px 18px',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 6,
      cursor: 'pointer',
    }}>
      {p && (
        <span style={{
          position: 'absolute', left: 0, top: 6, bottom: 6,
          width: 3, background: p.color, borderRadius: '0 3px 3px 0',
        }} />
      )}
      <Icon name="drag" size={14} color="var(--border-default)" style={{ marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 10, color: 'var(--fg-4)', letterSpacing: '0.02em' }}>{item.id}</span>
          {p && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: p.color, fontWeight: 500 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.color }} />
              {p.label}
            </span>
          )}
          {item.due && (
            <span className="mono" style={{
              fontSize: 10,
              color: item.flag === 'overdue' ? 'var(--danger-fg)' : 'var(--fg-4)',
            }}>· {item.due}{item.age ? ` · ${item.age}` : ''}</span>
          )}
        </div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-1)', lineHeight: 1.35 }}>{item.title}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <StageChip stage={stage} />
        <Avatar who={item.owner} size={22} />
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: string; count?: number }[] }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', gap: 16 }}>
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button key={t.id} onClick={() => onChange(t.id)}
            style={{
              padding: '10px 2px',
              marginBottom: -1,
              color: active ? 'var(--fg-1)' : 'var(--fg-3)',
              borderBottom: `2px solid ${active ? 'var(--path-primary)' : 'transparent'}`,
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}>
            {t.label}
            {typeof t.count === 'number' && <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

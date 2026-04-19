import type { ReactNode } from 'react';

export interface PageTab<T extends string = string> {
  id: T;
  label: string;
  count?: number;
}

interface Props<T extends string = string> {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  right?: ReactNode;
  tabs?: ReactNode | PageTab<T>[];
  activeTab?: T;
  onTab?: (id: T) => void;
}

export function PageHeader<T extends string = string>({ title, sub, actions, right, tabs, activeTab, onTab }: Props<T>) {
  const tabNode = Array.isArray(tabs)
    ? <Tabs value={activeTab} onChange={onTab} tabs={tabs} />
    : tabs;
  return (
    <>
      <div className="page-header">
        <div className="page-header__titleblock">
          <h1>{title}</h1>
          {sub && <div className="page-header__sub">{sub}</div>}
        </div>
        {(right || actions) && <div className="page-header__actions">{right ?? actions}</div>}
      </div>
      {tabNode && <div style={{ marginBottom: 20, marginTop: -8 }}>{tabNode}</div>}
    </>
  );
}

function Tabs<T extends string>({ value, onChange, tabs }: { value?: T; onChange?: (v: T) => void; tabs: PageTab<T>[] }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', gap: 16 }}>
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button key={t.id} onClick={() => onChange?.(t.id)}
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
            {typeof t.count === 'number' && <span className="meta" style={{ fontSize: 10 }}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

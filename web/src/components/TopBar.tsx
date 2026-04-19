import { useState } from 'react';
import { useUI } from '../lib/store';
import type { Route } from '../lib/types';
import { Button } from './primitives';
import { Icon } from './Icon';
import { PRODUCTS } from '../lib/seed';
import { useLogout, useSession } from '../lib/useSession';

const TITLE: Record<string, string> = {
  week: 'This Week',
  backlog: 'Backlog',
  docs: 'Documentation',
  tasks: 'Tasks',
  calendar: 'Calendar',
  jeff: 'Jeff',
  settings: 'Settings',
  'finance-docs': 'Finance',
  'sales-docs': 'Sales',
  'legal-docs': 'Legal',
};

export function titleFor(route: Route): string {
  if (route.startsWith('product:')) {
    const id = route.slice('product:'.length);
    const p = PRODUCTS.find((x) => x.id === id);
    return p ? p.label : 'Product';
  }
  return TITLE[route] ?? route;
}

export function TopBar({ now }: { now: Date }) {
  const route = useUI((s) => s.route);
  const navigate = useUI((s) => s.navigate);
  const theme = useUI((s) => s.theme);
  const setTheme = useUI((s) => s.setTheme);
  const session = useSession();
  const logout = useLogout();
  const [menuOpen, setMenuOpen] = useState(false);

  const d = now.toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'Europe/London' }).toUpperCase();
  const t = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/London' }) + ' GMT';

  const user = session.data;

  return (
    <header className="topbar">
      <div className="breadcrumb">
        <span className="breadcrumb__root">Workspace</span>
        <Icon name="chevron-right" size={14} color="var(--grey-300)" />
        <span className="breadcrumb__leaf">{titleFor(route)}</span>
      </div>
      <div className="topbar__right">
        <span className="topbar__clock mono">{d.replace(',', '')} · {t}</span>
        <Button variant="ghost" size="sm" icon={<Icon name="plus" size={14} />}>
          New
        </Button>
        <button className="topbar__icon" title="Toggle theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          <Icon name="eye" size={16} color="var(--fg-2)" />
        </button>
        <button className="topbar__icon" title="Notifications">
          <Icon name="bell" size={16} color="var(--fg-2)" />
        </button>
        {user && (
          <div style={{ position: 'relative' }}>
            <button
              className="topbar__icon"
              title={user.displayName}
              onClick={() => setMenuOpen((v) => !v)}
              style={{ width: 'auto', padding: '0 8px 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 26, height: 26,
                borderRadius: '50%',
                background: user.color ?? 'var(--bg-sunken)',
                color: '#fff',
                fontSize: 11.5, fontWeight: 600,
              }}>{user.key}</span>
              <Icon name="chevron-down" size={12} color="var(--fg-3)" />
            </button>
            {menuOpen && (
              <>
                <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: 220,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8,
                  boxShadow: 'var(--shadow-3)',
                  padding: 6,
                  zIndex: 50,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}>
                  <div style={{ padding: '8px 10px' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-1)' }}>{user.displayName}</div>
                    <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-4)' }}>@{user.username} · {user.role}</div>
                  </div>
                  <div style={{ height: 1, background: 'var(--border-subtle)', margin: '2px 0' }} />
                  <MenuItem onClick={() => { setMenuOpen(false); navigate('settings'); }} icon="settings">Settings</MenuItem>
                  <MenuItem onClick={() => { setMenuOpen(false); logout.mutate(); }} icon="arrow-up-right">Sign out</MenuItem>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

function MenuItem({ icon, onClick, children }: { icon: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="row-hover"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 5,
        fontSize: 13,
        color: 'var(--fg-2)',
        textAlign: 'left',
        background: 'transparent',
        border: 0,
        cursor: 'pointer',
        width: '100%',
      }}
    >
      <Icon name={icon as any} size={14} color="var(--fg-3)" />
      {children}
    </button>
  );
}

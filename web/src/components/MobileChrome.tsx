import { useMemo, useState } from 'react';
import { useUI } from '../lib/store';
import { Icon, type IconName } from './Icon';
import { PRODUCTS, PRODUCT_DOCS } from '../lib/seed';
import { Dot, MetaLabel } from './primitives';
import { titleFor } from './TopBar';
import type { Route } from '../lib/types';
import { useBacklog, useCalendar, useSalesOpportunities, useTasks } from '../lib/queries';

const TABS: { route: Route; label: string; icon: IconName }[] = [
  { route: 'week', label: 'Week', icon: 'week' },
  { route: 'backlog', label: 'Backlog', icon: 'backlog' },
  { route: 'docs', label: 'Docs', icon: 'docs' },
  { route: 'jeff', label: 'Jeff', icon: 'agent' },
];

export function MobileTopbar() {
  const route = useUI((s) => s.route);
  const openSearch = useUI((s) => s.openSearch);
  const openMenu = useUI((s) => s.openMobileMenu);
  return (
    <header className="m-topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <img src="/logo-light.png" alt="Path" style={{ width: 22, height: 22, borderRadius: 4 }} />
        <span style={{ fontSize: 14, fontWeight: 600 }}>{titleFor(route)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button className="m-iconbtn" onClick={openSearch} aria-label="Search">
          <Icon name="search" size={18} color="var(--fg-2)" />
        </button>
        <button className="m-iconbtn" onClick={openMenu} aria-label="Menu">
          <Icon name="more" size={18} color="var(--fg-2)" />
        </button>
      </div>
    </header>
  );
}

export function BottomTabs() {
  const route = useUI((s) => s.route);
  const navigate = useUI((s) => s.navigate);
  const isTab = (r: Route) =>
    route === r || (r === 'backlog' && route.startsWith('product:')) || (r === 'docs' && route === 'finance-docs');
  return (
    <nav className="m-tabs">
      {TABS.map((t) => {
        const active = isTab(t.route);
        return (
          <button key={t.route} className={`m-tab ${active ? 'is-active' : ''}`} onClick={() => navigate(t.route)}>
            <Icon name={t.icon} size={20} color={active ? 'var(--path-primary)' : 'var(--fg-3)'} />
            <span>{t.label}</span>
          </button>
        );
      })}
      <button className={`m-tab ${route === 'calendar' || route === 'tasks' ? 'is-active' : ''}`} onClick={() => useUI.getState().openMobileMenu()}>
        <Icon name="more" size={20} color="var(--fg-3)" />
        <span>More</span>
      </button>
    </nav>
  );
}

export function MobileMenu() {
  const open = useUI((s) => s.mobileMenuOpen);
  const close = useUI((s) => s.closeMobileMenu);
  const route = useUI((s) => s.route);
  const navigate = useUI((s) => s.navigate);
  const theme = useUI((s) => s.theme);
  const setTheme = useUI((s) => s.setTheme);
  if (!open) return null;
  return (
    <div className="m-drawer-backdrop" onClick={close}>
      <aside className="m-drawer" onClick={(e) => e.stopPropagation()}>
        <header className="m-drawer__head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/logo-light.png" alt="" style={{ width: 20, height: 20, borderRadius: 4 }} />
            <strong style={{ fontSize: 14 }}>Path</strong>
          </div>
          <button className="m-iconbtn" onClick={close}><Icon name="close" size={16} /></button>
        </header>
        <div className="m-drawer__section">
          <MetaLabel>Workspace</MetaLabel>
          {[
            { r: 'week' as Route, label: 'Today', icon: 'week' as IconName },
            { r: 'sales' as Route, label: 'Sales', icon: 'money' as IconName },
            { r: 'backlog' as Route, label: 'Backlog', icon: 'backlog' as IconName },
            { r: 'docs' as Route, label: 'Documentation', icon: 'docs' as IconName },
            { r: 'tasks' as Route, label: 'Tasks', icon: 'tasks' as IconName },
            { r: 'calendar' as Route, label: 'Calendar', icon: 'calendar' as IconName },
            { r: 'jeff' as Route, label: 'Jeff', icon: 'agent' as IconName },
          ].map((x) => (
            <button key={x.r} className={`m-drawer__row ${route === x.r ? 'is-active' : ''}`} onClick={() => { navigate(x.r); close(); }}>
              <Icon name={x.icon} size={16} />
              <span>{x.label}</span>
            </button>
          ))}
        </div>
        <div className="m-drawer__section">
          <MetaLabel>Products</MetaLabel>
          {PRODUCTS.map((p) => (
            <button key={p.id} className="m-drawer__row" onClick={() => { navigate(`product:${p.id}`); close(); }}>
              <Dot color={p.color} />
              <span>{p.label}</span>
            </button>
          ))}
        </div>
        <div className="m-drawer__section">
          <MetaLabel>Business</MetaLabel>
          {[
            { r: 'finance-docs' as Route, label: 'Finance', icon: 'money' as IconName },
            { r: 'legal-docs' as Route, label: 'Legal', icon: 'docs' as IconName },
          ].map((x) => (
            <button key={x.r} className={`m-drawer__row ${route === x.r ? 'is-active' : ''}`} onClick={() => { navigate(x.r); close(); }}>
              <Icon name={x.icon} size={16} />
              <span>{x.label}</span>
            </button>
          ))}
        </div>
        <div className="m-drawer__section">
          <MetaLabel>Settings</MetaLabel>
          <button className="m-drawer__row" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            <Icon name="eye" size={16} />
            <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
        </div>
      </aside>
    </div>
  );
}

export function SearchSheet() {
  const open = useUI((s) => s.searchOpen);
  const close = useUI((s) => s.closeSearch);
  const navigate = useUI((s) => s.navigate);
  const [query, setQuery] = useState('');
  const backlogQ = useBacklog();
  const tasksQ = useTasks();
  const salesQ = useSalesOpportunities();
  const calendarQ = useCalendar();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const includes = (...values: Array<unknown>) => values.filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    const rows: Array<{ id: string; label: string; meta: string; route: Route; focus?: string | null }> = [];
    for (const item of backlogQ.data ?? []) {
      if (includes(item.id, item.title, item.product, item.stage, item.owner)) {
        rows.push({ id: `backlog-${item.id}`, label: item.title, meta: `Backlog · ${item.id}`, route: 'backlog', focus: item.id });
      }
    }
    for (const task of tasksQ.data ?? []) {
      if (includes(task.id, task.title, task.owner, task.due, task.priority)) {
        rows.push({ id: `task-${task.id}`, label: task.title, meta: `Task · ${task.due}`, route: 'tasks' });
      }
    }
    for (const opp of salesQ.data ?? []) {
      if (includes(opp.id, opp.name, opp.accountName, opp.contactName, opp.contactEmail, opp.contactPhone, opp.website, opp.nextAction)) {
        rows.push({ id: `sales-${opp.id}`, label: opp.accountName, meta: `Sales · ${opp.id} · ${opp.name}`, route: 'sales' });
      }
    }
    for (const event of calendarQ.data ?? []) {
      if (includes(event.title, event.location, event.description, event.who)) {
        rows.push({ id: `calendar-${event.id ?? event.title}`, label: event.title, meta: 'Calendar', route: 'calendar' });
      }
    }
    for (const doc of PRODUCT_DOCS) {
      if (includes(doc.id, doc.title, doc.product, doc.group, doc.tags.join(' '))) {
        rows.push({ id: `doc-${doc.id}`, label: doc.title, meta: `Documentation · ${doc.product ?? 'workspace'}`, route: 'docs' });
      }
    }
    return rows.slice(0, 12);
  }, [backlogQ.data, calendarQ.data, query, salesQ.data, tasksQ.data]);

  if (!open) return null;
  return (
    <div className="m-drawer-backdrop" onClick={close}>
      <div className="m-sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
          <Icon name="search" size={16} color="var(--fg-3)" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sales, backlog, docs, tasks, calendar…" style={{
            flex: 1, background: 'transparent', border: 0, outline: 'none', fontSize: 14, color: 'var(--fg-1)',
          }} />
          <button onClick={close} className="m-iconbtn"><Icon name="close" size={14} /></button>
        </div>
        <div style={{ padding: 8 }}>
          {query.trim() && results.length === 0 && (
            <div style={{ padding: '16px 10px', color: 'var(--fg-3)', fontSize: 13 }}>No matching workspace results.</div>
          )}
          {!query.trim() && (
            <div style={{ padding: '10px', color: 'var(--fg-3)', fontSize: 13 }}>
              Try searching for "Acme", "PTH-204", "pricing", or "bank partner".
            </div>
          )}
          {results.map((result) => (
            <button
              key={result.id}
              className="row-hover"
              onClick={() => {
                navigate(result.route, result.focus);
                setQuery('');
              }}
              style={{
                display: 'grid',
                gridTemplateColumns: '18px minmax(0, 1fr)',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                border: 0,
                borderRadius: 6,
                background: 'transparent',
                padding: '10px',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <Icon name={iconForRoute(result.route)} size={15} color="var(--fg-3)" />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', color: 'var(--fg-1)', fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.label}</span>
                <span style={{ display: 'block', color: 'var(--fg-3)', fontSize: 11.5, marginTop: 2 }}>{result.meta}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function iconForRoute(route: Route): IconName {
  if (route === 'sales') return 'money';
  if (route === 'tasks') return 'tasks';
  if (route === 'calendar') return 'calendar';
  if (route === 'docs') return 'docs';
  return 'backlog';
}

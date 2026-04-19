import { useUI } from '../lib/store';
import type { Route } from '../lib/types';
import { Button } from './primitives';
import { Icon } from './Icon';
import { PRODUCTS } from '../lib/seed';

const TITLE: Record<string, string> = {
  week: 'This Week',
  backlog: 'Backlog',
  docs: 'Documentation',
  tasks: 'Tasks',
  calendar: 'Calendar',
  jeff: 'Jeff',
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
  const theme = useUI((s) => s.theme);
  const setTheme = useUI((s) => s.setTheme);

  const d = now.toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'Europe/London' }).toUpperCase();
  const t = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/London' }) + ' GMT';

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
      </div>
    </header>
  );
}

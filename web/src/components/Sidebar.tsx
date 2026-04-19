import { useUI } from '../lib/store';
import { PRODUCTS } from '../lib/seed';
import type { IconName } from './Icon';
import { Icon } from './Icon';
import { Avatar } from './primitives';
import type { Route } from '../lib/types';
import { useSession } from '../lib/useSession';

interface NavLink { route: Route; label: string; icon: IconName; badge?: string; }

const WORKSPACE: NavLink[] = [
  { route: 'week', label: 'This Week', icon: 'week' },
  { route: 'backlog', label: 'Backlog', icon: 'backlog' },
  { route: 'docs', label: 'Documentation', icon: 'docs' },
  { route: 'tasks', label: 'Tasks', icon: 'tasks' },
  { route: 'calendar', label: 'Calendar', icon: 'calendar' },
  { route: 'jeff', label: 'Jeff', icon: 'agent', badge: 'AGENT' },
];

const BUSINESS: { id: string; label: string }[] = [
  { id: 'finance', label: 'Finance' },
  { id: 'sales', label: 'Sales' },
  { id: 'legal', label: 'Legal' },
];

export function Sidebar() {
  const route = useUI((s) => s.route);
  const navigate = useUI((s) => s.navigate);
  const openSearch = useUI((s) => s.openSearch);
  const theme = useUI((s) => s.theme);
  const session = useSession();
  const isAdmin = session.data?.role === 'admin';

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img
          src={theme === 'dark' ? '/logo-dark.png' : '/logo-light.png'}
          alt="Path"
          className="logo-mark"
        />
      </div>

      <div className="sidebar-search-wrap">
        <button type="button" className="sidebar-search" onClick={openSearch} title="Quick find (⌘K)">
          <Icon name="search" size={14} color="var(--grey-500)" />
          <span style={{ flex: 1 }}>Quick find</span>
          <kbd className="kbd">⌘K</kbd>
        </button>
      </div>

      <div className="sidebar-scroll">
        <nav className="sidebar-nav">
          {WORKSPACE.map((n) => {
            const active = route === n.route;
            return (
              <div
                key={n.route}
                className={`nav-row ${active ? 'is-active' : ''}`}
                onClick={() => navigate(n.route)}
              >
                <Icon name={n.icon} size={16} color={active ? 'var(--path-primary)' : 'var(--grey-500)'} />
                <span className="nav-row__label">{n.label}</span>
                {n.badge && (
                  <span className="mono" style={{ fontSize: 9, color: 'var(--fg-4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{n.badge}</span>
                )}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-section">
          <div className="sidebar-section__head">
            <span>Products</span>
            <span style={{ color: 'var(--fg-4)' }}>{PRODUCTS.length}</span>
          </div>
          {PRODUCTS.map((p) => {
            const active = route === `product:${p.id}`;
            return (
              <div
                key={p.id}
                className={`nav-row nav-row--product ${active ? 'is-active' : ''}`}
                onClick={() => navigate(`product:${p.id}`)}
              >
                <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
                <span className="nav-row__label">{p.label}</span>
                {typeof p.count === 'number' && (
                  <span className="mono" style={{ fontSize: 10, color: 'var(--fg-4)' }}>{p.count}</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section__head">
            <span>Business</span>
          </div>
          {BUSINESS.map((b) => {
            const target: Route = (b.id === 'finance' ? 'finance-docs' : b.id === 'sales' ? 'sales-docs' : 'legal-docs');
            const active = route === target;
            const iconName: IconName = b.id === 'finance' ? 'money' : b.id === 'sales' ? 'trend-up' : 'scale';
            return (
              <div
                key={b.id}
                className={`nav-row ${active ? 'is-active' : ''}`}
                onClick={() => navigate(target)}
              >
                <Icon name={iconName} size={16} color={active ? 'var(--path-primary)' : 'var(--grey-500)'} />
                <span className="nav-row__label">{b.label}</span>
              </div>
            );
          })}
        </div>

        {isAdmin && (
          <div className="sidebar-section" style={{ marginTop: 'auto' }}>
            <div
              className={`nav-row ${route === 'settings' ? 'is-active' : ''}`}
              onClick={() => navigate('settings')}
            >
              <Icon name="settings" size={16} color={route === 'settings' ? 'var(--path-primary)' : 'var(--grey-500)'} />
              <span className="nav-row__label">Settings</span>
            </div>
          </div>
        )}
      </div>

      <div className="sidebar-foot">
        <div className="presence">
          <Avatar who="D" size={26} className="avatar" />
          <Avatar who="R" size={26} className="avatar" />
          <Avatar who="J" size={26} className="avatar" />
        </div>
        <div style={{ flex: 1, lineHeight: 1.2, marginLeft: -4 }}>
          <div style={{ fontSize: 11.5, color: 'var(--fg-2)', fontWeight: 500 }}>Dave · Raj</div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>Both online · Jeff idle</div>
        </div>
      </div>
    </aside>
  );
}

import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { BottomTabs, MobileMenu, MobileTopbar, SearchSheet } from './components/MobileChrome';
import { useUI } from './lib/store';
import { useIsMobile } from './lib/useIsMobile';
import { useSession } from './lib/useSession';
import { WeekView } from './views/WeekView';
import { MobileWeekView } from './views/MobileWeekView';
import { BacklogView } from './views/BacklogView';
import { DocsDriveReal } from './views/DocsDriveReal';
import { TasksView } from './views/TasksView';
import { CalendarView } from './views/CalendarView';
import { JeffView } from './views/JeffView';
import { SettingsView } from './views/SettingsView';
import { ReportsView } from './views/ReportsView';
import { LoginScreen } from './views/LoginScreen';
import { useBusinessCategories } from './lib/queries';

function BusinessPlaceholder({ categoryId }: { categoryId: string }) {
  const catsQ = useBusinessCategories();
  const cat = catsQ.data?.find((c) => c.id === categoryId);
  return (
    <div className="screen-enter" style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginTop: 0 }}>{cat?.label ?? categoryId}</h1>
      <div style={{ fontSize: 13.5, color: 'var(--fg-3)', marginTop: 6 }}>
        This business category is set up in Settings. Content surfaces (docs, files, reports) for new categories
        will land in a follow-up — for now you can manage the category itself in Settings › Categories.
      </div>
    </div>
  );
}
import './styles/shell.css';
import './styles/modules.css';

export function App() {
  const route = useUI((s) => s.route);
  const theme = useUI((s) => s.theme);
  const openSearch = useUI((s) => s.openSearch);
  const isMobile = useIsMobile();
  const session = useSession();
  // Real clock. VITE_PIN_NOW overrides for screenshot / demo sessions — when set to an ISO
  // string the app pretends "now" is that moment, handy for walking stakeholders through a
  // live-looking workspace. Leave it unset in prod.
  const [now] = useState(() => {
    const pin = (import.meta as any).env?.VITE_PIN_NOW;
    return pin ? new Date(pin) : new Date();
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openSearch]);

  if (session.isLoading) return null;
  if (!session.data) return <LoginScreen />;

  let content;
  if (route === 'week') content = isMobile ? <MobileWeekView now={now} /> : <WeekView now={now} />;
  else if (route === 'backlog') content = <BacklogView />;
  else if (route.startsWith('product:')) content = <BacklogView productFilter={route.slice('product:'.length)} />;
  // Docs (product + all business modes) run through DocsDriveReal — single Drive-browse view.
  else if (route === 'docs') content = <DocsDriveReal mode="product" />;
  else if (route === 'finance-docs') content = <DocsDriveReal mode="finance" />;
  else if (route === 'sales-docs') content = <DocsDriveReal mode="sales" />;
  else if (route === 'legal-docs') content = <DocsDriveReal mode="legal" />;
  else if (route === 'tasks') content = <TasksView />;
  else if (route === 'calendar') content = <CalendarView />;
  else if (route === 'jeff') content = <JeffView />;
  else if (route === 'settings') content = <SettingsView />;
  else if (route === 'reports') content = <ReportsView />;
  else if (route.startsWith('business:')) content = <BusinessPlaceholder categoryId={route.slice('business:'.length)} />;
  else content = <WeekView now={now} />;

  return (
    <div className="app-shell">
      {!isMobile && <Sidebar />}
      <div className="app-main">
        {isMobile ? <MobileTopbar /> : <TopBar now={now} />}
        <main className="app-content" key={route}>
          {content}
        </main>
      </div>
      {isMobile && <BottomTabs />}
      <MobileMenu />
      <SearchSheet />
    </div>
  );
}

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
import { DocsView } from './views/DocsView';
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
  // Prototype is pinned to Mon 13 Apr 2026 · 10:42 London time · Week 16. Hold that anchor until real auth + real calendars replace the seed.
  const [now] = useState(() => new Date('2026-04-13T10:42:00+01:00'));

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
  else if (route === 'docs') content = <DocsView mode="product" />;
  else if (route === 'finance-docs') content = <DocsView mode="finance" />;
  else if (route === 'sales-docs') content = <DocsView mode="sales" />;
  else if (route === 'legal-docs') content = <DocsView mode="legal" />;
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

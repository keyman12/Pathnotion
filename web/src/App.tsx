import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { BottomTabs, MobileMenu, MobileTopbar, SearchSheet } from './components/MobileChrome';
import { useUI } from './lib/store';
import { useIsMobile } from './lib/useIsMobile';
import { WeekView } from './views/WeekView';
import { MobileWeekView } from './views/MobileWeekView';
import { BacklogView } from './views/BacklogView';
import { DocsView } from './views/DocsView';
import { TasksView } from './views/TasksView';
import { CalendarView } from './views/CalendarView';
import { JeffView } from './views/JeffView';
import './styles/shell.css';
import './styles/modules.css';

export function App() {
  const route = useUI((s) => s.route);
  const theme = useUI((s) => s.theme);
  const openSearch = useUI((s) => s.openSearch);
  const isMobile = useIsMobile();
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

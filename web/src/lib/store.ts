import { create } from 'zustand';
import type { Route } from './types';

interface UIState {
  route: Route;
  theme: 'dark' | 'light';
  density: 'default' | 'airy' | 'dense';
  sidebarCollapsed: boolean;
  searchOpen: boolean;
  mobileMenuOpen: boolean;
  /** Set when another view wants the Backlog to land with a specific item already expanded. */
  focusBacklogId: string | null;
  /** Set when another view wants Docs to open a specific article. */
  focusDocId: string | null;
  /** Prefill text for the Jeff chat. Cleared after the chat picks it up. */
  jeffPrefill: string | null;
  navigate: (r: Route, focusId?: string | null) => void;
  clearBacklogFocus: () => void;
  clearDocFocus: () => void;
  askJeff: (prompt: string) => void;
  clearJeffPrefill: () => void;
  setTheme: (t: 'dark' | 'light') => void;
  setDensity: (d: 'default' | 'airy' | 'dense') => void;
  toggleSidebar: () => void;
  openSearch: () => void;
  closeSearch: () => void;
  openMobileMenu: () => void;
  closeMobileMenu: () => void;
}

const loadRoute = (): Route => {
  try {
    const v = localStorage.getItem('path:route');
    if (v && v.length) return v as Route;
  } catch { /* ignore */ }
  return 'week';
};

const loadTheme = (): 'dark' | 'light' => {
  try {
    const v = localStorage.getItem('path:theme');
    if (v === 'light' || v === 'dark') return v;
  } catch { /* ignore */ }
  return 'dark';
};

export const useUI = create<UIState>((set) => ({
  route: loadRoute(),
  theme: loadTheme(),
  density: 'default',
  sidebarCollapsed: false,
  searchOpen: false,
  mobileMenuOpen: false,
  focusBacklogId: null,
  focusDocId: null,
  jeffPrefill: null,
  navigate: (r, focusId) => {
    try { localStorage.setItem('path:route', r); } catch { /* ignore */ }
    const isDocsRoute = r === 'docs' || r === 'finance-docs' || r === 'sales-docs' || r === 'legal-docs';
    set({
      route: r,
      searchOpen: false,
      mobileMenuOpen: false,
      focusBacklogId: r === 'backlog' ? (focusId ?? null) : null,
      focusDocId: isDocsRoute ? (focusId ?? null) : null,
    });
  },
  clearBacklogFocus: () => set({ focusBacklogId: null }),
  clearDocFocus: () => set({ focusDocId: null }),
  /** Jump to Jeff with a prefilled draft. Used by "Ask Jeff" shortcuts from other views. */
  askJeff: (prompt) => {
    try { localStorage.setItem('path:route', 'jeff'); } catch { /* ignore */ }
    set({ route: 'jeff', jeffPrefill: prompt, searchOpen: false, mobileMenuOpen: false });
  },
  clearJeffPrefill: () => set({ jeffPrefill: null }),
  setTheme: (t) => {
    try { localStorage.setItem('path:theme', t); } catch { /* ignore */ }
    document.documentElement.dataset.theme = t;
    set({ theme: t });
  },
  setDensity: (d) => {
    if (d === 'default') delete document.documentElement.dataset.density;
    else document.documentElement.dataset.density = d;
    set({ density: d });
  },
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false }),
  openMobileMenu: () => set({ mobileMenuOpen: true }),
  closeMobileMenu: () => set({ mobileMenuOpen: false }),
}));

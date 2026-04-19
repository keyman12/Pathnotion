import { create } from 'zustand';
import type { Route } from './types';

interface UIState {
  route: Route;
  theme: 'dark' | 'light';
  density: 'default' | 'airy' | 'dense';
  sidebarCollapsed: boolean;
  searchOpen: boolean;
  mobileMenuOpen: boolean;
  navigate: (r: Route) => void;
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
  navigate: (r) => {
    try { localStorage.setItem('path:route', r); } catch { /* ignore */ }
    set({ route: r, searchOpen: false, mobileMenuOpen: false });
  },
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

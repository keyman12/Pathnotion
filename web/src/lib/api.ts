import type { AccessGrant, AgentJob, AgentRun, BacklogItem, CalendarEvent, Product, Task } from './types';

const BASE = '/api';

export type ApiError = Error & { status?: number };

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = new Error(`${res.status} ${res.statusText}`) as ApiError;
    err.status = res.status;
    try { err.message = (await res.json()).error ?? err.message; } catch { /* ignore */ }
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface SessionUser {
  id: number;
  key: string;
  username: string;
  displayName: string;
  email: string | null;
  role: 'admin' | 'member';
  color: string | null;
}

export const api = {
  auth: {
    me: () => fetchJson<SessionUser>('/auth/me'),
    login: (username: string, password: string) =>
      fetchJson<SessionUser>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    logout: () => fetchJson<void>('/auth/logout', { method: 'POST' }),
    changePassword: (current: string, next: string) =>
      fetchJson<void>('/auth/change-password', { method: 'POST', body: JSON.stringify({ current, next }) }),
    users: {
      list: () => fetchJson<SessionUser[]>('/auth/users'),
      create: (body: { key: string; username: string; displayName: string; email?: string | null; password: string; role?: 'admin' | 'member'; color?: string | null }) =>
        fetchJson<SessionUser>('/auth/users', { method: 'POST', body: JSON.stringify(body) }),
      patch: (id: number, body: Partial<Pick<SessionUser, 'displayName' | 'email' | 'role' | 'color'>>) =>
        fetchJson<SessionUser>(`/auth/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
      resetPassword: (id: number, password: string) =>
        fetchJson<void>(`/auth/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) }),
    },
  },
  products: () => fetchJson<Product[]>('/products'),
  productsCrud: {
    create: (body: { id: string; label: string; color: string; accent?: string; sortOrder?: number }) =>
      fetchJson<Product>('/products', { method: 'POST', body: JSON.stringify(body) }),
    patch: (id: string, body: Partial<Pick<Product, 'label' | 'color' | 'accent'>> & { sortOrder?: number }) =>
      fetchJson<Product>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: string) => fetchJson<void>(`/products/${id}`, { method: 'DELETE' }),
  },
  backlog: {
    list: (q: Partial<{ product: string; stage: string; owner: string }> = {}) => {
      const params = new URLSearchParams(q as Record<string, string>).toString();
      return fetchJson<BacklogItem[]>(`/backlog/items${params ? `?${params}` : ''}`);
    },
    create: (body: Partial<BacklogItem> & { id: string; title: string; product: string; stage: BacklogItem['stage']; owner: BacklogItem['owner'] }) =>
      fetchJson<BacklogItem>('/backlog/items', { method: 'POST', body: JSON.stringify(body) }),
    patch: (id: string, body: Partial<BacklogItem>) =>
      fetchJson<BacklogItem>(`/backlog/items/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: string) => fetchJson<void>(`/backlog/items/${id}`, { method: 'DELETE' }),
    reorder: (items: Array<{ id: string; sortOrder: number; stage?: BacklogItem['stage'] }>) =>
      fetchJson<void>('/backlog/reorder', { method: 'POST', body: JSON.stringify(items) }),
  },
  tasks: {
    list: () => fetchJson<Task[]>('/tasks'),
    create: (body: { title: string; owner: 'D' | 'R'; due: string; link?: { type: 'doc' | 'backlog'; ref: string } | null }) =>
      fetchJson<Task>('/tasks', { method: 'POST', body: JSON.stringify(body) }),
    patch: (id: number, body: Partial<Task>) =>
      fetchJson<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: number) => fetchJson<void>(`/tasks/${id}`, { method: 'DELETE' }),
  },
  calendar: {
    events: () => fetchJson<CalendarEvent[]>('/calendar/events'),
    create: (body: Omit<CalendarEvent, 'id'>) =>
      fetchJson<CalendarEvent>('/calendar/events', { method: 'POST', body: JSON.stringify(body) }),
    patch: (id: number, body: Partial<CalendarEvent>) =>
      fetchJson<CalendarEvent>(`/calendar/events/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: number) => fetchJson<void>(`/calendar/events/${id}`, { method: 'DELETE' }),
    sync: () => fetchJson<{ ok: boolean }>('/calendar/sync', { method: 'POST' }),
  },
  agent: {
    runs: () => fetchJson<AgentRun[]>('/agent/runs'),
    schedule: () => fetchJson<AgentJob[]>('/agent/schedule'),
    access: () => fetchJson<AccessGrant[]>('/agent/access'),
  },
  businessCategories: {
    list: () => fetchJson<BusinessCategory[]>('/business-categories'),
    create: (body: { id: string; label: string; icon?: string; sortOrder?: number }) =>
      fetchJson<BusinessCategory>('/business-categories', { method: 'POST', body: JSON.stringify(body) }),
    patch: (id: string, body: Partial<Pick<BusinessCategory, 'label' | 'icon' | 'sortOrder'>>) =>
      fetchJson<BusinessCategory>(`/business-categories/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: string) => fetchJson<void>(`/business-categories/${id}`, { method: 'DELETE' }),
  },
  subfolders: {
    list: (productId?: string) => {
      const q = productId ? `?product=${encodeURIComponent(productId)}` : '';
      return fetchJson<Subfolder[]>(`/subfolders${q}`);
    },
    create: (body: { productId: string; name: string; sortOrder?: number }) =>
      fetchJson<Subfolder>('/subfolders', { method: 'POST', body: JSON.stringify(body) }),
    patch: (id: number, body: Partial<Pick<Subfolder, 'name' | 'sortOrder'>>) =>
      fetchJson<Subfolder>(`/subfolders/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: number) => fetchJson<void>(`/subfolders/${id}`, { method: 'DELETE' }),
  },
  notifications: {
    prefs: () => fetchJson<NotificationPrefs>('/notifications/prefs'),
    patchPrefs: (body: Partial<Pick<NotificationPrefs, 'enabled' | 'deliveryTime'>> & { sections?: Partial<NotificationPrefs['sections']> }) =>
      fetchJson<NotificationPrefs>('/notifications/prefs', { method: 'PATCH', body: JSON.stringify(body) }),
    sendTest: () => fetchJson<{ ok: true }>('/notifications/send-test', { method: 'POST' }),
  },
};

export interface BusinessCategory {
  id: string;
  label: string;
  icon: string;
  sortOrder: number;
}

export interface Subfolder {
  id: number;
  productId: string;
  name: string;
  sortOrder: number;
}

export interface NotificationPrefs {
  enabled: boolean;
  deliveryTime: string;
  sections: { meetings: boolean; overdue: boolean; tasks: boolean; upcoming: boolean };
  lastSentDate: string | null;
  updatedAt: string;
}

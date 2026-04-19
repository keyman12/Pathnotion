import type { AccessGrant, AgentJob, AgentRun, BacklogItem, CalendarEvent, Product, Task } from './types';

const BASE = '/api';

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = new Error(`${res.status} ${res.statusText}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  products: () => fetchJson<Product[]>('/products'),
  backlog: {
    list: (q: Partial<{ product: string; stage: string; owner: string }> = {}) => {
      const params = new URLSearchParams(q as Record<string, string>).toString();
      return fetchJson<BacklogItem[]>(`/backlog/items${params ? `?${params}` : ''}`);
    },
    patch: (id: string, body: Partial<BacklogItem>) =>
      fetchJson<BacklogItem>(`/backlog/items/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  },
  tasks: {
    list: () => fetchJson<Task[]>('/tasks'),
    create: (body: { title: string; owner: 'D' | 'R'; due: string }) =>
      fetchJson<Task>('/tasks', { method: 'POST', body: JSON.stringify(body) }),
    patch: (id: string, body: Partial<Task>) =>
      fetchJson<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  },
  calendar: {
    events: () => fetchJson<CalendarEvent[]>('/calendar/events'),
    sync: () => fetchJson<{ ok: boolean }>('/calendar/sync', { method: 'POST' }),
  },
  agent: {
    runs: () => fetchJson<AgentRun[]>('/agent/runs'),
    schedule: () => fetchJson<AgentJob[]>('/agent/schedule'),
    access: () => fetchJson<AccessGrant[]>('/agent/access'),
  },
};

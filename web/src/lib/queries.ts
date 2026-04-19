import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { BacklogItem, Task } from './types';
import { AGENT_JOBS, AGENT_RUNS, BACKLOG, EVENTS, PRODUCTS, TASKS, ACCESS } from './seed';

// Each hook tries the backend, falls back to seed data if the API isn't reachable.
// This lets the frontend run standalone until the API is wired up.

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      try { return await api.products(); } catch { return PRODUCTS; }
    },
    staleTime: 60_000,
  });
}

export function useBacklog(productId?: string) {
  return useQuery({
    queryKey: ['backlog', productId ?? 'all'],
    queryFn: async () => {
      try { return await api.backlog.list(productId ? { product: productId } : {}); }
      catch { return productId ? BACKLOG.filter((b) => b.product === productId) : BACKLOG; }
    },
    staleTime: 30_000,
  });
}

export function usePatchBacklog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; patch: Partial<BacklogItem> }) => api.backlog.patch(args.id, args.patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['backlog'] }); },
  });
}

export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      try { return await api.tasks.list(); } catch { return TASKS; }
    },
  });
}

export function useToggleTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; done: boolean }) => api.tasks.patch(args.id, { done: args.done } as Partial<Task>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useCalendar() {
  return useQuery({
    queryKey: ['calendar'],
    queryFn: async () => {
      try { return await api.calendar.events(); } catch { return EVENTS; }
    },
    staleTime: 10_000,
  });
}

export function useAgentRuns() {
  return useQuery({
    queryKey: ['agent', 'runs'],
    queryFn: async () => { try { return await api.agent.runs(); } catch { return AGENT_RUNS; } },
  });
}

export function useAgentJobs() {
  return useQuery({
    queryKey: ['agent', 'jobs'],
    queryFn: async () => { try { return await api.agent.schedule(); } catch { return AGENT_JOBS; } },
  });
}

export function useAccess() {
  return useQuery({
    queryKey: ['agent', 'access'],
    queryFn: async () => { try { return await api.agent.access(); } catch { return ACCESS; } },
  });
}

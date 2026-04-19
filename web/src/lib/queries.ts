import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { ApiError } from './api';
import type { BacklogItem, CalendarEvent, Task } from './types';

// Every hook assumes the session is authed (App gates on it).
// On 401 mid-session, clear the session cache so the AuthGate redirects back to /login.

function handle401(err: unknown, qc: ReturnType<typeof useQueryClient>) {
  if ((err as ApiError).status === 401) qc.setQueryData(['auth', 'me'], null);
}

// Products
export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: () => api.products(),
    staleTime: 5 * 60_000,
  });
}

// Backlog
export function useBacklog(productId?: string) {
  return useQuery({
    queryKey: ['backlog', productId ?? 'all'],
    queryFn: () => api.backlog.list(productId ? { product: productId } : {}),
    staleTime: 30_000,
  });
}

export function useCreateBacklog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.backlog.create>[0]) => api.backlog.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backlog'] }),
    onError: (err) => handle401(err, qc),
  });
}

export function usePatchBacklog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; patch: Partial<BacklogItem> }) => api.backlog.patch(args.id, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backlog'] }),
    onError: (err) => handle401(err, qc),
  });
}

export function useDeleteBacklog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.backlog.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backlog'] }),
    onError: (err) => handle401(err, qc),
  });
}

// Tasks
export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.tasks.list(),
    staleTime: 30_000,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.tasks.create>[0]) => api.tasks.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
    onError: (err) => handle401(err, qc),
  });
}

export function usePatchTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; patch: Partial<Task> }) => api.tasks.patch(args.id, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
    onError: (err) => handle401(err, qc),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.tasks.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
    onError: (err) => handle401(err, qc),
  });
}

// Calendar
export function useCalendar() {
  return useQuery({
    queryKey: ['calendar'],
    queryFn: () => api.calendar.events(),
    staleTime: 30_000,
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<CalendarEvent, 'id'>) => api.calendar.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar'] }),
    onError: (err) => handle401(err, qc),
  });
}

export function usePatchEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; patch: Partial<CalendarEvent> }) => api.calendar.patch(args.id, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar'] }),
    onError: (err) => handle401(err, qc),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.calendar.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar'] }),
    onError: (err) => handle401(err, qc),
  });
}

// Agent (read-only for now)
export function useAgentRuns() {
  return useQuery({ queryKey: ['agent', 'runs'], queryFn: () => api.agent.runs() });
}
export function useAgentJobs() {
  return useQuery({ queryKey: ['agent', 'jobs'], queryFn: () => api.agent.schedule() });
}
export function useAccess() {
  return useQuery({ queryKey: ['agent', 'access'], queryFn: () => api.agent.access() });
}

// Users (admin)
export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: () => api.auth.users.list() });
}
export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.auth.users.create>[0]) => api.auth.users.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
export function usePatchUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; patch: Parameters<typeof api.auth.users.patch>[1] }) => api.auth.users.patch(args.id, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
export function useResetUserPassword() {
  return useMutation({
    mutationFn: (args: { id: number; password: string }) => api.auth.users.resetPassword(args.id, args.password),
  });
}

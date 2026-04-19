import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiError, SessionUser } from './api';
import { api } from './api';

export function useSession() {
  return useQuery<SessionUser | null>({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try { return await api.auth.me(); }
      catch (err) {
        if ((err as ApiError).status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { username: string; password: string }) => api.auth.login(v.username, v.password),
    onSuccess: (user) => {
      qc.setQueryData(['auth', 'me'], user);
      qc.invalidateQueries();
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.auth.logout(),
    onSuccess: () => {
      qc.setQueryData(['auth', 'me'], null);
      qc.clear();
    },
  });
}

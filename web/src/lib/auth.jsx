// The logged-in user, from GET /api/auth/me. The session itself is an HttpOnly cookie the page
// cannot read; this only knows what the server says about it.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { api } from './api.js';

const fetchMe = async () => {
  try {
    return (await api('/auth/me')).user;
  } catch (error) {
    if (error.status === 401) return null; // not logged in is a normal answer here
    throw error;
  }
};

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isPending } = useQuery({ queryKey: ['me'], queryFn: fetchMe, staleTime: 5 * 60_000 });

  const setUser = useCallback((next) => queryClient.setQueryData(['me'], next), [queryClient]);
  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    queryClient.setQueryData(['me'], null);
    queryClient.removeQueries({ queryKey: ['bookings'] });
    queryClient.removeQueries({ queryKey: ['booking'] });
  }, [queryClient]);

  return { user: user ?? null, loading: isPending, setUser, logout };
}

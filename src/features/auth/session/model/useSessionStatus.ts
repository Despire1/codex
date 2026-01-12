import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../../shared/api/client';

type SessionState = 'checking' | 'authenticated' | 'unauthenticated';

type SessionUser = {
  subscriptionStartAt?: string | null;
  subscriptionEndAt?: string | null;
  role?: string;
};

export const useSessionStatus = () => {
  const [state, setState] = useState<SessionState>('checking');
  const [user, setUser] = useState<SessionUser | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await api.getSession();
      const sessionUser = response.user as SessionUser;
      setUser(sessionUser);
      if (typeof window !== 'undefined') {
        if (sessionUser.role) {
          window.localStorage.setItem('userRole', sessionUser.role);
        } else {
          window.localStorage.removeItem('userRole');
        }
      }
      setState('authenticated');
    } catch (error) {
      setUser(null);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('userRole');
      }
      setState('unauthenticated');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const hasSubscription = Boolean(user?.subscriptionStartAt);

  return { state, refresh, user, hasSubscription };
};

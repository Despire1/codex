import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../../shared/api/client';

type SessionState = 'checking' | 'authenticated' | 'unauthenticated';

const SESSION_PRESENCE_KEY = 'tb_session_present';

type SessionUser = {
  subscriptionStartAt?: string | null;
  subscriptionEndAt?: string | null;
  role?: string;
  photoUrl?: string | null;
};

export const useSessionStatus = () => {
  const [state, setState] = useState<SessionState>('checking');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);

  const refresh = useCallback(async () => {
    try {
      const response = await api.getSession();
      const sessionUser = response.user as SessionUser;
      setUser(sessionUser);
      setSessionExpired(false);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SESSION_PRESENCE_KEY, '1');
        if (sessionUser.role) {
          window.localStorage.setItem('userRole', sessionUser.role);
        } else {
          window.localStorage.removeItem('userRole');
        }
      }
      setState('authenticated');
    } catch (_error) {
      setUser(null);
      if (typeof window !== 'undefined') {
        const wasPresent = window.localStorage.getItem(SESSION_PRESENCE_KEY) === '1';
        if (wasPresent) {
          setSessionExpired(true);
        }
        window.localStorage.removeItem(SESSION_PRESENCE_KEY);
        window.localStorage.removeItem('userRole');
      }
      setState('unauthenticated');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const hasSubscription = Boolean(user?.subscriptionStartAt);

  return { state, refresh, user, hasSubscription, sessionExpired };
};

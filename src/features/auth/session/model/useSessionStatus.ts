import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../../shared/api/client';

type SessionState = 'checking' | 'authenticated' | 'unauthenticated';

type SessionUser = {
  subscriptionStartAt?: string | null;
  subscriptionEndAt?: string | null;
};

export const useSessionStatus = () => {
  const [state, setState] = useState<SessionState>('checking');
  const [user, setUser] = useState<SessionUser | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await api.getSession();
      setUser(response.user as SessionUser);
      setState('authenticated');
    } catch (error) {
      setUser(null);
      setState('unauthenticated');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const hasSubscription = Boolean(user?.subscriptionStartAt);

  return { state, refresh, user, hasSubscription };
};

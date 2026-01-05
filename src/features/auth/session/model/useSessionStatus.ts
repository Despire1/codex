import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../../shared/api/client';

type SessionState = 'checking' | 'authenticated' | 'unauthenticated';

export const useSessionStatus = () => {
  const [state, setState] = useState<SessionState>('checking');

  const refresh = useCallback(async () => {
    try {
      await api.getSession();
      setState('authenticated');
    } catch (error) {
      setState('unauthenticated');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { state, refresh };
};

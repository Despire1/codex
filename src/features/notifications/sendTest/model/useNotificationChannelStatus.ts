import { useCallback, useEffect, useState } from 'react';
import { api } from '@/shared/api/client';

export type NotificationChannelStatus = {
  channel: string;
  configured: boolean;
  reason?: string;
};

type ChannelStatusState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  channel: string;
  configured: boolean;
  reason?: string;
};

export const useNotificationChannelStatus = () => {
  const [state, setState] = useState<ChannelStatusState>({
    status: 'loading',
    channel: 'telegram',
    configured: false,
    reason: undefined,
  });

  const fetchStatus = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'loading' }));
    try {
      const data = await api.getNotificationChannelStatus();
      setState({
        status: 'ready',
        channel: data.channel,
        configured: data.configured,
        reason: data.reason,
      });
    } catch (error) {
      setState((prev) => ({ ...prev, status: 'error', configured: false }));
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return { ...state, refresh: fetchStatus };
};

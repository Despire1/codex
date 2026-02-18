import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActivityFeedUnreadStatus } from '../../../entities/types';
import { api } from '../../../shared/api/client';

const POLL_INTERVAL_MS = 30_000;

const defaultStatus: ActivityFeedUnreadStatus = {
  hasUnread: false,
  latestOccurredAt: null,
  seenAt: null,
};

export const useDashboardActivityUnread = (enabled: boolean) => {
  const [status, setStatus] = useState<ActivityFeedUnreadStatus>(defaultStatus);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);

    try {
      const nextStatus = await api.getActivityFeedUnreadStatus();
      if (requestIdRef.current !== requestId) return;
      setStatus(nextStatus);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load activity feed unread status', error);
      if (requestIdRef.current === requestId) {
        setStatus(defaultStatus);
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [enabled]);

  const markSeen = useCallback(
    async (seenThrough?: string) => {
      if (!enabled) return;
      try {
        const nextStatus = await api.markActivityFeedSeen(
          seenThrough
            ? {
                seenThrough,
              }
            : undefined,
        );
        setStatus(nextStatus);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to mark activity feed as seen', error);
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) {
      setStatus(defaultStatus);
      setLoading(false);
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      void refresh();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const intervalId = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void refresh();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, refresh]);

  return useMemo(
    () => ({
      ...status,
      loading,
      refresh,
      markSeen,
    }),
    [loading, markSeen, refresh, status],
  );
};

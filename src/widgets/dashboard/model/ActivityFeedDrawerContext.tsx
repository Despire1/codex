import { createContext, FC, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ActivityFeedItem } from '../../../entities/types';
import { useTimeZone } from '../../../shared/lib/timezoneContext';
import { useIsMobile } from '../../../shared/lib/useIsMobile';
import { ActivityFeedDrawer } from '../components/ActivityFeedDrawer';
import { DashboardActivityFilters, useDashboardActivityFeed } from './useDashboardActivityFeed';
import { useDashboardActivityUnread } from './useDashboardActivityUnread';

const LAST_SEEN_STORAGE_KEY = 'activity-feed:last-seen';

const readLastSeenLocally = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(LAST_SEEN_STORAGE_KEY);
    return typeof value === 'string' && value ? value : null;
  } catch {
    return null;
  }
};

const writeLastSeenLocally = (value: string) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_SEEN_STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
};

interface ActivityFeedDrawerContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  items: ActivityFeedItem[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  filters: DashboardActivityFilters;
  applyFilters: (next: DashboardActivityFilters) => void;
  resetFilters: () => void;
  loadMore: () => void;
  refresh: () => Promise<void> | void;
  hasUnread: boolean;
  refreshUnread: () => Promise<void> | void;
  markSeen: (seenThrough?: string) => Promise<void> | void;
}

const ActivityFeedDrawerContext = createContext<ActivityFeedDrawerContextValue | null>(null);

interface ActivityFeedDrawerProviderProps {
  children: ReactNode;
  enabled?: boolean;
}

export const ActivityFeedDrawerProvider: FC<ActivityFeedDrawerProviderProps> = ({ children, enabled = true }) => {
  const timeZone = useTimeZone();
  const isMobile = useIsMobile(1023);
  const [isOpen, setIsOpen] = useState(false);
  const [requested, setRequested] = useState(false);
  const [unreadThreshold, setUnreadThreshold] = useState<string | null | undefined>(undefined);
  const thresholdCapturedRef = useRef(false);
  const lastSeenLocallyRef = useRef<string | null>(readLastSeenLocally());

  const feedEnabled = enabled && (!isMobile || requested);

  const feed = useDashboardActivityFeed(timeZone, {
    pageSize: isMobile ? 10 : 20,
    enabled: feedEnabled,
    pollIntervalMs: isOpen ? 10_000 : 0,
  });

  const unread = useDashboardActivityUnread(enabled);

  const open = useCallback(() => {
    setRequested(true);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => {
    setRequested(true);
    setIsOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      thresholdCapturedRef.current = false;
      setUnreadThreshold(undefined);
    }
  }, [isOpen]);

  const applyFilters = useCallback(
    (next: DashboardActivityFilters) => {
      feed.setFilters(next);
    },
    [feed],
  );

  const resetFilters = useCallback(() => {
    feed.setFilters({ categories: [], studentId: null, from: '', to: '' });
  }, [feed]);

  useEffect(() => {
    if (!isOpen) return;
    if (!feed.items.length) return;
    const topOccurredAt = feed.items[0].occurredAt;
    if (!thresholdCapturedRef.current) {
      thresholdCapturedRef.current = true;
      const localSeen = lastSeenLocallyRef.current;
      const serverSeen = unread.seenAt ?? null;
      const threshold =
        localSeen && serverSeen ? (localSeen >= serverSeen ? localSeen : serverSeen) : (localSeen ?? serverSeen);
      setUnreadThreshold(threshold);
    }
    if (!lastSeenLocallyRef.current || lastSeenLocallyRef.current < topOccurredAt) {
      lastSeenLocallyRef.current = topOccurredAt;
      writeLastSeenLocally(topOccurredAt);
    }
    void unread.markSeen(topOccurredAt);
  }, [feed.items, isOpen, unread]);

  const lastLatestOccurredAtRef = useRef<string | null>(null);
  useEffect(() => {
    const next = unread.latestOccurredAt ?? null;
    const prev = lastLatestOccurredAtRef.current;
    lastLatestOccurredAtRef.current = next;
    if (!feedEnabled) return;
    if (!next) return;
    if (prev === next) return;
    const topOccurredAt = feed.items[0]?.occurredAt ?? null;
    if (topOccurredAt && next <= topOccurredAt) return;
    void feed.refreshHead();
  }, [feed, feedEnabled, unread.latestOccurredAt]);

  const value = useMemo<ActivityFeedDrawerContextValue>(
    () => ({
      isOpen,
      open,
      close,
      toggle,
      items: feed.items,
      loading: feed.loading,
      loadingMore: feed.loadingMore,
      hasMore: feed.hasMore,
      filters: feed.filters,
      applyFilters,
      resetFilters,
      loadMore: feed.loadMore,
      refresh: feed.refresh,
      hasUnread: unread.hasUnread,
      refreshUnread: unread.refresh,
      markSeen: unread.markSeen,
    }),
    [
      isOpen,
      open,
      close,
      toggle,
      feed.items,
      feed.loading,
      feed.loadingMore,
      feed.hasMore,
      feed.filters,
      feed.loadMore,
      feed.refresh,
      applyFilters,
      resetFilters,
      unread.hasUnread,
      unread.refresh,
      unread.markSeen,
    ],
  );

  return (
    <ActivityFeedDrawerContext.Provider value={value}>
      {children}
      <ActivityFeedDrawer
        isOpen={isOpen}
        onClose={close}
        items={feed.items}
        loading={feed.loading}
        loadingMore={feed.loadingMore}
        hasMore={feed.hasMore}
        onLoadMore={feed.loadMore}
        filters={feed.filters}
        onApplyFilters={applyFilters}
        unreadThreshold={unreadThreshold}
      />
    </ActivityFeedDrawerContext.Provider>
  );
};

export const useActivityFeedDrawer = (): ActivityFeedDrawerContextValue => {
  const ctx = useContext(ActivityFeedDrawerContext);
  if (!ctx) {
    throw new Error('useActivityFeedDrawer must be used within ActivityFeedDrawerProvider');
  }
  return ctx;
};

export const useActivityFeedDrawerOptional = (): ActivityFeedDrawerContextValue | null => {
  return useContext(ActivityFeedDrawerContext);
};

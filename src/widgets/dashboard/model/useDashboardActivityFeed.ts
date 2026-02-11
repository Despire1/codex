import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityCategory, ActivityFeedItem } from '../../../entities/types';
import { api } from '../../../shared/api/client';
import { toUtcDateFromTimeZone } from '../../../shared/lib/timezoneDates';

const PAGE_SIZE = 20;

export type DashboardActivityFilters = {
  categories: ActivityCategory[];
  studentId: number | null;
  from: string;
  to: string;
};

const defaultFilters: DashboardActivityFilters = {
  categories: [],
  studentId: null,
  from: '',
  to: '',
};

const uniqueCategories = (categories: ActivityCategory[]) => {
  const seen = new Set<ActivityCategory>();
  return categories.filter((category) => {
    if (seen.has(category)) return false;
    seen.add(category);
    return true;
  });
};

export const useDashboardActivityFeed = (timeZone: string) => {
  const [items, setItems] = useState<ActivityFeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filters, setFiltersState] = useState<DashboardActivityFilters>(defaultFilters);
  const requestIdRef = useRef(0);

  const setFilters = useCallback((patch: Partial<DashboardActivityFilters>) => {
    setFiltersState((prev) => {
      const nextCategories =
        patch.categories !== undefined ? uniqueCategories(patch.categories) : prev.categories;
      return {
        ...prev,
        ...patch,
        categories: nextCategories,
      };
    });
  }, []);

  const loadInitial = useCallback(async (nextFilters?: DashboardActivityFilters) => {
    const activeFilters = nextFilters ?? filters;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    try {
      const data = await api.listActivityFeed({
        limit: PAGE_SIZE,
        categories: activeFilters.categories,
        studentId: activeFilters.studentId ?? undefined,
        from: activeFilters.from
          ? toUtcDateFromTimeZone(activeFilters.from, '00:00', timeZone).toISOString()
          : undefined,
        to: activeFilters.to
          ? toUtcDateFromTimeZone(activeFilters.to, '23:59', timeZone).toISOString()
          : undefined,
      });
      if (requestIdRef.current !== requestId) return;
      setItems(data.items);
      setNextCursor(data.nextCursor);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load activity feed', error);
      if (requestIdRef.current === requestId) {
        setItems([]);
        setNextCursor(null);
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [filters, timeZone]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const data = await api.listActivityFeed({
        limit: PAGE_SIZE,
        cursor: nextCursor,
        categories: filters.categories,
        studentId: filters.studentId ?? undefined,
        from: filters.from ? toUtcDateFromTimeZone(filters.from, '00:00', timeZone).toISOString() : undefined,
        to: filters.to ? toUtcDateFromTimeZone(filters.to, '23:59', timeZone).toISOString() : undefined,
      });
      setItems((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load more activity feed items', error);
    } finally {
      setLoadingMore(false);
    }
  }, [filters, loading, loadingMore, nextCursor, timeZone]);

  const refresh = useCallback(async () => {
    await loadInitial(filters);
  }, [filters, loadInitial]);

  useEffect(() => {
    void loadInitial(filters);
  }, [filters, loadInitial]);

  return useMemo(
    () => ({
      items,
      loading,
      loadingMore,
      nextCursor,
      hasMore: Boolean(nextCursor),
      filters,
      setFilters,
      loadInitial,
      loadMore,
      refresh,
    }),
    [filters, items, loadInitial, loadMore, loading, loadingMore, nextCursor, refresh, setFilters],
  );
};

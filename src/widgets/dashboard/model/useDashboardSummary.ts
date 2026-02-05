import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../shared/api/client';
import type { DashboardSummary } from '../../../shared/api/client';

export type DashboardSummaryState = {
  summary: DashboardSummary | null;
  isLoading: boolean;
  refresh: () => void;
};

export type DashboardSummaryConfig = {
  hasAccess: boolean;
  isActive: boolean;
};

export const useDashboardSummaryInternal = ({ hasAccess, isActive }: DashboardSummaryConfig): DashboardSummaryState => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadSummary = useCallback(async () => {
    if (!hasAccess || !isActive) return;
    setIsLoading(true);
    try {
      const data = await api.getDashboardSummary();
      setSummary(data);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load dashboard summary', error);
    } finally {
      setIsLoading(false);
    }
  }, [hasAccess, isActive]);

  useEffect(() => {
    if (!hasAccess || !isActive) return;
    void loadSummary();
  }, [hasAccess, isActive, loadSummary]);

  useEffect(() => {
    if (!hasAccess || !isActive) return;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void loadSummary();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [hasAccess, isActive, loadSummary]);

  return { summary, isLoading, refresh: loadSummary };
};

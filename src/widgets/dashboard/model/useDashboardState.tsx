import { type PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { addDays, startOfWeek } from 'date-fns';
import { api } from '../../../shared/api/client';
import {
  type DashboardActionRequiredItem,
  type DashboardHomeworkReviewItem,
  type UnpaidLessonEntry,
} from '../../../entities/types';
import { toZonedDate } from '../../../shared/lib/timezoneDates';

type LessonRange = {
  key: string;
  startAt: Date;
  endAt: Date;
  startIso: string;
  endIso: string;
};

export type DashboardStateConfig = {
  hasAccess: boolean;
  timeZone: string;
  isActive: boolean;
  buildLessonRange: (start: Date, end: Date) => LessonRange;
  loadLessonsForRange: (range: LessonRange) => void | Promise<void>;
};

export type DashboardStateValue = {
  weekRange: { start: Date; end: Date } | null;
  setWeekRange: (start: Date, end: Date) => void;
  isWeekLessonsLoading: boolean;
  unpaidEntries: UnpaidLessonEntry[];
  loadUnpaidLessons: () => Promise<void>;
  actionRequiredItems: DashboardActionRequiredItem[];
  loadActionRequired: () => Promise<void>;
  homeworkReviewItems: DashboardHomeworkReviewItem[];
  loadHomeworkReview: () => Promise<void>;
};

const DashboardStateContext = createContext<DashboardStateValue | null>(null);

export const DashboardStateProvider = ({ children, value }: PropsWithChildren<{ value: DashboardStateValue }>) => {
  return <DashboardStateContext.Provider value={value}>{children}</DashboardStateContext.Provider>;
};

export const useDashboardState = () => {
  const context = useContext(DashboardStateContext);
  if (!context) {
    throw new Error('useDashboardState must be used within DashboardStateProvider');
  }
  return context;
};

export const useDashboardStateInternal = ({
  hasAccess,
  timeZone,
  isActive,
  buildLessonRange,
  loadLessonsForRange,
}: DashboardStateConfig): DashboardStateValue => {
  const [weekRange, setWeekRangeState] = useState<{ start: Date; end: Date } | null>(() => {
    const nowZoned = toZonedDate(new Date(), timeZone);
    const weekStart = startOfWeek(nowZoned, { weekStartsOn: 1 });
    return { start: weekStart, end: addDays(weekStart, 6) };
  });
  const [isWeekLessonsLoading, setIsWeekLessonsLoading] = useState(false);
  const [unpaidEntries, setUnpaidEntries] = useState<UnpaidLessonEntry[]>([]);
  const [actionRequiredItems, setActionRequiredItems] = useState<DashboardActionRequiredItem[]>([]);
  const [homeworkReviewItems, setHomeworkReviewItems] = useState<DashboardHomeworkReviewItem[]>([]);

  const setWeekRange = useCallback((start: Date, end: Date) => {
    setIsWeekLessonsLoading(true);
    setWeekRangeState({ start, end });
  }, []);

  const loadUnpaidLessons = useCallback(async () => {
    if (!hasAccess) return;
    try {
      const data = await api.listUnpaidLessons();
      setUnpaidEntries(data.entries ?? []);
    } catch (error) {
      console.error('Failed to load unpaid lessons', error);
    }
  }, [hasAccess]);

  const loadActionRequired = useCallback(async () => {
    if (!hasAccess) return;
    try {
      const data = await api.listDashboardActionRequired();
      setActionRequiredItems(data.items ?? []);
    } catch (error) {
      console.error('Failed to load dashboard action required', error);
    }
  }, [hasAccess]);

  const loadHomeworkReview = useCallback(async () => {
    if (!hasAccess) return;
    try {
      const data = await api.listDashboardHomeworkReview();
      setHomeworkReviewItems(data.items ?? []);
    } catch (error) {
      console.error('Failed to load homework review queue', error);
    }
  }, [hasAccess]);

  useEffect(() => {
    if (!hasAccess || !isActive) return;
    void loadUnpaidLessons();
    void loadActionRequired();
    void loadHomeworkReview();
  }, [hasAccess, isActive, loadActionRequired, loadHomeworkReview, loadUnpaidLessons]);

  useEffect(() => {
    if (!hasAccess || !isActive || !weekRange) return;
    let canceled = false;
    const loadWeekLessons = async () => {
      setIsWeekLessonsLoading(true);
      try {
        await loadLessonsForRange(buildLessonRange(weekRange.start, weekRange.end));
      } finally {
        if (!canceled) {
          setIsWeekLessonsLoading(false);
        }
      }
    };
    void loadWeekLessons();
    return () => {
      canceled = true;
    };
  }, [buildLessonRange, hasAccess, isActive, loadLessonsForRange, weekRange]);

  return useMemo(
    () => ({
      weekRange,
      setWeekRange,
      isWeekLessonsLoading,
      unpaidEntries,
      loadUnpaidLessons,
      actionRequiredItems,
      loadActionRequired,
      homeworkReviewItems,
      loadHomeworkReview,
    }),
    [
      actionRequiredItems,
      homeworkReviewItems,
      isWeekLessonsLoading,
      loadActionRequired,
      loadHomeworkReview,
      loadUnpaidLessons,
      setWeekRange,
      unpaidEntries,
      weekRange,
    ],
  );
};

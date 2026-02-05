import { addDays, addMonths, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Lesson } from '../../../entities/types';
import { api } from '../../../shared/api/client';
import { normalizeLesson } from '../../../shared/lib/normalizers';
import { formatInTimeZone, toUtcEndOfDay, toUtcDateFromDate, toZonedDate } from '../../../shared/lib/timezoneDates';

type LessonRange = {
  key: string;
  startAt: Date;
  endAt: Date;
  startIso: string;
  endIso: string;
};

export type ScheduleLessonsRangeConfig = {
  hasAccess: boolean;
  timeZone: string;
  monthAnchor: Date;
  monthOffset: number;
};

export type ScheduleLessonsRangeValue = {
  lessons: Lesson[];
  buildLessonRange: (start: Date, end: Date) => LessonRange;
  buildWeekRange: (date: Date) => LessonRange;
  buildDayRange: (date: Date) => LessonRange;
  buildMonthRange: () => LessonRange;
  loadLessonsForRange: (range: LessonRange) => Promise<void>;
  applyLessonsForRange: (range: LessonRange, items: Lesson[]) => void;
  updateLessonsForCurrentRange: (updater: (prev: Lesson[]) => Lesson[]) => void;
  syncLessonsInRanges: (lessons: Lesson[]) => void;
  removeLessonsFromRanges: (options: { ids?: number[]; recurrenceGroupId?: string | null; startFrom?: Date }) => void;
  isLessonInCurrentRange: (lesson: Lesson) => boolean;
  filterLessonsForCurrentRange: (items: Lesson[]) => Lesson[];
};

const WEEK_STARTS_ON = 1;

export const useScheduleLessonsRangeInternal = ({
  hasAccess,
  timeZone,
  monthAnchor,
  monthOffset,
}: ScheduleLessonsRangeConfig): ScheduleLessonsRangeValue => {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonsByRange, setLessonsByRange] = useState<Record<string, Lesson[]>>({});
  const lessonsByRangeRef = useRef(lessonsByRange);
  const lessonRangeRef = useRef<LessonRange | null>(null);
  const lessonRangeRequestId = useRef(0);

  useEffect(() => {
    lessonsByRangeRef.current = lessonsByRange;
  }, [lessonsByRange]);

  const buildLessonRange = useCallback(
    (startDate: Date, endDate: Date): LessonRange => {
      const startIso = formatInTimeZone(startDate, 'yyyy-MM-dd', { timeZone });
      const endIso = formatInTimeZone(endDate, 'yyyy-MM-dd', { timeZone });
      const startAt = toUtcDateFromDate(startIso, timeZone);
      const endAt = toUtcEndOfDay(endIso, timeZone);
      return {
        key: `${startIso}_${endIso}`,
        startAt,
        endAt,
        startIso,
        endIso,
      };
    },
    [timeZone],
  );

  const buildWeekRange = useCallback(
    (date: Date) => {
      const zoned = toZonedDate(date, timeZone);
      const weekStart = startOfWeek(zoned, { weekStartsOn: WEEK_STARTS_ON as 0 | 1 });
      const weekEnd = addDays(weekStart, 6);
      return buildLessonRange(weekStart, weekEnd);
    },
    [buildLessonRange, timeZone],
  );

  const buildDayRange = useCallback(
    (date: Date) => {
      const zoned = toZonedDate(date, timeZone);
      return buildLessonRange(zoned, zoned);
    },
    [buildLessonRange, timeZone],
  );

  const buildMonthRange = useCallback(() => {
    const targetMonth = addMonths(monthAnchor, monthOffset);
    const monthStart = startOfWeek(startOfMonth(targetMonth), { weekStartsOn: WEEK_STARTS_ON as 0 | 1 });
    const monthEnd = endOfWeek(endOfMonth(targetMonth), { weekStartsOn: WEEK_STARTS_ON as 0 | 1 });
    return buildLessonRange(monthStart, monthEnd);
  }, [buildLessonRange, monthAnchor, monthOffset]);

  const buildRangeFromKey = useCallback(
    (key: string): LessonRange | null => {
      const [startIso, endIso] = key.split('_');
      if (!startIso || !endIso) return null;
      const startAt = toUtcDateFromDate(startIso, timeZone);
      const endAt = toUtcEndOfDay(endIso, timeZone);
      if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return null;
      return { key, startAt, endAt, startIso, endIso };
    },
    [timeZone],
  );

  const isLessonInRange = useCallback((lesson: Lesson, range: LessonRange) => {
    const startAt = new Date(lesson.startAt).getTime();
    return startAt >= range.startAt.getTime() && startAt <= range.endAt.getTime();
  }, []);

  const isLessonInCurrentRange = useCallback(
    (lesson: Lesson) => {
      const range = lessonRangeRef.current;
      if (!range) return true;
      return isLessonInRange(lesson, range);
    },
    [isLessonInRange],
  );

  const filterLessonsForCurrentRange = useCallback(
    (items: Lesson[]) => {
      const range = lessonRangeRef.current;
      if (!range) return items;
      return items.filter((lesson) => isLessonInRange(lesson, range));
    },
    [isLessonInRange],
  );

  const applyLessonsForRange = useCallback((range: LessonRange, items: Lesson[]) => {
    const normalized = items.map(normalizeLesson);
    setLessons(normalized);
    setLessonsByRange((prev) => ({ ...prev, [range.key]: normalized }));
    lessonRangeRef.current = range;
  }, []);

  const updateLessonsForCurrentRange = useCallback((updater: (prev: Lesson[]) => Lesson[]) => {
    const range = lessonRangeRef.current;
    setLessons((prev) => {
      const next = updater(prev);
      if (range) {
        setLessonsByRange((cache) => ({ ...cache, [range.key]: next }));
      }
      return next;
    });
  }, []);

  const syncLessonsInRanges = useCallback(
    (items: Lesson[]) => {
      if (!items || items.length === 0) return;
      const normalized = items.map(normalizeLesson);
      const ids = new Set(normalized.map((lesson) => lesson.id));
      const currentKey = lessonRangeRef.current?.key ?? null;

      setLessonsByRange((prev) => {
        const next: Record<string, Lesson[]> = { ...prev };
        Object.keys(next).forEach((key) => {
          const range = buildRangeFromKey(key);
          if (!range) return;
          const filtered = (next[key] ?? []).filter((lesson) => !ids.has(lesson.id));
          const additions = normalized.filter((lesson) => isLessonInRange(lesson, range));
          const merged = [...filtered, ...additions].sort(
            (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
          );
          next[key] = merged;
        });
        if (currentKey && next[currentKey]) {
          setLessons(next[currentKey]);
        }
        return next;
      });
    },
    [buildRangeFromKey, isLessonInRange],
  );

  const removeLessonsFromRanges = useCallback(
    (options: { ids?: number[]; recurrenceGroupId?: string | null; startFrom?: Date }) => {
      const ids = options.ids ?? [];
      const recurrenceGroupId = options.recurrenceGroupId ?? null;
      const startFrom = options.startFrom ?? null;
      if (ids.length === 0 && !recurrenceGroupId) return;
      const startFromTime = startFrom ? startFrom.getTime() : null;
      const idSet = new Set(ids);
      const currentKey = lessonRangeRef.current?.key ?? null;

      setLessonsByRange((prev) => {
        const next: Record<string, Lesson[]> = { ...prev };
        Object.keys(next).forEach((key) => {
          const items = next[key] ?? [];
          next[key] = items.filter((lesson) => {
            if (idSet.has(lesson.id)) return false;
            if (recurrenceGroupId && lesson.recurrenceGroupId === recurrenceGroupId) {
              if (!startFromTime) return false;
              const lessonStart = new Date(lesson.startAt).getTime();
              if (lessonStart >= startFromTime) {
                return lesson.status !== 'SCHEDULED';
              }
              return true;
            }
            return true;
          });
        });
        if (currentKey && next[currentKey]) {
          setLessons(next[currentKey]);
        }
        return next;
      });
    },
    [],
  );

  const loadLessonsForRange = useCallback(
    async (range: LessonRange) => {
      if (!hasAccess) return;
      lessonRangeRef.current = range;
      const cached = lessonsByRangeRef.current[range.key];
      if (cached) {
        setLessons(cached);
        return;
      }
      const requestId = (lessonRangeRequestId.current += 1);
      try {
        const data = await api.listLessonsForRange({
          start: range.startAt.toISOString(),
          end: range.endAt.toISOString(),
        });
        const normalized = (data.lessons ?? []).map(normalizeLesson);
        setLessonsByRange((prev) => ({ ...prev, [range.key]: normalized }));
        if (lessonRangeRequestId.current === requestId) {
          setLessons(normalized);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to load lessons for range', error);
      }
    },
    [hasAccess],
  );

  return useMemo(
    () => ({
      lessons,
      buildLessonRange,
      buildWeekRange,
      buildDayRange,
      buildMonthRange,
      loadLessonsForRange,
      applyLessonsForRange,
      updateLessonsForCurrentRange,
      syncLessonsInRanges,
      removeLessonsFromRanges,
      isLessonInCurrentRange,
      filterLessonsForCurrentRange,
    }),
    [
      applyLessonsForRange,
      buildDayRange,
      buildLessonRange,
      buildMonthRange,
      buildWeekRange,
      filterLessonsForCurrentRange,
      isLessonInCurrentRange,
      lessons,
      loadLessonsForRange,
      removeLessonsFromRanges,
      syncLessonsInRanges,
      updateLessonsForCurrentRange,
    ],
  );
};

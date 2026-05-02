import {
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { format, parseISO } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Lesson } from '@/entities/types';
import { toUtcDateFromTimeZone, toZonedDate } from '@/shared/lib/timezoneDates';
import { normalizeWeekdayList } from '@/shared/lib/weekdays';

export const NAV_PREV_DROPPABLE_ID = 'nav:prev';
export const NAV_NEXT_DROPPABLE_ID = 'nav:next';
export const NAV_PREV_EDGE_DROPPABLE_ID = 'nav:edge:prev';
export const NAV_NEXT_EDGE_DROPPABLE_ID = 'nav:edge:next';
export const DAY_DROPPABLE_PREFIX = 'day:';

const PREV_NAV_IDS: Set<string | number> = new Set([NAV_PREV_DROPPABLE_ID, NAV_PREV_EDGE_DROPPABLE_ID]);
const NEXT_NAV_IDS: Set<string | number> = new Set([NAV_NEXT_DROPPABLE_ID, NAV_NEXT_EDGE_DROPPABLE_ID]);

const NAV_HOVER_HOLD_MS = 1000;

export type NavHoverTarget = 'prev' | 'next' | null;

export interface UseWeeklyCalendarDndParams {
  lessons: Lesson[];
  timeZone: string;
  weekendWeekdays?: number[];
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onReschedule: (lesson: Lesson, newStartAt: string) => void;
  onWeekendDrop?: (dayKey: string) => void;
}

export const isLessonDraggable = (lesson: Lesson) => lesson.status === 'SCHEDULED';

export const dayDroppableId = (dayKey: string) => `${DAY_DROPPABLE_PREFIX}${dayKey}`;

const parseDayKeyFromOverId = (overId: string | number | null | undefined): string | null => {
  if (typeof overId !== 'string') return null;
  if (!overId.startsWith(DAY_DROPPABLE_PREFIX)) return null;
  return overId.slice(DAY_DROPPABLE_PREFIX.length);
};

const computeNewStartAt = (lesson: Lesson, dayKey: string, timeZone: string) => {
  const zoned = toZonedDate(lesson.startAt, timeZone);
  const time = format(zoned, 'HH:mm');
  return toUtcDateFromTimeZone(dayKey, time, timeZone).toISOString();
};

export const useWeeklyCalendarDnd = ({
  lessons,
  timeZone,
  weekendWeekdays,
  onPrevWeek,
  onNextWeek,
  onReschedule,
  onWeekendDrop,
}: UseWeeklyCalendarDndParams) => {
  const weekendSet = useMemo(() => new Set(normalizeWeekdayList(weekendWeekdays ?? [])), [weekendWeekdays]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  const [activeLessonId, setActiveLessonId] = useState<number | null>(null);
  const [activeLessonSnapshot, setActiveLessonSnapshot] = useState<Lesson | null>(null);
  const [navHoverTarget, setNavHoverTarget] = useState<NavHoverTarget>(null);
  const navTimerRef = useRef<number | null>(null);

  const clearNavTimer = useCallback(() => {
    if (navTimerRef.current !== null) {
      window.clearTimeout(navTimerRef.current);
      navTimerRef.current = null;
    }
  }, []);

  const scheduleNavTrigger = useCallback(
    (target: 'prev' | 'next') => {
      clearNavTimer();
      navTimerRef.current = window.setTimeout(() => {
        if (target === 'prev') onPrevWeek();
        else onNextWeek();
        scheduleNavTrigger(target);
      }, NAV_HOVER_HOLD_MS);
    },
    [clearNavTimer, onNextWeek, onPrevWeek],
  );

  const stopNavHover = useCallback(() => {
    clearNavTimer();
    setNavHoverTarget(null);
  }, [clearNavTimer]);

  useEffect(() => {
    return () => {
      clearNavTimer();
    };
  }, [clearNavTimer]);

  const activeLesson = activeLessonSnapshot;

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const lessonId = typeof event.active.id === 'number' ? event.active.id : Number(event.active.id);
      if (!Number.isFinite(lessonId)) return;
      setActiveLessonId(lessonId);
      const found = lessons.find((l) => l.id === lessonId) ?? null;
      setActiveLessonSnapshot(found);
    },
    [lessons],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const overId = event.over?.id ?? null;
      if (overId !== null && PREV_NAV_IDS.has(overId)) {
        if (navHoverTarget !== 'prev') {
          setNavHoverTarget('prev');
          scheduleNavTrigger('prev');
        }
        return;
      }
      if (overId !== null && NEXT_NAV_IDS.has(overId)) {
        if (navHoverTarget !== 'next') {
          setNavHoverTarget('next');
          scheduleNavTrigger('next');
        }
        return;
      }
      if (navHoverTarget !== null) {
        stopNavHover();
      }
    },
    [navHoverTarget, scheduleNavTrigger, stopNavHover],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      stopNavHover();
      setActiveLessonId(null);
      const lessonIdNum = typeof event.active.id === 'number' ? event.active.id : Number(event.active.id);
      const lesson = lessons.find((l) => l.id === lessonIdNum) ?? activeLessonSnapshot;
      setActiveLessonSnapshot(null);
      if (!lesson || lesson.id !== lessonIdNum) return;
      const dayKey = parseDayKeyFromOverId(event.over?.id);
      if (!dayKey) return;
      if (!isLessonDraggable(lesson)) return;
      const targetDate = parseISO(dayKey);
      if (!Number.isNaN(targetDate.getTime()) && weekendSet.has(targetDate.getDay())) {
        onWeekendDrop?.(dayKey);
        return;
      }
      const newStartAt = computeNewStartAt(lesson, dayKey, timeZone);
      if (newStartAt === lesson.startAt) return;
      if (new Date(newStartAt).getTime() === new Date(lesson.startAt).getTime()) return;
      onReschedule(lesson, newStartAt);
    },
    [activeLessonSnapshot, lessons, onReschedule, onWeekendDrop, stopNavHover, timeZone, weekendSet],
  );

  const handleDragCancel = useCallback(
    (_event: DragCancelEvent) => {
      stopNavHover();
      setActiveLessonId(null);
      setActiveLessonSnapshot(null);
    },
    [stopNavHover],
  );

  return {
    sensors,
    activeLesson,
    activeLessonId,
    navHoverTarget,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  };
};

import { useEffect } from 'react';

type ScheduleView = 'day' | 'week' | 'month';

type ScheduleLessonsLoaderConfig<TRange> = {
  hasAccess: boolean;
  isActive: boolean;
  scheduleView: ScheduleView;
  dayViewDate: Date;
  buildDayRange: (date: Date) => TRange;
  buildWeekRange: (date: Date) => TRange;
  buildMonthRange: () => TRange;
  loadLessonsForRange: (range: TRange) => void | Promise<void>;
};

export const useScheduleLessonsLoaderInternal = <TRange,>({
  hasAccess,
  isActive,
  scheduleView,
  dayViewDate,
  buildDayRange,
  buildWeekRange,
  buildMonthRange,
  loadLessonsForRange,
}: ScheduleLessonsLoaderConfig<TRange>) => {
  useEffect(() => {
    if (!hasAccess || !isActive) return;
    const range =
      scheduleView === 'month'
        ? buildMonthRange()
        : scheduleView === 'week'
          ? buildWeekRange(dayViewDate)
          : buildDayRange(dayViewDate);
    void loadLessonsForRange(range);
  }, [
    buildDayRange,
    buildMonthRange,
    buildWeekRange,
    dayViewDate,
    hasAccess,
    isActive,
    loadLessonsForRange,
    scheduleView,
  ]);
};

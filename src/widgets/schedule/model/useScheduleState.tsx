import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { addDays, addMonths, endOfMonth, format, startOfMonth } from 'date-fns';
import { toUtcDateFromDate, toZonedDate } from '../../../shared/lib/timezoneDates';

export type ScheduleView = 'day' | 'week' | 'month';

export type ScheduleStateContextValue = {
  scheduleView: ScheduleView;
  setScheduleView: (view: ScheduleView) => void;
  dayViewDate: Date;
  setDayViewDate: (date: Date) => void;
  monthAnchor: Date;
  setMonthAnchor: (date: Date) => void;
  monthOffset: number;
  setMonthOffset: (value: number) => void;
  selectedMonthDay: string | null;
  setSelectedMonthDay: (dayIso: string | null) => void;
  dayLabelKey: number;
  weekLabelKey: number;
  monthLabelKey: number;
  shiftDay: (delta: number) => void;
  shiftWeek: (delta: number) => void;
  shiftMonth: (delta: number) => void;
  goToToday: () => void;
};

const ScheduleStateContext = createContext<ScheduleStateContextValue | null>(null);

export const ScheduleStateProvider = ({
  children,
  value,
}: PropsWithChildren<{ value: ScheduleStateContextValue }>) => {
  return <ScheduleStateContext.Provider value={value}>{children}</ScheduleStateContext.Provider>;
};

export const useScheduleState = () => {
  const context = useContext(ScheduleStateContext);
  if (!context) {
    throw new Error('useScheduleState must be used within ScheduleStateProvider');
  }
  return context;
};

export const useScheduleStateInternal = ({ timeZone }: { timeZone: string }): ScheduleStateContextValue => {
  const [scheduleView, setScheduleView] = useState<ScheduleView>('month');
  const [dayViewDate, setDayViewDate] = useState<Date>(() => toZonedDate(new Date(), timeZone));
  const [monthAnchor, setMonthAnchor] = useState<Date>(() => startOfMonth(toZonedDate(new Date(), timeZone)));
  const [monthOffset, setMonthOffset] = useState(0);
  const [dayLabelKey, setDayLabelKey] = useState(0);
  const [weekLabelKey, setWeekLabelKey] = useState(0);
  const [monthLabelKey, setMonthLabelKey] = useState(0);
  const [selectedMonthDay, setSelectedMonthDay] = useState<string | null>(null);

  useEffect(() => {
    const today = toZonedDate(new Date(), timeZone);
    setDayViewDate((current) => {
      const currentIso = format(current, 'yyyy-MM-dd');
      return toZonedDate(toUtcDateFromDate(currentIso, timeZone), timeZone);
    });
    setMonthAnchor(startOfMonth(today));
  }, [timeZone]);

  const shiftMonth = useCallback(
    (delta: number) => {
      setMonthOffset((prev) => {
        const next = prev + delta;
        const targetMonth = addMonths(monthAnchor, next);
        if (scheduleView === 'month') {
          setDayViewDate((current) => {
            const day = Math.min(current.getDate(), endOfMonth(targetMonth).getDate());
            return new Date(targetMonth.getFullYear(), targetMonth.getMonth(), day);
          });
        }
        return next;
      });
      setMonthLabelKey((key) => key + 1);
    },
    [monthAnchor, scheduleView],
  );

  const shiftWeek = useCallback((delta: number) => {
    setDayViewDate((prev) => addDays(prev, delta * 7));
    setWeekLabelKey((key) => key + 1);
  }, []);

  const shiftDay = useCallback((delta: number) => {
    setDayViewDate((prev) => addDays(prev, delta));
    setDayLabelKey((key) => key + 1);
  }, []);

  const goToToday = useCallback(() => {
    const today = toZonedDate(new Date(), timeZone);
    setDayViewDate(today);
    setMonthOffset(0);
    setDayLabelKey((key) => key + 1);
    setWeekLabelKey((key) => key + 1);
    setMonthLabelKey((key) => key + 1);
  }, [timeZone]);

  return useMemo(
    () => ({
      scheduleView,
      setScheduleView,
      dayViewDate,
      setDayViewDate,
      monthAnchor,
      setMonthAnchor,
      monthOffset,
      setMonthOffset,
      selectedMonthDay,
      setSelectedMonthDay,
      dayLabelKey,
      weekLabelKey,
      monthLabelKey,
      shiftDay,
      shiftWeek,
      shiftMonth,
      goToToday,
    }),
    [
      dayLabelKey,
      dayViewDate,
      goToToday,
      monthAnchor,
      monthLabelKey,
      monthOffset,
      scheduleView,
      selectedMonthDay,
      shiftDay,
      shiftMonth,
      shiftWeek,
      weekLabelKey,
    ],
  );
};

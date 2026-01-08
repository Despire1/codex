import {
  addDays,
  addMonths,
  addYears,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import type { Locale } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './day-picker.module.css';
import { useTimeZone } from '../lib/timezoneContext';
import { toZonedDate } from '../lib/timezoneDates';

type ClassNames = {
  root: string;
  nav: string;
  caption: string;
  caption_label: string;
  nav_button: string;
  weekdays: string;
  weekday: string;
  grid: string;
  months_grid: string;
  month: string;
  years_grid: string;
  year: string;
  day: string;
  day_selected: string;
  day_range: string;
  day_range_start: string;
  day_range_end: string;
  day_outside: string;
  day_today: string;
};

type DateRange = { from?: Date; to?: Date };

type DayPickerProps = {
  mode?: 'single';
  selected?: Date;
  onSelect?: (date?: Date) => void;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  locale?: Locale;
  className?: string;
  classNames?: Partial<ClassNames>;
  numberOfMonths?: number;
  defaultMonth?: Date;
} | {
  mode: 'range';
  selected?: DateRange;
  onSelect?: (range?: DateRange) => void;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  locale?: Locale;
  className?: string;
  classNames?: Partial<ClassNames>;
  numberOfMonths?: number;
  defaultMonth?: Date;
};

const mergeClassName = (base: string, override?: string) => `${base}${override ? ` ${override}` : ''}`;

export const DayPicker: React.FC<DayPickerProps> = ({
  mode = 'single',
  selected,
  onSelect,
  weekStartsOn = 1,
  locale = ru,
  className,
  classNames,
  numberOfMonths = 1,
  defaultMonth,
}) => {
  const timeZone = useTimeZone();
  const todayZoned = useMemo(() => toZonedDate(new Date(), timeZone), [timeZone]);
  const isRangeMode = mode === 'range';
  const selectedRange = (isRangeMode ? selected : undefined) as DateRange | undefined;
  const selectedDate = (!isRangeMode ? selected : undefined) as Date | undefined;

  const initialMonth = useMemo(() => {
    if (isRangeMode && selectedRange?.from) return startOfMonth(selectedRange.from);
    if (!isRangeMode && selectedDate) return startOfMonth(selectedDate);
    if (defaultMonth) return startOfMonth(defaultMonth);
    return startOfMonth(todayZoned);
  }, [defaultMonth, isRangeMode, selectedDate, selectedRange?.from, todayZoned]);

  const [month, setMonth] = useState<Date>(() => initialMonth);
  const [viewMode, setViewMode] = useState<'days' | 'months' | 'years'>('days');
  const [yearPage, setYearPage] = useState(0);

  useEffect(() => {
    if (isRangeMode && selectedRange?.from && !isSameMonth(selectedRange.from, month)) {
      setMonth(startOfMonth(selectedRange.from));
    }

    if (!isRangeMode && selectedDate && !isSameMonth(selectedDate, month)) {
      setMonth(startOfMonth(selectedDate));
    }
  }, [isRangeMode, selectedDate, selectedRange?.from]);

  const weekdays = useMemo(() => {
    const base = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const rotated = base.slice(weekStartsOn).concat(base.slice(0, weekStartsOn));
    return rotated;
  }, [weekStartsOn]);

  const monthNames = useMemo(() => {
    return Array.from({ length: 12 }, (_, index) =>
      format(new Date(2020, index, 1), 'LLL', { locale }),
    );
  }, [locale]);

  const yearRangeStart = useMemo(() => {
    const baseYear = Math.floor(month.getFullYear() / 12) * 12;
    return baseYear + yearPage * 12;
  }, [month, yearPage]);

  const monthsToRender = useMemo(() => {
    const count = Math.max(1, Math.round(numberOfMonths));
    return Array.from({ length: count }, (_, index) => startOfMonth(addMonths(month, index)));
  }, [month, numberOfMonths]);

  const buildDays = useCallback(
    (monthDate: Date) => {
      const start = startOfWeek(startOfMonth(monthDate), { weekStartsOn });
      const end = startOfWeek(addDays(endOfMonth(monthDate), 7), { weekStartsOn });

      const list: { date: Date; outside: boolean }[] = [];
      for (let cursor = start; cursor < end; cursor = addDays(cursor, 1)) {
        list.push({ date: cursor, outside: !isSameMonth(cursor, monthDate) });
      }
      return list;
    },
    [weekStartsOn],
  );

  const monthDays = useMemo(
    () => monthsToRender.map((monthDate) => ({ month: monthDate, days: buildDays(monthDate) })),
    [buildDays, monthsToRender],
  );

  const captionLabel = useMemo(() => {
    if (viewMode === 'days') return format(month, 'LLLL yyyy', { locale });
    if (viewMode === 'months') return format(month, 'yyyy', { locale });
    return `${yearRangeStart} – ${yearRangeStart + 11}`;
  }, [locale, month, viewMode, yearRangeStart]);

  const handleSelect = (date: Date) => {
    if (isRangeMode) {
      const current = selectedRange ?? {};
      const hasCompleteRange = Boolean(current.from && current.to);

      if (!current.from || hasCompleteRange) {
        onSelect?.({ from: date, to: undefined });
      } else if (current.from && !current.to) {
        if (date < current.from) {
          onSelect?.({ from: date, to: undefined });
        } else {
          onSelect?.({ from: current.from, to: date });
        }
      }
    } else {
      onSelect?.(date);
    }

    setMonth(date);
    setViewMode('days');
  };

  const handleMonthShift = (delta: number) => {
    setMonth((prev) => addMonths(prev, delta));
    setViewMode('days');
    setYearPage(0);
  };

  const handleYearSelect = (year: number) => {
    const next = new Date(month);
    next.setFullYear(year);
    setMonth(startOfMonth(next));
    setViewMode('months');
    setYearPage(0);
  };

  const handleMonthSelect = (monthIndex: number) => {
    const next = new Date(month);
    next.setMonth(monthIndex);
    setMonth(startOfMonth(next));
    setViewMode('days');
    setYearPage(0);
  };

  const handleCaptionClick = () => {
    if (viewMode === 'days') {
      setViewMode('months');
      setYearPage(0);
      return;
    }

    if (viewMode === 'months') {
      setViewMode('years');
    }
  };

  const handlePrev = () => {
    if (viewMode === 'days') {
      handleMonthShift(-1);
      return;
    }

    if (viewMode === 'months') {
      setMonth((prev) => startOfMonth(addYears(prev, -1)));
      setYearPage(0);
      return;
    }

    setYearPage((prev) => prev - 1);
  };

  const handleNext = () => {
    if (viewMode === 'days') {
      handleMonthShift(1);
      return;
    }

    if (viewMode === 'months') {
      setMonth((prev) => startOfMonth(addYears(prev, 1)));
      setYearPage(0);
      return;
    }

    setYearPage((prev) => prev + 1);
  };

  const monthsCount = monthsToRender.length;
  const showMonthTitles = monthsCount > 1;

  return (
    <div
      className={mergeClassName(styles.root, mergeClassName(className ?? '', classNames?.root))}
      style={{ ['--months-count' as string]: monthsCount }}
    >
      <div className={mergeClassName(styles.nav, classNames?.nav)}>
        <button
          type="button"
          className={mergeClassName(styles.navButton, classNames?.nav_button)}
          onClick={handlePrev}
          aria-label="Назад"
        >
          ←
        </button>
        <button
          type="button"
          className={mergeClassName(styles.captionLabel, classNames?.caption_label)}
          onClick={handleCaptionClick}
          aria-label="Выбор периода"
        >
          {captionLabel}
        </button>
        <button
          type="button"
          className={mergeClassName(styles.navButton, classNames?.nav_button)}
          onClick={handleNext}
          aria-label="Вперёд"
        >
          →
        </button>
      </div>

      {viewMode === 'days' && (
        <div className={styles.months}>
          {monthDays.map(({ month: monthDate, days }) => (
            <div key={monthDate.toISOString()} className={styles.month}>
              {showMonthTitles && (
                <div className={styles.monthTitle}>{format(monthDate, 'LLLL yyyy', { locale })}</div>
              )}
              <div className={mergeClassName(styles.weekdays, classNames?.weekdays)}>
                {weekdays.map((weekday) => (
                  <div key={weekday} className={mergeClassName('', classNames?.weekday)}>
                    {weekday}
                  </div>
                ))}
              </div>

              <div className={mergeClassName(styles.grid, classNames?.grid)}>
                {days.map(({ date, outside }) => {
                  const isSelected = !isRangeMode && selectedDate ? isSameDay(selectedDate, date) : false;
                  const isRangeStart = Boolean(selectedRange?.from && isSameDay(selectedRange.from, date));
                  const isRangeEnd = Boolean(selectedRange?.to && isSameDay(selectedRange.to, date));
                  const isInRange =
                    Boolean(selectedRange?.from && selectedRange?.to) &&
                    isWithinInterval(date, {
                      start: selectedRange!.from!,
                      end: selectedRange!.to!,
                    });
                  const today = isSameDay(date, todayZoned);
                  const classes = [styles.dayButton, classNames?.day];
                  if (outside) classes.push(styles.dayOutside, classNames?.day_outside);
                  if (isSelected) classes.push(styles.daySelected, classNames?.day_selected);
                  if (isRangeMode && isInRange) classes.push(styles.dayRange, classNames?.day_range);
                  if (isRangeMode && isRangeStart) classes.push(styles.dayRangeStart, classNames?.day_range_start);
                  if (isRangeMode && isRangeEnd) classes.push(styles.dayRangeEnd, classNames?.day_range_end);
                  if (today) classes.push(styles.dayToday, classNames?.day_today);

                  return (
                    <button
                      key={date.toISOString()}
                      type="button"
                      className={classes.filter(Boolean).join(' ')}
                      onClick={() => handleSelect(date)}
                    >
                      {format(date, 'd')}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {viewMode === 'months' && (
        <div className={mergeClassName(styles.monthsGrid, classNames?.months_grid)}>
          {monthNames.map((label, index) => (
            <button
              key={label}
              type="button"
              className={mergeClassName(styles.monthButton, classNames?.month)}
              onClick={() => handleMonthSelect(index)}
            >
              {label.charAt(0).toUpperCase() + label.slice(1)}
            </button>
          ))}
        </div>
      )}

      {viewMode === 'years' && (
        <div className={mergeClassName(styles.yearsGrid, classNames?.years_grid)}>
          {Array.from({ length: 12 }, (_, index) => yearRangeStart + index).map((year) => (
            <button
              key={year}
              type="button"
              className={mergeClassName(styles.yearButton, classNames?.year)}
              onClick={() => handleYearSelect(year)}
            >
              {year}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default DayPicker;

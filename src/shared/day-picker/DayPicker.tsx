import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import type { Locale } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import styles from './day-picker.module.css';

type ClassNames = {
  root: string;
  nav: string;
  caption: string;
  caption_label: string;
  nav_button: string;
  weekdays: string;
  weekday: string;
  grid: string;
  day: string;
  day_selected: string;
  day_outside: string;
  day_today: string;
};

type DayPickerProps = {
  mode?: 'single';
  selected?: Date;
  onSelect?: (date?: Date) => void;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  locale?: Locale;
  className?: string;
  classNames?: Partial<ClassNames>;
};

const mergeClassName = (base: string, override?: string) => `${base}${override ? ` ${override}` : ''}`;

export const DayPicker: React.FC<DayPickerProps> = ({
  selected,
  onSelect,
  weekStartsOn = 1,
  locale,
  className,
  classNames,
}) => {
  const [month, setMonth] = useState<Date>(() => selected ?? new Date());
  const [yearPickerOpen, setYearPickerOpen] = useState(false);

  useEffect(() => {
    if (selected && !isSameMonth(selected, month)) {
      setMonth(startOfMonth(selected));
    }
  }, [selected]);

  const weekdays = useMemo(() => {
    const base = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const rotated = base.slice(weekStartsOn).concat(base.slice(0, weekStartsOn));
    return rotated;
  }, [weekStartsOn]);

  const years = useMemo(() => {
    const currentYear = month.getFullYear();
    return Array.from({ length: 11 }, (_, index) => currentYear - 5 + index);
  }, [month]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn });
    const end = startOfWeek(addDays(endOfMonth(month), 7), { weekStartsOn });

    const list: { date: Date; outside: boolean }[] = [];
    for (let cursor = start; cursor < end; cursor = addDays(cursor, 1)) {
      list.push({ date: cursor, outside: !isSameMonth(cursor, month) });
    }
    return list;
  }, [month, weekStartsOn]);

  const captionLabel = useMemo(
    () => format(month, 'LLLL yyyy', { locale }),
    [locale, month],
  );

  const handleSelect = (date: Date) => {
    onSelect?.(date);
    setMonth(date);
    setYearPickerOpen(false);
  };

  const handleMonthShift = (delta: number) => {
    setMonth((prev) => addMonths(prev, delta));
    setYearPickerOpen(false);
  };

  const handleYearSelect = (year: number) => {
    const next = new Date(month);
    next.setFullYear(year);
    setMonth(startOfMonth(next));
    setYearPickerOpen(false);
  };

  return (
    <div className={mergeClassName(styles.root, mergeClassName(className ?? '', classNames?.root))}>
      <div className={mergeClassName(styles.nav, classNames?.nav)}>
        <button
          type="button"
          className={mergeClassName(styles.navButton, classNames?.nav_button)}
          onClick={() => handleMonthShift(-1)}
          aria-label="Предыдущий месяц"
        >
          ←
        </button>
        <button
          type="button"
          className={mergeClassName(styles.captionLabel, classNames?.caption_label)}
          onClick={() => setYearPickerOpen((open) => !open)}
          aria-label="Выбор года"
        >
          {captionLabel}
        </button>
        {yearPickerOpen && (
          <div className={styles.yearDropdown}>
            {years.map((year) => (
              <button
                key={year}
                type="button"
                className={styles.yearOption}
                onClick={() => handleYearSelect(year)}
              >
                {year}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className={mergeClassName(styles.navButton, classNames?.nav_button)}
          onClick={() => handleMonthShift(1)}
          aria-label="Следующий месяц"
        >
          →
        </button>
      </div>

      <div className={mergeClassName(styles.weekdays, classNames?.weekdays)}>
        {weekdays.map((weekday) => (
          <div key={weekday} className={mergeClassName('', classNames?.weekday)}>
            {weekday}
          </div>
        ))}
      </div>

      <div className={mergeClassName(styles.grid, classNames?.grid)}>
        {days.map(({ date, outside }) => {
          const isSelected = selected ? isSameDay(selected, date) : false;
          const today = isToday(date);
          const classes = [styles.dayButton, classNames?.day];
          if (outside) classes.push(styles.dayOutside, classNames?.day_outside);
          if (isSelected) classes.push(styles.daySelected, classNames?.day_selected);
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
  );
};

export default DayPicker;

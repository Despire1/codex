import { FC, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { FilterAltOutlinedIcon } from '../../../icons/MaterialIcons';
import { LessonDateRange, LessonPaymentFilter, LessonStatusFilter } from '../../../entities/types';
import { DayPicker } from '../../../shared/day-picker';
import { AdaptivePopover } from '../../../shared/ui/AdaptivePopover/AdaptivePopover';
import controls from '../../../shared/styles/controls.module.css';
import styles from '../StudentsSection.module.css';

interface LessonFiltersPopoverProps {
  lessonPaymentFilter: LessonPaymentFilter;
  lessonStatusFilter: LessonStatusFilter;
  lessonDateRange: LessonDateRange;
  onLessonPaymentFilterChange: (filter: LessonPaymentFilter) => void;
  onLessonStatusFilterChange: (filter: LessonStatusFilter) => void;
  onLessonDateRangeChange: (range: LessonDateRange) => void;
}

const parseDateValue = (value?: string) => {
  if (!value) return undefined;
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

export const LessonFiltersPopover: FC<LessonFiltersPopoverProps> = ({
  lessonPaymentFilter,
  lessonStatusFilter,
  lessonDateRange,
  onLessonPaymentFilterChange,
  onLessonStatusFilterChange,
  onLessonDateRangeChange,
}) => {
  const [open, setOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const selectedRange = useMemo(
    () => ({
      from: parseDateValue(lessonDateRange.from),
      to: parseDateValue(lessonDateRange.to),
    }),
    [lessonDateRange.from, lessonDateRange.to],
  );

  const isFilterActive = useMemo(() => {
    return (
      lessonPaymentFilter !== 'all' ||
      lessonStatusFilter !== 'all' ||
      Boolean(lessonDateRange.from) ||
      Boolean(lessonDateRange.to) ||
      lessonDateRange.fromTime !== '00:00' ||
      lessonDateRange.toTime !== '23:59'
    );
  }, [
    lessonDateRange.from,
    lessonDateRange.fromTime,
    lessonDateRange.to,
    lessonDateRange.toTime,
    lessonPaymentFilter,
    lessonStatusFilter,
  ]);

  const formatRangeLabel = () => {
    const from = selectedRange.from;
    const to = selectedRange.to;
    if (from && to) {
      return `${format(from, 'dd.MM.yyyy')} — ${format(to, 'dd.MM.yyyy')}`;
    }
    if (from) {
      return `С ${format(from, 'dd.MM.yyyy')}`;
    }
    if (to) {
      return `До ${format(to, 'dd.MM.yyyy')}`;
    }
    return 'Все';
  };

  const handleReset = () => {
    onLessonPaymentFilterChange('all');
    onLessonStatusFilterChange('all');
    onLessonDateRangeChange({
      from: '',
      to: '',
      fromTime: '00:00',
      toTime: '23:59',
    });
  };

  return (
    <AdaptivePopover
      isOpen={open}
      onClose={() => {
        setOpen(false);
        setDatePickerOpen(false);
      }}
      trigger={
        <button
          type="button"
          className={controls.iconButton}
          onClick={() => setOpen((prev) => !prev)}
          aria-label="Фильтры списка занятий"
        >
          <span className={styles.filterIconWrapper}>
            <FilterAltOutlinedIcon width={18} height={18} />
            {isFilterActive && <span className={styles.filterDot} aria-hidden />}
          </span>
        </button>
      }
      className={`${styles.filtersPopoverContent} ${styles.filtersPopoverWide}`}
    >
      <div className={styles.lessonFilterGroup}>
        <span className={styles.lessonFilterLabel}>Оплата:</span>
        {[
          { id: 'all', label: 'Все' },
          { id: 'paid', label: 'Оплачены' },
          { id: 'unpaid', label: 'Не оплачены' },
        ].map((filter) => (
          <button
            key={filter.id}
            type="button"
            className={`${styles.filterChip} ${lessonPaymentFilter === filter.id ? styles.activeChip : ''}`}
            onClick={() => onLessonPaymentFilterChange(filter.id as LessonPaymentFilter)}
          >
            {filter.label}
          </button>
        ))}
      </div>
      <div className={styles.lessonFilterGroup}>
        {[
          { id: 'all', label: 'Все' },
          { id: 'completed', label: 'Проведены' },
          { id: 'not_completed', label: 'Не проведены' },
        ].map((filter) => (
          <button
            key={filter.id}
            type="button"
            className={`${styles.filterChip} ${lessonStatusFilter === filter.id ? styles.activeChip : ''}`}
            onClick={() => onLessonStatusFilterChange(filter.id as LessonStatusFilter)}
          >
            {filter.label}
          </button>
        ))}
      </div>
      <div className={styles.lessonDateFilter}>
        <span className={styles.lessonFilterLabel}>Период:</span>
        <div className={styles.lessonDatePicker}>
          <button
            type="button"
            className={styles.lessonDateButton}
            onClick={() => setDatePickerOpen((prev) => !prev)}
          >
            {formatRangeLabel()}
          </button>
          {(lessonDateRange.from || lessonDateRange.to) && (
            <button
              type="button"
              className={styles.lessonDateClear}
              onClick={() =>
                onLessonDateRangeChange({
                  ...lessonDateRange,
                  from: '',
                  to: '',
                })
              }
              aria-label="Сбросить период"
            >
              ×
            </button>
          )}
          {datePickerOpen && (
            <div className={styles.lessonDatePopover}>
              <DayPicker
                mode="range"
                selected={selectedRange}
                onSelect={(range) => {
                  onLessonDateRangeChange({
                    ...lessonDateRange,
                    from: range?.from ? format(range.from, 'yyyy-MM-dd') : '',
                    to: range?.to ? format(range.to, 'yyyy-MM-dd') : '',
                  });
                  if (range?.from && range?.to) {
                    setDatePickerOpen(false);
                  }
                }}
                weekStartsOn={1}
                locale={ru}
                numberOfMonths={2}
              />
            </div>
          )}
        </div>
        <div className={styles.lessonTimeFields}>
          <label className={styles.lessonTimeField}>
            <span>С</span>
            <input
              type="time"
              value={lessonDateRange.fromTime}
              onChange={(event) => onLessonDateRangeChange({ ...lessonDateRange, fromTime: event.target.value })}
              className={styles.lessonTimeInput}
            />
          </label>
          <label className={styles.lessonTimeField}>
            <span>По</span>
            <input
              type="time"
              value={lessonDateRange.toTime}
              onChange={(event) => onLessonDateRangeChange({ ...lessonDateRange, toTime: event.target.value })}
              className={styles.lessonTimeInput}
            />
          </label>
        </div>
      </div>
      <div className={styles.lessonFilterActions}>
        <button
          type="button"
          className={styles.lessonResetButton}
          onClick={handleReset}
          disabled={!isFilterActive}
        >
          Сбросить фильтры
        </button>
      </div>
    </AdaptivePopover>
  );
};

import { FC, useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { LessonDateRange, LessonPaymentFilter, LessonSortOrder, LessonStatusFilter } from '../../../entities/types';
import { DayPicker } from '../../../shared/day-picker';
import controls from '../../../shared/styles/controls.module.css';
import { BottomSheet } from '../../../shared/ui/BottomSheet/BottomSheet';
import styles from '../StudentsSection.module.css';

interface LessonFiltersSheetProps {
  open: boolean;
  lessonPaymentFilter: LessonPaymentFilter;
  lessonStatusFilter: LessonStatusFilter;
  lessonDateRange: LessonDateRange;
  lessonSortOrder: LessonSortOrder;
  onApply: (filters: {
    lessonPaymentFilter: LessonPaymentFilter;
    lessonStatusFilter: LessonStatusFilter;
    lessonDateRange: LessonDateRange;
    lessonSortOrder: LessonSortOrder;
  }) => void;
  onClose: () => void;
}

const parseDateValue = (value?: string) => {
  if (!value) return undefined;
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

export const LessonFiltersSheet: FC<LessonFiltersSheetProps> = ({
  open,
  lessonPaymentFilter,
  lessonStatusFilter,
  lessonDateRange,
  lessonSortOrder,
  onApply,
  onClose,
}) => {
  const [draftPaymentFilter, setDraftPaymentFilter] = useState(lessonPaymentFilter);
  const [draftStatusFilter, setDraftStatusFilter] = useState(lessonStatusFilter);
  const [draftDateRange, setDraftDateRange] = useState(lessonDateRange);
  const [draftSortOrder, setDraftSortOrder] = useState(lessonSortOrder);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraftPaymentFilter(lessonPaymentFilter);
    setDraftStatusFilter(lessonStatusFilter);
    setDraftDateRange(lessonDateRange);
    setDraftSortOrder(lessonSortOrder);
    setDatePickerOpen(false);
  }, [lessonDateRange, lessonPaymentFilter, lessonSortOrder, lessonStatusFilter, open]);

  const selectedRange = useMemo(
    () => ({
      from: parseDateValue(draftDateRange.from),
      to: parseDateValue(draftDateRange.to),
    }),
    [draftDateRange.from, draftDateRange.to],
  );

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
    setDraftPaymentFilter('all');
    setDraftStatusFilter('all');
    setDraftDateRange({
      from: '',
      to: '',
      fromTime: '00:00',
      toTime: '23:59',
    });
    setDraftSortOrder('desc');
  };

  const handleApply = () => {
    onApply({
      lessonPaymentFilter: draftPaymentFilter,
      lessonStatusFilter: draftStatusFilter,
      lessonDateRange: draftDateRange,
      lessonSortOrder: draftSortOrder,
    });
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Фильтры">
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
            className={`${styles.filterChip} ${draftPaymentFilter === filter.id ? styles.activeChip : ''}`}
            onClick={() => setDraftPaymentFilter(filter.id as LessonPaymentFilter)}
          >
            {filter.label}
          </button>
        ))}
      </div>
      <div className={styles.lessonFilterGroup}>
        <span className={styles.lessonFilterLabel}>Статус:</span>
        {[
          { id: 'all', label: 'Все' },
          { id: 'completed', label: 'Проведены' },
          { id: 'not_completed', label: 'Не проведены' },
        ].map((filter) => (
          <button
            key={filter.id}
            type="button"
            className={`${styles.filterChip} ${draftStatusFilter === filter.id ? styles.activeChip : ''}`}
            onClick={() => setDraftStatusFilter(filter.id as LessonStatusFilter)}
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
          {(draftDateRange.from || draftDateRange.to) && (
            <button
              type="button"
              className={styles.lessonDateClear}
              onClick={() =>
                setDraftDateRange({
                  ...draftDateRange,
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
                  setDraftDateRange({
                    ...draftDateRange,
                    from: range?.from ? format(range.from, 'yyyy-MM-dd') : '',
                    to: range?.to ? format(range.to, 'yyyy-MM-dd') : '',
                  });
                  if (range?.from && range?.to) {
                    setDatePickerOpen(false);
                  }
                }}
                weekStartsOn={1}
                locale={ru}
                numberOfMonths={1}
              />
            </div>
          )}
        </div>
        <div className={styles.lessonTimeFields}>
          <label className={styles.lessonTimeField}>
            <span>С</span>
            <input
              type="time"
              value={draftDateRange.fromTime}
              onChange={(event) => setDraftDateRange({ ...draftDateRange, fromTime: event.target.value })}
              className={styles.lessonTimeInput}
            />
          </label>
          <label className={styles.lessonTimeField}>
            <span>По</span>
            <input
              type="time"
              value={draftDateRange.toTime}
              onChange={(event) => setDraftDateRange({ ...draftDateRange, toTime: event.target.value })}
              className={styles.lessonTimeInput}
            />
          </label>
        </div>
      </div>
      <div className={styles.lessonFilterGroup}>
        <span className={styles.lessonFilterLabel}>Сортировка:</span>
        <button
          type="button"
          className={`${styles.filterChip} ${draftSortOrder === 'desc' ? styles.activeChip : ''}`}
          onClick={() => setDraftSortOrder('desc')}
        >
          Сначала новые
        </button>
        <button
          type="button"
          className={`${styles.filterChip} ${draftSortOrder === 'asc' ? styles.activeChip : ''}`}
          onClick={() => setDraftSortOrder('asc')}
        >
          Сначала старые
        </button>
      </div>
      <div className={styles.lessonFilterSheetFooter}>
        <button type="button" className={controls.secondaryButton} onClick={handleReset}>
          Сбросить
        </button>
        <button type="button" className={controls.primaryButton} onClick={handleApply}>
          Применить
        </button>
      </div>
    </BottomSheet>
  );
};

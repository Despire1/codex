import { FC, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { PaymentEvent, Lesson } from '../../../entities/types';
import { FilterAltOutlinedIcon } from '../../../icons/MaterialIcons';
import { DayPicker } from '../../../shared/day-picker';
import { AdaptivePopover } from '../../../shared/ui/AdaptivePopover/AdaptivePopover';
import controls from '../../../shared/styles/controls.module.css';
import styles from '../StudentsSection.module.css';
import { PaymentList } from './PaymentList';

interface PaymentsTabProps {
  payments: PaymentEvent[];
  paymentFilter: 'all' | 'topup' | 'charges' | 'manual';
  paymentDate: string;
  onPaymentFilterChange: (filter: 'all' | 'topup' | 'charges' | 'manual') => void;
  onPaymentDateChange: (date: string) => void;
  onOpenLesson: (lesson: Lesson) => void;
}

export const PaymentsTab: FC<PaymentsTabProps> = ({
  payments,
  paymentFilter,
  paymentDate,
  onPaymentFilterChange,
  onPaymentDateChange,
  onOpenLesson,
}) => {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const selectedDate = useMemo(() => {
    if (!paymentDate) return null;
    const parsed = parseISO(paymentDate);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [paymentDate]);
  const dateLabel = selectedDate ? format(selectedDate, 'dd.MM.yyyy') : 'Все';
  const isFilterActive = paymentFilter !== 'all' || Boolean(paymentDate);

  return (
    <div className={`${styles.card} ${styles.tabCard}`}>
      <div className={styles.homeworkHeader}>
        <div className={styles.lessonsActions}>
          <div className={styles.priceLabel}>История оплат</div>
          <AdaptivePopover
            isOpen={filtersOpen}
            onClose={() => {
              setFiltersOpen(false);
              setDatePickerOpen(false);
            }}
            trigger={
              <button
                type="button"
                className={controls.iconButton}
                onClick={() => setFiltersOpen((prev) => !prev)}
                aria-label="Фильтры истории оплат"
              >
                <span className={styles.filterIconWrapper}>
                  <FilterAltOutlinedIcon width={18} height={18} />
                  {isFilterActive && <span className={styles.filterDot} aria-hidden />}
                </span>
              </button>
            }
            className={styles.filtersPopoverContent}
            side={"right"}
          >
            <div className={styles.paymentFilters}>
              {[
                { id: 'all', label: 'Все' },
                { id: 'topup', label: 'Пополнения' },
                { id: 'charges', label: 'Списания' },
                { id: 'manual', label: 'Ручные оплаты' },
              ].map((filterOption) => (
                <button
                  key={filterOption.id}
                  type="button"
                  onClick={() => {
                    onPaymentFilterChange(filterOption.id as typeof paymentFilter);
                    setFiltersOpen(false);
                  }}
                  className={`${styles.paymentFilterButton} ${
                    filterOption.id === paymentFilter ? styles.paymentFilterActive : ''
                  }`}
                >
                  {filterOption.label}
                </button>
              ))}
              <label className={styles.paymentDateFilter}>
                <span>Дата</span>
                <div className={styles.paymentDatePicker}>
                  <button
                    type="button"
                    className={styles.paymentDateButton}
                    onClick={() => setDatePickerOpen((prev) => !prev)}
                  >
                    {dateLabel}
                  </button>
                  {selectedDate && (
                    <button
                      type="button"
                      className={styles.paymentDateClear}
                      onClick={() => {
                        onPaymentDateChange('');
                        setDatePickerOpen(false);
                      }}
                      aria-label="Сбросить дату"
                    >
                      ×
                    </button>
                  )}
                  {datePickerOpen && (
                    <div className={styles.paymentDatePopover}>
                      <DayPicker
                        selected={selectedDate ?? undefined}
                        onSelect={(nextDate) => {
                          if (!nextDate) return;
                          onPaymentDateChange(format(nextDate, 'yyyy-MM-dd'));
                          setDatePickerOpen(false);
                        }}
                        weekStartsOn={1}
                        locale={ru}
                      />
                    </div>
                  )}
                </div>
              </label>
            </div>
          </AdaptivePopover>
        </div>
      </div>
      <PaymentList
        payments={payments}
        onOpenLesson={onOpenLesson}
      />
    </div>
  );
};

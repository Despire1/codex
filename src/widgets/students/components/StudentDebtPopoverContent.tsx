import { formatInTimeZone } from '../../../shared/lib/timezoneDates';
import { ru } from 'date-fns/locale';
import { Lesson, StudentDebtItem } from '../../../entities/types';
import controls from '../../../shared/styles/controls.module.css';
import styles from './StudentDebtPopoverContent.module.css';
import { useTimeZone } from '../../../shared/lib/timezoneContext';

interface StudentDebtPopoverContentProps {
  items: StudentDebtItem[];
  pendingIds: number[];
  onMarkPaid: (lessonId: number) => void;
  showCloseButton?: boolean;
  onClose?: () => void;
}

const statusLabels: Record<Lesson['status'], string> = {
  COMPLETED: 'Проведён',
  CANCELED: 'Отменён',
  SCHEDULED: 'Запланирован',
};

export const StudentDebtPopoverContent = ({
  items,
  pendingIds,
  onMarkPaid,
  showCloseButton = false,
  onClose,
}: StudentDebtPopoverContentProps) => {
  const timeZone = useTimeZone();
  return (
    <div className={styles.container}>
      <div className={styles.title}>Неоплаченные занятия</div>
      {items.length === 0 ? (
        <div className={styles.empty}>Нет неоплаченных занятий</div>
      ) : (
        <div className={styles.list}>
          {items.map((item) => {
            const isLoading = pendingIds.includes(item.id);
            const dateLabel = formatInTimeZone(item.startAt, 'd MMM yyyy, HH:mm', { locale: ru, timeZone });
            const priceLabel = item.price === null ? '—' : `${item.price} ₽`;
            const statusLabel = statusLabels[item.status];

            return (
              <div key={item.id} className={styles.item}>
                <div className={styles.itemInfo}>
                  <div className={styles.itemDate}>{dateLabel}</div>
                  {statusLabel && <div className={styles.itemStatus}>{statusLabel}</div>}
                </div>
                <div className={styles.itemActions}>
                  <span className={styles.itemAmount}>{priceLabel}</span>
                  <button
                    type="button"
                    className={`${controls.primaryButton} ${styles.payButton}`}
                    onClick={() => onMarkPaid(item.id)}
                    disabled={isLoading}
                  >
                    {isLoading ? <span className={styles.spinner} aria-hidden /> : 'Отметить оплату'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {showCloseButton && onClose && (
        <button type="button" className={`${controls.secondaryButton} ${styles.closeButton}`} onClick={onClose}>
          Закрыть
        </button>
      )}
    </div>
  );
};

import { formatInTimeZone } from '../../../shared/lib/timezoneDates';
import { ru } from 'date-fns/locale';
import { Lesson, StudentDebtItem } from '../../../entities/types';
import { NotificationsNoneOutlinedIcon } from '../../../icons/MaterialIcons';
import controls from '../../../shared/styles/controls.module.css';
import styles from './StudentDebtPopoverContent.module.css';
import { useTimeZone } from '../../../shared/lib/timezoneContext';
import { AdaptivePopover } from '../../../shared/ui/AdaptivePopover/AdaptivePopover';

interface StudentDebtPopoverContentProps {
  items: StudentDebtItem[];
  pendingIds: number[];
  pendingReminderIds: number[];
  onMarkPaid: (lessonId: number) => void;
  onSendPaymentReminder: (lessonId: number) => void;
  confirmReminderLessonId: number | null;
  confirmReminderSentAt: string | null;
  onConfirmPaymentReminder: (lessonId: number) => void;
  onCancelPaymentReminder: () => void;
  reminderDisabledReason: string | null;
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
  pendingReminderIds,
  onMarkPaid,
  onSendPaymentReminder,
  confirmReminderLessonId,
  confirmReminderSentAt,
  onConfirmPaymentReminder,
  onCancelPaymentReminder,
  reminderDisabledReason,
  showCloseButton = false,
  onClose,
}: StudentDebtPopoverContentProps) => {
  const timeZone = useTimeZone();
  const reminderDisabled = Boolean(reminderDisabledReason);
  return (
    <div className={styles.container}>
      <div className={styles.title}>Неоплаченные занятия</div>
      {items.length === 0 ? (
        <div className={styles.empty}>Нет неоплаченных занятий</div>
      ) : (
        <div className={styles.list}>
          {items.map((item) => {
            const isLoading = pendingIds.includes(item.id);
            const isReminderLoading = pendingReminderIds.includes(item.id);
            const dateLabel = formatInTimeZone(item.startAt, 'd MMM yyyy, HH:mm', { locale: ru, timeZone });
            const priceLabel = item.price === null ? '—' : `${item.price} ₽`;
            const statusLabel = statusLabels[item.status];
            const isConfirmOpen = confirmReminderLessonId === item.id;
            const reminderSentAtLabel = confirmReminderSentAt
              ? formatInTimeZone(new Date(confirmReminderSentAt), 'd MMM yyyy, HH:mm', { locale: ru, timeZone })
              : null;

            return (
              <div key={item.id} className={styles.item}>
                <div className={styles.itemInfo}>
                  <div className={styles.itemDate}>{dateLabel}</div>
                  {statusLabel && <div className={styles.itemStatus}>{statusLabel}</div>}
                </div>
                <div className={styles.itemActions}>
                  <span className={styles.itemAmount}>{priceLabel}</span>
                  <AdaptivePopover
                    isOpen={isConfirmOpen}
                    onClose={onCancelPaymentReminder}
                    trigger={(
                      <button
                        type="button"
                        className={styles.remindButton}
                        onClick={() => (isConfirmOpen ? onCancelPaymentReminder() : onSendPaymentReminder(item.id))}
                        disabled={reminderDisabled || isReminderLoading}
                        title={reminderDisabledReason ?? 'Отправить напоминание'}
                      >
                        {isReminderLoading ? <span className={styles.remindSpinner} aria-hidden /> : (
                          <NotificationsNoneOutlinedIcon width={16} height={16} />
                        )}
                      </button>
                    )}
                    side="bottom"
                    align="end"
                    offset={6}
                    className={styles.confirmPopover}
                  >
                    <div className={styles.confirmTitle}>Отправить ещё раз?</div>
                    {reminderSentAtLabel && (
                      <div className={styles.confirmText}>Последнее напоминание: {reminderSentAtLabel}</div>
                    )}
                    <div className={styles.confirmActions}>
                      <button type="button" className={controls.secondaryButton} onClick={onCancelPaymentReminder}>
                        Отмена
                      </button>
                      <button type="button" className={controls.primaryButton} onClick={() => onConfirmPaymentReminder(item.id)}>
                        Отправить
                      </button>
                    </div>
                  </AdaptivePopover>
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

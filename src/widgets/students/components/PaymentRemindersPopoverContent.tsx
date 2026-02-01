import { ru } from 'date-fns/locale';
import { Lesson, PaymentReminderLog } from '../../../entities/types';
import { formatInTimeZone } from '../../../shared/lib/timezoneDates';
import { useTimeZone } from '../../../shared/lib/timezoneContext';
import styles from './PaymentRemindersPopoverContent.module.css';

interface PaymentRemindersPopoverContentProps {
  reminders: PaymentReminderLog[];
  lessonsById: Map<number, Lesson>;
  isLoading?: boolean;
}

const statusLabels: Record<Lesson['status'], string> = {
  COMPLETED: 'Проведён',
  CANCELED: 'Отменён',
  SCHEDULED: 'Запланирован',
};

const sourceLabels: Record<PaymentReminderLog['source'], string> = {
  AUTO: 'Авто',
  MANUAL: 'Вручную',
};

const statusLabelsReminder: Record<PaymentReminderLog['status'], string> = {
  SENT: 'Доставлено',
  FAILED: 'Не доставлено',
};

export const PaymentRemindersPopoverContent = ({
  reminders,
  lessonsById,
  isLoading,
}: PaymentRemindersPopoverContentProps) => {
  const timeZone = useTimeZone();

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.title}>Напоминания об оплате</div>
        <div className={styles.loading}>Загрузка…</div>
      </div>
    );
  }

  if (reminders.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.title}>Напоминания об оплате</div>
        <div className={styles.empty}>Пока нет отправленных напоминаний.</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.title}>Напоминания об оплате</div>
      <div className={styles.list}>
        {reminders.map((reminder) => {
          const lesson = lessonsById.get(reminder.lessonId);
          const reminderDate = formatInTimeZone(reminder.createdAt, 'd MMM yyyy, HH:mm', { locale: ru, timeZone });
          const lessonDate = lesson
            ? formatInTimeZone(lesson.startAt, 'd MMM yyyy, HH:mm', { locale: ru, timeZone })
            : null;
          const lessonStatus = lesson ? statusLabels[lesson.status] : null;
          const reasonLabel = lesson
            ? lesson.paymentStatus === 'UNPAID' || !lesson.isPaid
              ? 'Неоплаченное занятие'
              : 'Оплата занятия'
            : 'Оплата занятия';

          return (
            <div key={reminder.id} className={styles.item}>
              <div className={styles.itemInfo}>
                <div className={styles.itemDate}>{reminderDate}</div>
                <div className={styles.itemReason}>{reasonLabel}</div>
                {lessonDate && (
                  <div className={styles.itemLesson}>
                    <span>{lessonDate}</span>
                    {lessonStatus && <span className={styles.itemLessonStatus}>{lessonStatus}</span>}
                  </div>
                )}
              </div>
              <div className={styles.itemMeta}>
                <span className={styles.itemBadge}>{sourceLabels[reminder.source]}</span>
                <span className={styles.itemStatus}>{statusLabelsReminder[reminder.status]}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

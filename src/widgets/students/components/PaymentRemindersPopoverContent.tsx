import { useEffect, useRef } from 'react';
import { ru } from 'date-fns/locale';
import { Lesson, PaymentReminderLog } from '../../../entities/types';
import { formatInTimeZone } from '../../../shared/lib/timezoneDates';
import { useTimeZone } from '../../../shared/lib/timezoneContext';
import styles from './PaymentRemindersPopoverContent.module.css';

interface PaymentRemindersPopoverContentProps {
  reminders: PaymentReminderLog[];
  lessonsById: Map<number, Lesson>;
  isLoading?: boolean;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
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
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}: PaymentRemindersPopoverContentProps) => {
  const timeZone = useTimeZone();
  const listRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasMore || isLoadingMore) return;
    if (!onLoadMore) return;
    const target = loadMoreRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMore();
        }
      },
      { root: listRef.current, rootMargin: '120px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, onLoadMore]);

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
      <div className={styles.list} ref={listRef}>
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
        {isLoadingMore && <div className={styles.loadMore}>Загрузка…</div>}
        {hasMore && <div className={styles.loadMoreSentinel} ref={loadMoreRef} aria-hidden />}
      </div>
    </div>
  );
};

import { formatDistanceToNowStrict } from 'date-fns';
import { formatInTimeZone } from '../../../shared/lib/timezoneDates';
import { ru } from 'date-fns/locale';
import { FC } from 'react';
import controls from '../../../shared/styles/controls.module.css';
import { Badge } from '../../../shared/ui/Badge/Badge';
import styles from './UnpaidLessonsPopoverContent.module.css';
import { useTimeZone } from '../../../shared/lib/timezoneContext';
import { NotificationsNoneOutlinedIcon } from '../../../icons/MaterialIcons';

interface UnpaidLessonEntry {
  lessonId: number;
  startAt: string;
  completedAt: string | null;
  lastPaymentReminderAt: string | null;
  paymentReminderCount: number;
  studentId: number;
  studentName: string;
  price: number;
  isActivated: boolean;
  paymentRemindersEnabled: boolean;
}

interface UnpaidLessonsPopoverContentProps {
  entries: UnpaidLessonEntry[];
  reminderDelayHours: number;
  globalPaymentRemindersEnabled: boolean;
  onOpenStudent: (studentId: number) => void;
  onTogglePaid: (lessonId: number, studentId?: number) => void;
  onRemindLessonPayment: (lessonId: number, studentId?: number) => Promise<void> | void;
}

const capitalizeFirst = (value: string) => (value ? value[0].toUpperCase() + value.slice(1) : value);

export const UnpaidLessonsPopoverContent: FC<UnpaidLessonsPopoverContentProps> = ({
  entries,
  reminderDelayHours,
  globalPaymentRemindersEnabled,
  onOpenStudent,
  onTogglePaid,
  onRemindLessonPayment,
}) => {
  const timeZone = useTimeZone();
  const now = new Date();

  const sortedEntries = [...entries].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );

  const reminderDelayMs = Math.max(1, reminderDelayHours) * 60 * 60 * 1000;
  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.title}>Неоплаченные ({entries.length})</div>
        <button type="button" className={styles.allPaymentsButton}>
          Все оплаты
        </button>
      </div>
      {entries.length === 0 ? (
        <div className={styles.empty}>Нет неоплаченных занятий</div>
      ) : (
        <div className={styles.list}>
          {sortedEntries.map((entry) => {
            const lessonDate = capitalizeFirst(
              formatInTimeZone(entry.startAt, 'd MMM', { locale: ru, timeZone }).replace('.', ''),
            );
            const priceLabel = `${entry.price} ₽`;
            const reminderLabel = entry.isActivated
              ? entry.lastPaymentReminderAt
                ? `Напоминание отправлено ${formatDistanceToNowStrict(new Date(entry.lastPaymentReminderAt), {
                    addSuffix: true,
                    locale: ru,
                  })}.`
                : 'Напоминание не отправлялось.'
              : 'Ученик не активировал бота — отправка невозможна.';
            const showProgress =
              entry.isActivated &&
              !entry.lastPaymentReminderAt &&
              globalPaymentRemindersEnabled &&
              entry.paymentRemindersEnabled &&
              entry.completedAt;
            const progressValue = showProgress
              ? Math.min(
                  (now.getTime() - new Date(entry.completedAt ?? entry.startAt).getTime()) / reminderDelayMs,
                  1,
                )
              : 0;
            const waitLabel = `Ждём ${Math.max(1, reminderDelayHours)}ч`;
            const avatarLetter = entry.studentName.trim().charAt(0).toUpperCase() || 'У';
            const reminderDisabledReason = entry.isActivated
              ? null
              : 'Ученик не активировал бота — отправка невозможна';

            return (
              <div key={`${entry.lessonId}-${entry.studentId}`} className={styles.item}>
                <div className={styles.itemHeader}>
                  <div className={styles.avatar}>{avatarLetter}</div>
                  <div className={styles.itemHeaderInfo}>
                    <button
                      type="button"
                      className={styles.studentName}
                      onClick={() => onOpenStudent(entry.studentId)}
                    >
                      {entry.studentName}
                    </button>
                    <div className={styles.lessonMeta}>
                      Урок {lessonDate} • {priceLabel}
                    </div>
                  </div>
                  <Badge className={styles.debtBadge} label="долг" variant="unpaid" />
                </div>

                <div className={styles.reminderRow}>
                  <NotificationsNoneOutlinedIcon width={16} height={16} />
                  <span>{reminderLabel}</span>
                </div>

                <div className={styles.actionsRow}>
                  <button
                    type="button"
                    className={`${controls.primaryButton} ${styles.payButton}`}
                    onClick={() => onTogglePaid(entry.lessonId, entry.studentId)}
                  >
                    Отметить оплату
                  </button>
                  <button
                    type="button"
                    className={styles.remindButton}
                    onClick={() => onRemindLessonPayment(entry.lessonId, entry.studentId)}
                    title={reminderDisabledReason ?? 'Отправить напоминание'}
                    disabled={Boolean(reminderDisabledReason)}
                  >
                    <NotificationsNoneOutlinedIcon width={18} height={18} />
                  </button>
                </div>

                {showProgress && (
                  <div className={styles.progressRow}>
                    <div className={styles.progressTrack}>
                      <span className={styles.progressFill} style={{ width: `${progressValue * 100}%` }} />
                    </div>
                    <div className={styles.progressLabel}>{waitLabel}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

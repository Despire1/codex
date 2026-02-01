import { formatDistanceToNowStrict } from 'date-fns';
import { formatInTimeZone } from '../../../shared/lib/timezoneDates';
import { ru } from 'date-fns/locale';
import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  onRemindLessonPayment: (
    lessonId: number,
    studentId?: number,
  ) => Promise<{ status: 'sent' | 'error' }> | { status: 'sent' | 'error' };
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
  const [pendingReminderIds, setPendingReminderIds] = useState<Set<string>>(new Set());
  const [successReminderIds, setSuccessReminderIds] = useState<Set<string>>(new Set());
  const [optimisticReminders, setOptimisticReminders] = useState<Record<string, string>>({});
  const successTimeouts = useRef<Map<string, number>>(new Map());
  const [isExpanded, setIsExpanded] = useState(false);

  const sortedEntries = [...entries].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );

  const entryKeys = useMemo(
    () => new Map(sortedEntries.map((entry) => [`${entry.lessonId}-${entry.studentId}`, entry])),
    [sortedEntries],
  );

  const reminderDelayMs = Math.max(1, reminderDelayHours) * 60 * 60 * 1000;

  useEffect(() => {
    return () => {
      successTimeouts.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      successTimeouts.current.clear();
    };
  }, []);

  const handleReminderSend = useCallback(
    async (lessonId: number, studentId?: number) => {
      if (studentId === undefined) return;
      const key = `${lessonId}-${studentId}`;
      if (pendingReminderIds.has(key)) return;
      const entry = entryKeys.get(key);
      if (!entry || !entry.isActivated) return;

      setPendingReminderIds((prev) => new Set(prev).add(key));
      try {
        const result = await onRemindLessonPayment(lessonId, studentId);
        if (result && result.status !== 'sent') {
          return;
        }
        const nowIso = new Date().toISOString();
        setOptimisticReminders((prev) => ({ ...prev, [key]: nowIso }));
        setSuccessReminderIds((prev) => new Set(prev).add(key));
        const timeoutId = window.setTimeout(() => {
          setSuccessReminderIds((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
          successTimeouts.current.delete(key);
        }, 1200);
        successTimeouts.current.set(key, timeoutId);
      } catch (error) {
        // keep previous reminder timestamp on failure
      } finally {
        setPendingReminderIds((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [entryKeys, onRemindLessonPayment, pendingReminderIds],
  );

  const visibleEntries = isExpanded ? sortedEntries : sortedEntries.slice(0, 2);
  const showToggle = sortedEntries.length > 2;
  const isScrollable = isExpanded && sortedEntries.length > 4;

  return (
      <div className={styles.root}>
        <div className={styles.header}>
          <div className={styles.title}>Неоплаченные ({entries.length})</div>
        </div>

        {entries.length === 0 ? (
            <div className={styles.empty}>Нет неоплаченных занятий</div>
        ) : (
            <>
              <div className={`${styles.list} ${isScrollable ? styles.listScrollable : ''}`}>
                {visibleEntries.map((entry) => {
                  const entryKey = `${entry.lessonId}-${entry.studentId}`;
                  const reminderTimestamp = optimisticReminders[entryKey] ?? entry.lastPaymentReminderAt;

                  const lessonDate = capitalizeFirst(
                      formatInTimeZone(entry.startAt, 'd MMM', { locale: ru, timeZone }).replace('.', ''),
                  );

                  const priceLabel = `${entry.price} ₽`;

                  const reminderLabel = entry.isActivated
                      ? reminderTimestamp
                          ? `Напоминание отправлено ${formatDistanceToNowStrict(new Date(reminderTimestamp), {
                            addSuffix: true,
                            locale: ru,
                          })}.`
                          : 'Напоминание не отправлялось.'
                      : 'Ученик не активировал бота — отправка невозможна.';

                  const showProgress =
                      entry.isActivated &&
                      !reminderTimestamp &&
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

                  const isPending = pendingReminderIds.has(entryKey);
                  const isSuccess = successReminderIds.has(entryKey);

                  return (
                      <div key={entryKey} className={styles.item}>
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
                              onClick={() => handleReminderSend(entry.lessonId, entry.studentId)}
                              title={reminderDisabledReason ?? 'Отправить напоминание'}
                              disabled={Boolean(reminderDisabledReason) || isPending}
                          >
                            {isPending ? (
                                <span className={styles.iconSpinner} aria-hidden />
                            ) : isSuccess ? (
                                <span className={styles.iconCheck} aria-hidden />
                            ) : (
                                <NotificationsNoneOutlinedIcon width={18} height={18} />
                            )}
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

              {showToggle && (
                  <div className={styles.toggleWrapper}>
                    <button
                        type="button"
                        className={styles.toggleButton}
                        onClick={() => setIsExpanded((prev) => !prev)}
                    >
                      {isExpanded ? 'Свернуть' : 'Показать все'}
                    </button>
                  </div>
              )}
            </>
        )}
      </div>
  );
};

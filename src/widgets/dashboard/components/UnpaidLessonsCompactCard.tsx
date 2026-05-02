import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UnpaidLessonEntry } from '@/entities/types';
import { useTimeZone } from '@/shared/lib/timezoneContext';
import { formatInTimeZone } from '@/shared/lib/timezoneDates';
import { ru } from 'date-fns/locale';
import { pluralizeRu } from '@/shared/lib/pluralizeRu';
import { Tooltip } from '@/shared/ui/Tooltip/Tooltip';
import { DoneOutlinedIcon, NotificationsNoneOutlinedIcon } from '@/icons/MaterialIcons';
import styles from './UnpaidLessonsCompactCard.module.css';

interface UnpaidLessonsCompactCardProps {
  entries: UnpaidLessonEntry[];
  onOpenStudent: (studentId: number) => void;
  onTogglePaid: (lessonId: number, studentId?: number) => void;
  onRemindLessonPayment: (
    lessonId: number,
    studentId?: number,
  ) => Promise<{ status: 'sent' | 'error' }> | { status: 'sent' | 'error' };
  onShowAll: () => void;
  className?: string;
  maxRows?: number;
}

const formatRub = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;

const capitalize = (value: string) => (value ? value[0].toUpperCase() + value.slice(1) : value);

const overdueDays = (startAt: string, completedAt: string | null) => {
  const reference = completedAt ? new Date(completedAt).getTime() : new Date(startAt).getTime();
  return Math.max(0, Math.floor((Date.now() - reference) / (24 * 60 * 60 * 1000)));
};

export const UnpaidLessonsCompactCard: FC<UnpaidLessonsCompactCardProps> = ({
  entries,
  onOpenStudent,
  onTogglePaid,
  onRemindLessonPayment,
  onShowAll,
  className,
  maxRows = 3,
}) => {
  const timeZone = useTimeZone();
  const [pendingReminderIds, setPendingReminderIds] = useState<Set<string>>(new Set());
  const [successReminderIds, setSuccessReminderIds] = useState<Set<string>>(new Set());
  const successTimers = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const timers = successTimers.current;
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
    };
  }, []);

  const sorted = useMemo(
    () => [...entries].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
    [entries],
  );

  const visible = sorted.slice(0, maxRows);
  const totalRub = useMemo(
    () => entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.price) || 0), 0),
    [entries],
  );

  const handleRemind = useCallback(
    async (lessonId: number, studentId: number) => {
      const key = `${lessonId}-${studentId}`;
      if (pendingReminderIds.has(key) || successReminderIds.has(key)) return;
      setPendingReminderIds((prev) => new Set(prev).add(key));
      try {
        const result = await onRemindLessonPayment(lessonId, studentId);
        if (result.status === 'sent') {
          setSuccessReminderIds((prev) => new Set(prev).add(key));
          const timerId = window.setTimeout(() => {
            setSuccessReminderIds((prev) => {
              const next = new Set(prev);
              next.delete(key);
              return next;
            });
            successTimers.current.delete(key);
          }, 2400);
          successTimers.current.set(key, timerId);
        }
      } finally {
        setPendingReminderIds((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [onRemindLessonPayment, pendingReminderIds, successReminderIds],
  );

  const handleRemindAll = useCallback(() => {
    visible.forEach((entry) => {
      if (entry.isActivated) void handleRemind(entry.lessonId, entry.studentId);
    });
  }, [handleRemind, visible]);

  if (entries.length === 0) {
    return (
      <section className={[styles.card, className].filter(Boolean).join(' ')}>
        <div className={styles.head}>
          <div className={styles.titleRow}>
            <span className={styles.icon} aria-hidden>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.001 10h2v5h-2zM11 16h2v2h-2z" />
                <path d="M13.768 4.2C13.42 3.545 12.742 3.138 12 3.138s-1.42.407-1.768 1.063L2.894 18.064a1.986 1.986 0 0 0 .054 1.968A1.984 1.984 0 0 0 4.661 21h14.678c.708 0 1.349-.362 1.714-.968a1.989 1.989 0 0 0 .054-1.968L13.768 4.2zM4.661 19 12 5.137 19.344 19H4.661z" />
              </svg>
            </span>
            <h3 className={styles.title}>Неоплаченные</h3>
          </div>
        </div>
        <div className={styles.empty}>Все занятия оплачены</div>
      </section>
    );
  }

  return (
    <section className={[styles.card, className].filter(Boolean).join(' ')}>
      <div className={styles.head}>
        <div className={styles.titleRow}>
          <span className={styles.icon} aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.001 10h2v5h-2zM11 16h2v2h-2z" />
              <path d="M13.768 4.2C13.42 3.545 12.742 3.138 12 3.138s-1.42.407-1.768 1.063L2.894 18.064a1.986 1.986 0 0 0 .054 1.968A1.984 1.984 0 0 0 4.661 21h14.678c.708 0 1.349-.362 1.714-.968a1.989 1.989 0 0 0 .054-1.968L13.768 4.2zM4.661 19 12 5.137 19.344 19H4.661z" />
            </svg>
          </span>
          <h3 className={styles.title}>Неоплаченные</h3>
          <span className={styles.badge}>
            {entries.length} · {formatRub(totalRub)}
          </span>
        </div>
        {entries.length > maxRows && (
          <button type="button" className={styles.link} onClick={onShowAll}>
            Все →
          </button>
        )}
      </div>

      <ul className={styles.list}>
        {visible.map((entry) => {
          const key = `${entry.lessonId}-${entry.studentId}`;
          const days = overdueDays(entry.startAt, entry.completedAt);
          const isPending = pendingReminderIds.has(key);
          const isSuccess = successReminderIds.has(key);
          const dateLabel = capitalize(
            formatInTimeZone(entry.startAt, 'd MMM', { locale: ru, timeZone }).replace('.', ''),
          );
          const remindDisabled = !entry.isActivated || isPending || isSuccess;
          const remindReason = entry.isActivated
            ? isSuccess
              ? 'Напоминание отправлено'
              : 'Напомнить в Telegram'
            : 'Ученик не активировал бот';

          return (
            <li key={key} className={styles.row}>
              <div className={styles.avatar}>{entry.studentName.trim().charAt(0).toUpperCase() || 'У'}</div>
              <div className={styles.main}>
                <button
                  type="button"
                  className={styles.name}
                  onClick={() => onOpenStudent(entry.studentId)}
                  title={entry.studentName}
                >
                  {entry.studentName}
                </button>
                <span className={styles.meta}>
                  {dateLabel} · {formatRub(Math.max(0, Number(entry.price) || 0))}
                </span>
              </div>
              <div className={styles.right}>
                {days > 0 && (
                  <span className={`${styles.overduePill} ${days >= 7 ? styles.overduePillStrong : ''}`}>
                    {pluralizeRu(days, { one: 'дн.', few: 'дн.', many: 'дн.' })}
                  </span>
                )}
                <Tooltip content={remindReason}>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    onClick={() => handleRemind(entry.lessonId, entry.studentId)}
                    disabled={remindDisabled}
                    aria-label={remindReason}
                  >
                    {isPending ? (
                      <span className={styles.spinner} aria-hidden />
                    ) : isSuccess ? (
                      <DoneOutlinedIcon width={14} height={14} />
                    ) : (
                      <NotificationsNoneOutlinedIcon width={14} height={14} />
                    )}
                  </button>
                </Tooltip>
                <Tooltip content={`Отметить урок ${dateLabel} как оплаченный`}>
                  <button
                    type="button"
                    className={styles.payBtn}
                    onClick={() => onTogglePaid(entry.lessonId, entry.studentId)}
                    aria-label={`Отметить урок ${dateLabel} как оплаченный`}
                  >
                    <DoneOutlinedIcon width={14} height={14} />
                  </button>
                </Tooltip>
              </div>
            </li>
          );
        })}
      </ul>

      <button type="button" className={styles.cta} onClick={handleRemindAll}>
        Напомнить всем
      </button>
    </section>
  );
};

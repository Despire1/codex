import { addDays, isSameDay, ru } from 'date-fns';
import { FC, ReactNode, UIEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarIcon,
  CloseIcon,
  EventNoteIcon,
  NotificationsNoneOutlinedIcon,
  PaidOutlinedIcon,
} from '../../../icons/MaterialIcons';
import { ActivityCategory, ActivityFeedItem } from '../../../entities/types';
import { useTimeZone } from '../../../shared/lib/timezoneContext';
import { formatInTimeZone, toZonedDate } from '../../../shared/lib/timezoneDates';
import { useTelegramBotUsername } from '../../../features/auth/telegram/model/useTelegramBotUsername';
import { buildActivityTimelinePresentation } from '../model/activityFeedPresentation';
import type { DashboardActivityFilters } from '../model/useDashboardActivityFeed';
import styles from './ActivityFeedDrawer.module.css';

const ANIMATION_DURATION = 220;

type FilterKey = 'all' | 'reminders' | 'payments' | 'lessons';

const FILTER_CHIPS: { key: FilterKey; label: string; categories: ActivityCategory[] }[] = [
  { key: 'all', label: 'Все', categories: [] },
  { key: 'reminders', label: 'Напоминания', categories: ['NOTIFICATION'] },
  { key: 'payments', label: 'Оплаты', categories: ['PAYMENT'] },
  { key: 'lessons', label: 'Уроки', categories: ['LESSON'] },
];

const formatUnreadLabel = (count: number): string => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${count} новых`;
  if (mod10 === 1) return `${count} новое`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} новых`;
  return `${count} новых`;
};

const TEACHER_ACTIONS_WITH_BOT_CTA = new Set([
  'PAYMENT_REMINDER_TEACHER',
  'TEACHER_LESSON_REMINDER',
  'TEACHER_DAILY_SUMMARY',
  'TEACHER_TOMORROW_SUMMARY',
]);

interface ActivityFeedDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: ActivityFeedItem[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  filters: DashboardActivityFilters;
  onApplyFilters: (next: DashboardActivityFilters) => void;
  unreadThreshold: string | null | undefined;
}

interface DayGroup {
  key: string;
  label: string;
  items: ActivityFeedItem[];
}

const resolveActiveFilterKey = (filters: DashboardActivityFilters): FilterKey => {
  if (filters.studentId !== null || filters.from || filters.to) return 'all';
  if (filters.categories.length === 0) return 'all';
  if (filters.categories.length !== 1) return 'all';
  const [only] = filters.categories;
  if (only === 'NOTIFICATION') return 'reminders';
  if (only === 'PAYMENT') return 'payments';
  if (only === 'LESSON') return 'lessons';
  return 'all';
};

const buildDayGroups = (items: ActivityFeedItem[], timeZone: string): DayGroup[] => {
  if (items.length === 0) return [];
  const today = toZonedDate(new Date(), timeZone);
  const yesterday = addDays(today, -1);
  const groups: DayGroup[] = [];

  for (const item of items) {
    const eventDate = toZonedDate(item.occurredAt, timeZone);
    const dayKey = formatInTimeZone(item.occurredAt, 'yyyy-MM-dd', { timeZone });

    let label: string;
    if (isSameDay(eventDate, today)) label = 'Сегодня';
    else if (isSameDay(eventDate, yesterday)) label = 'Вчера';
    else label = formatInTimeZone(item.occurredAt, 'd MMM', { locale: ru, timeZone });

    const last = groups[groups.length - 1];
    if (last && last.key === dayKey) {
      last.items.push(item);
    } else {
      groups.push({ key: dayKey, label, items: [item] });
    }
  }

  return groups;
};

const renderHighlightedMessage = (message: string, highlight?: string | null): ReactNode => {
  if (!highlight) return message;
  const normalizedHighlight = highlight.trim();
  if (!normalizedHighlight) return message;
  const index = message.indexOf(normalizedHighlight);
  if (index === -1) return message;
  // Имя в message может быть склонённым (Артема, Артему). Расширяем выделение до конца слова,
  // чтобы окончание не оставалось не-жирным.
  let endIndex = index + normalizedHighlight.length;
  while (endIndex < message.length && /[\p{L}]/u.test(message[endIndex])) {
    endIndex += 1;
  }
  return (
    <>
      {message.slice(0, index)}
      <strong>{message.slice(index, endIndex)}</strong>
      {message.slice(endIndex)}
    </>
  );
};

const resolveCategoryDot = (item: ActivityFeedItem, isFailed: boolean) => {
  if (isFailed) return { className: styles.dotFailed, icon: <NotificationsNoneOutlinedIcon /> };
  switch (item.category) {
    case 'NOTIFICATION':
      return { className: styles.dotBell, icon: <NotificationsNoneOutlinedIcon /> };
    case 'PAYMENT':
      return { className: styles.dotPaid, icon: <PaidOutlinedIcon /> };
    case 'LESSON':
      return { className: styles.dotLesson, icon: <EventNoteIcon /> };
    default:
      return { className: '', icon: <CalendarIcon /> };
  }
};

export const ActivityFeedDrawer: FC<ActivityFeedDrawerProps> = ({
  isOpen,
  onClose,
  items,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  filters,
  onApplyFilters,
  unreadThreshold,
}) => {
  const timeZone = useTimeZone();
  const botUsername = useTelegramBotUsername();
  const [isMounted, setIsMounted] = useState(isOpen);
  const [isPresented, setIsPresented] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const autoLoadLockRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      const timer = window.setTimeout(() => setIsPresented(true), 16);
      return () => window.clearTimeout(timer);
    }
    setIsPresented(false);
    const timer = window.setTimeout(() => setIsMounted(false), ANIMATION_DURATION);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!loadingMore) autoLoadLockRef.current = false;
  }, [loadingMore, items.length]);

  const activeFilterKey = useMemo(() => resolveActiveFilterKey(filters), [filters]);
  const dayGroups = useMemo(() => buildDayGroups(items, timeZone), [items, timeZone]);
  const isItemUnread = useCallback(
    (item: ActivityFeedItem) => {
      if (unreadThreshold === undefined) return false;
      if (unreadThreshold === null) return true;
      return item.occurredAt > unreadThreshold;
    },
    [unreadThreshold],
  );
  const unreadCount = useMemo(() => items.filter((item) => isItemUnread(item)).length, [items, isItemUnread]);

  const handleChipClick = (chip: (typeof FILTER_CHIPS)[number]) => {
    onApplyFilters({
      categories: chip.categories,
      studentId: null,
      from: '',
      to: '',
    });
  };

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!hasMore || loading || loadingMore) return;
    const element = event.currentTarget;
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (remaining <= 96) {
      if (autoLoadLockRef.current) return;
      autoLoadLockRef.current = true;
      onLoadMore();
    }
  };

  if (!isMounted) return null;

  return createPortal(
    <div className={`${styles.root} ${isPresented ? styles.rootOpen : ''}`.trim()} aria-hidden={!isOpen}>
      <button type="button" className={styles.backdrop} aria-label="Закрыть" onClick={onClose} />
      <aside
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Лента активности"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.head}>
          <div className={styles.titleRow}>
            <h2 className={styles.title}>Лента активности</h2>
            {unreadCount > 0 ? (
              <span className={styles.unreadBadge} aria-label={formatUnreadLabel(unreadCount)}>
                {formatUnreadLabel(unreadCount)}
              </span>
            ) : null}
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">
            <CloseIcon width={16} height={16} />
          </button>
        </div>

        <div className={styles.body} ref={bodyRef} onScroll={handleScroll}>
          <div className={styles.filters}>
            {FILTER_CHIPS.map((chip) => {
              const isActive = chip.key === activeFilterKey;
              return (
                <button
                  key={chip.key}
                  type="button"
                  className={`${styles.chip} ${isActive ? styles.chipActive : ''}`.trim()}
                  onClick={() => handleChipClick(chip)}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>

          {loading && items.length === 0 ? (
            <div className={styles.state}>Загрузка…</div>
          ) : items.length === 0 ? (
            <div className={styles.state}>Событий по выбранным фильтрам нет.</div>
          ) : (
            <>
              {dayGroups.map((group) => (
                <div key={group.key}>
                  <div className={styles.dayLabel}>{group.label}</div>
                  {group.items.map((item) => {
                    const presentation = buildActivityTimelinePresentation(item, timeZone);
                    const isFailed = item.status === 'FAILED';
                    const { className: dotClass, icon } = resolveCategoryDot(item, isFailed);
                    const timeLabel = formatInTimeZone(item.occurredAt, 'HH:mm', { timeZone });
                    const showBotCta =
                      isFailed &&
                      TEACHER_ACTIONS_WITH_BOT_CTA.has(item.action) &&
                      Boolean(botUsername) &&
                      ((item.details ?? '').toLowerCase().includes('chat not found') ||
                        (item.details ?? '').toLowerCase().includes('blocked by the user'));

                    const unread = isItemUnread(item);

                    return (
                      <div key={item.id} className={`${styles.item} ${unread ? styles.itemUnread : ''}`.trim()}>
                        <span className={`${styles.dot} ${dotClass}`.trim()}>
                          {icon}
                          {unread ? <span className={styles.unreadDot} aria-hidden /> : null}
                        </span>
                        <div>
                          <div className={styles.text}>
                            {renderHighlightedMessage(presentation.message, item.studentName)}
                          </div>
                          {presentation.details ? <div className={styles.details}>{presentation.details}</div> : null}
                          {showBotCta ? (
                            <a
                              className={styles.cta}
                              href={`https://t.me/${botUsername}`}
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              Открыть бота в Telegram
                            </a>
                          ) : null}
                        </div>
                        <span className={styles.time}>{timeLabel}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
              {loadingMore ? <div className={styles.loadingMore}>Загрузка…</div> : null}
            </>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
};

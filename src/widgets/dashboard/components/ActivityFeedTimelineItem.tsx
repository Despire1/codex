import { FC, useMemo } from 'react';
import { ActivityFeedItem } from '../../../entities/types';
import { buildActivityTimelinePresentation } from '../model/activityFeedPresentation';
import { useTelegramBotUsername } from '../../../features/auth/telegram/model/useTelegramBotUsername';
import styles from './ActivityFeedTimelineItem.module.css';

interface ActivityFeedTimelineItemProps {
  item: ActivityFeedItem;
  timeZone: string;
  isLast: boolean;
}

const renderHighlightedMessage = (message: string, highlight?: string | null) => {
  if (!highlight) return message;
  const normalizedHighlight = highlight.trim();
  if (!normalizedHighlight) return message;
  const index = message.indexOf(normalizedHighlight);
  if (index === -1) return message;
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

const TEACHER_ACTIONS_WITH_BOT_CTA = new Set([
  'PAYMENT_REMINDER_TEACHER',
  'TEACHER_LESSON_REMINDER',
  'TEACHER_DAILY_SUMMARY',
  'TEACHER_TOMORROW_SUMMARY',
]);

const resolveCategoryClass = (category: string) => {
  switch (category) {
    case 'LESSON':
      return styles.dotLesson;
    case 'PAYMENT':
      return styles.dotPayment;
    case 'HOMEWORK':
      return styles.dotHomework;
    case 'NOTIFICATION':
      return styles.dotNotification;
    case 'SETTINGS':
      return styles.dotSettings;
    default:
      return styles.dotDefault;
  }
};

export const ActivityFeedTimelineItem: FC<ActivityFeedTimelineItemProps> = ({ item, timeZone, isLast }) => {
  const presentation = buildActivityTimelinePresentation(item, timeZone);
  const botUsername = useTelegramBotUsername();
  const toneClass = presentation.tone === 'failed' ? styles.dotFailed : resolveCategoryClass(item.category);

  const showBotCta = useMemo(() => {
    if (item.status !== 'FAILED') return false;
    if (!TEACHER_ACTIONS_WITH_BOT_CTA.has(item.action)) return false;
    const details = (item.details ?? '').toLowerCase();
    return details.includes('chat not found') || details.includes('blocked by the user');
  }, [item.action, item.details, item.status]);

  return (
    <div className={`${styles.root} ${isLast ? styles.rootLast : ''}`}>
      <div className={styles.track}>
        <span className={`${styles.dot} ${toneClass}`} />
        {!isLast && <span className={styles.line} />}
      </div>
      <div className={styles.content}>
        <div className={styles.time}>
          <span>{presentation.timeLabel}</span>
          {presentation.groupedCount ? (
            <span
              className={styles.groupedBadge}
              title={presentation.groupedRangeLabel ?? undefined}
              aria-label={`${presentation.groupedCount} обновлений${presentation.groupedRangeLabel ? `, ${presentation.groupedRangeLabel}` : ''}`}
            >
              ×{presentation.groupedCount}
              {presentation.groupedRangeLabel ? (
                <span className={styles.groupedBadgeRange}>{presentation.groupedRangeLabel}</span>
              ) : null}
            </span>
          ) : null}
        </div>
        <div className={styles.message}>{renderHighlightedMessage(presentation.message, item.studentName)}</div>
        {presentation.details && <div className={styles.details}>{presentation.details}</div>}
        {showBotCta && botUsername ? (
          <a className={styles.cta} href={`https://t.me/${botUsername}`} target="_blank" rel="noreferrer noopener">
            Открыть бота в Telegram
          </a>
        ) : null}
      </div>
    </div>
  );
};

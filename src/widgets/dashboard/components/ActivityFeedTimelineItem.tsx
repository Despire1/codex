import { FC } from 'react';
import { ActivityFeedItem } from '../../../entities/types';
import { buildActivityTimelinePresentation } from '../model/activityFeedPresentation';
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
  const before = message.slice(0, index);
  const after = message.slice(index + normalizedHighlight.length);
  return (
    <>
      {before}
      <strong>{normalizedHighlight}</strong>
      {after}
    </>
  );
};

export const ActivityFeedTimelineItem: FC<ActivityFeedTimelineItemProps> = ({ item, timeZone, isLast }) => {
  const presentation = buildActivityTimelinePresentation(item, timeZone);
  const toneClass =
    presentation.tone === 'failed'
      ? styles.dotFailed
      : presentation.tone === 'info'
        ? styles.dotInfo
        : styles.dotSuccess;

  return (
    <div className={`${styles.root} ${isLast ? styles.rootLast : ''}`}>
      <div className={styles.track}>
        <span className={`${styles.dot} ${toneClass}`} />
        {!isLast && <span className={styles.line} />}
      </div>
      <div className={styles.content}>
        <div className={styles.time}>{presentation.timeLabel}</div>
        <div className={styles.message}>{renderHighlightedMessage(presentation.message, item.studentName)}</div>
        {presentation.details && <div className={styles.details}>{presentation.details}</div>}
      </div>
    </div>
  );
};

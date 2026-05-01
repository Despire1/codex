import { FC } from 'react';
import { HistoryOutlinedIcon } from '../../../icons/MaterialIcons';
import { useActivityFeedDrawer } from '../model/ActivityFeedDrawerContext';
import styles from './ActivityFeedTrigger.module.css';

interface ActivityFeedTriggerProps {
  className?: string;
  'data-tour'?: string;
}

export const ActivityFeedTrigger: FC<ActivityFeedTriggerProps> = ({ className, 'data-tour': dataTour }) => {
  const { open, hasUnread } = useActivityFeedDrawer();

  return (
    <button
      type="button"
      className={className}
      data-tour={dataTour}
      aria-label="Открыть ленту активности"
      onClick={open}
    >
      <HistoryOutlinedIcon width={20} height={20} />
      {hasUnread ? <span className={styles.dot} aria-hidden /> : null}
    </button>
  );
};

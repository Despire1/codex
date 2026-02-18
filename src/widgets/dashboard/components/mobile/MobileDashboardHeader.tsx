import { FC } from 'react';
import { NotificationsNoneOutlinedIcon } from '@/icons/MaterialIcons';
import styles from './MobileDashboardHeader.module.css';

interface MobileDashboardHeaderProps {
  dateLabel: string;
  scheduleMode: 'day' | 'week';
  onScheduleModeChange: (mode: 'day' | 'week') => void;
  hasActivityUnread: boolean;
  onOpenActivityFeed: () => void;
}

export const MobileDashboardHeader: FC<MobileDashboardHeaderProps> = ({
  dateLabel,
  scheduleMode,
  onScheduleModeChange,
  hasActivityUnread,
  onOpenActivityFeed,
}) => {
  return (
    <header className={styles.root}>
      <div className={styles.titleGroup}>
        <h1 className={styles.title}>Сегодня</h1>
        <span className={styles.date}>{dateLabel}</span>
      </div>
      <div className={styles.actions}>
        <div className={styles.toggle}>
          <button
            type="button"
            className={`${styles.toggleButton} ${scheduleMode === 'day' ? styles.toggleButtonActive : ''}`}
            onClick={() => onScheduleModeChange('day')}
          >
            День
          </button>
          <button
            type="button"
            className={`${styles.toggleButton} ${scheduleMode === 'week' ? styles.toggleButtonActive : ''}`}
            onClick={() => onScheduleModeChange('week')}
          >
            Неделя
          </button>
        </div>
        <button
          type="button"
          className={styles.notificationButton}
          aria-label="Открыть ленту активности"
          onClick={onOpenActivityFeed}
        >
          <NotificationsNoneOutlinedIcon width={20} height={20} />
          {hasActivityUnread ? <span className={styles.notificationDot} aria-hidden /> : null}
        </button>
      </div>
    </header>
  );
};

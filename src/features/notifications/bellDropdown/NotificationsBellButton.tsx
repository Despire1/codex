import { FC, useState } from 'react';
import { AdaptivePopover } from '@/shared/ui/AdaptivePopover/AdaptivePopover';
import { NotificationsNoneOutlinedIcon } from '../../../icons/MaterialIcons';
import { useDashboardActivityFeed } from '../../../widgets/dashboard/model/useDashboardActivityFeed';
import { useDashboardActivityUnread } from '../../../widgets/dashboard/model/useDashboardActivityUnread';
import { ActivityFeedTimelineItem } from '../../../widgets/dashboard/components/ActivityFeedTimelineItem';
import styles from './NotificationsBellButton.module.css';

interface NotificationsBellButtonProps {
  timeZone: string;
  triggerClassName?: string;
  enabled?: boolean;
  onOpen?: () => void;
  onNavigateAll: () => void;
  onNavigateSettings: () => void;
}

const POPOVER_LIMIT = 8;

export const NotificationsBellButton: FC<NotificationsBellButtonProps> = ({
  timeZone,
  triggerClassName,
  enabled = true,
  onOpen,
  onNavigateAll,
  onNavigateSettings,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const unread = useDashboardActivityUnread(enabled);
  const feed = useDashboardActivityFeed(timeZone, {
    enabled: enabled && isOpen,
    pageSize: POPOVER_LIMIT,
  });

  const items = feed.items.slice(0, POPOVER_LIMIT);

  const handleToggle = () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen) {
      onOpen?.();
      if (unread.hasUnread) {
        void unread.markSeen();
      }
    }
  };

  const handleClose = () => setIsOpen(false);

  const handleAll = () => {
    handleClose();
    onNavigateAll();
  };

  const handleSettings = () => {
    handleClose();
    onNavigateSettings();
  };

  return (
    <AdaptivePopover
      isOpen={isOpen}
      onClose={handleClose}
      side="bottom"
      align="end"
      offset={10}
      className={styles.popover}
      trigger={
        <button
          type="button"
          className={triggerClassName}
          aria-label="Открыть уведомления"
          onClick={handleToggle}
        >
          <NotificationsNoneOutlinedIcon width={20} height={20} />
          {unread.hasUnread ? <span className={styles.bellDot} aria-hidden /> : null}
        </button>
      }
    >
      <div className={styles.popoverInner}>
        <div className={styles.header}>Уведомления</div>

        <div className={styles.list}>
          {feed.loading && items.length === 0 ? (
            <div className={styles.placeholder}>Загружаем события…</div>
          ) : items.length === 0 ? (
            <div className={styles.placeholder}>Пока нет событий.</div>
          ) : (
            items.map((item, index) => (
              <ActivityFeedTimelineItem
                key={item.id}
                item={item}
                timeZone={timeZone}
                isLast={index === items.length - 1}
              />
            ))
          )}
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.footerButton} onClick={handleAll}>
            Все события
          </button>
          <button type="button" className={styles.footerButtonPrimary} onClick={handleSettings}>
            Настройки уведомлений
          </button>
        </div>
      </div>
    </AdaptivePopover>
  );
};

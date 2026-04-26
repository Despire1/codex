import { type FC, type ReactNode } from 'react';
import { NotificationsNoneOutlinedIcon } from '../../icons/MaterialIcons';
import { TopbarProfileMenu } from './ui/TopbarProfileMenu/TopbarProfileMenu';
import styles from './Topbar.module.css';

interface StudentTopbarProps {
  title: string;
  subtitle: string;
  displayName: string;
  fallbackText: string;
  profilePhotoUrl?: string | null;
  onOpenNotifications: () => void;
  renderNotificationBell?: (triggerClassName: string) => ReactNode;
  notificationDotVisible?: boolean;
}

export const StudentTopbar: FC<StudentTopbarProps> = ({
  title,
  subtitle,
  displayName,
  fallbackText,
  profilePhotoUrl,
  onOpenNotifications,
  renderNotificationBell,
  notificationDotVisible = true,
}) => {
  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>{title}</h1>
          <span className={styles.separator} aria-hidden>
            |
          </span>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
      </div>

      <div className={`${styles.actions} ${styles.actionsNoCreateReserve}`}>
        {renderNotificationBell ? (
          renderNotificationBell(styles.iconButton)
        ) : (
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Открыть уведомления"
            onClick={onOpenNotifications}
          >
            <NotificationsNoneOutlinedIcon width={20} height={20} />
            {notificationDotVisible ? <span className={styles.notificationDot} aria-hidden /> : null}
          </button>
        )}

        <div className={styles.profile}>
          <TopbarProfileMenu
            displayName={displayName}
            fallbackText={fallbackText}
            profilePhotoUrl={profilePhotoUrl}
            displayNameClassName={styles.teacherName}
          />
        </div>
      </div>
    </header>
  );
};

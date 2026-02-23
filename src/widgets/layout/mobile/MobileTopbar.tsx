import { type FC } from 'react';
import { BarsIcon, NotificationsNoneOutlinedIcon, RobotIcon } from '@/icons/MaterialIcons';
import styles from './MobileTopbar.module.css';

export interface MobileTopbarProps {
  profileName: string;
  profilePhotoUrl?: string | null;
  hasNotificationDot?: boolean;
  onOpenSidebar: () => void;
  onOpenNotifications: () => void;
}

const resolveInitial = (name: string) => name.trim().charAt(0).toUpperCase() || 'T';

export const MobileTopbar: FC<MobileTopbarProps> = ({
  profileName,
  profilePhotoUrl,
  hasNotificationDot = true,
  onOpenSidebar,
  onOpenNotifications,
}) => {
  return (
    <header className={styles.root}>
      <div className={styles.left}>
        <button
          type="button"
          className={styles.menuButton}
          aria-label="Открыть меню"
          onClick={onOpenSidebar}
        >
          <BarsIcon width={18} height={18} />
        </button>

        <div className={styles.brandIcon} aria-hidden>
          <RobotIcon width={20} height={20} />
        </div>
        <span className={styles.brandText}>TeacherBot</span>
      </div>

      <div className={styles.right}>
        <button
          type="button"
          className={styles.notificationButton}
          aria-label="Открыть уведомления"
          onClick={onOpenNotifications}
        >
          <NotificationsNoneOutlinedIcon width={20} height={20} />
          {hasNotificationDot ? <span className={styles.notificationDot} aria-hidden /> : null}
        </button>

        <div className={styles.avatar} aria-hidden>
          {profilePhotoUrl ? (
            <img src={profilePhotoUrl} alt={profileName} className={styles.avatarImage} />
          ) : (
            <span className={styles.avatarFallback}>{resolveInitial(profileName)}</span>
          )}
        </div>
      </div>
    </header>
  );
};

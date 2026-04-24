import { type FC, type ReactNode } from 'react';
import { BarsIcon, ChevronLeftIcon, NotificationsNoneOutlinedIcon, RobotIcon } from '@/icons/MaterialIcons';
import styles from './MobileTopbar.module.css';

export interface MobileTopbarProps {
  profileName: string;
  profilePhotoUrl?: string | null;
  hasNotificationDot?: boolean;
  variant?: 'default' | 'title' | 'back';
  title?: string;
  onOpenSidebar: () => void;
  onOpenNotifications: () => void;
  renderNotificationBell?: (triggerClassName: string) => ReactNode;
  onBack?: () => void;
}

const resolveInitial = (name: string) => name.trim().charAt(0).toUpperCase() || 'T';

export const MobileTopbar: FC<MobileTopbarProps> = ({
  profileName,
  profilePhotoUrl,
  hasNotificationDot = true,
  variant = 'default',
  title = 'Настройки',
  onOpenSidebar,
  onOpenNotifications,
  renderNotificationBell,
  onBack,
}) => {
  const isDefault = variant === 'default';
  const isBack = variant === 'back';

  return (
    <header className={styles.root}>
      <div className={styles.left}>
        <button
          type="button"
          className={styles.menuButton}
          aria-label={isBack ? 'Назад' : 'Открыть меню'}
          onClick={isBack ? onBack : onOpenSidebar}
        >
          {isBack ? <ChevronLeftIcon width={18} height={18} /> : <BarsIcon width={18} height={18} />}
        </button>

        {isDefault ? (
          <>
            <div className={styles.brandIcon} aria-hidden>
              <RobotIcon width={20} height={20} />
            </div>
            <span className={styles.brandText}>TeacherBot</span>
          </>
        ) : (
          <span className={styles.titleText}>{title}</span>
        )}
      </div>

      {isDefault ? (
        <div className={styles.right}>
          {renderNotificationBell ? (
            renderNotificationBell(styles.notificationButton)
          ) : (
            <button
              type="button"
              className={styles.notificationButton}
              aria-label="Открыть уведомления"
              onClick={onOpenNotifications}
            >
              <NotificationsNoneOutlinedIcon width={20} height={20} />
              {hasNotificationDot ? <span className={styles.notificationDot} aria-hidden /> : null}
            </button>
          )}

          <div className={styles.avatar} aria-hidden>
            {profilePhotoUrl ? (
              <img src={profilePhotoUrl} alt={profileName} className={styles.avatarImage} />
            ) : (
              <span className={styles.avatarFallback}>{resolveInitial(profileName)}</span>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
};

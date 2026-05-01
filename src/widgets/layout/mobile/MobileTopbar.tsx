import { type FC, type ReactNode } from 'react';
import { BarsIcon, ChevronLeftIcon, NotificationsNoneOutlinedIcon } from '@/icons/MaterialIcons';
import { BrandLogo } from '@/shared/ui/BrandLogo';
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
  renderSearchButton?: (triggerClassName: string) => ReactNode;
  onBack?: () => void;
  onLogoClick?: () => void;
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
  renderSearchButton,
  onBack,
  onLogoClick,
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
          onLogoClick ? (
            <button type="button" className={styles.brandLink} onClick={onLogoClick} aria-label="На главную">
              <span className={styles.brandIcon} aria-hidden>
                <BrandLogo width={28} height={28} />
              </span>
              <span className={styles.brandText}>TeacherBot</span>
            </button>
          ) : (
            <>
              <div className={styles.brandIcon} aria-hidden>
                <BrandLogo width={28} height={28} />
              </div>
              <span className={styles.brandText}>TeacherBot</span>
            </>
          )
        ) : (
          <span className={styles.titleText}>{title}</span>
        )}
      </div>

      {isDefault ? (
        <div className={styles.right}>
          {renderSearchButton ? renderSearchButton(styles.notificationButton) : null}

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

import { type FC, useEffect } from 'react';
import type { TabId } from '@/app/tabs';
import { CloseIcon, RobotIcon, SettingsIcon } from '@/icons/MaterialIcons';
import type { MobileNavItem } from './model/mobileNavigation';
import styles from './MobileSidebarDrawer.module.css';

export interface MobileSidebarDrawerProps {
  isOpen: boolean;
  activeTab: TabId;
  items: readonly MobileNavItem[];
  profileName: string;
  profilePlanLabel: string;
  profilePhotoUrl?: string | null;
  onClose: () => void;
  onNavigate: (item: MobileNavItem) => void;
}

const resolveInitial = (name: string) => name.trim().charAt(0).toUpperCase() || 'T';

export const MobileSidebarDrawer: FC<MobileSidebarDrawerProps> = ({
  isOpen,
  activeTab,
  items,
  profileName,
  profilePlanLabel,
  profilePhotoUrl,
  onClose,
  onNavigate,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <>
      <button
        type="button"
        className={`${styles.overlay} ${isOpen ? styles.overlayVisible : ''}`}
        aria-label="Закрыть меню"
        onClick={onClose}
      />

      <aside className={`${styles.drawer} ${isOpen ? styles.drawerOpen : ''}`} aria-label="Мобильная навигация">
        <div className={styles.drawerInner}>
          <div className={styles.header}>
            <div className={styles.brand}>
              <div className={styles.brandIcon} aria-hidden>
                <RobotIcon width={20} height={20} />
              </div>
              <span className={styles.brandText}>TeacherBot</span>
            </div>

            <button type="button" className={styles.closeButton} aria-label="Закрыть" onClick={onClose}>
              <CloseIcon width={20} height={20} />
            </button>
          </div>

          <nav className={styles.nav} aria-label="Разделы">
            {items.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                  onClick={() => onNavigate(item)}
                >
                  <span className={styles.navItemMain}>
                    <item.icon width={20} height={20} />
                    <span>{item.label}</span>
                  </span>

                  {typeof item.badgeCount === 'number' ? (
                    <span className={styles.badge}>{item.badgeCount}</span>
                  ) : item.hasUnreadDot ? (
                    <span className={styles.dot} aria-hidden />
                  ) : null}
                </button>
              );
            })}
          </nav>

          <div className={styles.footer}>
            <button type="button" className={styles.profileCard}>
              <span className={styles.avatar} aria-hidden>
                {profilePhotoUrl ? (
                  <img src={profilePhotoUrl} alt={profileName} className={styles.avatarImage} />
                ) : (
                  <span className={styles.avatarFallback}>{resolveInitial(profileName)}</span>
                )}
              </span>

              <span className={styles.profileMeta}>
                <span className={styles.profileName}>{profileName}</span>
                <span className={styles.profilePlan}>{profilePlanLabel}</span>
              </span>

              <span className={styles.settingsIcon} aria-hidden>
                <SettingsIcon width={16} height={16} />
              </span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

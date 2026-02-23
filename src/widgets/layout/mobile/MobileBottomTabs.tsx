import { type CSSProperties, type FC } from 'react';
import type { TabId } from '@/app/tabs';
import type { MobileNavItem } from './model/mobileNavigation';
import styles from './MobileBottomTabs.module.css';

export interface MobileBottomTabsProps {
  activeTab: TabId;
  items: readonly MobileNavItem[];
  onNavigate: (item: MobileNavItem) => void;
}

export const MobileBottomTabs: FC<MobileBottomTabsProps> = ({ activeTab, items, onNavigate }) => {
  const tabsStyle = {
    '--tabs-count': items.length,
  } as CSSProperties;

  return (
    <nav className={styles.root} aria-label="Нижняя навигация">
      <div className={styles.inner} style={tabsStyle}>
        {items.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
              onClick={() => onNavigate(item)}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className={styles.iconWrap}>
                <item.icon width={18} height={18} />
                {typeof item.badgeCount === 'number' ? (
                  <span className={styles.badge}>{item.badgeCount}</span>
                ) : item.hasUnreadDot ? (
                  <span className={styles.dot} aria-hidden />
                ) : null}
              </span>
              <span className={styles.label}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

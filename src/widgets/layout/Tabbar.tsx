import { type FC } from 'react';
import { tabs, type AppTab, type TabId } from '../../app/tabs';
import styles from './Tabbar.module.css';

interface TabbarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  tabsList?: readonly AppTab[];
}

export const Tabbar: FC<TabbarProps> = ({ activeTab, onTabChange, tabsList = tabs }) => {
  return (
    <nav className={styles.tabbar} aria-label="Нижняя навигация">
      {tabsList.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
          onClick={() => onTabChange(tab.id)}
          aria-label={tab.label}
          aria-current={activeTab === tab.id ? 'page' : undefined}
        >
          <span className={styles.tabIconWrap} aria-hidden>
            <span className={styles.tabIcon}>
              <tab.icon />
            </span>
          </span>
          <span className={styles.tabLabel}>{tab.id === 'analytics' ? 'Финансы' : tab.label}</span>
        </button>
      ))}
    </nav>
  );
};

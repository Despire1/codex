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
    <nav className={styles.tabbar}>
      {tabsList.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
          onClick={() => onTabChange(tab.id)}
          aria-label={tab.label}
        >
          <span className={styles.tabIcon} aria-hidden>
            <tab.icon />
          </span>
          <span className={styles.tabLabel}>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
};

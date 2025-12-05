import { type FC } from 'react';
import { tabs, type TabId } from '../../app/tabs';
import styles from './Tabbar.module.css';

interface TabbarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export const Tabbar: FC<TabbarProps> = ({ activeTab, onTabChange }) => {
  return (
    <nav className={styles.tabbar}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          <span className={styles.tabIcon} aria-hidden>
            <tab.icon />
          </span>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
};

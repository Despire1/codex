import { type FC } from 'react';
import { Teacher } from '../../entities/types';
import { tabs, type TabId } from '../../app/tabs';
import { DarkModeIcon, LightModeIcon } from '../../icons/MaterialIcons';
import { useTheme } from '../../shared/lib/theme';
import styles from './Topbar.module.css';

interface TopbarProps {
  teacher: Teacher;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export const Topbar: FC<TopbarProps> = ({
  teacher,
  activeTab,
  onTabChange,
}) => {
  const { isDark, toggleTheme } = useTheme();

  const themeLabel = isDark ? 'Тёмная' : 'Светлая';
  const themeHint = isDark ? 'Переключить на светлую тему' : 'Переключить на тёмную тему';

  return (
    <header className={styles.topbar}>
      <div className={styles.topbarGreeting}>
        <h1 className={styles.title}>TeacherBot Web</h1>
      </div>

      <div className={styles.topbarNav}>
        <nav className={styles.topNav}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`${styles.topNavButton} ${activeTab === tab.id ? styles.topNavActive : ''}`}
              onClick={() => onTabChange(tab.id)}
            >
              <span className={styles.tabIcon} aria-hidden>
                <tab.icon />
              </span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className={styles.topbarActions}>
        <button type="button" className={styles.themeToggle} onClick={toggleTheme} aria-label={themeHint}>
          <span className={styles.themeIcon} aria-hidden>
            {isDark ? <LightModeIcon /> : <DarkModeIcon />}
          </span>
          <span className={styles.themeLabel}>{themeLabel}</span>
        </button>
      </div>
    </header>
  );
};

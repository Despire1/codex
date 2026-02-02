import { type FC } from 'react';
import { Teacher } from '../../entities/types';
import { tabs, type TabId } from '../../app/tabs';
import { Avatar } from '../../shared/ui/Avatar/Avatar';
import styles from './Topbar.module.css';

interface TopbarProps {
  teacher: Teacher;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  profilePhotoUrl?: string | null;
}

export const Topbar: FC<TopbarProps> = ({
  teacher,
  activeTab,
  onTabChange,
  profilePhotoUrl,
}) => {
  const fallbackText = teacher.name || teacher.username || 'П';
  const teacherDisplayName = teacher.name ?? teacher.username ?? 'Преподаватель';

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

      <div className={styles.topbarProfile}>
        <span className={styles.teacherName}>{teacherDisplayName}</span>
        <Avatar src={profilePhotoUrl} alt="Профиль преподавателя" fallbackText={fallbackText} />
      </div>
    </header>
  );
};

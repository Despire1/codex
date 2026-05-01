import { FC } from 'react';
import { ActivityFeedTrigger } from '../../../../dashboard/components/ActivityFeedTrigger';
import { TopbarCreateMenu, type TopbarCreateMenuItem } from '../../../../layout/ui/TopbarCreateMenu/TopbarCreateMenu';
import { HelpMenu } from '../../../../layout/ui/HelpMenu/HelpMenu';
import { useIsMobile } from '../../../../../shared/lib/useIsMobile';
import styles from './TeacherHomeworksHeader.module.css';

type WorkspaceMode = 'templates' | 'list' | 'drafts';

interface TeacherHomeworksHeaderProps {
  title: string;
  subtitle: string;
  workspaceMode: WorkspaceMode;
  createMenuItems: TopbarCreateMenuItem[];
  onWorkspaceModeChange: (mode: WorkspaceMode) => void;
}

const WORKSPACE_TABS: Array<{ id: WorkspaceMode; label: string }> = [
  { id: 'templates', label: 'Библиотека' },
  { id: 'list', label: 'Назначенные' },
  { id: 'drafts', label: 'Черновики' },
];

export const TeacherHomeworksHeader: FC<TeacherHomeworksHeaderProps> = ({
  title,
  subtitle,
  workspaceMode,
  createMenuItems,
  onWorkspaceModeChange,
}) => {
  const isMobile = useIsMobile(767);
  const tourScenarioId = isMobile ? 'teacher-twa' : 'teacher-web';
  return (
    <header className={styles.header}>
      <div className={styles.topRow}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>{title}</h1>
          <span className={styles.separator} aria-hidden>
            |
          </span>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>

        <div className={styles.tabsWrap} role="tablist" aria-label="Разделы домашних заданий">
          {WORKSPACE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={workspaceMode === tab.id}
              className={`${styles.tabButton} ${workspaceMode === tab.id ? styles.tabButtonActive : ''}`}
              onClick={() => onWorkspaceModeChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className={styles.actions}>
          <ActivityFeedTrigger className={styles.iconButton} data-tour="activity-feed" />
          <HelpMenu tourScenarioId={tourScenarioId} triggerClassName={styles.iconButton} />
          <TopbarCreateMenu
            label="Добавить"
            items={createMenuItems}
            triggerClassName={styles.createButton}
            iconAccentClassName={styles.createButtonIconAccent}
            triggerDataTour="create-menu"
          />
        </div>
      </div>
    </header>
  );
};

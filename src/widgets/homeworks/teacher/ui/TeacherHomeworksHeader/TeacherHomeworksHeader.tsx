import { FC } from 'react';
import { Tooltip } from '../../../../../shared/ui/Tooltip/Tooltip';
import { HomeworkBellRegularIcon } from '../../../../../shared/ui/icons/HomeworkFaIcons';
import { TopbarCreateMenu, type TopbarCreateMenuItem } from '../../../../layout/ui/TopbarCreateMenu/TopbarCreateMenu';
import styles from './TeacherHomeworksHeader.module.css';

type WorkspaceMode = 'templates' | 'list' | 'drafts';

interface TeacherHomeworksHeaderProps {
  title: string;
  subtitle: string;
  workspaceMode: WorkspaceMode;
  hasUnreadActivity: boolean;
  createMenuItems: TopbarCreateMenuItem[];
  onOpenActivity: () => void;
  onWorkspaceModeChange: (mode: WorkspaceMode) => void;
}

const WORKSPACE_TABS: Array<{ id: WorkspaceMode; label: string }> = [
  { id: 'templates', label: 'Задания' },
  { id: 'list', label: 'Назначенные' },
  { id: 'drafts', label: 'Черновики' },
];

export const TeacherHomeworksHeader: FC<TeacherHomeworksHeaderProps> = ({
  title,
  subtitle,
  workspaceMode,
  hasUnreadActivity,
  createMenuItems,
  onOpenActivity,
  onWorkspaceModeChange,
}) => {
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
          <Tooltip content="События домашних заданий" side="bottom" align="end">
            <button
              type="button"
              className={styles.iconButton}
              onClick={onOpenActivity}
              aria-label="Открыть события домашних заданий"
            >
              <HomeworkBellRegularIcon size={18} />
              {hasUnreadActivity ? <span className={styles.notificationDot} aria-hidden /> : null}
            </button>
          </Tooltip>

          <TopbarCreateMenu
            label="Добавить"
            items={createMenuItems}
            triggerClassName={styles.createButton}
            iconAccentClassName={styles.createButtonIconAccent}
          />
        </div>
      </div>
    </header>
  );
};

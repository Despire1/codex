import { KeyboardEvent, MouseEvent, type FC } from 'react';
import { HomeworkAssignment } from '../../../../../entities/types';
import { HomeworkEllipsisVerticalIcon } from '../../../../../shared/ui/icons/HomeworkFaIcons';
import { resolveDraftChangedLabel, resolveDraftSavedLabel } from '../../model/lib/mobileHomeworkPresentation';
import styles from './TeacherHomeworksMobileDraftCard.module.css';

interface TeacherHomeworksMobileDraftCardProps {
  assignment: HomeworkAssignment;
  onOpen: (assignment: HomeworkAssignment) => void;
  onMore: (assignment: HomeworkAssignment) => void;
}

export const TeacherHomeworksMobileDraftCard: FC<TeacherHomeworksMobileDraftCardProps> = ({
  assignment,
  onOpen,
  onMore,
}) => {
  const stop = (event: MouseEvent<HTMLElement>) => event.stopPropagation();

  const handleActivate = () => onOpen(assignment);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handleActivate();
  };

  return (
    <article
      className={styles.card}
      role="button"
      tabIndex={0}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      aria-label={`Продолжить черновик ${assignment.title}`}
    >
      <div className={styles.content}>
        <div className={styles.head}>
          <span className={styles.badge}>Черновик</span>

          <button
            type="button"
            className={styles.menuButton}
            onClick={(event) => {
              stop(event);
              onMore(assignment);
            }}
            aria-label="Действия с черновиком"
          >
            <HomeworkEllipsisVerticalIcon size={18} />
          </button>
        </div>

        <div className={styles.body}>
          <h3 className={styles.title}>{assignment.title}</h3>
          <span className={styles.changed}>{resolveDraftChangedLabel(assignment)}</span>
        </div>
      </div>

      <div className={styles.footer}>
        <span className={styles.saved}>{resolveDraftSavedLabel(assignment)}</span>
        <button
          type="button"
          className={styles.continueButton}
          onClick={(event) => {
            stop(event);
            onOpen(assignment);
          }}
        >
          Продолжить
        </button>
      </div>
    </article>
  );
};

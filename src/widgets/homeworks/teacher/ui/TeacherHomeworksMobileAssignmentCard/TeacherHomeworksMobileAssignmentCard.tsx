import { KeyboardEvent, MouseEvent, type FC } from 'react';
import { HomeworkAssignment } from '../../../../../entities/types';
import { Ellipsis } from '../../../../../shared/ui/Ellipsis/Ellipsis';
import { HomeworkEllipsisVerticalIcon } from '../../../../../shared/ui/icons/HomeworkFaIcons';
import {
  resolveAssignedDueLabel,
  resolveAssignedDueTone,
  resolveAssignedStatusLabel,
  resolveAssignedSubmissionLabel,
} from '../../model/lib/mobileHomeworkPresentation';
import styles from './TeacherHomeworksMobileAssignmentCard.module.css';

interface TeacherHomeworksMobileAssignmentCardProps {
  assignment: HomeworkAssignment;
  statusTone: 'review' | 'danger' | 'warning' | 'success' | 'info' | 'neutral';
  primaryActionLabel: string;
  onOpen: (assignment: HomeworkAssignment) => void;
  onPrimaryAction: (assignment: HomeworkAssignment) => void;
  onMore: (assignment: HomeworkAssignment) => void;
  onOpenStudentProfile: (studentId: number) => void;
}

export const TeacherHomeworksMobileAssignmentCard: FC<TeacherHomeworksMobileAssignmentCardProps> = ({
  assignment,
  statusTone,
  primaryActionLabel,
  onOpen,
  onPrimaryAction,
  onMore,
  onOpenStudentProfile,
}) => {
  const studentLabel = assignment.studentName?.trim() || `Ученик #${assignment.studentId}`;
  const dueLabel = resolveAssignedDueLabel(assignment);
  const dueTone = resolveAssignedDueTone(assignment);
  const actionToneClassName =
    primaryActionLabel === 'Напомнить' || primaryActionLabel === 'Исправить'
      ? styles.primaryButtonDanger
      : primaryActionLabel === 'Проверить'
        ? styles.primaryButtonWarning
        : styles.primaryButtonInfo;

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
      aria-label={`Открыть назначение ${assignment.title}`}
    >
      <div className={styles.content}>
        <button
          type="button"
          className={styles.menuButton}
          onClick={(event) => {
            stop(event);
            onMore(assignment);
          }}
          aria-label="Действия с назначением"
        >
          <HomeworkEllipsisVerticalIcon size={18} />
        </button>

        <div className={styles.mainRow}>
          <div className={styles.avatar}>{studentLabel.trim().charAt(0).toUpperCase() || 'У'}</div>
          <div className={styles.studentMain}>
            <button
              type="button"
              className={styles.studentName}
              onClick={(event) => {
                stop(event);
                onOpenStudentProfile(assignment.studentId);
              }}
              >
                {studentLabel}
              </button>
            <Ellipsis className={styles.assignmentTitle} title={assignment.title}>
              {assignment.title}
            </Ellipsis>
            <span
              className={`${styles.deadline} ${
                dueTone === 'danger' ? styles.deadlineDanger : dueTone === 'warning' ? styles.deadlineWarning : ''
              }`}
            >
              {dueLabel === 'Без срока' ? 'Срок: без срока' : `Срок: ${dueLabel.toLowerCase()}`}
            </span>
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.statusRow}>
          <span className={`${styles.statusChip} ${styles[`statusChip${statusTone[0].toUpperCase()}${statusTone.slice(1)}`]}`}>
            {resolveAssignedStatusLabel(assignment)}
          </span>
          <span className={styles.submission}>{resolveAssignedSubmissionLabel(assignment)}</span>
        </div>

        <button
          type="button"
          className={`${styles.primaryButton} ${actionToneClassName}`}
          onClick={(event) => {
            stop(event);
            onPrimaryAction(assignment);
          }}
        >
          {primaryActionLabel}
        </button>
      </div>
    </article>
  );
};

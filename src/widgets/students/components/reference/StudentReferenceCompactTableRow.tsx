import { type CSSProperties, type FC, type KeyboardEvent, useMemo } from 'react';
import {
  buildCompactStudentTablePresentation,
  getStudentDisplayName,
  getStudentInitials,
} from '../../model/referencePresentation';
import { type StudentReferenceCardProps } from './StudentReferenceCard.types';
import styles from './StudentReferenceCompactTableRow.module.css';

export const StudentReferenceCompactTableRow: FC<StudentReferenceCardProps> = ({ item, timeZone, onOpenStudent }) => {
  const presentation = useMemo(() => buildCompactStudentTablePresentation(item, timeZone), [item, timeZone]);

  const avatarStyle = useMemo(
    () =>
      ({
        '--student-accent': presentation.uiColor,
      }) as CSSProperties,
    [presentation.uiColor],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onOpenStudent(item.student.id);
  };

  return (
    <article
      className={styles.row}
      role="button"
      tabIndex={0}
      onClick={() => onOpenStudent(item.student.id)}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.grid}>
        <div className={styles.studentCell}>
          <div className={styles.avatar} style={avatarStyle}>
            {getStudentInitials(item)}
          </div>

          <div className={styles.studentText}>
            <h3 className={styles.studentName}>{getStudentDisplayName(item)}</h3>
            <p className={styles.studentLevel}>{presentation.levelLabel || 'Без уровня'}</p>
          </div>
        </div>

        <div className={styles.centerCell}>
          <span className={styles.primaryValue}>{presentation.lessonsCount}</span>
        </div>

        <div className={styles.centerCell}>
          <span
            className={`${styles.attendanceBadge} ${
              presentation.attendanceTone === 'success'
                ? styles.attendanceSuccess
                : presentation.attendanceTone === 'warning'
                  ? styles.attendanceWarning
                  : presentation.attendanceTone === 'danger'
                    ? styles.attendanceDanger
                    : styles.attendanceNeutral
            }`}
          >
            {presentation.attendanceLabel}
          </span>
        </div>

        <div className={styles.lessonCell}>
          <div className={styles.lessonMeta}>
            <span
              className={`${styles.lessonDot} ${
                presentation.nextLessonTone === 'today'
                  ? styles.lessonDotToday
                  : presentation.nextLessonTone === 'future'
                    ? styles.lessonDotFuture
                    : styles.lessonDotNone
              }`}
              aria-hidden
            />
            <span className={styles.lessonText}>{presentation.nextLessonLabel}</span>
          </div>
        </div>

        <div className={styles.statusCell}>
          <span
            className={`${styles.statusText} ${
              presentation.statusTone === 'active'
                ? styles.statusActive
                : presentation.statusTone === 'paused'
                  ? styles.statusPaused
                  : presentation.statusTone === 'completed'
                    ? styles.statusCompleted
                    : styles.statusInactive
            }`}
          >
            {presentation.statusLabel}
          </span>
          {presentation.activationLabel ? (
            <span className={`${styles.statusText} ${styles.statusInactive}`}>
              {presentation.activationLabel}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
};

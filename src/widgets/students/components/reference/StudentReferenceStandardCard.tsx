import { type FC, type KeyboardEvent, useMemo } from 'react';
import { Tooltip } from '@/shared/ui/Tooltip/Tooltip';
import {
  buildStudentCardPresentation,
  getStatusUiMeta,
  getStudentDisplayName,
  getStudentInitials,
} from '../../model/referencePresentation';
import { StudentReferenceCardMenu } from './StudentReferenceCardMenu';
import { type StudentReferenceCardProps } from './StudentReferenceCard.types';
import styles from './StudentReferenceStandardCard.module.css';

export const StudentReferenceStandardCard: FC<StudentReferenceCardProps> = ({
  item,
  timeZone,
  onOpenStudent,
  onEditStudent,
  onDeleteStudent,
}) => {
  const presentation = useMemo(() => buildStudentCardPresentation(item, timeZone), [item, timeZone]);
  const statusMeta = getStatusUiMeta(presentation.status);
  const hasDebt = (typeof item.debtRub === 'number' && item.debtRub > 0) || (item.debtLessonCount ?? 0) > 0;

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onOpenStudent(item.student.id);
  };

  return (
    <article
      className={styles.card}
      role="button"
      tabIndex={0}
      onClick={() => onOpenStudent(item.student.id)}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.head}>
        <div className={styles.identity}>
          <div
            className={styles.avatar}
            style={{
              borderColor: presentation.uiColor,
              background: presentation.uiColor,
              color: '#ffffff',
            }}
          >
            {getStudentInitials(item)}
          </div>
          <div className={styles.identityText}>
            <div className={styles.nameRow}>
              <h3 className={styles.name}>{getStudentDisplayName(item)}</h3>
              {hasDebt ? (
                <Tooltip content="Есть неоплаченные занятия" side="bottom" align="start">
                  <span className={styles.debtBadge}>Долг</span>
                </Tooltip>
              ) : null}
            </div>
            {presentation.levelLabel ? <p className={styles.level}>{presentation.levelLabel}</p> : null}
          </div>
        </div>
        <StudentReferenceCardMenu
          studentId={item.student.id}
          onEditStudent={onEditStudent}
          onDeleteStudent={onDeleteStudent}
        />
      </div>

      <div className={styles.metricsGrid}>
        <div className={styles.metricCell}>
          <div className={styles.metricValue}>{presentation.lessonsConducted}</div>
          <div className={styles.metricLabel}>Занятий проведено</div>
        </div>
        <div className={styles.metricCell}>
          <div className={`${styles.metricValue} ${styles.metricGreen}`}>{presentation.attendanceRate}%</div>
          <div className={styles.metricLabel}>Посещ.</div>
        </div>
        <div className={styles.metricCell}>
          <div className={`${styles.metricValue} ${styles.metricBlue}`}>{presentation.averageScore.toFixed(1)}</div>
          <div className={styles.metricLabel}>Средний</div>
        </div>
      </div>

      <div className={styles.homeworkProgressRow}>
        <span>Выполнено домашек</span>
        <strong>
          {presentation.completedHomeworks}/{presentation.totalHomeworks || presentation.completedHomeworks}
        </strong>
      </div>

      <div className={styles.progressBarTrack}>
        <div
          className={styles.progressBarFill}
          style={{
            width: `${presentation.progressPercent}%`,
            background: presentation.uiColor,
          }}
        />
      </div>

      <div className={styles.footer}>
        <span className={styles.nextLessonMeta}>
          <span
            className={`${styles.nextLessonDot} ${
              presentation.nextLessonTone === 'today'
                ? styles.nextLessonDotToday
                : presentation.nextLessonTone === 'future'
                  ? styles.nextLessonDotFuture
                  : styles.nextLessonDotNone
            }`}
            aria-hidden
          />
          <span className={styles.nextLessonText}>{presentation.nextLessonLabel}</span>
        </span>
        <span
          className={`${styles.statusText} ${
            statusMeta.tone === 'active'
              ? styles.statusTextActive
              : statusMeta.tone === 'paused'
                ? styles.statusTextPaused
                : styles.statusTextCompleted
          }`}
        >
          {statusMeta.label}
        </span>
      </div>
    </article>
  );
};

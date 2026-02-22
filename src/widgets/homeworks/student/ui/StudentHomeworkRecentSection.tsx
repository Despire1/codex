import { FC, KeyboardEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendar } from '@fortawesome/free-regular-svg-icons';
import { faArrowRight } from '@fortawesome/free-solid-svg-icons';
import { HomeworkAssignment } from '../../../../entities/types';
import { formatStudentHomeworkScore, resolveStudentHomeworkDescription, resolveStudentHomeworkScoreValue } from '../model/lib/presentation';
import {
  formatStudentHomeworkReferenceCompactDate,
  resolveStudentHomeworkReferenceRecentResult,
  resolveStudentHomeworkReferenceTypeMeta,
} from '../model/lib/referencePresentation';
import styles from './StudentHomeworkRecentSection.module.css';

type StudentHomeworkRecentSectionProps = {
  assignments: HomeworkAssignment[];
  onOpenAssignment: (assignment: HomeworkAssignment) => void;
  onOpenAll: () => void;
};

const onCardKeyDown = (
  event: KeyboardEvent<HTMLElement>,
  assignment: HomeworkAssignment,
  onOpenAssignment: (assignment: HomeworkAssignment) => void,
) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  onOpenAssignment(assignment);
};

export const StudentHomeworkRecentSection: FC<StudentHomeworkRecentSectionProps> = ({
  assignments,
  onOpenAssignment,
  onOpenAll,
}) => {
  if (assignments.length === 0) return null;

  return (
    <section className={styles.section} aria-label="Недавно выполненные задания">
      <div className={styles.head}>
        <h2>Недавно выполненные</h2>
        <button type="button" className={styles.allLink} onClick={onOpenAll}>
          Все задания
          <FontAwesomeIcon icon={faArrowRight} />
        </button>
      </div>

      <div className={styles.grid}>
        {assignments.map((assignment) => {
          const score = resolveStudentHomeworkScoreValue(assignment);
          const scoreLabel = score === null ? null : formatStudentHomeworkScore(score);
          const typeMeta = resolveStudentHomeworkReferenceTypeMeta(assignment);

          return (
            <article
              key={assignment.id}
              className={styles.card}
              role="button"
              tabIndex={0}
              onClick={() => onOpenAssignment(assignment)}
              onKeyDown={(event) => onCardKeyDown(event, assignment, onOpenAssignment)}
              aria-label={`Открыть ${assignment.title}`}
            >
              <div className={styles.cardHead}>
                <span className={`${styles.typeBadge} ${styles[`typeBadge_${typeMeta.tone}`]}`}>{typeMeta.label}</span>
                {scoreLabel ? <span className={styles.scoreBadge}>{scoreLabel}</span> : null}
              </div>

              <h3 className={styles.title}>{assignment.title}</h3>
              <p className={styles.description}>{resolveStudentHomeworkDescription(assignment)}</p>

              <div className={styles.footer}>
                <span className={styles.date}>
                  <FontAwesomeIcon icon={faCalendar} />
                  {formatStudentHomeworkReferenceCompactDate(assignment)}
                </span>
                <span className={styles.result}>{resolveStudentHomeworkReferenceRecentResult(assignment)}</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

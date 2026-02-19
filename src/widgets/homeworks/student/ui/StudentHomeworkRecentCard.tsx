import { FC, KeyboardEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendar } from '@fortawesome/free-regular-svg-icons';
import { HomeworkAssignment } from '../../../../entities/types';
import {
  formatStudentHomeworkScore,
  resolveStudentHomeworkDescription,
  resolveStudentHomeworkDisplayDate,
  resolveStudentHomeworkScoreValue,
  resolveStudentHomeworkSubjectLabel,
} from '../model/lib/presentation';
import styles from './StudentHomeworkRecentCard.module.css';

type StudentHomeworkRecentCardProps = {
  assignment: HomeworkAssignment;
  onOpen: (assignment: HomeworkAssignment) => void;
};

const resolveResultLabel = (score: number | null) => {
  if (score === null) return 'Завершено';
  if (score >= 9) return 'Отлично!';
  if (score >= 8) return 'Хорошо';
  return 'Принято';
};

const onCardKeyDown = (
  event: KeyboardEvent<HTMLElement>,
  assignment: HomeworkAssignment,
  onOpen: (assignment: HomeworkAssignment) => void,
) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  onOpen(assignment);
};

export const StudentHomeworkRecentCard: FC<StudentHomeworkRecentCardProps> = ({ assignment, onOpen }) => {
  const score = resolveStudentHomeworkScoreValue(assignment);
  const scoreLabel = score === null ? null : formatStudentHomeworkScore(score);

  return (
    <article
      className={styles.card}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(assignment)}
      onKeyDown={(event) => onCardKeyDown(event, assignment, onOpen)}
      aria-label={`Открыть ${assignment.title}`}
    >
      <div className={styles.head}>
        <span className={styles.subject}>{resolveStudentHomeworkSubjectLabel(assignment)}</span>
        {scoreLabel ? <span className={styles.score}>{scoreLabel}</span> : null}
      </div>

      <h3 className={styles.title}>{assignment.title}</h3>
      <p className={styles.description}>{resolveStudentHomeworkDescription(assignment)}</p>

      <div className={styles.footer}>
        <span className={styles.date}>
          <FontAwesomeIcon icon={faCalendar} />
          {resolveStudentHomeworkDisplayDate(assignment)}
        </span>
        <span className={styles.result}>{resolveResultLabel(score)}</span>
      </div>
    </article>
  );
};

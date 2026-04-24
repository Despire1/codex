import { addMinutes, format } from 'date-fns';
import type { CSSProperties, FC, KeyboardEvent, MouseEvent } from 'react';
import { buildParticipants, getLessonLabel } from '@/entities/lesson/lib/lessonDetails';
import type { Lesson, LinkedStudent } from '@/entities/types';
import { getLessonColorTheme, getLessonColorVars } from '@/shared/lib/lessonColors';
import { toZonedDate } from '@/shared/lib/timezoneDates';
import styles from './WeekLessonCard.module.css';

interface WeekLessonCardProps {
  lesson: Lesson;
  linkedStudentsById: Map<number, LinkedStudent>;
  timeZone: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  onDoubleClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

export const WeekLessonCard: FC<WeekLessonCardProps> = ({
  lesson,
  linkedStudentsById,
  timeZone,
  onClick,
  onDoubleClick,
  onKeyDown,
}) => {
  const participants = buildParticipants(lesson, linkedStudentsById);
  const lessonLabel = getLessonLabel(participants, linkedStudentsById);
  const startDate = toZonedDate(lesson.startAt, timeZone);
  const endDate = addMinutes(startDate, lesson.durationMinutes);
  const timeLabel = `${format(startDate, 'HH:mm')} - ${format(endDate, 'HH:mm')}`;
  const isCanceled = lesson.status === 'CANCELED';
  const isCompleted = lesson.status === 'COMPLETED';
  const theme = getLessonColorTheme(lesson.color);

  const styleVars = {
    ...getLessonColorVars(lesson.color),
    '--lesson-time': theme.hoverBackground,
    '--lesson-focus-ring': theme.hoverBorder,
  } as CSSProperties;

  return (
    <button
      type="button"
      className={[
        styles.card,
        isCanceled ? styles.cardCanceled : '',
        isCompleted ? styles.cardCompleted : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={styleVars}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      aria-label={isCompleted ? `Проведённое занятие: ${lessonLabel}, ${timeLabel}` : undefined}
    >
      <span className={styles.time}>
        {isCompleted ? (
          <svg
            className={styles.completedIcon}
            viewBox="0 0 16 16"
            aria-hidden="true"
            width={12}
            height={12}
          >
            <path
              d="M3.5 8.5l2.8 2.8 6.2-6.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
        {timeLabel}
      </span>
      <span className={styles.name}>{lessonLabel}</span>
    </button>
  );
};

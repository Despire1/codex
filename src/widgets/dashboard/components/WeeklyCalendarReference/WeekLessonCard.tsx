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
  const theme = getLessonColorTheme(lesson.color);

  const styleVars = {
    ...getLessonColorVars(lesson.color),
    '--lesson-time': theme.hoverBackground,
    '--lesson-focus-ring': theme.hoverBorder,
  } as CSSProperties;

  return (
    <button
      type="button"
      className={[styles.card, isCanceled ? styles.cardCanceled : ''].filter(Boolean).join(' ')}
      style={styleVars}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
    >
      <span className={styles.time}>{timeLabel}</span>
      <span className={styles.name}>{lessonLabel}</span>
    </button>
  );
};

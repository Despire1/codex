import { addMinutes, format } from 'date-fns';
import type { CSSProperties, FC, KeyboardEvent, MouseEvent } from 'react';
import { buildParticipants, getLessonLabel } from '@/entities/lesson/lib/lessonDetails';
import type { Lesson, LinkedStudent } from '@/entities/types';
import { normalizeLessonColor } from '@/shared/lib/lessonColors';
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
  const color = normalizeLessonColor(lesson.color);

  const paletteByColor = {
    blue: { background: '#F7FEE7', border: '#A3E635', time: '#65A30D' },
    lavender: { background: '#FAF5FF', border: '#A855F7', time: '#9333EA' },
    peach: { background: '#FFF7ED', border: '#F97316', time: '#EA580C' },
    mint: { background: '#F0FDF4', border: '#22C55E', time: '#16A34A' },
    sand: { background: '#F0FDFA', border: '#14B8A6', time: '#0D9488' },
    rose: { background: '#FDF2F8', border: '#EC4899', time: '#DB2777' },
  } as const;

  const selectedPalette = paletteByColor[color];

  const styleVars = {
    '--lesson-bg': selectedPalette.background,
    '--lesson-border': selectedPalette.border,
    '--lesson-time': selectedPalette.time,
    '--lesson-shadow': 'rgba(15, 23, 42, 0.12)',
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

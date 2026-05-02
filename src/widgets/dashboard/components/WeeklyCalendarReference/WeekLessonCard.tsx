import { addMinutes, format } from 'date-fns';
import type { CSSProperties, FC, HTMLAttributes, KeyboardEvent, MouseEvent } from 'react';
import { buildParticipants, getLessonLabel } from '@/entities/lesson/lib/lessonDetails';
import type { Lesson, LinkedStudent } from '@/entities/types';
import { getLessonColorTheme, getLessonColorVars } from '@/shared/lib/lessonColors';
import { toZonedDate } from '@/shared/lib/timezoneDates';
import styles from './WeekLessonCard.module.css';

export interface WeekLessonCardDragHandle {
  setNodeRef: (el: HTMLElement | null) => void;
  attributes: HTMLAttributes<HTMLElement>;
  listeners?: HTMLAttributes<HTMLElement>;
  isDragging?: boolean;
  dragLocked?: boolean;
  asOverlay?: boolean;
}

const resolveStatusLabel = (lesson: Lesson) => {
  if (lesson.status === 'CANCELED') return 'Отменён';
  if (lesson.status === 'COMPLETED') return 'Проведён';
  return 'Запланирован';
};

const resolvePaidLabel = (lesson: Lesson) => {
  if (lesson.participants && lesson.participants.length > 0) {
    const allPaid = lesson.participants.every((p) => p.isPaid);
    return allPaid ? 'Оплачен' : 'Не оплачен';
  }
  return lesson.isPaid ? 'Оплачен' : 'Не оплачен';
};

interface WeekLessonCardProps {
  lesson: Lesson;
  linkedStudentsById: Map<number, LinkedStudent>;
  timeZone: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  onDoubleClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  dragHandle?: WeekLessonCardDragHandle;
}

export const WeekLessonCard: FC<WeekLessonCardProps> = ({
  lesson,
  linkedStudentsById,
  timeZone,
  onClick,
  onDoubleClick,
  onKeyDown,
  dragHandle,
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

  const statusLabel = resolveStatusLabel(lesson);
  const paidLabel = resolvePaidLabel(lesson);

  return (
    <button
      type="button"
      ref={dragHandle?.setNodeRef}
      {...(dragHandle?.attributes ?? {})}
      {...(dragHandle?.listeners ?? {})}
      className={[
        styles.card,
        isCanceled ? styles.cardCanceled : '',
        isCompleted ? styles.cardCompleted : '',
        dragHandle?.isDragging ? styles.cardDragging : '',
        dragHandle?.dragLocked ? styles.cardDragLocked : '',
        dragHandle?.asOverlay ? styles.cardDragOverlay : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={styleVars}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      aria-label={`${lessonLabel}, ${timeLabel}, ${statusLabel}, ${paidLabel}`}
    >
      <span className={styles.time}>
        {isCompleted ? (
          <svg className={styles.completedIcon} viewBox="0 0 16 16" aria-hidden="true" width={12} height={12}>
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

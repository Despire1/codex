import { addMinutes, format } from 'date-fns';
import type { CSSProperties, MouseEvent, KeyboardEvent, HTMLAttributes } from 'react';
import type { Lesson, LinkedStudent } from '@/entities/types';
import { getLessonColorTheme, getLessonColorVars } from '@/shared/lib/lessonColors';
import { toZonedDate } from '@/shared/lib/timezoneDates';
import { buildParticipants, getLessonLabel } from '../../lib/lessonDetails';
import styles from './LessonChip.module.css';

export interface LessonChipDragHandle {
  setNodeRef: (el: HTMLElement | null) => void;
  attributes: HTMLAttributes<HTMLElement>;
  listeners?: HTMLAttributes<HTMLElement>;
  isDragging?: boolean;
  dragLocked?: boolean;
  asOverlay?: boolean;
}

interface LessonChipProps {
  lesson: Lesson;
  linkedStudentsById: Map<number, LinkedStudent>;
  timeZone: string;
  className?: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  onDoubleClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  dragHandle?: LessonChipDragHandle;
}

export const LessonChip = ({
  lesson,
  linkedStudentsById,
  timeZone,
  className,
  onClick,
  onDoubleClick,
  onKeyDown,
  dragHandle,
}: LessonChipProps) => {
  const participants = buildParticipants(lesson, linkedStudentsById);
  const lessonLabel = getLessonLabel(participants, linkedStudentsById);
  const startDate = toZonedDate(lesson.startAt, timeZone);
  const endDate = addMinutes(startDate, lesson.durationMinutes);
  const timeLabel = `${format(startDate, 'HH:mm')} - ${format(endDate, 'HH:mm')}`;
  const isCanceled = lesson.status === 'CANCELED';
  const theme = getLessonColorTheme(lesson.color);
  const styleVars = {
    ...getLessonColorVars(lesson.color),
    '--lesson-text': theme.hoverBackground,
  } as CSSProperties;

  return (
    <button
      type="button"
      ref={dragHandle?.setNodeRef}
      {...(dragHandle?.attributes ?? {})}
      {...(dragHandle?.listeners ?? {})}
      className={[
        styles.chip,
        isCanceled ? styles.canceled : '',
        dragHandle?.isDragging ? styles.dragging : '',
        dragHandle?.dragLocked ? styles.dragLocked : '',
        dragHandle?.asOverlay ? styles.dragOverlayChip : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={styleVars}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
    >
      <div className={styles.time}>{timeLabel}</div>
      {!isCanceled && <div className={styles.name}>{lessonLabel}</div>}
      {isCanceled && (
        <div className={styles.nameRow}>
          <div className={styles.name}>{lessonLabel}</div>
          <span className={styles.badge}>Отменён</span>
        </div>
      )}
    </button>
  );
};

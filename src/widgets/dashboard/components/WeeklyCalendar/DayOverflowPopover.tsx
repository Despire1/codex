import { addMinutes, format } from 'date-fns';
import { type FC, useMemo } from 'react';
import type { Lesson, LinkedStudent } from '@/entities/types';
import { buildParticipants, getLessonLabel } from '@/entities/lesson/lib/lessonDetails';
import { AnchoredPopover } from '@/shared/ui/AnchoredPopover/AnchoredPopover';
import { toZonedDate } from '@/shared/lib/timezoneDates';
import styles from './DayOverflowPopover.module.css';

interface DayOverflowPopoverProps {
  isOpen: boolean;
  anchorEl: HTMLElement | null;
  lessons: Lesson[];
  linkedStudentsById: Map<number, LinkedStudent>;
  timeZone: string;
  onClose: () => void;
  onSelectLesson: (lesson: Lesson) => void;
}

export const DayOverflowPopover: FC<DayOverflowPopoverProps> = ({
  isOpen,
  anchorEl,
  lessons,
  linkedStudentsById,
  timeZone,
  onClose,
  onSelectLesson,
}) => {
  const items = useMemo(
    () =>
      lessons.map((lesson) => {
        const participants = buildParticipants(lesson, linkedStudentsById);
        const label = getLessonLabel(participants, linkedStudentsById);
        const startDate = toZonedDate(lesson.startAt, timeZone);
        const endDate = addMinutes(startDate, lesson.durationMinutes);
        return {
          lesson,
          label,
          time: `${format(startDate, 'HH:mm')} - ${format(endDate, 'HH:mm')}`,
          isCanceled: lesson.status === 'CANCELED',
        };
      }),
    [lessons, linkedStudentsById, timeZone],
  );

  return (
    <AnchoredPopover isOpen={isOpen} anchorEl={anchorEl} onClose={onClose} side="bottom" align="start">
      <div className={styles.popover}>
        <div className={styles.list}>
          {items.map(({ lesson, label, time, isCanceled }) => (
            <button
              key={lesson.id}
              type="button"
              className={[styles.item, isCanceled ? styles.itemCanceled : ''].filter(Boolean).join(' ')}
              onClick={() => onSelectLesson(lesson)}
            >
              <div className={styles.itemTime}>{time}</div>
              <div className={styles.itemLabel}>{label}</div>
              {isCanceled && <span className={styles.badge}>Отменён</span>}
            </button>
          ))}
        </div>
      </div>
    </AnchoredPopover>
  );
};

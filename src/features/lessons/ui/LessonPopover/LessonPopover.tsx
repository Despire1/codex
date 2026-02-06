import { addMinutes, format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useMemo } from 'react';
import type { Lesson, LinkedStudent } from '../../../../entities/types';
import { toZonedDate } from '../../../../shared/lib/timezoneDates';
import { buildParticipants, getLessonLabel, resolveLessonPaid } from '../../../../entities/lesson/lib/lessonDetails';
import styles from './LessonPopover.module.css';

interface LessonPopoverProps {
  lesson: Lesson;
  linkedStudentsById: Map<number, LinkedStudent>;
  timeZone: string;
  onReschedule: () => void;
  onEditFull: () => void;
  onCancel: () => void;
  onRestore: () => void;
}

export const LessonPopover = ({
  lesson,
  linkedStudentsById,
  timeZone,
  onReschedule,
  onEditFull,
  onCancel,
  onRestore,
}: LessonPopoverProps) => {
  const participants = useMemo(() => buildParticipants(lesson, linkedStudentsById), [lesson, linkedStudentsById]);
  const lessonLabel = useMemo(() => getLessonLabel(participants, linkedStudentsById), [participants, linkedStudentsById]);
  const isPaid = resolveLessonPaid(lesson, participants);
  const isCanceled = lesson.status === 'CANCELED';
  const startDate = toZonedDate(lesson.startAt, timeZone);
  const endDate = addMinutes(startDate, lesson.durationMinutes);
  const dateLabel = format(startDate, 'd MMMM', { locale: ru });
  const timeLabel = `${format(startDate, 'HH:mm')} - ${format(endDate, 'HH:mm')}`;

  return (
    <div className={styles.root}>
      <div className={styles.summary}>
        <div className={styles.title}>{lessonLabel}</div>
        <div className={styles.metaRow}>
          <span>{dateLabel}</span>
          <span className={styles.dot}>•</span>
          <span>{timeLabel}</span>
        </div>
        <div className={styles.metaRow}>
          {isCanceled && <span className={styles.status}>Отменён</span>}
          {isPaid && <span className={styles.paid}>Оплачен</span>}
        </div>
      </div>

      <div className={styles.actions}>
        {!isCanceled && (
          <>
            <button type="button" className={styles.actionButton} onClick={onReschedule}>
              Перенести
            </button>
            <button type="button" className={styles.actionButton} onClick={onEditFull}>
              Редактировать
            </button>
            <button type="button" className={styles.actionDanger} onClick={onCancel}>
              Отменить
            </button>
          </>
        )}

        {isCanceled && (
          <>
            <button type="button" className={styles.actionButton} onClick={onRestore}>
              Восстановить
            </button>
            <button type="button" className={styles.actionButton} onClick={onEditFull}>
              Редактировать
            </button>
          </>
        )}
      </div>
    </div>
  );
};

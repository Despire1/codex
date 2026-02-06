import { addMinutes, format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useMemo, useRef } from 'react';
import type { Lesson, LinkedStudent } from '../../../../entities/types';
import { buildParticipants, getLessonLabel } from '../../../../entities/lesson/lib/lessonDetails';
import { toZonedDate } from '../../../../shared/lib/timezoneDates';
import { useFocusTrap } from '../../../../shared/lib/useFocusTrap';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import modalStyles from '../../../../shared/ui/Modal/Modal.module.css';
import controls from '../../../../shared/styles/controls.module.css';
import styles from './LessonRestoreDialog.module.css';

interface LessonRestoreDialogProps {
  open: boolean;
  lesson: Lesson | null;
  linkedStudentsById: Map<number, LinkedStudent>;
  timeZone: string;
  onConfirm: () => void;
  onClose: () => void;
}

export const LessonRestoreDialog = ({
  open,
  lesson,
  linkedStudentsById,
  timeZone,
  onConfirm,
  onClose,
}: LessonRestoreDialogProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, containerRef);
  const participants = useMemo(
    () => (lesson ? buildParticipants(lesson, linkedStudentsById) : []),
    [lesson, linkedStudentsById],
  );

  if (!lesson) return null;

  const startDate = toZonedDate(lesson.startAt, timeZone);
  const endDate = addMinutes(startDate, lesson.durationMinutes);
  const dateLabel = format(startDate, 'd MMMM', { locale: ru });
  const timeLabel = `${format(startDate, 'HH:mm')} - ${format(endDate, 'HH:mm')}`;
  const lessonLabel = getLessonLabel(participants, linkedStudentsById);

  return (
    <Modal open={open} title="Восстановить урок?" onClose={onClose}>
      <div ref={containerRef}>
        <p className={modalStyles.message}>
          {dateLabel}, {timeLabel} • {lessonLabel}
        </p>
        <div className={styles.actions}>
          <button type="button" className={controls.secondaryButton} onClick={onClose}>
            Отмена
          </button>
          <button type="button" className={controls.primaryButton} onClick={onConfirm}>
            Восстановить
          </button>
        </div>
      </div>
    </Modal>
  );
};

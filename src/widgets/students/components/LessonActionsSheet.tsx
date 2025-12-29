import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Lesson } from '../../../entities/types';
import { BottomSheet } from '../../../shared/ui/BottomSheet/BottomSheet';
import styles from './LessonActionsSheet.module.css';

interface LessonActionsSheetProps {
  lesson: Lesson | null;
  isOpen: boolean;
  isPaid: boolean;
  resolvedPrice?: number;
  onClose: () => void;
  onComplete: () => void;
  onTogglePaid: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export const LessonActionsSheet = ({
  lesson,
  isOpen,
  isPaid,
  resolvedPrice,
  onClose,
  onComplete,
  onTogglePaid,
  onEdit,
  onDelete,
}: LessonActionsSheetProps) => {
  if (!lesson) return null;

  const lessonDate = format(parseISO(lesson.startAt), 'd MMM yyyy, HH:mm', { locale: ru });
  const durationLabel = lesson.durationMinutes ? `${lesson.durationMinutes} мин` : '—';
  const priceLabel = resolvedPrice === undefined || resolvedPrice === null ? '—' : `${resolvedPrice} ₽`;
  const isCompleted = lesson.status === 'COMPLETED';

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className={styles.header}>
        <div className={styles.title}>{lessonDate}</div>
        <div className={styles.subtitle}>
          {durationLabel} • {priceLabel}
        </div>
      </div>
      <div className={styles.actionsCard}>
        <button
          type="button"
          className={`${styles.actionButton} ${isCompleted ? styles.disabled : ''}`}
          onClick={() => {
            if (isCompleted) return;
            onComplete();
            onClose();
          }}
          disabled={isCompleted}
        >
          Отметить проведённым
        </button>
        <button
          type="button"
          className={`${styles.actionButton} ${isPaid ? styles.disabled : ''}`}
          onClick={() => {
            if (isPaid) return;
            onTogglePaid();
            onClose();
          }}
          disabled={isPaid}
        >
          Отметить оплату
        </button>
        <button
          type="button"
          className={styles.actionButton}
          onClick={() => {
            onEdit();
            onClose();
          }}
        >
          Перенести
        </button>
        <button
          type="button"
          className={`${styles.actionButton} ${styles.danger}`}
          onClick={() => {
            onDelete();
            onClose();
          }}
        >
          Удалить
        </button>
      </div>
      <button type="button" className={styles.cancelButton} onClick={onClose}>
        Отмена
      </button>
    </BottomSheet>
  );
};

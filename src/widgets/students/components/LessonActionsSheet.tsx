import { formatInTimeZone } from '../../../shared/lib/timezoneDates';
import { ru } from 'date-fns/locale';
import { Lesson } from '../../../entities/types';
import {
  resolveLessonDeleteDisabledReason,
  resolveLessonMutationDisabledReason,
} from '../../../entities/lesson/lib/lessonMutationGuards';
import { BottomSheet } from '../../../shared/ui/BottomSheet/BottomSheet';
import { Tooltip } from '../../../shared/ui/Tooltip/Tooltip';
import styles from './LessonActionsSheet.module.css';
import { useTimeZone } from '../../../shared/lib/timezoneContext';

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
  const timeZone = useTimeZone();
  if (!lesson) return null;

  const lessonDate = formatInTimeZone(lesson.startAt, 'd MMM yyyy, HH:mm', { locale: ru, timeZone });
  const durationLabel = lesson.durationMinutes ? `${lesson.durationMinutes} мин` : '—';
  const priceLabel = resolvedPrice === undefined || resolvedPrice === null ? '—' : `${resolvedPrice} ₽`;
  const isCompleted = lesson.status === 'COMPLETED';
  const rescheduleDisabledReason = resolveLessonMutationDisabledReason(lesson);
  const deleteDisabledReason = resolveLessonDeleteDisabledReason(lesson);
  const paymentActionLabel = isPaid ? 'Отменить оплату' : 'Отметить оплату';

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
          className={styles.actionButton}
          onClick={() => {
            onTogglePaid();
            onClose();
          }}
        >
          {paymentActionLabel}
        </button>
        <button
          type="button"
          className={`${styles.actionButton} ${rescheduleDisabledReason ? styles.disabled : ''}`}
          onClick={() => {
            if (rescheduleDisabledReason) return;
            onEdit();
            onClose();
          }}
          disabled={Boolean(rescheduleDisabledReason)}
        >
          Перенести урок
        </button>
        <Tooltip content={deleteDisabledReason}>
          <button
            type="button"
            className={`${styles.actionButton} ${styles.danger} ${deleteDisabledReason ? styles.disabled : ''}`}
            onClick={() => {
              if (deleteDisabledReason) return;
              onDelete();
              onClose();
            }}
            disabled={Boolean(deleteDisabledReason)}
          >
            Удалить урок
          </button>
        </Tooltip>
      </div>
      <button type="button" className={styles.cancelButton} onClick={onClose}>
        Отмена
      </button>
    </BottomSheet>
  );
};

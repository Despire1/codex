import { formatInTimeZone } from '../../../shared/lib/timezoneDates';
import { ru } from 'date-fns/locale';
import { Lesson } from '../../../entities/types';
import { resolveLessonMutationDisabledReason } from '../../../entities/lesson/lib/lessonMutationGuards';
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
  if (!lesson) return null;
  const timeZone = useTimeZone();

  const lessonDate = formatInTimeZone(lesson.startAt, 'd MMM yyyy, HH:mm', { locale: ru, timeZone });
  const durationLabel = lesson.durationMinutes ? `${lesson.durationMinutes} мин` : '—';
  const priceLabel = resolvedPrice === undefined || resolvedPrice === null ? '—' : `${resolvedPrice} ₽`;
  const isCompleted = lesson.status === 'COMPLETED';
  const mutationDisabledReason = resolveLessonMutationDisabledReason(lesson);
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
          className={styles.actionButton}
          onClick={() => {
            onEdit();
            onClose();
          }}
        >
          Перенести
        </button>
        <Tooltip content={mutationDisabledReason}>
          <button
            type="button"
            className={`${styles.actionButton} ${styles.danger} ${mutationDisabledReason ? styles.disabled : ''}`}
            onClick={() => {
              if (mutationDisabledReason) return;
              onDelete();
              onClose();
            }}
            disabled={Boolean(mutationDisabledReason)}
          >
            Удалить
          </button>
        </Tooltip>
      </div>
      <button type="button" className={styles.cancelButton} onClick={onClose}>
        Отмена
      </button>
    </BottomSheet>
  );
};

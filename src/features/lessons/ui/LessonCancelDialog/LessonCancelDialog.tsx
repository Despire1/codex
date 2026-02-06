import { addMinutes, format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Lesson, LinkedStudent } from '../../../../entities/types';
import { buildParticipants, getLessonLabel, resolveLessonPaid } from '../../../../entities/lesson/lib/lessonDetails';
import { toZonedDate } from '../../../../shared/lib/timezoneDates';
import { useFocusTrap } from '../../../../shared/lib/useFocusTrap';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import modalStyles from '../../../../shared/ui/Modal/Modal.module.css';
import controls from '../../../../shared/styles/controls.module.css';
import type { LessonCancelRefundMode } from '../../model/types';
import styles from './LessonCancelDialog.module.css';

interface LessonCancelDialogProps {
  open: boolean;
  lesson: Lesson | null;
  linkedStudentsById: Map<number, LinkedStudent>;
  timeZone: string;
  refundableToBalance?: boolean;
  onConfirm: (refundMode?: LessonCancelRefundMode) => void;
  onClose: () => void;
}

export const LessonCancelDialog = ({
  open,
  lesson,
  linkedStudentsById,
  timeZone,
  refundableToBalance = true,
  onConfirm,
  onClose,
}: LessonCancelDialogProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, containerRef);
  const participants = useMemo(
    () => (lesson ? buildParticipants(lesson, linkedStudentsById) : []),
    [lesson, linkedStudentsById],
  );
  const isPaid = lesson ? resolveLessonPaid(lesson, participants) : false;
  const [refundMode, setRefundMode] = useState<LessonCancelRefundMode | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    if (!isPaid) {
      setRefundMode(undefined);
      return;
    }
    if (!refundableToBalance) {
      setRefundMode('KEEP_AS_PAID');
      return;
    }
    setRefundMode(undefined);
  }, [isPaid, open, refundableToBalance]);

  if (!lesson) return null;

  const startDate = toZonedDate(lesson.startAt, timeZone);
  const endDate = addMinutes(startDate, lesson.durationMinutes);
  const dateLabel = format(startDate, 'd MMMM', { locale: ru });
  const timeLabel = `${format(startDate, 'HH:mm')} - ${format(endDate, 'HH:mm')}`;
  const lessonLabel = getLessonLabel(participants, linkedStudentsById);

  const handleConfirm = () => {
    onConfirm(refundMode);
  };

  const isConfirmDisabled = isPaid && (!refundMode || (refundMode === 'RETURN_TO_BALANCE' && !refundableToBalance));

  return (
    <Modal open={open} title="Отменить урок?" onClose={onClose}>
      <div ref={containerRef}>
        <p className={modalStyles.message}>
          {dateLabel}, {timeLabel} • {lessonLabel}
        </p>
        {isPaid && (
          <div className={styles.options} role="radiogroup" aria-label="Что сделать с оплатой">
            <label
              className={`${styles.option} ${refundMode === 'RETURN_TO_BALANCE' ? styles.optionActive : ''} ${
                !refundableToBalance ? styles.optionDisabled : ''
              }`}
            >
              <input
                type="radio"
                name="refundMode"
                value="RETURN_TO_BALANCE"
                checked={refundMode === 'RETURN_TO_BALANCE'}
                disabled={!refundableToBalance}
                onChange={() => setRefundMode('RETURN_TO_BALANCE')}
              />
              <span>
                Вернуть занятие на баланс ученика
                {!refundableToBalance && <span className={styles.optionHint}>Недоступно для этого урока</span>}
              </span>
            </label>
            <label
              className={`${styles.option} ${refundMode === 'KEEP_AS_PAID' ? styles.optionActive : ''}`}
            >
              <input
                type="radio"
                name="refundMode"
                value="KEEP_AS_PAID"
                checked={refundMode === 'KEEP_AS_PAID'}
                onChange={() => setRefundMode('KEEP_AS_PAID')}
              />
              <span>Не возвращать</span>
            </label>
          </div>
        )}
        <div className={styles.actions}>
          <button type="button" className={controls.secondaryButton} onClick={onClose}>
            Не отменять
          </button>
          <button
            type="button"
            className={controls.dangerButton}
            disabled={isConfirmDisabled}
            onClick={handleConfirm}
          >
            Отменить урок
          </button>
        </div>
      </div>
    </Modal>
  );
};

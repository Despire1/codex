import { addMinutes, format, ru } from 'date-fns';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Lesson, LinkedStudent } from '../../../../entities/types';
import { buildParticipants, getLessonLabel, resolveLessonPaid } from '../../../../entities/lesson/lib/lessonDetails';
import { resolveLessonHasPaidParticipant } from '../../../../entities/lesson/lib/lessonMutationGuards';
import { toZonedDate } from '../../../../shared/lib/timezoneDates';
import { useFocusTrap } from '../../../../shared/lib/useFocusTrap';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import modalStyles from '../../../../shared/ui/Modal/Modal.module.css';
import controls from '../../../../shared/styles/controls.module.css';
import { resolveLessonCancelActionCopy } from '../../../../entities/lesson/lib/lessonStatusPresentation';
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
  const hasPaidParticipants = lesson ? resolveLessonHasPaidParticipant(lesson) : false;
  const isCompleted = lesson?.status === 'COMPLETED';
  const [refundMode, setRefundMode] = useState<LessonCancelRefundMode | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    if (!hasPaidParticipants) {
      setRefundMode(undefined);
      return;
    }
    if (!refundableToBalance) {
      setRefundMode('KEEP_AS_PAID');
      return;
    }
    setRefundMode('RETURN_TO_BALANCE');
  }, [hasPaidParticipants, open, refundableToBalance]);

  if (!lesson) return null;

  const startDate = toZonedDate(lesson.startAt, timeZone);
  const endDate = addMinutes(startDate, lesson.durationMinutes);
  const dateLabel = format(startDate, 'd MMMM', { locale: ru });
  const timeLabel = `${format(startDate, 'HH:mm')} - ${format(endDate, 'HH:mm')}`;
  const lessonLabel = getLessonLabel(participants, linkedStudentsById);

  const handleConfirm = () => {
    onConfirm(refundMode);
  };

  const isConfirmDisabled =
    hasPaidParticipants && (!refundMode || (refundMode === 'RETURN_TO_BALANCE' && !refundableToBalance));
  const cancelCopy = resolveLessonCancelActionCopy(lesson);

  const correctionMessage = isCompleted
    ? hasPaidParticipants
      ? 'Урок уже отмечен проведённым. Мы изменим его статус на «Отменён» и ниже нужно выбрать, что сделать с оплатой.'
      : 'Урок уже отмечен проведённым. Мы изменим его статус на «Отменён».'
    : hasPaidParticipants
      ? 'Урок уже оплачен. При отмене выберите, что сделать с оплатой.'
      : null;

  return (
    <Modal open={open} title={cancelCopy.title} onClose={onClose}>
      <div ref={containerRef}>
        <p className={modalStyles.message}>
          {dateLabel}, {timeLabel} • {lessonLabel}
        </p>
        {correctionMessage && <div className={styles.notice}>{correctionMessage}</div>}
        {hasPaidParticipants && (
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
            <label className={`${styles.option} ${refundMode === 'KEEP_AS_PAID' ? styles.optionActive : ''}`}>
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
        {hasPaidParticipants && !isPaid && (
          <p className={modalStyles.message}>
            Возврат затронет только тех участников, у которых это занятие уже отмечено как оплаченное.
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className={controls.secondaryButton} onClick={onClose}>
            {cancelCopy.cancelText}
          </button>
          <button type="button" className={controls.dangerButton} disabled={isConfirmDisabled} onClick={handleConfirm}>
            {cancelCopy.confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
};

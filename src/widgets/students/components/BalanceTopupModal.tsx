import { FC, TouchEvent, useEffect, useMemo, useRef, useState } from 'react';
import { formatInTimeZone, toUtcDateFromTimeZone } from '../../../shared/lib/timezoneDates';
import { PaymentEventType, Student, TeacherStudent } from '../../../entities/types';
import controls from '../../../shared/styles/controls.module.css';
import { NumberInput } from '../../../shared/ui/NumberInput/NumberInput';
import { DatePickerField } from '../../../shared/ui/DatePickerField';
import styles from '../StudentsSection.module.css';
import { useTimeZone } from '../../../shared/lib/timezoneContext';

const quickValues = [1, 2, 4, 8];

type BalanceOperationType = Extract<
  PaymentEventType,
  'TOP_UP' | 'MANUAL_PAID' | 'SUBSCRIPTION' | 'OTHER' | 'ADJUSTMENT'
>;

interface BalanceTopupModalProps {
  isOpen: boolean;
  isMobile: boolean;
  student: (Student & { link: TeacherStudent }) | null;
  onClose: () => void;
  onSubmit: (payload: { delta: number; type: BalanceOperationType; comment?: string; createdAt?: string }) => Promise<void>;
}

const defaultDateTime = (timeZone: string) => formatInTimeZone(new Date(), "yyyy-MM-dd'T'HH:mm", { timeZone });

export const BalanceTopupModal: FC<BalanceTopupModalProps> = ({
  isOpen,
  isMobile,
  student,
  onClose,
  onSubmit,
}) => {
  const timeZone = useTimeZone();
  const [lessonCount, setLessonCount] = useState(0);
  const [operationType, setOperationType] = useState<BalanceOperationType>('TOP_UP');
  const [comment, setComment] = useState('');
  const [dateTime, setDateTime] = useState(() => defaultDateTime(timeZone));
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const touchStartY = useRef<number | null>(null);

  const normalizedLessonCount = Math.trunc(lessonCount);
  const isRemoval = normalizedLessonCount < 0;
  const isSaveDisabled = isSubmitting || normalizedLessonCount === 0;
  const currentBalance = student?.link.balanceLessons ?? 0;

  useEffect(() => {
    if (!isOpen) return;
    setLessonCount(0);
    setOperationType('TOP_UP');
    setComment('');
    setDateTime(defaultDateTime(timeZone));
    setErrorMessage('');
  }, [isOpen, student?.id, timeZone]);

  useEffect(() => {
    if (isRemoval) {
      setOperationType('ADJUSTMENT');
    } else if (operationType === 'ADJUSTMENT') {
      setOperationType('TOP_UP');
    }
  }, [isRemoval, operationType]);

  const handleQuickAdd = (delta: number) => {
    const direction = lessonCount < 0 ? -1 : 1;
    setLessonCount((prev) => prev + direction * delta);
  };

  const handleLessonChange = (value: number) => {
    setLessonCount(value);
  };

  const handleSubmit = async () => {
    if (!student) return;
    const normalizedCount = Math.trunc(lessonCount);
    if (normalizedCount === 0) {
      setErrorMessage('Введите значение отличное от нуля.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const [datePart, timePart] = dateTime.split('T');
      const createdAt = datePart && timePart
        ? toUtcDateFromTimeZone(datePart, timePart, timeZone).toISOString()
        : undefined;
      await onSubmit({
        delta: normalizedCount,
        type: operationType,
        comment: comment.trim() ? comment.trim() : undefined,
        createdAt,
      });
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось пополнить баланс.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!isMobile) return;
    touchStartY.current = event.touches[0]?.clientY ?? null;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (!isMobile) return;
    const startY = touchStartY.current;
    const endY = event.changedTouches[0]?.clientY ?? null;
    if (startY !== null && endY !== null && endY - startY > 80) {
      onClose();
    }
    touchStartY.current = null;
  };

  const operationOptions = useMemo(() => {
    if (isRemoval) {
      return [{ value: 'ADJUSTMENT', label: 'Списание занятий' }];
    }
    return [
      { value: 'TOP_UP', label: 'Пополнение предоплаты' },
      { value: 'MANUAL_PAID', label: 'Оплата занятия вручную' },
      { value: 'SUBSCRIPTION', label: 'Абонемент' },
      { value: 'OTHER', label: 'Другое' },
    ];
  }, [isRemoval]);

  if (!isOpen || !student) return null;

  return (
    <div
      className={`${styles.modalOverlay} ${isMobile ? styles.modalOverlayBottom : ''}`}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`${styles.modalCard} ${isMobile ? styles.modalCardBottom : ''}`}
        onClick={(event) => event.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        role="dialog"
        aria-modal="true"
        aria-label="Изменение баланса"
      >
        {isMobile && <div className={styles.modalHandle} />}
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>Изменение баланса</div>
            <div className={styles.modalSubtitle}>{student.link.customName}</div>
          </div>
          <button className={styles.modalClose} type="button" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.balanceMeta}>Текущий баланс: {currentBalance} занятий</div>
          <div className={styles.balanceQuickRow}>
            <span className={styles.modalLabel}>
              Быстро изменить
            </span>
            <div className={styles.balanceQuickButtons}>
              {quickValues.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={styles.balanceQuickButton}
                  onClick={() => handleQuickAdd(value)}
                >
                  {lessonCount < 0 ? `-${value}` : `+${value}`}
                </button>
              ))}
            </div>
          </div>
          <label className={styles.modalField}>
            <span className={styles.modalLabel}>
              Изменить баланс занятий
            </span>
            <NumberInput
              className={styles.modalNumberInput}
              value={lessonCount}
              onChange={handleLessonChange}
              step={1}
              ariaLabel="Изменить баланс занятий"
              disallowZero
            />
          </label>
          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Тип операции</span>
            <select
              className={styles.modalSelect}
              value={operationType}
              onChange={(event) => setOperationType(event.target.value as BalanceOperationType)}
              disabled={isRemoval}
            >
              {operationOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Комментарий (необязательно)</span>
            <textarea
              className={styles.modalTextarea}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Комментарий"
            />
          </label>
          <DatePickerField
            className={styles.modalField}
            label="Дата и время"
            value={dateTime}
            onChange={(nextValue) => setDateTime(nextValue ?? defaultDateTime(timeZone))}
            mode="datetime"
            minuteStep={5}
          />
          {errorMessage && <div className={styles.modalError}>{errorMessage}</div>}
        </div>
        <div className={`${styles.modalFooter} ${isMobile ? styles.modalFooterSticky : ''}`}>
          <button
            type="button"
            className={controls.secondaryButton}
            onClick={onClose}
            disabled={isSubmitting}
          >
            Отмена
          </button>
          <button
            type="button"
            className={controls.primaryButton}
            onClick={handleSubmit}
            disabled={isSaveDisabled}
          >
            {isSubmitting ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
};

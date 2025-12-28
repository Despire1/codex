import { FC, TouchEvent, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { PaymentEventType, Student, TeacherStudent } from '../../../entities/types';
import controls from '../../../shared/styles/controls.module.css';
import styles from '../StudentsSection.module.css';

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

const defaultDateTime = () => format(new Date(), "yyyy-MM-dd'T'HH:mm");

export const BalanceTopupModal: FC<BalanceTopupModalProps> = ({
  isOpen,
  isMobile,
  student,
  onClose,
  onSubmit,
}) => {
  const [lessonCount, setLessonCount] = useState(1);
  const [operationMode, setOperationMode] = useState<'add' | 'remove'>('add');
  const [operationType, setOperationType] = useState<BalanceOperationType>('TOP_UP');
  const [comment, setComment] = useState('');
  const [dateTime, setDateTime] = useState(defaultDateTime);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const touchStartY = useRef<number | null>(null);

  const isSaveDisabled = isSubmitting || lessonCount < 1;
  const currentBalance = student?.link.balanceLessons ?? 0;

  useEffect(() => {
    if (!isOpen) return;
    setLessonCount(1);
    setOperationMode('add');
    setOperationType('TOP_UP');
    setComment('');
    setDateTime(defaultDateTime());
    setErrorMessage('');
  }, [isOpen, student?.id]);

  useEffect(() => {
    if (operationMode === 'remove') {
      setOperationType('ADJUSTMENT');
    } else if (operationType === 'ADJUSTMENT') {
      setOperationType('TOP_UP');
    }
  }, [operationMode, operationType]);

  const handleQuickAdd = (delta: number) => {
    const signedDelta = operationMode === 'remove' ? -delta : delta;
    setLessonCount((prev) => Math.max(0, prev + signedDelta));
  };

  const handleSubmit = async () => {
    if (!student) return;
    const normalizedCount = Math.floor(lessonCount);
    if (normalizedCount < 1) {
      setErrorMessage('Добавьте хотя бы одно занятие.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const signedDelta = operationMode === 'remove' ? -normalizedCount : normalizedCount;
      await onSubmit({
        delta: signedDelta,
        type: operationType,
        comment: comment.trim() ? comment.trim() : undefined,
        createdAt: dateTime || undefined,
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
    if (operationMode === 'remove') {
      return [{ value: 'ADJUSTMENT', label: 'Списание занятий' }];
    }
    return [
      { value: 'TOP_UP', label: 'Пополнение предоплаты' },
      { value: 'MANUAL_PAID', label: 'Оплата занятия вручную' },
      { value: 'SUBSCRIPTION', label: 'Абонемент' },
      { value: 'OTHER', label: 'Другое' },
    ];
  }, [operationMode]);

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
        aria-label="Пополнить баланс"
      >
        {isMobile && <div className={styles.modalHandle} />}
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>Пополнить баланс</div>
            <div className={styles.modalSubtitle}>{student.link.customName}</div>
          </div>
          <button className={styles.modalClose} type="button" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.balanceMeta}>Текущий баланс: {currentBalance} занятий</div>
          <div className={styles.balanceModeToggle}>
            <button
              type="button"
              className={`${styles.balanceModeButton} ${
                operationMode === 'add' ? styles.balanceModeButtonActive : ''
              }`}
              onClick={() => setOperationMode('add')}
            >
              Пополнить
            </button>
            <button
              type="button"
              className={`${styles.balanceModeButton} ${
                operationMode === 'remove' ? styles.balanceModeButtonActive : ''
              }`}
              onClick={() => setOperationMode('remove')}
            >
              Списать
            </button>
          </div>
          <div className={styles.balanceQuickRow}>
            <span className={styles.modalLabel}>
              {operationMode === 'remove' ? 'Быстро списать' : 'Быстро добавить'}
            </span>
            <div className={styles.balanceQuickButtons}>
              {quickValues.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={styles.balanceQuickButton}
                  onClick={() => handleQuickAdd(value)}
                >
                  {operationMode === 'remove' ? `-${value}` : `+${value}`}
                </button>
              ))}
            </div>
          </div>
          <label className={styles.modalField}>
            <span className={styles.modalLabel}>
              {operationMode === 'remove' ? 'Списать занятий' : 'Добавить занятий'}
            </span>
            <input
              className={styles.modalInput}
              type="number"
              min={1}
              step={1}
              value={lessonCount}
              onChange={(event) => setLessonCount(Math.max(0, Number(event.target.value)))}
            />
          </label>
          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Тип операции</span>
            <select
              className={styles.modalSelect}
              value={operationType}
              onChange={(event) => setOperationType(event.target.value as BalanceOperationType)}
              disabled={operationMode === 'remove'}
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
          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Дата и время</span>
            <input
              className={styles.modalInput}
              type="datetime-local"
              value={dateTime}
              onChange={(event) => setDateTime(event.target.value)}
            />
          </label>
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

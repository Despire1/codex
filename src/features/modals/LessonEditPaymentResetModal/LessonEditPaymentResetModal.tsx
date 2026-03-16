import { FC, useState } from 'react';
import { Modal } from '../../../shared/ui/Modal/Modal';
import modalStyles from '../../../shared/ui/Modal/Modal.module.css';
import controls from '../../../shared/styles/controls.module.css';
import styles from './LessonEditPaymentResetModal.module.css';

interface LessonEditPaymentResetModalProps {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void | Promise<void>;
  onConfirm: () => void | Promise<void>;
}

export const LessonEditPaymentResetModal: FC<LessonEditPaymentResetModalProps> = ({
  open,
  title,
  message,
  onClose,
  onConfirm,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAction = async (action: () => void | Promise<void>) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await action();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={open} title={title} onClose={isSubmitting ? () => undefined : onClose}>
      <p className={modalStyles.message}>{message}</p>
      <p className={modalStyles.message}>
        Мы снимем отметку оплаты у оплаченных участников этого урока и вернём по 1 занятию на их баланс перед сохранением.
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className={`${controls.secondaryButton} ${styles.button}`}
          onClick={() => {
            void handleAction(onClose);
          }}
          disabled={isSubmitting}
        >
          Отмена
        </button>
        <button
          type="button"
          className={`${controls.primaryButton} ${styles.button}`}
          onClick={() => {
            void handleAction(onConfirm);
          }}
          disabled={isSubmitting}
        >
          <span className={modalStyles.buttonContent}>
            {isSubmitting ? <span className={modalStyles.buttonSpinner} aria-hidden /> : null}
            <span>Вернуть и сохранить</span>
          </span>
        </button>
      </div>
    </Modal>
  );
};

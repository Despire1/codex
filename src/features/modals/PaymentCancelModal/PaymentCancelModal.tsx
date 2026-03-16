import { FC, useState } from 'react';
import { Modal } from '../../../shared/ui/Modal/Modal';
import modalStyles from '../../../shared/ui/Modal/Modal.module.css';
import controls from '../../../shared/styles/controls.module.css';
import styles from './PaymentCancelModal.module.css';

interface PaymentCancelModalProps {
  open: boolean;
  title: string;
  message: string;
  helperText?: string;
  refundText?: string;
  writeOffText?: string;
  onClose: () => void | Promise<void>;
  onRefund: () => void | Promise<void>;
  onWriteOff: () => void | Promise<void>;
}

export const PaymentCancelModal: FC<PaymentCancelModalProps> = ({
  open,
  title,
  message,
  helperText,
  refundText = 'Вернуть на баланс',
  writeOffText = 'Отменить без возврата',
  onClose,
  onRefund,
  onWriteOff,
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
        {helperText ??
          'Если вернуть, баланс увеличится на 1 урок. Если нет — оплата будет отменена без возврата на баланс.'}
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
          className={`${controls.secondaryButton} ${styles.button}`}
          onClick={() => {
            void handleAction(onWriteOff);
          }}
          disabled={isSubmitting}
        >
          <span className={modalStyles.buttonContent}>
            {isSubmitting ? <span className={modalStyles.buttonSpinner} aria-hidden /> : null}
            <span>{writeOffText}</span>
          </span>
        </button>
        <button
          type="button"
          className={`${controls.primaryButton} ${styles.button}`}
          onClick={() => {
            void handleAction(onRefund);
          }}
          disabled={isSubmitting}
        >
          <span className={modalStyles.buttonContent}>
            {isSubmitting ? <span className={modalStyles.buttonSpinner} aria-hidden /> : null}
            <span>{refundText}</span>
          </span>
        </button>
      </div>
    </Modal>
  );
};

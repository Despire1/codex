import { FC } from 'react';
import { Modal } from '../../../shared/ui/Modal/Modal';
import modalStyles from '../../../shared/ui/Modal/Modal.module.css';
import controls from '../../../shared/styles/controls.module.css';
import styles from './PaymentCancelModal.module.css';

interface PaymentCancelModalProps {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
  onRefund: () => void;
  onWriteOff: () => void;
}

export const PaymentCancelModal: FC<PaymentCancelModalProps> = ({
  open,
  title,
  message,
  onClose,
  onRefund,
  onWriteOff,
}) => {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <p className={modalStyles.message}>{message}</p>
      <p className={modalStyles.message}>
        Если вернуть, баланс увеличится на 1 урок. Если нет — оплата будет отменена без возврата на баланс.
      </p>
      <div className={styles.actions}>
        <button type="button" className={`${controls.secondaryButton} ${styles.button}`} onClick={onClose}>
          Отмена
        </button>
        <button type="button" className={`${controls.secondaryButton} ${styles.button}`} onClick={onWriteOff}>
          Списать без возврата
        </button>
        <button type="button" className={`${controls.primaryButton} ${styles.button}`} onClick={onRefund}>
          Вернуть на баланс
        </button>
      </div>
    </Modal>
  );
};

import { FC } from 'react';
import { Modal } from '../../../shared/ui/Modal/Modal';
import modalStyles from '../../../shared/ui/Modal/Modal.module.css';
import controls from '../../../shared/styles/controls.module.css';
import styles from './PaymentBalanceModal.module.css';

interface PaymentBalanceModalProps {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
  onWriteOff: () => void;
  onSkip: () => void;
}

export const PaymentBalanceModal: FC<PaymentBalanceModalProps> = ({
  open,
  title,
  message,
  onClose,
  onWriteOff,
  onSkip,
}) => {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <p className={modalStyles.message}>{message}</p>
      <p className={modalStyles.message}>Можно списать 1 занятие с баланса или оставить оплату без списания.</p>
      <div className={styles.actions}>
        <button type="button" className={`${controls.secondaryButton} ${styles.button}`} onClick={onClose}>
          Отмена
        </button>
        <button type="button" className={`${controls.secondaryButton} ${styles.button}`} onClick={onSkip}>
          Не списывать
        </button>
        <button type="button" className={`${controls.primaryButton} ${styles.button}`} onClick={onWriteOff}>
          Списать с баланса
        </button>
      </div>
    </Modal>
  );
};

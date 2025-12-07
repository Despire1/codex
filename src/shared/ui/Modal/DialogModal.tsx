import { ReactNode } from 'react';
import controls from '../../styles/controls.module.css';
import { Modal } from './Modal';
import styles from './Modal.module.css';

interface DialogModalProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmText?: string;
  cancelText?: string;
  onClose: () => void;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export const DialogModal = ({
  open,
  title,
  description,
  confirmText,
  cancelText,
  onClose,
  onConfirm,
  onCancel,
}: DialogModalProps) => {
  const hasCancel = Boolean(onCancel);
  const handleConfirm = () => {
    onConfirm?.();
  };

  const handleCancel = () => {
    onCancel?.();
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className={styles.message}>{description}</p>
      <div className={styles.actions}>
        {hasCancel && (
          <button type="button" className={controls.secondaryButton} onClick={handleCancel}>
            {cancelText ?? 'Отмена'}
          </button>
        )}
        <button type="button" className={controls.primaryButton} onClick={handleConfirm}>
          {confirmText ?? (hasCancel ? 'Продолжить' : 'Понятно')}
        </button>
      </div>
    </Modal>
  );
};

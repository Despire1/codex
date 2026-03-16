import { ReactNode, useState } from 'react';
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
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasCancel = Boolean(onCancel);
  const handleConfirm = async () => {
    if (!onConfirm || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!onCancel || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onCancel();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={isSubmitting ? () => undefined : onClose} title={title}>
      <p className={styles.message}>{description}</p>
      <div className={styles.actions}>
        {hasCancel && (
          <button type="button" className={controls.secondaryButton} onClick={handleCancel} disabled={isSubmitting}>
            {cancelText ?? 'Отмена'}
          </button>
        )}
        <button type="button" className={controls.primaryButton} onClick={handleConfirm} disabled={isSubmitting}>
          <span className={styles.buttonContent}>
            {isSubmitting ? <span className={styles.buttonSpinner} aria-hidden /> : null}
            <span>{confirmText ?? (hasCancel ? 'Продолжить' : 'Понятно')}</span>
          </span>
        </button>
      </div>
    </Modal>
  );
};

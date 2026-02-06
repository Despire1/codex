import { ReactNode } from 'react';
import styles from './Toast.module.css';
import { ToastVariant } from '../../lib/toast';

interface ToastProps {
  message: string;
  variant: ToastVariant;
  icon?: ReactNode;
  backgroundColor?: string;
  textColor?: string;
  visible: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

export const Toast = ({
  message,
  variant,
  icon,
  backgroundColor,
  textColor,
  visible,
  actionLabel,
  onAction,
}: ToastProps) => {
  return (
    <div className={styles.container} role="status" aria-live="polite">
      <div
        className={`${styles.toast} ${styles[variant]} ${visible ? styles.visible : ''}`}
        style={{ backgroundColor, color: textColor }}
      >
        {icon && <span className={styles.icon}>{icon}</span>}
        <span className={styles.message}>{message}</span>
        {actionLabel && onAction && (
          <button type="button" className={styles.action} onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
};

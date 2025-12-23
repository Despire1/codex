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
}

export const Toast = ({ message, variant, icon, backgroundColor, textColor, visible }: ToastProps) => {
  return (
    <div className={styles.container} role="status" aria-live="polite">
      <div
        className={`${styles.toast} ${styles[variant]} ${visible ? styles.visible : ''}`}
        style={{ backgroundColor, color: textColor }}
      >
        {icon && <span className={styles.icon}>{icon}</span>}
        <span className={styles.message}>{message}</span>
      </div>
    </div>
  );
};

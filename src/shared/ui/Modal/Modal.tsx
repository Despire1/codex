import { ReactNode, useEffect } from 'react';
import styles from './Modal.module.css';

interface ModalProps {
  open: boolean;
  title?: ReactNode;
  titleActions?: ReactNode;
  headerActions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

export const Modal = ({ open, title, titleActions, headerActions, onClose, children }: ModalProps) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    if (open) document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.titleRow}>
            {title ? <h3 className={styles.title}>{title}</h3> : <span />}
            {titleActions ? <div className={styles.titleActions}>{titleActions}</div> : null}
          </div>
          <div className={styles.headerActions}>
            {headerActions}
            <button type="button" className={styles.close} aria-label="Закрыть" onClick={onClose}>
              ×
            </button>
          </div>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
};

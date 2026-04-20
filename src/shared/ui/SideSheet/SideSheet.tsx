import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './SideSheet.module.css';

interface SideSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

const ANIMATION_DURATION = 320;

export const SideSheet = ({ isOpen, onClose, children, className = '' }: SideSheetProps) => {
  const [isMounted, setIsMounted] = useState(isOpen);
  const [isPresented, setIsPresented] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      const frameId = window.requestAnimationFrame(() => {
        setIsPresented(true);
      });
      return () => window.cancelAnimationFrame(frameId);
    }

    setIsPresented(false);
    if (!isMounted) return undefined;
    const timerId = window.setTimeout(() => {
      setIsMounted(false);
    }, ANIMATION_DURATION);

    return () => window.clearTimeout(timerId);
  }, [isMounted, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isMounted) return null;

  return createPortal(
    <div className={`${styles.root} ${isPresented ? styles.rootOpen : ''}`.trim()} aria-hidden={!isOpen}>
      <button type="button" className={styles.overlay} aria-label="Закрыть окно" onClick={onClose} />
      <aside
        className={`${styles.panel} ${isPresented ? styles.panelOpen : ''} ${className}`.trim()}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </aside>
    </div>,
    document.body,
  );
};

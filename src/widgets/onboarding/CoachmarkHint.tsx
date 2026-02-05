import { type FC, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './CoachmarkHint.module.css';

interface CoachmarkHintProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement>;
  onClose: () => void;
  message?: string;
}

export const CoachmarkHint: FC<CoachmarkHintProps> = ({ open, anchorRef, onClose, message }) => {
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const updatePosition = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const bubbleWidth = 260;
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - bubbleWidth - 12));
      const top = rect.bottom + 10;
      setPosition({ top, left });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorRef, open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (anchorRef.current?.contains(target)) return;
      if (bubbleRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('click', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('click', handleClick);
    };
  }, [anchorRef, onClose, open]);

  if (!open) return null;

  return createPortal(
    <div
      className={styles.bubble}
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
      ref={bubbleRef}
      role="dialog"
      aria-live="polite"
    >
      <div className={styles.message}>{message ?? 'Нажмите сюда, чтобы добавить ученика.'}</div>
      <button type="button" className={styles.close} onClick={onClose}>
        Понятно
      </button>
    </div>,
    document.body,
  );
};

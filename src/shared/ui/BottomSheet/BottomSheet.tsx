import { ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './BottomSheet.module.css';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

const ANIMATION_DURATION = 250;
const CLOSE_THRESHOLD = 80;

export const BottomSheet = ({ isOpen, onClose, children, className = '' }: BottomSheetProps) => {
  const [isVisible, setIsVisible] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const draggingRef = useRef(false);
  const previousOverflow = useRef('');

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setIsClosing(false);
      return undefined;
    }
    if (!isVisible) return undefined;
    setIsClosing(true);
    const timer = window.setTimeout(() => {
      setIsVisible(false);
      setIsClosing(false);
      setDragOffset(0);
    }, ANIMATION_DURATION);

    return () => window.clearTimeout(timer);
  }, [isOpen, isVisible]);

  useEffect(() => {
    if (!isOpen) return undefined;
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow.current;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    startYRef.current = event.clientY;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const delta = event.clientY - startYRef.current;
    setDragOffset(Math.max(0, delta));
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (dragOffset > CLOSE_THRESHOLD) {
      onClose();
      setDragOffset(0);
      return;
    }
    setDragOffset(0);
  };

  if (!isVisible) return null;

  return createPortal(
    <>
      <div
        className={`${styles.overlay} ${isOpen && !isClosing ? styles.overlayOpen : ''}`}
        onClick={onClose}
        aria-hidden
      />
      <div className={styles.wrapper} aria-hidden={!isOpen}>
        <div
          className={`${styles.sheet} ${isOpen && !isClosing ? styles.sheetOpen : ''} ${
            isDragging ? styles.sheetDragging : ''
          } ${className}`}
          style={dragOffset ? { transform: `translate3d(0, ${dragOffset}px, 0)` } : undefined}
          onClick={(event) => event.stopPropagation()}
        >
          <div
            className={styles.handleZone}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
          >
            <div className={styles.handle} />
          </div>
          <div className={styles.content}>{children}</div>
        </div>
      </div>
    </>,
    document.body,
  );
};

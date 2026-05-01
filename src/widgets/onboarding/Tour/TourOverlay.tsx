import { type FC } from 'react';
import { createPortal } from 'react-dom';
import styles from './Tour.module.css';

interface TourOverlayProps {
  rect: DOMRect | null;
}

const HOLE_PADDING = 8;

export const TourOverlay: FC<TourOverlayProps> = ({ rect }) => {
  if (typeof document === 'undefined') return null;

  if (!rect) {
    return createPortal(<div className={styles.overlayFull} aria-hidden />, document.body);
  }

  const top = Math.max(0, rect.top - HOLE_PADDING);
  const left = Math.max(0, rect.left - HOLE_PADDING);
  const width = rect.width + HOLE_PADDING * 2;
  const height = rect.height + HOLE_PADDING * 2;

  return createPortal(
    <div className={styles.overlay} aria-hidden>
      <div className={styles.overlayPanel} style={{ top: 0, left: 0, right: 0, height: top }} />
      <div className={styles.overlayPanel} style={{ top: top + height, left: 0, right: 0, bottom: 0 }} />
      <div className={styles.overlayPanel} style={{ top, left: 0, width: left, height }} />
      <div className={styles.overlayPanel} style={{ top, left: left + width, right: 0, height }} />
      <div className={styles.cutoutFrame} style={{ top, left, width, height }} />
    </div>,
    document.body,
  );
};

import { type CSSProperties, type FC } from 'react';
import styles from './PopoverArrow.module.css';

export type PopoverArrowSide = 'top' | 'bottom' | 'left' | 'right';

interface PopoverArrowProps {
  /**
   * На какой грани popover'а сидит стрелка.
   * `top` — сверху popover'а, кончик указывает вверх (popover ниже якоря).
   * `bottom` — снизу popover'а, кончик указывает вниз (popover выше якоря).
   * `left` — слева popover'а, кончик указывает влево (popover справа от якоря).
   * `right` — справа popover'а, кончик указывает вправо (popover слева от якоря).
   */
  side: PopoverArrowSide;
  /**
   * Смещение стрелки в пикселях вдоль стороны popover'а.
   * Для side `top`/`bottom` — расстояние от левого края (центр стрелки на этом X).
   * Для side `left`/`right` — расстояние от верхнего края (центр стрелки на этом Y).
   */
  offset: number;
  /** Диагональ ромба до rotate (default 14). */
  size?: number;
  className?: string;
}

export const PopoverArrow: FC<PopoverArrowProps> = ({ side, offset, size = 14, className = '' }) => {
  const half = size / 2;
  const positionStyle: CSSProperties =
    side === 'top'
      ? { top: -half, left: offset, marginLeft: -half }
      : side === 'bottom'
        ? { bottom: -half, left: offset, marginLeft: -half }
        : side === 'left'
          ? { left: -half, top: offset, marginTop: -half }
          : { right: -half, top: offset, marginTop: -half };

  return (
    <span
      className={`${styles.arrow} ${styles[`side_${side}`]} ${className}`.trim()}
      style={{ width: size, height: size, ...positionStyle }}
      aria-hidden
    />
  );
};

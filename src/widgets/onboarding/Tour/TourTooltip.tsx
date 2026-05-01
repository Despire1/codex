import { type FC, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TourTooltipSide } from '../../../features/onboarding/model/tourScenarios';
import { PopoverArrow, type PopoverArrowSide } from '../../../shared/ui/PopoverArrow/PopoverArrow';
import styles from './Tour.module.css';

const GAP = 14;
const SCREEN_PADDING = 12;
const ARROW_EDGE_PADDING = 20;

const clampValue = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

interface TourTooltipProps {
  rect: DOMRect | null;
  preferredSide: TourTooltipSide;
  title: string;
  body: string;
  progress: string | null;
  showBack: boolean;
  showSkip: boolean;
  primaryLabel: string;
  backLabel: string;
  skipLabel: string;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

type Position = {
  side: TourTooltipSide;
  top: number;
  left: number;
  arrowX: number;
  arrowY: number;
};

const fitsOn = (
  side: TourTooltipSide,
  rect: DOMRect,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
) => {
  if (side === 'top') return rect.top - GAP - size.height >= SCREEN_PADDING;
  if (side === 'bottom') return rect.bottom + GAP + size.height <= viewport.height - SCREEN_PADDING;
  if (side === 'left') return rect.left - GAP - size.width >= SCREEN_PADDING;
  return rect.right + GAP + size.width <= viewport.width - SCREEN_PADDING;
};

const computeAt = (
  side: TourTooltipSide,
  rect: DOMRect,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): Position => {
  let top = 0;
  let left = 0;
  if (side === 'top') {
    top = rect.top - GAP - size.height;
    left = rect.left + (rect.width - size.width) / 2;
  } else if (side === 'bottom') {
    top = rect.bottom + GAP;
    left = rect.left + (rect.width - size.width) / 2;
  } else if (side === 'left') {
    top = rect.top + (rect.height - size.height) / 2;
    left = rect.left - GAP - size.width;
  } else {
    top = rect.top + (rect.height - size.height) / 2;
    left = rect.right + GAP;
  }
  left = Math.max(SCREEN_PADDING, Math.min(left, viewport.width - size.width - SCREEN_PADDING));
  top = Math.max(SCREEN_PADDING, Math.min(top, viewport.height - size.height - SCREEN_PADDING));

  const anchorCenterX = rect.left + rect.width / 2;
  const anchorCenterY = rect.top + rect.height / 2;
  const arrowX = clampValue(anchorCenterX - left, ARROW_EDGE_PADDING, size.width - ARROW_EDGE_PADDING);
  const arrowY = clampValue(anchorCenterY - top, ARROW_EDGE_PADDING, size.height - ARROW_EDGE_PADDING);

  return { side, top, left, arrowX, arrowY };
};

const SIDE_FALLBACKS: TourTooltipSide[] = ['bottom', 'top', 'right', 'left'];

const computePosition = (
  rect: DOMRect,
  preferred: TourTooltipSide,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): Position => {
  const order: TourTooltipSide[] = [preferred, ...SIDE_FALLBACKS.filter((s) => s !== preferred)];
  const fitting = order.find((side) => fitsOn(side, rect, size, viewport));
  return computeAt(fitting ?? preferred, rect, size, viewport);
};

export const TourTooltip: FC<TourTooltipProps> = ({
  rect,
  preferredSide,
  title,
  body,
  progress,
  showBack,
  showSkip,
  primaryLabel,
  backLabel,
  skipLabel,
  onNext,
  onBack,
  onSkip,
}) => {
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<Position | null>(null);

  useLayoutEffect(() => {
    if (!rect || !tooltipRef.current) {
      setPosition(null);
      return;
    }
    const el = tooltipRef.current;
    const size = { width: el.offsetWidth, height: el.offsetHeight };
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    setPosition(computePosition(rect, preferredSide, size, viewport));
  }, [rect, preferredSide, title, body]);

  useEffect(() => {
    if (!rect) return;
    const handle = () => {
      if (!tooltipRef.current) return;
      const el = tooltipRef.current;
      const size = { width: el.offsetWidth, height: el.offsetHeight };
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      setPosition(computePosition(rect, preferredSide, size, viewport));
    };
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, [rect, preferredSide]);

  if (typeof document === 'undefined') return null;

  const isCenter = !rect;
  const placementSide = position?.side ?? 'top';
  const arrowSide: PopoverArrowSide =
    placementSide === 'top'
      ? 'bottom'
      : placementSide === 'bottom'
        ? 'top'
        : placementSide === 'left'
          ? 'right'
          : 'left';

  const inlineStyle = isCenter
    ? undefined
    : position
      ? { top: position.top, left: position.left, transform: 'none' }
      : { opacity: 0, top: 0, left: 0 };

  const arrowOffset = position
    ? arrowSide === 'top' || arrowSide === 'bottom'
      ? position.arrowX
      : position.arrowY
    : null;

  return createPortal(
    <div
      ref={tooltipRef}
      className={`${styles.tooltip} ${isCenter ? styles.tooltipCenter : ''}`}
      style={inlineStyle}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {!isCenter && arrowOffset !== null ? <PopoverArrow side={arrowSide} offset={arrowOffset} /> : null}
      <h3 className={styles.tooltipTitle}>{title}</h3>
      <p className={styles.tooltipBody}>{body}</p>
      <div className={styles.tooltipFooter}>
        {progress ? <span className={styles.tooltipProgress}>{progress}</span> : <span />}
        <div className={styles.tooltipActions}>
          {showBack ? (
            <button type="button" className={styles.tooltipBack} onClick={onBack}>
              {backLabel}
            </button>
          ) : null}
          <button type="button" className={styles.tooltipNext} onClick={onNext}>
            {primaryLabel}
          </button>
        </div>
      </div>
      {showSkip ? (
        <div className={styles.tooltipSkipRow}>
          <button type="button" className={styles.tooltipSkip} onClick={onSkip}>
            {skipLabel}
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  );
};

import { type FC, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHintFlag } from '../../../features/onboarding/model/useHintFlag';
import { useHintRegistry } from '../../../features/onboarding/model/hintRegistry';
import { useTour } from '../../../features/onboarding/model/useTour';
import { useT, type MessageKey } from '../../../shared/i18n';
import { trackEvent } from '../../../shared/lib/analytics';
import { PopoverArrow, type PopoverArrowSide } from '../../../shared/ui/PopoverArrow/PopoverArrow';
import styles from './FirstTimeHint.module.css';

export type HintSide = 'top' | 'bottom' | 'left' | 'right';

interface FirstTimeHintProps {
  area: string;
  userId: number | string | null;
  anchorRef?: RefObject<HTMLElement | null>;
  anchorSelector?: string;
  titleKey: MessageKey;
  bodyKey: MessageKey;
  side?: HintSide;
}

const GAP = 12;
const PADDING = 12;
const ARROW_EDGE_PADDING = 18;

type Position = { side: HintSide; top: number; left: number; arrowX: number; arrowY: number };

const fitsOn = (side: HintSide, rect: DOMRect, size: { w: number; h: number }, vp: { w: number; h: number }) => {
  if (side === 'top') return rect.top - GAP - size.h >= PADDING;
  if (side === 'bottom') return rect.bottom + GAP + size.h <= vp.h - PADDING;
  if (side === 'left') return rect.left - GAP - size.w >= PADDING;
  return rect.right + GAP + size.w <= vp.w - PADDING;
};

const clampValue = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

const computeAt = (
  side: HintSide,
  rect: DOMRect,
  size: { w: number; h: number },
  vp: { w: number; h: number },
): Position => {
  let top = 0;
  let left = 0;
  if (side === 'top') {
    top = rect.top - GAP - size.h;
    left = rect.left + (rect.width - size.w) / 2;
  } else if (side === 'bottom') {
    top = rect.bottom + GAP;
    left = rect.left + (rect.width - size.w) / 2;
  } else if (side === 'left') {
    top = rect.top + (rect.height - size.h) / 2;
    left = rect.left - GAP - size.w;
  } else {
    top = rect.top + (rect.height - size.h) / 2;
    left = rect.right + GAP;
  }
  left = Math.max(PADDING, Math.min(left, vp.w - size.w - PADDING));
  top = Math.max(PADDING, Math.min(top, vp.h - size.h - PADDING));

  const anchorCenterX = rect.left + rect.width / 2;
  const anchorCenterY = rect.top + rect.height / 2;
  const arrowX = clampValue(anchorCenterX - left, ARROW_EDGE_PADDING, size.w - ARROW_EDGE_PADDING);
  const arrowY = clampValue(anchorCenterY - top, ARROW_EDGE_PADDING, size.h - ARROW_EDGE_PADDING);

  return { side, top, left, arrowX, arrowY };
};

const FALLBACKS: HintSide[] = ['bottom', 'top', 'right', 'left'];

const computePosition = (
  rect: DOMRect,
  preferred: HintSide,
  size: { w: number; h: number },
  vp: { w: number; h: number },
): Position => {
  const order: HintSide[] = [preferred, ...FALLBACKS.filter((s) => s !== preferred)];
  const fitting = order.find((s) => fitsOn(s, rect, size, vp));
  return computeAt(fitting ?? preferred, rect, size, vp);
};

const isVisuallyVisible = (el: HTMLElement): boolean => {
  if (typeof window === 'undefined') return true;
  const cs = window.getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  if (parseFloat(cs.opacity) === 0) return false;
  return true;
};

const resolveAnchor = (
  anchorRef: RefObject<HTMLElement | null> | undefined,
  selector: string | undefined,
): HTMLElement | null => {
  let el: HTMLElement | null = null;
  if (anchorRef?.current) el = anchorRef.current;
  else if (selector && typeof document !== 'undefined') {
    el = document.querySelector<HTMLElement>(selector);
  }
  if (!el) return null;
  if (!isVisuallyVisible(el)) return null;
  return el;
};

export const FirstTimeHint: FC<FirstTimeHintProps> = ({
  area,
  userId,
  anchorRef,
  anchorSelector,
  titleKey,
  bodyKey,
  side = 'bottom',
}) => {
  const t = useT();
  const { register, unregister, resetTick, firstNotSeenArea } = useHintRegistry();
  const { seen, setSeen, isReady } = useHintFlag(area, userId, resetTick);
  const tour = useTour();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const trackedRef = useRef(false);

  useEffect(() => {
    register({ area, titleKey, bodyKey, seen: seen ?? undefined });
  }, [area, bodyKey, register, seen, titleKey]);

  useEffect(() => () => unregister(area), [area, unregister]);

  const isFirstInQueue = firstNotSeenArea === area;

  useEffect(() => {
    if (!isReady || seen || tour.isActive || !isFirstInQueue) {
      setOpen(false);
      return;
    }
    const handle = window.setTimeout(() => setOpen(true), 250);
    return () => window.clearTimeout(handle);
  }, [isFirstInQueue, isReady, seen, tour.isActive]);

  useLayoutEffect(() => {
    if (!open || !cardRef.current) {
      setPosition(null);
      return;
    }
    const anchor = resolveAnchor(anchorRef, anchorSelector);
    if (!anchor) {
      setPosition(null);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setPosition(null);
      return;
    }
    const card = cardRef.current;
    const size = { w: card.offsetWidth, h: card.offsetHeight };
    const vp = { w: window.innerWidth, h: window.innerHeight };
    setPosition(computePosition(rect, side, size, vp));
  }, [anchorRef, anchorSelector, open, side]);

  useEffect(() => {
    if (!open) return;
    const recalc = () => {
      if (!cardRef.current) return;
      const anchor = resolveAnchor(anchorRef, anchorSelector);
      if (!anchor) {
        setPosition(null);
        return;
      }
      const rect = anchor.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setPosition(null);
        return;
      }
      const card = cardRef.current;
      const size = { w: card.offsetWidth, h: card.offsetHeight };
      const vp = { w: window.innerWidth, h: window.innerHeight };
      setPosition(computePosition(rect, side, size, vp));
    };

    const observer = typeof MutationObserver !== 'undefined' ? new MutationObserver(recalc) : null;
    observer?.observe(document.body, { childList: true, subtree: true, attributes: true });

    window.addEventListener('resize', recalc);
    window.addEventListener('scroll', recalc, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', recalc);
      window.removeEventListener('scroll', recalc, true);
    };
  }, [anchorRef, anchorSelector, open, side]);

  useEffect(() => {
    if (!open || trackedRef.current) return;
    trackedRef.current = true;
    trackEvent('hint_shown', { area });
  }, [area, open]);

  useEffect(() => {
    if (!open) trackedRef.current = false;
  }, [open]);

  const handleDismiss = () => {
    trackEvent('hint_dismissed', { area });
    setSeen(true);
    setOpen(false);
  };

  if (!open || typeof document === 'undefined') return null;

  const placementSide = position?.side ?? side;
  const arrowSide: PopoverArrowSide =
    placementSide === 'top'
      ? 'bottom'
      : placementSide === 'bottom'
        ? 'top'
        : placementSide === 'left'
          ? 'right'
          : 'left';

  const inlineStyle = position
    ? { top: position.top, left: position.left }
    : { opacity: 0, top: 0, left: 0, pointerEvents: 'none' as const };

  const arrowOffset = position
    ? arrowSide === 'top' || arrowSide === 'bottom'
      ? position.arrowX
      : position.arrowY
    : null;

  return createPortal(
    <div ref={cardRef} className={styles.card} style={inlineStyle} role="status" aria-live="polite">
      {arrowOffset !== null ? <PopoverArrow side={arrowSide} offset={arrowOffset} /> : null}
      <div className={styles.header}>
        <h4 className={styles.title}>{t(titleKey)}</h4>
        <button type="button" className={styles.close} aria-label={t('common.close')} onClick={handleDismiss}>
          ×
        </button>
      </div>
      <p className={styles.body}>{t(bodyKey)}</p>
      <button type="button" className={styles.action} onClick={handleDismiss}>
        {t('common.gotIt')}
      </button>
    </div>,
    document.body,
  );
};

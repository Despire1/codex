import { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isElementFullyOutsideViewport } from '@/shared/lib/isElementFullyOutsideViewport';
import styles from './AnchoredPopover.module.css';

type PopoverSide = 'top' | 'bottom' | 'left' | 'right';
type PopoverAlign = 'start' | 'center' | 'end';

interface AnchoredPopoverProps {
  isOpen: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
  side?: PopoverSide;
  align?: PopoverAlign;
  offset?: number;
  className?: string;
  preventCloseOnOtherPopoverClick?: boolean;
}

const DEFAULT_OFFSET = 8;
const VIEWPORT_PADDING = 8;
const TRANSITION_DURATION_MS = 180;
const ARROW_EDGE_PADDING = 18;

const getOppositeSide = (side: PopoverSide): PopoverSide => {
  switch (side) {
    case 'top':
      return 'bottom';
    case 'bottom':
      return 'top';
    case 'left':
      return 'right';
    case 'right':
      return 'left';
    default:
      return 'bottom';
  }
};

const uniqueSides = (sides: PopoverSide[]) => Array.from(new Set(sides));

export const AnchoredPopover = ({
  isOpen,
  anchorEl,
  onClose,
  children,
  side = 'bottom',
  align = 'start',
  offset = DEFAULT_OFFSET,
  className = '',
  preventCloseOnOtherPopoverClick = false,
}: AnchoredPopoverProps) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    maxHeight: number | null;
    arrowX: number;
    arrowY: number;
  }>({
    top: 0,
    left: 0,
    maxHeight: null,
    arrowX: 0,
    arrowY: 0,
  });
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(isOpen);
  const [activeAnchorEl, setActiveAnchorEl] = useState<HTMLElement | null>(anchorEl);
  const candidates = useMemo(
    () => uniqueSides([side, getOppositeSide(side), 'bottom', 'top', 'right', 'left']),
    [side],
  );

  const getAlignedLeft = (anchorRect: DOMRect, popoverRect: DOMRect) => {
    if (align === 'center') {
      return anchorRect.left + (anchorRect.width - popoverRect.width) / 2;
    }
    if (align === 'end') {
      return anchorRect.right - popoverRect.width;
    }
    return anchorRect.left;
  };

  const getAlignedTop = (anchorRect: DOMRect, popoverRect: DOMRect) => {
    if (align === 'center') {
      return anchorRect.top + (anchorRect.height - popoverRect.height) / 2;
    }
    if (align === 'end') {
      return anchorRect.bottom - popoverRect.height;
    }
    return anchorRect.top;
  };

  const getPosition = (direction: PopoverSide, anchorRect: DOMRect, popoverRect: DOMRect) => {
    switch (direction) {
      case 'top':
        return {
          top: anchorRect.top - popoverRect.height - offset,
          left: getAlignedLeft(anchorRect, popoverRect),
        };
      case 'bottom':
        return {
          top: anchorRect.bottom + offset,
          left: getAlignedLeft(anchorRect, popoverRect),
        };
      case 'left':
        return {
          top: getAlignedTop(anchorRect, popoverRect),
          left: anchorRect.left - popoverRect.width - offset,
        };
      case 'right':
      default:
        return {
          top: getAlignedTop(anchorRect, popoverRect),
          left: anchorRect.right + offset,
        };
    }
  };

  const clampPosition = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

  const isWithinViewport = (nextPosition: { top: number; left: number }, popoverRect: DOMRect) => {
    const maxLeft = window.innerWidth - popoverRect.width - VIEWPORT_PADDING;
    const maxTop = window.innerHeight - popoverRect.height - VIEWPORT_PADDING;
    return (
      nextPosition.left >= VIEWPORT_PADDING &&
      nextPosition.top >= VIEWPORT_PADDING &&
      nextPosition.left <= maxLeft &&
      nextPosition.top <= maxTop
    );
  };

  const getAvailableSpaceForSide = (direction: PopoverSide, anchorRect: DOMRect) => {
    switch (direction) {
      case 'top':
        return Math.max(anchorRect.top - offset - VIEWPORT_PADDING, 0);
      case 'bottom':
        return Math.max(window.innerHeight - anchorRect.bottom - offset - VIEWPORT_PADDING, 0);
      case 'left':
        return Math.max(anchorRect.left - offset - VIEWPORT_PADDING, 0);
      case 'right':
      default:
        return Math.max(window.innerWidth - anchorRect.right - offset - VIEWPORT_PADDING, 0);
    }
  };

  const updatePosition = () => {
    const resolvedAnchorEl = anchorEl ?? activeAnchorEl;
    if (!resolvedAnchorEl || !popoverRef.current) return;

    if (isElementFullyOutsideViewport(resolvedAnchorEl)) {
      onClose();
      return;
    }

    const anchorRect = resolvedAnchorEl.getBoundingClientRect();
    const popoverRect = popoverRef.current.getBoundingClientRect();

    let nextPosition = getPosition(side, anchorRect, popoverRect);
    let resolvedSide = side;
    let foundFit = false;

    for (const candidate of candidates) {
      const candidatePosition = getPosition(candidate, anchorRect, popoverRect);
      if (isWithinViewport(candidatePosition, popoverRect)) {
        nextPosition = candidatePosition;
        resolvedSide = candidate;
        foundFit = true;
        break;
      }
    }

    let maxHeight: number | null = null;
    if (!foundFit) {
      const isVerticalPrimary = side === 'top' || side === 'bottom';
      if (isVerticalPrimary) {
        const topSpace = getAvailableSpaceForSide('top', anchorRect);
        const bottomSpace = getAvailableSpaceForSide('bottom', anchorRect);
        resolvedSide = bottomSpace >= topSpace ? 'bottom' : 'top';
        maxHeight = Math.max(resolvedSide === 'bottom' ? bottomSpace : topSpace, 120);
      } else {
        const leftSpace = getAvailableSpaceForSide('left', anchorRect);
        const rightSpace = getAvailableSpaceForSide('right', anchorRect);
        resolvedSide = rightSpace >= leftSpace ? 'right' : 'left';
      }
      nextPosition = getPosition(resolvedSide, anchorRect, popoverRect);
    }

    const maxLeft = window.innerWidth - popoverRect.width - VIEWPORT_PADDING;
    const maxTop = window.innerHeight - popoverRect.height - VIEWPORT_PADDING;
    const clamped = {
      top: clampPosition(nextPosition.top, VIEWPORT_PADDING, Math.max(maxTop, VIEWPORT_PADDING)),
      left: clampPosition(nextPosition.left, VIEWPORT_PADDING, Math.max(maxLeft, VIEWPORT_PADDING)),
    };

    popoverRef.current.dataset.side = resolvedSide;

    const anchorCenterX = anchorRect.left + anchorRect.width / 2;
    const anchorCenterY = anchorRect.top + anchorRect.height / 2;
    const arrowX = clampPosition(
      anchorCenterX - clamped.left,
      ARROW_EDGE_PADDING,
      Math.max(ARROW_EDGE_PADDING, popoverRect.width - ARROW_EDGE_PADDING),
    );
    const arrowY = clampPosition(
      anchorCenterY - clamped.top,
      ARROW_EDGE_PADDING,
      Math.max(ARROW_EDGE_PADDING, popoverRect.height - ARROW_EDGE_PADDING),
    );

    setPosition({ ...clamped, maxHeight, arrowX, arrowY });
  };

  useLayoutEffect(() => {
    if (!shouldRender || !isOpen) return;
    updatePosition();
    // updatePosition пересоздаётся каждый рендер, но читает только refs/props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRender, isOpen, anchorEl, activeAnchorEl, side, align, offset, onClose]);

  useEffect(() => {
    if (!isOpen || !anchorEl) return undefined;

    setActiveAnchorEl(anchorEl);
    setShouldRender(true);

    const rafId = window.requestAnimationFrame(() => {
      setIsVisible(true);
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [isOpen, anchorEl]);

  useEffect(() => {
    if (isOpen || !shouldRender) return undefined;

    setIsVisible(false);
    const timeoutId = window.setTimeout(() => {
      setShouldRender(false);
      setActiveAnchorEl(null);
    }, TRANSITION_DURATION_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isOpen, shouldRender]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
      if (
        preventCloseOnOtherPopoverClick &&
        target instanceof Element &&
        target.closest('[data-anchored-popover-root="true"]')
      ) {
        return;
      }
      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    const handleReposition = () => updatePosition();

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
    // updatePosition пересоздаётся каждый рендер, но читает только refs/props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorEl, isOpen, onClose, preventCloseOnOtherPopoverClick, activeAnchorEl]);

  if (!shouldRender || !activeAnchorEl) return null;

  return createPortal(
    <div
      ref={popoverRef}
      data-anchored-popover-root="true"
      data-visibility={isVisible ? 'open' : 'closing'}
      className={`${styles.popover} ${isVisible ? styles.popoverOpen : styles.popoverClosing} ${className}`.trim()}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        ['--anchor-arrow-x' as string]: `${position.arrowX}px`,
        ['--anchor-arrow-y' as string]: `${position.arrowY}px`,
        ...(position.maxHeight !== null ? { maxHeight: `${position.maxHeight}px`, overflowY: 'auto' as const } : null),
      }}
    >
      {children}
    </div>,
    document.body,
  );
};

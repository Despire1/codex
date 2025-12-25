import { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './AdaptivePopover.module.css';

type PopoverSide = 'top' | 'bottom' | 'left' | 'right';
type PopoverAlign = 'start' | 'center' | 'end';

interface AdaptivePopoverProps {
  isOpen: boolean;
  onClose: () => void;
  trigger: ReactNode;
  children: ReactNode;
  side?: PopoverSide;
  align?: PopoverAlign;
  offset?: number;
  className?: string;
}

const DEFAULT_OFFSET = 8;
const VIEWPORT_PADDING = 8;

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

export const AdaptivePopover = ({
  isOpen,
  onClose,
  trigger,
  children,
  side = 'bottom',
  align = 'start',
  offset = DEFAULT_OFFSET,
  className = '',
}: AdaptivePopoverProps) => {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const candidates = useMemo(
    () => uniqueSides([side, getOppositeSide(side), 'bottom', 'top', 'right', 'left']),
    [side],
  );

  const getAlignedLeft = (triggerRect: DOMRect, popoverRect: DOMRect) => {
    if (align === 'center') {
      return triggerRect.left + (triggerRect.width - popoverRect.width) / 2;
    }
    if (align === 'end') {
      return triggerRect.right - popoverRect.width;
    }
    return triggerRect.left;
  };

  const getAlignedTop = (triggerRect: DOMRect, popoverRect: DOMRect) => {
    if (align === 'center') {
      return triggerRect.top + (triggerRect.height - popoverRect.height) / 2;
    }
    if (align === 'end') {
      return triggerRect.bottom - popoverRect.height;
    }
    return triggerRect.top;
  };

  const getPosition = (direction: PopoverSide, triggerRect: DOMRect, popoverRect: DOMRect) => {
    switch (direction) {
      case 'top':
        return {
          top: triggerRect.top - popoverRect.height - offset,
          left: getAlignedLeft(triggerRect, popoverRect),
        };
      case 'bottom':
        return {
          top: triggerRect.bottom + offset,
          left: getAlignedLeft(triggerRect, popoverRect),
        };
      case 'left':
        return {
          top: getAlignedTop(triggerRect, popoverRect),
          left: triggerRect.left - popoverRect.width - offset,
        };
      case 'right':
      default:
        return {
          top: getAlignedTop(triggerRect, popoverRect),
          left: triggerRect.right + offset,
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

  const updatePosition = () => {
    if (!triggerRef.current || !popoverRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const popoverRect = popoverRef.current.getBoundingClientRect();

    let nextPosition = getPosition(side, triggerRect, popoverRect);
    let resolvedSide = side;

    for (const candidate of candidates) {
      const candidatePosition = getPosition(candidate, triggerRect, popoverRect);
      if (isWithinViewport(candidatePosition, popoverRect)) {
        nextPosition = candidatePosition;
        resolvedSide = candidate;
        break;
      }
    }

    if (!isWithinViewport(nextPosition, popoverRect)) {
      const maxLeft = window.innerWidth - popoverRect.width - VIEWPORT_PADDING;
      const maxTop = window.innerHeight - popoverRect.height - VIEWPORT_PADDING;
      nextPosition = {
        top: clampPosition(nextPosition.top, VIEWPORT_PADDING, maxTop),
        left: clampPosition(nextPosition.left, VIEWPORT_PADDING, maxLeft),
      };
    }

    if (resolvedSide !== side) {
      popoverRef.current.dataset.side = resolvedSide;
    } else {
      delete popoverRef.current.dataset.side;
    }

    setPosition(nextPosition);
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
  }, [isOpen, side, align, offset, children]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const handleReposition = () => updatePosition();

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isOpen, onClose]);

  return (
    <span className={styles.root}>
      <span ref={triggerRef} className={styles.trigger}>
        {trigger}
      </span>
      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            className={`${styles.popover} ${className}`}
            style={{ top: `${position.top}px`, left: `${position.left}px` }}
          >
            {children}
          </div>,
          document.body,
        )}
    </span>
  );
};

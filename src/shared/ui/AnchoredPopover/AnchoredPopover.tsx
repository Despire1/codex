import { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

export const AnchoredPopover = ({
  isOpen,
  anchorEl,
  onClose,
  children,
  side = 'bottom',
  align = 'start',
  offset = DEFAULT_OFFSET,
  className = '',
}: AnchoredPopoverProps) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
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

  const updatePosition = () => {
    if (!anchorEl || !popoverRef.current) return;
    const anchorRect = anchorEl.getBoundingClientRect();
    const popoverRect = popoverRef.current.getBoundingClientRect();

    let nextPosition = getPosition(side, anchorRect, popoverRect);
    let resolvedSide = side;

    for (const candidate of candidates) {
      const candidatePosition = getPosition(candidate, anchorRect, popoverRect);
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
  }, [isOpen, anchorEl, side, align, offset, children]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
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
  }, [anchorEl, isOpen, onClose]);

  if (!isOpen || !anchorEl) return null;

  return createPortal(
    <div
      ref={popoverRef}
      className={`${styles.popover} ${className}`.trim()}
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
    >
      {children}
    </div>,
    document.body,
  );
};

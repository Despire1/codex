import { CSSProperties, ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isElementFullyOutsideViewport } from '@/shared/lib/isElementFullyOutsideViewport';
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
  rootClassName?: string;
  triggerClassName?: string;
  matchTriggerWidth?: boolean;
}

const DEFAULT_OFFSET = 8;
const VIEWPORT_PADDING = 8;
const MIN_SPACE = 0;

type PopoverMeasurement = {
  width: number;
  height: number;
};

type PopoverPositionState = {
  top: number;
  left: number;
  width: number;
  maxWidth: number;
  maxHeight: number;
  resolvedSide: PopoverSide;
};

const getPopoverMeasurement = (element: HTMLDivElement): PopoverMeasurement => {
  const rect = element.getBoundingClientRect();

  return {
    width: Math.ceil(Math.max(rect.width, element.scrollWidth)),
    height: Math.ceil(Math.max(rect.height, element.scrollHeight)),
  };
};

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

const clampPosition = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getViewportBounds = () => ({
  width: Math.max(window.innerWidth - VIEWPORT_PADDING * 2, MIN_SPACE),
  height: Math.max(window.innerHeight - VIEWPORT_PADDING * 2, MIN_SPACE),
});

const getAvailableSpace = (direction: PopoverSide, triggerRect: DOMRect, offset: number) => {
  const viewport = getViewportBounds();
  const topSpace = Math.max(triggerRect.top - VIEWPORT_PADDING - offset, MIN_SPACE);
  const bottomSpace = Math.max(window.innerHeight - triggerRect.bottom - VIEWPORT_PADDING - offset, MIN_SPACE);
  const leftSpace = Math.max(triggerRect.left - VIEWPORT_PADDING - offset, MIN_SPACE);
  const rightSpace = Math.max(window.innerWidth - triggerRect.right - VIEWPORT_PADDING - offset, MIN_SPACE);

  switch (direction) {
    case 'top':
      return { width: viewport.width, height: topSpace };
    case 'bottom':
      return { width: viewport.width, height: bottomSpace };
    case 'left':
      return { width: leftSpace, height: viewport.height };
    case 'right':
    default:
      return { width: rightSpace, height: viewport.height };
  }
};

const resolveConstrainedSize = (
  direction: PopoverSide,
  measurement: PopoverMeasurement,
  availableSpace: PopoverMeasurement,
): PopoverMeasurement => {
  const maxWidth = direction === 'left' || direction === 'right' ? availableSpace.width : getViewportBounds().width;
  const maxHeight = direction === 'top' || direction === 'bottom' ? availableSpace.height : getViewportBounds().height;

  return {
    width: Math.min(measurement.width, Math.max(maxWidth, MIN_SPACE)),
    height: Math.min(measurement.height, Math.max(maxHeight, MIN_SPACE)),
  };
};

const fitsWithinAvailableSpace = (
  direction: PopoverSide,
  measurement: PopoverMeasurement,
  availableSpace: PopoverMeasurement,
) => {
  if (direction === 'top' || direction === 'bottom') {
    return measurement.height <= availableSpace.height && measurement.width <= getViewportBounds().width;
  }

  return measurement.width <= availableSpace.width && measurement.height <= getViewportBounds().height;
};

export const AdaptivePopover = ({
  isOpen,
  onClose,
  trigger,
  children,
  side = 'bottom',
  align = 'start',
  offset = DEFAULT_OFFSET,
  className = '',
  rootClassName = '',
  triggerClassName = '',
  matchTriggerWidth = false,
}: AdaptivePopoverProps) => {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<PopoverPositionState>({
    top: 0,
    left: 0,
    width: 0,
    maxWidth: 0,
    maxHeight: 0,
    resolvedSide: side,
  });

  const candidates = useMemo(
    () => uniqueSides([side, getOppositeSide(side), 'bottom', 'top', 'right', 'left']),
    [side],
  );

  const getAlignedLeft = (triggerRect: DOMRect, popoverRect: PopoverMeasurement) => {
    if (align === 'center') {
      return triggerRect.left + (triggerRect.width - popoverRect.width) / 2;
    }
    if (align === 'end') {
      return triggerRect.right - popoverRect.width;
    }
    return triggerRect.left;
  };

  const getAlignedTop = (triggerRect: DOMRect, popoverRect: PopoverMeasurement) => {
    if (align === 'center') {
      return triggerRect.top + (triggerRect.height - popoverRect.height) / 2;
    }
    if (align === 'end') {
      return triggerRect.bottom - popoverRect.height;
    }
    return triggerRect.top;
  };

  const getPosition = (direction: PopoverSide, triggerRect: DOMRect, popoverRect: PopoverMeasurement) => {
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

  const updatePosition = () => {
    if (!triggerRef.current || !popoverRef.current) return;

    if (isElementFullyOutsideViewport(triggerRef.current)) {
      onClose();
      return;
    }

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const measurement = getPopoverMeasurement(popoverRef.current);

    const layouts = candidates.map((candidate) => {
      const availableSpace = getAvailableSpace(candidate, triggerRect, offset);
      const constrainedSize = resolveConstrainedSize(candidate, measurement, availableSpace);
      const candidatePosition = getPosition(candidate, triggerRect, constrainedSize);
      const maxLeft = Math.max(window.innerWidth - constrainedSize.width - VIEWPORT_PADDING, VIEWPORT_PADDING);
      const maxTop = Math.max(window.innerHeight - constrainedSize.height - VIEWPORT_PADDING, VIEWPORT_PADDING);

      return {
        side: candidate,
        availableSpace,
        constrainedSize,
        position: {
          top: clampPosition(candidatePosition.top, VIEWPORT_PADDING, maxTop),
          left: clampPosition(candidatePosition.left, VIEWPORT_PADDING, maxLeft),
        },
        fitsNaturally: fitsWithinAvailableSpace(candidate, measurement, availableSpace),
      };
    });

    const resolvedLayout =
      layouts.find((layout) => layout.fitsNaturally) ??
      layouts.reduce((best, current) => {
        const bestPrimary =
          best.side === 'top' || best.side === 'bottom' ? best.availableSpace.height : best.availableSpace.width;
        const currentPrimary =
          current.side === 'top' || current.side === 'bottom'
            ? current.availableSpace.height
            : current.availableSpace.width;

        if (currentPrimary !== bestPrimary) {
          return currentPrimary > bestPrimary ? current : best;
        }

        const bestSecondary =
          best.side === 'top' || best.side === 'bottom' ? best.availableSpace.width : best.availableSpace.height;
        const currentSecondary =
          current.side === 'top' || current.side === 'bottom'
            ? current.availableSpace.width
            : current.availableSpace.height;

        return currentSecondary > bestSecondary ? current : best;
      });

    setPosition({
      ...resolvedLayout.position,
      width: triggerRect.width,
      maxWidth: resolvedLayout.constrainedSize.width,
      maxHeight: resolvedLayout.constrainedSize.height,
      resolvedSide: resolvedLayout.side,
    });
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
  }, [isOpen, side, align, offset, children, onClose]);

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

  useEffect(() => {
    if (!isOpen || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(() => updatePosition());

    if (triggerRef.current) observer.observe(triggerRef.current);
    if (popoverRef.current) observer.observe(popoverRef.current);

    return () => observer.disconnect();
  }, [isOpen, children, side, align, offset, onClose]);

  const popoverStyle = {
    top: `${position.top}px`,
    left: `${position.left}px`,
    width: matchTriggerWidth ? `${Math.min(position.width, position.maxWidth)}px` : undefined,
    maxWidth: position.maxWidth ? `${position.maxWidth}px` : undefined,
    maxHeight: position.maxHeight ? `${position.maxHeight}px` : undefined,
  } as CSSProperties & Record<'--adaptive-popover-available-width' | '--adaptive-popover-available-height', string | undefined>;

  popoverStyle['--adaptive-popover-available-width'] = position.maxWidth ? `${position.maxWidth}px` : undefined;
  popoverStyle['--adaptive-popover-available-height'] = position.maxHeight ? `${position.maxHeight}px` : undefined;

  return (
    <span className={`${styles.root} ${rootClassName}`.trim()}>
      <span ref={triggerRef} className={`${styles.trigger} ${triggerClassName}`.trim()}>
        {trigger}
      </span>
      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            className={`${styles.popover} ${className}`}
            data-side={position.resolvedSide !== side ? position.resolvedSide : undefined}
            style={popoverStyle}
          >
            {children}
          </div>,
          document.body,
        )}
    </span>
  );
};

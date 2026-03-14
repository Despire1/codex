import { ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './Tooltip.module.css';

type TooltipSide = 'top' | 'bottom';
type TooltipAlign = 'start' | 'center' | 'end';

interface TooltipProps {
  content?: ReactNode;
  children: ReactNode;
  side?: TooltipSide;
  align?: TooltipAlign;
  className?: string;
  tooltipClassName?: string;
}

export const Tooltip = ({
  content,
  children,
  side = 'bottom',
  align = 'end',
  className = '',
  tooltipClassName = '',
}: TooltipProps) => {
  const rootRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, side, align });

  const resolvedContent = useMemo(() => content, [content]);

  const getAnchorElement = () => {
    const root = rootRef.current;
    if (!root) return null;
    return root.firstElementChild instanceof HTMLElement
      ? root.firstElementChild
      : root.querySelector<HTMLElement>('*');
  };

  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

  const getHorizontalPosition = (resolvedAlign: TooltipAlign, anchorRect: DOMRect, tooltipRect: DOMRect) => {
    if (resolvedAlign === 'center') {
      return anchorRect.left + (anchorRect.width - tooltipRect.width) / 2;
    }
    if (resolvedAlign === 'start') {
      return anchorRect.left;
    }
    return anchorRect.right - tooltipRect.width;
  };

  const updatePosition = () => {
    const anchorEl = getAnchorElement();
    const tooltipEl = tooltipRef.current;
    if (!anchorEl || !tooltipEl) return;

    const anchorRect = anchorEl.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();
    const viewportPadding = 8;
    const offset = 8;
    const maxLeft = window.innerWidth - tooltipRect.width - viewportPadding;
    const maxTop = window.innerHeight - tooltipRect.height - viewportPadding;

    const preferredSide = side;
    const flippedSide = preferredSide === 'bottom' ? 'top' : 'bottom';
    const sideCandidates: TooltipSide[] = [preferredSide, flippedSide];
    const preferredAlignCandidates: TooltipAlign[] =
      align === 'start' ? ['start', 'end', 'center'] : align === 'center' ? ['center', 'end', 'start'] : ['end', 'start', 'center'];

    let resolvedSide = preferredSide;
    let resolvedAlign = align;
    let left = getHorizontalPosition(resolvedAlign, anchorRect, tooltipRect);
    let top = resolvedSide === 'bottom'
      ? anchorRect.bottom + offset
      : anchorRect.top - tooltipRect.height - offset;

    for (const candidateSide of sideCandidates) {
      const candidateTop =
        candidateSide === 'bottom'
          ? anchorRect.bottom + offset
          : anchorRect.top - tooltipRect.height - offset;
      const fitsVertically =
        candidateTop >= viewportPadding && candidateTop <= maxTop;

      for (const candidateAlign of preferredAlignCandidates) {
        const candidateLeft = getHorizontalPosition(candidateAlign, anchorRect, tooltipRect);
        const fitsHorizontally =
          candidateLeft >= viewportPadding && candidateLeft <= maxLeft;

        if (fitsVertically && fitsHorizontally) {
          resolvedSide = candidateSide;
          resolvedAlign = candidateAlign;
          top = candidateTop;
          left = candidateLeft;
          setPosition({ top, left, side: resolvedSide, align: resolvedAlign });
          return;
        }
      }
    }

    resolvedSide =
      top < viewportPadding || top > maxTop
        ? flippedSide
        : preferredSide;
    top =
      resolvedSide === 'bottom'
        ? anchorRect.bottom + offset
        : anchorRect.top - tooltipRect.height - offset;

    left = clamp(getHorizontalPosition(align, anchorRect, tooltipRect), viewportPadding, maxLeft);
    top = clamp(top, viewportPadding, maxTop);
    setPosition({ top, left, side: resolvedSide, align });
  };

  useLayoutEffect(() => {
    if (!isOpen || !resolvedContent) return;
    updatePosition();
  }, [align, isOpen, resolvedContent, side]);

  useEffect(() => {
    if (resolvedContent) return;
    setIsOpen(false);
  }, [resolvedContent]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleReposition = () => updatePosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isOpen]);

  if (!resolvedContent) return <>{children}</>;

  return (
    <span
      ref={rootRef}
      className={`${styles.root} ${className}`.trim()}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocusCapture={() => setIsOpen(true)}
      onBlurCapture={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) {
          setIsOpen(false);
        }
      }}
    >
      {children}
      {isOpen &&
        createPortal(
          <span
            id={tooltipId}
            ref={tooltipRef}
            role="tooltip"
            className={`${styles.tooltip} ${styles[`side_${position.side}`]} ${styles[`align_${position.align}`]} ${tooltipClassName}`.trim()}
            style={{ top: `${position.top}px`, left: `${position.left}px` }}
          >
            {resolvedContent}
          </span>,
          document.body,
        )}
    </span>
  );
};

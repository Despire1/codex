import { ReactNode, useEffect, useRef, useState } from 'react';
import { Tooltip } from '../Tooltip/Tooltip';
import styles from './Ellipsis.module.css';

interface EllipsisProps {
  children: ReactNode;
  className?: string;
  title?: string;
  tooltipAlign?: 'start' | 'center' | 'end';
  tooltipSide?: 'top' | 'bottom';
}

export const Ellipsis = ({
  children,
  className = '',
  title,
  tooltipAlign = 'start',
  tooltipSide = 'bottom',
}: EllipsisProps) => {
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const node = textRef.current;
    if (!node) return undefined;

    const updateTruncation = () => {
      setIsTruncated(node.scrollWidth > node.clientWidth + 1);
    };

    updateTruncation();

    const resizeObserver = new ResizeObserver(() => {
      updateTruncation();
    });
    resizeObserver.observe(node);

    window.addEventListener('resize', updateTruncation);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateTruncation);
    };
  }, [children, className, title]);

  return (
    <Tooltip
      content={isTruncated ? title : undefined}
      align={tooltipAlign}
      side={tooltipSide}
      className={styles.wrapper}
    >
      <span ref={textRef} className={`${styles.ellipsis} ${className}`}>
        {children}
      </span>
    </Tooltip>
  );
};

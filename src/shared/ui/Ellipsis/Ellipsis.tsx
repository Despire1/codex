import { ReactNode } from 'react';
import { Tooltip } from '../Tooltip/Tooltip';
import styles from './Ellipsis.module.css';

interface EllipsisProps {
  children: ReactNode;
  className?: string;
  title?: string;
}

export const Ellipsis = ({ children, className = '', title }: EllipsisProps) => (
  <Tooltip content={title}>
    <span className={`${styles.ellipsis} ${className}`}>
      {children}
    </span>
  </Tooltip>
);

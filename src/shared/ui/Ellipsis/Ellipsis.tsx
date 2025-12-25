import { ReactNode } from 'react';
import styles from './Ellipsis.module.css';

interface EllipsisProps {
  children: ReactNode;
  className?: string;
  title?: string;
}

export const Ellipsis = ({ children, className = '', title }: EllipsisProps) => (
  <span className={`${styles.ellipsis} ${className}`} title={title}>
    {children}
  </span>
);

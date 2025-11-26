import { SelectHTMLAttributes } from 'react';
import styles from './Select.module.css';

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
}

export const Select = ({ label, className = '', children, ...rest }: Props) => (
  <label className={`${styles.field} ${className}`}>
    <span className={styles.label}>{label}</span>
    <select className={styles.select} {...rest}>
      {children}
    </select>
  </label>
);

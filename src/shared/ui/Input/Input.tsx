import { InputHTMLAttributes } from 'react';
import styles from './Input.module.css';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const Input = ({ label, className = '', ...rest }: Props) => (
  <label className={`${styles.field} ${className}`}>
    <span className={styles.label}>{label}</span>
    <input className={styles.input} {...rest} />
  </label>
);

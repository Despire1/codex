import type { InputHTMLAttributes } from 'react';
import styles from './LoginField.module.css';

type LoginFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'children'> & {
  label: string;
};

export const LoginField = ({ label, ...inputProps }: LoginFieldProps) => (
  <label className={styles.field}>
    <span className={styles.label}>{label}</span>
    <input className={styles.input} {...inputProps} />
  </label>
);

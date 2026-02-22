import { InputHTMLAttributes } from 'react';
import styles from './Checkbox.module.css';

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export const Checkbox = ({ className = '', ...rest }: CheckboxProps) => (
  <input type="checkbox" className={className ? `${styles.checkbox} ${className}` : styles.checkbox} {...rest} />
);

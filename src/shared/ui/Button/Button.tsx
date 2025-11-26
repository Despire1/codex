import { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export const Button = ({ children, className = '', ...rest }: Props) => (
  <button className={`${styles.button} ${className}`} {...rest}>
    {children}
  </button>
);

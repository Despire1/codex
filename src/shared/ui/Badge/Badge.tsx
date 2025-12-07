import { ButtonHTMLAttributes, DetailedHTMLProps } from 'react';
import styles from './Badge.module.css';

type BadgeVariant = 'paid' | 'unpaid' | 'groupPaid' | 'groupUnpaid';

type BadgeElementProps = DetailedHTMLProps<ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement>;

interface BadgeProps {
  label: string;
  variant: BadgeVariant;
  withDot?: boolean;
  className?: string;
  onClick?: BadgeElementProps['onClick'];
  title?: string;
}

export const Badge = ({ label, variant, withDot = false, className = '', onClick, title }: BadgeProps) => {
  if (onClick) {
    return (
      <button
        type="button"
        className={`${styles.badge} ${styles[variant]} ${styles.interactive} ${className}`}
        onClick={onClick}
        title={title}
      >
        {withDot && <span className={styles.dot} />}
        {label}
      </button>
    );
  }

  return (
    <span className={`${styles.badge} ${styles[variant]} ${className}`} title={title}>
      {withDot && <span className={styles.dot} />}
      {label}
    </span>
  );
};

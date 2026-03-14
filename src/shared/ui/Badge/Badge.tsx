import { ButtonHTMLAttributes, DetailedHTMLProps } from 'react';
import { Tooltip } from '../Tooltip/Tooltip';
import styles from './Badge.module.css';

type BadgeVariant = 'paid' | 'unpaid' | 'groupPaid' | 'groupUnpaid' | 'pending';

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
      <Tooltip content={title}>
        <button
          type="button"
          className={`${styles.badge} ${styles[variant]} ${styles.interactive} ${className}`}
          onClick={onClick}
        >
          {withDot && <span className={styles.dot} />}
          {label}
        </button>
      </Tooltip>
    );
  }

  return (
    <Tooltip content={title}>
      <span className={`${styles.badge} ${styles[variant]} ${className}`}>
        {withDot && <span className={styles.dot} />}
        {label}
      </span>
    </Tooltip>
  );
};

import { type FC } from 'react';
import styles from './Avatar.module.css';

interface AvatarProps {
  src?: string | null;
  alt?: string;
  fallbackText?: string;
  className?: string;
}

export const Avatar: FC<AvatarProps> = ({ src, alt = '', fallbackText, className = '' }) => (
  <div className={`${styles.avatar} ${className}`} role="img" aria-label={alt}>
    {src ? <img src={src} alt={alt} /> : <span>{fallbackText?.slice(0, 1) ?? ''}</span>}
  </div>
);

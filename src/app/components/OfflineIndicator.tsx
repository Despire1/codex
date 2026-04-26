import { FC, useEffect, useState } from 'react';
import styles from './OfflineIndicator.module.css';

export const OfflineIndicator: FC = () => {
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleOffline = () => {
      setIsOffline(true);
      setShowRestored(false);
    };

    const handleOnline = () => {
      setIsOffline(false);
      setShowRestored(true);
      window.setTimeout(() => setShowRestored(false), 3000);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (!isOffline && !showRestored) return null;

  return (
    <div
      className={`${styles.root} ${isOffline ? styles.rootOffline : styles.rootRestored}`}
      role="status"
      aria-live="polite"
    >
      {isOffline ? '⚠ Нет связи. Изменения синхронизируются, когда вернётся интернет.' : '✓ Связь восстановлена'}
    </div>
  );
};

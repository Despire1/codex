import { FC, useEffect, useState } from 'react';
import styles from './InstallAppBanner.module.css';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const STORAGE_KEY = 'pwa-install-dismissed';

export const InstallAppBanner: FC = () => {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (window.matchMedia('(display-mode: standalone)').matches) return undefined;
    if (sessionStorage.getItem(STORAGE_KEY) === '1') return undefined;

    const handler = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent;
      event.preventDefault();
      setDeferred(promptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
    }
    setDeferred(null);
  };

  const handleDismiss = () => {
    setVisible(false);
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch (_error) {
      // ignore
    }
  };

  if (!visible || !deferred) return null;

  return (
    <div className={styles.root} role="dialog" aria-label="Установить приложение">
      <div className={styles.content}>
        <strong className={styles.title}>Установите TeacherBot на главный экран</strong>
        <p className={styles.description}>Быстрый доступ и push-уведомления.</p>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={handleInstall}>
          Установить
        </button>
        <button type="button" className={styles.secondary} onClick={handleDismiss}>
          Позже
        </button>
      </div>
    </div>
  );
};

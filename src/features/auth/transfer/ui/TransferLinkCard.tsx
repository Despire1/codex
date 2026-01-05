import { useCallback, useState } from 'react';
import { api } from '../../../../shared/api/client';
import { useToast } from '../../../../shared/lib/toast';
import controls from '../../../../shared/styles/controls.module.css';
import styles from './TransferLinkCard.module.css';

export const TransferLinkCard = () => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);

  const handleCreate = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.createTransferLink();
      setLink(data.url);
      setExpiresIn(data.expires_in);
      showToast({ message: 'Ссылка создана. Откройте её на компьютере.', variant: 'success' });
    } catch (error) {
      showToast({ message: 'Не удалось создать ссылку.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const handleCopy = useCallback(async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      showToast({ message: 'Ссылка скопирована.', variant: 'success' });
    } catch (error) {
      showToast({ message: 'Не удалось скопировать ссылку.', variant: 'error' });
    }
  }, [link, showToast]);

  return (
    <div className={styles.card}>
      <div>
        <h3 className={styles.title}>Открыть на компьютере</h3>
        <p className={styles.subtitle}>
          Создайте одноразовую ссылку и откройте её в браузере. Ссылка действует ограниченное время.
        </p>
      </div>
      <div className={styles.actions}>
        <button className={controls.primaryButton} type="button" onClick={handleCreate} disabled={loading}>
          {loading ? 'Создаём…' : 'Создать ссылку'}
        </button>
        {link ? (
          <div className={styles.linkBox}>
            <div className={styles.linkText}>{link}</div>
            <div className={styles.linkMeta}>
              {expiresIn ? `Действует ${expiresIn} сек.` : 'Ссылка готова'}
            </div>
            <button className={controls.secondaryButton} type="button" onClick={handleCopy}>
              Скопировать
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

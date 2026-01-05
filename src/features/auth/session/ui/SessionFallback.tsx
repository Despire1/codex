import { FC } from 'react';
import styles from './SessionFallback.module.css';

interface SessionFallbackProps {
  state: 'checking' | 'unauthenticated';
}

export const SessionFallback: FC<SessionFallbackProps> = ({ state }) => {
  if (state === 'checking') {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <h1>Подключаемся…</h1>
          <p>Проверяем доступ через Telegram.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1>Доступ только через Telegram</h1>
        <p>
          Откройте Mini App в Telegram и авторизуйтесь. Для входа на компьютере используйте одноразовую ссылку из Mini App.
        </p>
      </div>
    </div>
  );
};

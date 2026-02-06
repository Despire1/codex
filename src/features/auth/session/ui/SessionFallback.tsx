import { FC } from 'react';
import styles from './SessionFallback.module.css';

interface SessionFallbackProps {
  state: 'checking' | 'unauthenticated';
}

export const SessionFallback: FC<SessionFallbackProps> = ({ state }) => {
  const isLocalAuthBypass = import.meta.env.DEV && import.meta.env.VITE_LOCAL_AUTH_BYPASS === 'true';

  if (state === 'checking') {
    return (
      <div id="app" className={`${styles.container} app-content`}>
        <div className={styles.card}>
          <h1>Подключаемся…</h1>
          <p>{isLocalAuthBypass ? 'Проверяем локальный доступ.' : 'Проверяем доступ через Telegram.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div id="app" className={`${styles.container} app-content`}>
      <div className={styles.card}>
        {isLocalAuthBypass ? (
          <>
            <h1>Локальный доступ недоступен</h1>
            <p>Убедитесь, что API запущен и доступен по адресу, указанному в настройках.</p>
          </>
        ) : (
          <>
            <h1>Доступ только через Telegram</h1>
            <p>
              Откройте Mini App в Telegram и авторизуйтесь. Для входа на компьютере используйте одноразовую ссылку из
              Mini App.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

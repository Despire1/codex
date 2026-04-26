import { FC } from 'react';
import { TelegramBrowserLogin } from '../../telegram';
import styles from './SessionFallback.module.css';

interface SessionFallbackProps {
  state: 'checking' | 'unauthenticated';
  expired?: boolean;
}

export const SessionFallback: FC<SessionFallbackProps> = ({ state, expired = false }) => {
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
        {expired && !isLocalAuthBypass ? (
          <div className={styles.expiredNotice} role="status">
            <strong>Сессия истекла.</strong> Войдите снова, чтобы продолжить работу.
          </div>
        ) : null}
        {isLocalAuthBypass ? (
          <>
            <h1>Локальный доступ недоступен</h1>
            <p>Убедитесь, что API запущен и доступен по адресу, указанному в настройках.</p>
          </>
        ) : (
          <>
            <span className={styles.badge}>Telegram Login</span>
            <h1>Войдите через Telegram</h1>
            <p className={styles.lead}>
              Кабинет можно открыть не только внутри Mini App. Если вы зашли по обычной ссылке в браузере, авторизуйтесь
              через Telegram прямо здесь.
            </p>
            <TelegramBrowserLogin />
            <div className={styles.noteBlock}>
              <p>
                Если удобнее, вы по-прежнему можете открыть приложение внутри Telegram Mini App и работать как раньше.
              </p>
              <p>Одноразовая ссылка из Mini App тоже остаётся запасным способом входа на компьютере.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

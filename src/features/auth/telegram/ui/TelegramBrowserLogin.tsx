import { useTelegramBrowserLogin } from '../model/useTelegramBrowserLogin';
import styles from './TelegramBrowserLogin.module.css';

const unavailableMessageByReason: Record<'missing_bot_token' | 'missing_bot_username', string> = {
  missing_bot_token: 'На сервере пока не указан токен Telegram-бота, поэтому browser login недоступен.',
  missing_bot_username: 'На сервере пока не указан username Telegram-бота, поэтому browser login недоступен.',
};

export const TelegramBrowserLogin = () => {
  const { containerRef, config, state } = useTelegramBrowserLogin();

  if (state === 'loading') {
    return (
      <div className={styles.panel}>
        <p className={styles.message}>Подготавливаем вход через Telegram…</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className={styles.panel}>
        <p className={styles.message}>
          Не удалось загрузить браузерный вход. Обновите страницу или откройте приложение через Mini App.
        </p>
      </div>
    );
  }

  if (state === 'unavailable') {
    const reason = config?.reason;
    return (
      <div className={styles.panel}>
        <p className={styles.message}>
          {reason ? unavailableMessageByReason[reason] : 'Вход через Telegram в браузере пока недоступен.'}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div ref={containerRef} className={styles.widget} />
      <p className={styles.caption}>Telegram подтвердит вход и вернёт вас обратно в этот же экран уже авторизованным.</p>
    </div>
  );
};

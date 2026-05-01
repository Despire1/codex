import { FC } from 'react';
import { TelegramLoginScreen } from '../../telegram';
import styles from './SessionFallback.module.css';

interface SessionFallbackProps {
  state: 'checking' | 'unauthenticated';
  onAuthenticated: () => Promise<void> | void;
}

export const SessionFallback: FC<SessionFallbackProps> = ({ state, onAuthenticated }) => {
  if (state === 'checking') {
    return (
      <div id="app" className={`${styles.container} app-content`}>
        <div className={styles.card}>
          <h1>Подключаемся…</h1>
          <p>Проверяем сессию.</p>
        </div>
      </div>
    );
  }

  return <TelegramLoginScreen onAuthenticated={onAuthenticated} />;
};

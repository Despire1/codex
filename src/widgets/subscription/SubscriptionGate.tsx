import { useTelegramBotUsername } from '../../features/auth/telegram/model/useTelegramBotUsername';
import styles from './SubscriptionGate.module.css';

export const SubscriptionGate = () => {
  const botUsername = useTelegramBotUsername();
  const botDeepLink = botUsername ? `https://t.me/${botUsername}?start=subscribe` : null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.badge}>Доступ закрыт</div>
        <h1 className={styles.title}>Оформите пробную подписку</h1>
        <p className={styles.text}>
          Чтобы пользоваться сервисом, активируйте пробную подписку в боте. Это бесплатно и не требует банковских карт.
        </p>
        {botDeepLink ? (
          <a className={styles.cta} href={botDeepLink} target="_blank" rel="noreferrer noopener">
            Открыть бота
          </a>
        ) : null}
        <ol className={styles.steps}>
          <li>Откройте чат с ботом.</li>
          <li>Нажмите команду /start и выберите «Я учитель».</li>
          <li>Подтвердите оформление пробной подписки.</li>
        </ol>
        <p className={styles.hint}>После этого функционал сервиса станет доступен в Mini App.</p>
      </div>
    </div>
  );
};

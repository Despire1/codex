import styles from './SubscriptionGate.module.css';

export const SubscriptionGate = () => (
  <div className={styles.wrapper}>
    <div className={styles.card}>
      <div className={styles.badge}>Доступ закрыт</div>
      <h1 className={styles.title}>Оформите пробную подписку</h1>
      <p className={styles.text}>
        Чтобы пользоваться сервисом, активируйте пробную подписку в боте. Это бесплатно и не требует банковских карт.
      </p>
      <ol className={styles.steps}>
        <li>Откройте чат с ботом.</li>
        <li>Нажмите команду /start и выберите «Я учитель».</li>
        <li>Подтвердите оформление пробной подписки.</li>
      </ol>
      <p className={styles.hint}>После этого функционал сервиса станет доступен в Mini App.</p>
    </div>
  </div>
);

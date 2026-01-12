import { Card } from '../../shared/ui/Card/Card';
import styles from './StudentRoleNotice.module.css';

export const StudentRoleNotice = () => (
  <section className={styles.container}>
    <Card
      title="Интерфейс ученика появится позже"
      meta="Мы готовим кабинет ученика в Mini App."
    >
      <p className={styles.text}>
        Пока что доступен только интерфейс учителя. Если хотите управлять занятиями, переключитесь на роль «Я
        учитель» в боте.
      </p>
      <p className={styles.hint}>Откройте меню /start в Telegram и выберите нужную роль.</p>
    </Card>
  </section>
);

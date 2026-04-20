import { LoginField } from './LoginField';
import styles from './PasswordLoginScreen.module.css';

export const PasswordLoginScreen = () => {
  return (
    <main id="app" className={`${styles.page} app-content`}>
      <div className={styles.shell}>
        <section className={styles.card} aria-label="Форма входа">
          <div className={styles.brand}>
            <div className={styles.logoWrap}>
              <img className={styles.logo} src="/pwa-icon.svg" alt="TeacherBot" />
            </div>
            <div className={styles.brandText}>
              <span className={styles.serviceName}>TeacherBot</span>
              <h1 className={styles.title}>Вход</h1>
            </div>
          </div>

          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <LoginField
              id="login"
              name="login"
              type="text"
              label="Логин"
              autoComplete="username"
              placeholder="Введите логин"
              spellCheck={false}
            />

            <LoginField
              id="password"
              name="password"
              type="password"
              label="Пароль"
              autoComplete="current-password"
              placeholder="Введите пароль"
            />

            <button className={styles.submitButton} type="submit">
              Войти
            </button>
          </form>
        </section>
      </div>
    </main>
  );
};

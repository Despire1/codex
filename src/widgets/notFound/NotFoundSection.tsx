import { FC } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import styles from './NotFoundSection.module.css';

interface NotFoundSectionProps {
  homePath?: string;
}

export const NotFoundSection: FC<NotFoundSectionProps> = ({ homePath = '/' }) => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <section className={styles.page}>
      <div className={styles.card}>
        <div className={styles.code} aria-hidden>
          404
        </div>
        <h1 className={styles.title}>Страница не найдена</h1>
        <p className={styles.description}>
          Адрес <code className={styles.path}>{location.pathname}</code> не существует или был переименован.
          Проверьте URL или вернитесь на главную.
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => {
              if (window.history.length > 1) {
                window.history.back();
              } else {
                navigate(homePath);
              }
            }}
          >
            Назад
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => navigate(homePath)}
          >
            На главную
          </button>
        </div>
      </div>
    </section>
  );
};

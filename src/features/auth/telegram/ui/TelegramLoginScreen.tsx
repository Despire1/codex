import { FC, ReactNode } from 'react';
import { BrandLogo } from '@/shared/ui/BrandLogo';
import { useTelegramDeepLinkLogin } from '../model/useTelegramDeepLinkLogin';
import styles from './TelegramLoginScreen.module.css';

const formatRemaining = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const TelegramIcon: FC = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
    <path d="M21.4 3.1 2.9 10.3c-1.1.4-1.1 1-.2 1.3l4.7 1.5 1.8 5.7c.2.6.1.9.7.9.5 0 .7-.2 1-.5l2.4-2.3 4.9 3.6c.9.5 1.5.2 1.8-.8l3.2-15.1c.3-1.3-.4-1.9-1.8-1.5zM9.9 13.9 8.5 18l-1-4 10-6.3-7.6 6.2z" />
  </svg>
);

const ArrowIcon: FC = () => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const SpinnerIcon: FC = () => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M21 12a9 9 0 11-9-9" />
  </svg>
);

const WarnIcon: FC = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4M12 16v.5" />
  </svg>
);

const Logo: FC = () => (
  <div className={styles.logoWrap}>
    <span className={styles.logoMark} aria-hidden="true">
      <BrandLogo width={24} height={24} />
    </span>
    <span className={styles.logoText}>TeacherBot</span>
  </div>
);

const HeroPanel: FC = () => (
  <div className={styles.hero}>
    <div className={styles.heroBlob1} aria-hidden="true" />
    <div className={styles.heroBlob2} aria-hidden="true" />
    <svg className={styles.heroGrid} aria-hidden="true">
      <defs>
        <pattern id="login-hero-grid" width="28" height="28" patternUnits="userSpaceOnUse">
          <path d="M28 0L0 0 0 28" fill="none" stroke="#0f172a" strokeWidth="0.7" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#login-hero-grid)" />
    </svg>

    <div className={styles.heroTopRow}>
      <Logo />
      <span className={styles.heroBadge}>для учителей и учеников</span>
    </div>

    <div className={styles.heroBody}>
      <div className={styles.heroTagline}>Ваш класс — в одном окне</div>
      <h1 className={styles.heroTitle}>Расписание, ученики и задания без хаоса в блокнотах.</h1>
      <p className={styles.heroLead}>Расписание, ученики и домашние задания — в одном окне. Без таблиц и блокнотов.</p>
    </div>

    <div className={styles.heroCards} aria-hidden="true">
      <div className={styles.miniCard}>
        <span className={`${styles.miniCardBar} ${styles.miniCardBarAccent}`} />
        <div>
          <div className={styles.miniCardTime}>09:00</div>
          <div className={styles.miniCardTitle}>Алгебра · Иван</div>
        </div>
      </div>
      <div className={styles.miniCard}>
        <span className={`${styles.miniCardBar} ${styles.miniCardBarPlain}`} />
        <div>
          <div className={styles.miniCardTime}>11:00</div>
          <div className={styles.miniCardTitle}>Геометрия · Анна</div>
        </div>
      </div>
    </div>
  </div>
);

type ShellProps = {
  children: ReactNode;
};

const Shell: FC<ShellProps> = ({ children }) => (
  <div id="app" className={`${styles.root} app-content`}>
    <HeroPanel />
    <div className={styles.formColumn}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>С возвращением</h2>
          <p className={styles.cardSubtitle}>Продолжим, на чём остановились — расписание, ученики, задания.</p>
        </div>
        {children}
        <div className={styles.terms}>
          Нажимая «Войти», вы соглашаетесь с{' '}
          <a href="https://bot.politdev.ru/offer" target="_blank" rel="noopener noreferrer">
            условиями
          </a>{' '}
          и{' '}
          <a href="https://bot.politdev.ru/privacy" target="_blank" rel="noopener noreferrer">
            политикой конфиденциальности
          </a>
          .
        </div>
      </div>
    </div>
  </div>
);

type TelegramLoginScreenProps = {
  onAuthenticated: () => Promise<void> | void;
};

export const TelegramLoginScreen: FC<TelegramLoginScreenProps> = ({ onAuthenticated }) => {
  const { state, config, deepLink, errorMessage, remainingMs, start, cancel } = useTelegramDeepLinkLogin({
    onSuccess: onAuthenticated,
  });

  if (state === 'loading') {
    return (
      <Shell>
        <div className={styles.formStack}>
          <p className={styles.checkingMessage}>Подготавливаем вход…</p>
        </div>
      </Shell>
    );
  }

  if (state === 'unavailable') {
    return (
      <Shell>
        <div className={styles.formStack}>
          <h3 className={styles.unavailableTitle}>Вход недоступен</h3>
          <p className={styles.unavailableMessage}>Откройте приложение через Telegram Mini App или попробуйте позже.</p>
        </div>
      </Shell>
    );
  }

  const botHandle = config?.botUsername ? `@${config.botUsername}` : 'Telegram';
  const isAwaiting = state === 'awaiting' || state === 'success';
  const isStarting = state === 'starting';
  const showError = state === 'error' || state === 'expired';
  const errorText =
    state === 'expired'
      ? 'Срок этой ссылки истёк. Запустите вход ещё раз — займёт пару секунд.'
      : (errorMessage ?? 'Что-то пошло не так. Попробуйте ещё раз.');

  return (
    <Shell>
      <div className={styles.formStack}>
        <div className={styles.tgPanel}>
          <div className={styles.tgPanelIcon}>
            <TelegramIcon />
          </div>
          <div className={styles.tgPanelTitle}>Войти через Telegram</div>
          <div className={styles.tgPanelHint}>Быстро и без паролей — откроется бот для подтверждения входа.</div>
        </div>

        {showError ? (
          <div className={styles.errorBanner} role="alert">
            <WarnIcon />
            <span>{errorText}</span>
          </div>
        ) : null}

        {isAwaiting ? (
          <>
            <button type="button" className={styles.primaryButton} disabled>
              <span className={styles.spin}>
                <SpinnerIcon />
              </span>
              <span>Ждём подтверждение в {botHandle}</span>
            </button>
            {remainingMs !== null && state === 'awaiting' ? (
              <div className={styles.statusRow}>
                <span>Действует ещё</span>
                <span className={styles.statusTimer}>{formatRemaining(remainingMs)}</span>
              </div>
            ) : null}
            {deepLink ? (
              <a className={styles.ghostButton} href={deepLink} target="_blank" rel="noopener noreferrer">
                <span style={{ color: '#229ED9' }}>
                  <TelegramIcon />
                </span>
                <span>Открыть Telegram ещё раз</span>
              </a>
            ) : null}
            <button type="button" className={styles.subtleButton} onClick={cancel}>
              Отменить вход
            </button>
          </>
        ) : (
          <button type="button" className={styles.primaryButton} onClick={start} disabled={isStarting}>
            {isStarting ? (
              <>
                <span className={styles.spin}>
                  <SpinnerIcon />
                </span>
                <span>Открываем Telegram…</span>
              </>
            ) : (
              <>
                <span className={styles.primaryButtonIcon}>
                  <TelegramIcon />
                </span>
                <span>Войти через Telegram</span>
                <ArrowIcon />
              </>
            )}
          </button>
        )}
      </div>
    </Shell>
  );
};

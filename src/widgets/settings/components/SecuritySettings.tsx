import { FC, SVGProps, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AndroidBrandIcon,
  AppleBrandIcon,
  ChromeBrandIcon,
  SettingsIcon,
  TelegramBrandIcon,
} from '../../../icons/MaterialIcons';
import { SessionSummary, api } from '../../../shared/api/client';
import { useToast } from '../../../shared/lib/toast';
import controls from '../../../shared/styles/controls.module.css';
import styles from '../SettingsSection.module.css';

type SessionPresentation = {
  title: string;
  icon: (props: SVGProps<SVGSVGElement>) => JSX.Element;
  iconClassName: string;
};

const getSessionPresentation = (session: SessionSummary): SessionPresentation => {
  const value = session.userAgent?.toLowerCase() ?? '';

  if (value.includes('telegram') && value.includes('android')) {
    return {
      title: 'Telegram на Android',
      icon: AndroidBrandIcon,
      iconClassName: styles.sessionGlyphAndroid,
    };
  }

  if (value.includes('telegram')) {
    return {
      title: 'Telegram Desktop',
      icon: TelegramBrandIcon,
      iconClassName: styles.sessionGlyphTelegram,
    };
  }

  if (value.includes('iphone') || value.includes('ios') || value.includes('safari')) {
    return {
      title: 'Safari на iPhone',
      icon: AppleBrandIcon,
      iconClassName: styles.sessionGlyphApple,
    };
  }

  if (value.includes('chrome') || value.includes('chromium')) {
    return {
      title: value.includes('windows') ? 'Chrome на Windows' : 'Chrome',
      icon: ChromeBrandIcon,
      iconClassName: styles.sessionGlyphChrome,
    };
  }

  if (
    value.includes('curl') ||
    value.includes('python') ||
    value.includes('postman') ||
    value.includes('node') ||
    value.includes('wget') ||
    value.includes('httpie')
  ) {
    return {
      title: 'Скрипт или API-клиент',
      icon: SettingsIcon,
      iconClassName: styles.sessionGlyphDefault,
    };
  }

  if (value.includes('firefox')) {
    return {
      title: value.includes('windows') ? 'Firefox на Windows' : 'Firefox',
      icon: SettingsIcon,
      iconClassName: styles.sessionGlyphDefault,
    };
  }

  return {
    title: 'Неизвестное устройство',
    icon: SettingsIcon,
    iconClassName: styles.sessionGlyphDefault,
  };
};

const formatSessionActivity = (value: string) => {
  const createdAt = new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - createdAt.getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / (1000 * 60)));

  if (diffMinutes < 2) return 'Последняя активность: Только что';
  if (diffMinutes < 60) return `Последняя активность: ${diffMinutes} мин назад`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `Последняя активность: ${diffHours} ${diffHours === 1 ? 'час' : diffHours < 5 ? 'часа' : 'часов'} назад`;
  }

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) {
    return `Последняя активность: ${diffDays} ${diffDays === 1 ? 'день' : diffDays < 5 ? 'дня' : 'дней'} назад`;
  }

  return `Последняя активность: ${createdAt.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

export const SecuritySettings: FC = () => {
  const { showToast } = useToast();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [actionLoading, setActionLoading] = useState(false);

  const loadSessions = useCallback(async () => {
    setStatus('loading');
    try {
      const data = await api.listSessions();
      setSessions(data.sessions ?? []);
      setStatus('ready');
    } catch (_error) {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const hasOtherSessions = useMemo(() => sessions.some((session) => !session.isCurrent), [sessions]);
  const sortedSessions = useMemo(
    () => [...sessions].sort((left, right) => Number(right.isCurrent) - Number(left.isCurrent)),
    [sessions],
  );

  const handleRevoke = async (sessionId: number) => {
    if (!window.confirm('Эта сессия будет закрыта. Пользователь потеряет доступ, пока не войдёт снова.')) {
      return;
    }
    setActionLoading(true);
    try {
      await api.revokeSession(sessionId);
      setSessions((prev) => prev.filter((session) => session.id !== sessionId));
    } catch (_error) {
      showToast({ message: 'Не удалось завершить сессию', variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokeOthers = async () => {
    const otherCount = sessions.filter((session) => !session.isCurrent).length;
    const message =
      otherCount > 0
        ? `Все сессии кроме текущей будут закрыты. ${otherCount} ${
            otherCount === 1 ? 'устройство потеряет' : 'устройств потеряют'
          } доступ.`
        : 'Закрыть все другие сессии?';
    if (!window.confirm(message)) {
      return;
    }
    setActionLoading(true);
    try {
      await api.revokeOtherSessions();
      setSessions((prev) => prev.filter((session) => session.isCurrent));
    } catch (_error) {
      showToast({ message: 'Не удалось завершить другие сессии', variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className={styles.moduleStack}>
      <section className={styles.settingsCard}>
        <div className={styles.sectionHeaderBetween}>
          <div className={styles.sectionHeaderCompact}>
            <div className={`${styles.sectionIcon} ${styles.sectionIconPurple}`}>
              <SettingsIcon width={20} height={20} />
            </div>
            <div className={styles.sectionHeaderCopy}>
              <h2 className={styles.sectionHeading}>Активные сессии</h2>
              <p className={styles.sectionDescription}>Устройства с доступом к вашему аккаунту</p>
            </div>
          </div>

          <button
            className={`${controls.secondaryButton} ${styles.dangerActionButton}`}
            type="button"
            onClick={handleRevokeOthers}
            disabled={!hasOtherSessions || actionLoading || status !== 'ready'}
          >
            Завершить все другие
          </button>
        </div>

        {status === 'loading' && <div className={styles.loadingState}>Загрузка…</div>}

        {status === 'error' && (
          <div className={styles.errorBox}>
            Не удалось загрузить список сессий.
            <button className={`${controls.secondaryButton} ${styles.headerSecondaryButton}`} type="button" onClick={loadSessions}>
              Повторить
            </button>
          </div>
        )}

        {status === 'ready' && (
          <div className={styles.sessionsList}>
            {sortedSessions.length === 0 && <div className={styles.helperText}>Активных сессий не найдено.</div>}

            {sortedSessions.map((session) => {
              const presentation = getSessionPresentation(session);
              const Icon = presentation.icon;

              return (
                <div
                  key={session.id}
                  className={`${styles.sessionCard} ${session.isCurrent ? styles.sessionCardCurrent : ''}`}
                >
                  <div className={styles.sessionCardMain}>
                    <div className={`${styles.sessionGlyph} ${presentation.iconClassName}`}>
                      <Icon width={24} height={24} />
                    </div>

                    <div className={styles.sessionContent}>
                      <div className={styles.sessionTitle}>
                        {presentation.title}
                        {session.isCurrent && <span className={styles.sessionBadge}>Текущая</span>}
                      </div>

                      <div className={styles.sessionMetaLine}>{session.ip ? `IP: ${session.ip}` : 'IP не определён'}</div>
                      <div className={styles.sessionMetaSecondary}>
                        {formatSessionActivity(session.lastSeenAt ?? session.createdAt)}
                      </div>
                      <div className={styles.sessionMetaSecondary}>
                        Вход: {new Date(session.createdAt).toLocaleString('ru-RU', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>

                  {!session.isCurrent ? (
                    <button
                      className={`${controls.secondaryButton} ${styles.sessionActionButton}`}
                      type="button"
                      onClick={() => handleRevoke(session.id)}
                      disabled={actionLoading}
                    >
                      Завершить
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

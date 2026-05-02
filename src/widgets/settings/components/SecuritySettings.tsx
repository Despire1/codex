import { FC, SVGProps, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AndroidBrandIcon,
  AppleBrandIcon,
  ChromeBrandIcon,
  SettingsIcon,
  TelegramBrandIcon,
} from '../../../icons/MaterialIcons';
import { SessionSummary, api } from '../../../shared/api/client';
import { formatDisplayIp } from '../../../shared/lib/sessionDisplay';
import { useToast } from '../../../shared/lib/toast';
import { DialogModal } from '../../../shared/ui/Modal/DialogModal';
import { useLogout } from '../../../features/auth/session';
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
  const [exporting, setExporting] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  type SecurityAlertsState = {
    enabled: boolean;
    newDevice: boolean;
    logout: boolean;
    sessionRevoke: boolean;
  };
  const [alerts, setAlerts] = useState<SecurityAlertsState | null>(null);
  const [alertsBusy, setAlertsBusy] = useState<keyof SecurityAlertsState | null>(null);
  const { logout, isLoggingOut } = useLogout();

  useEffect(() => {
    let cancelled = false;
    api
      .getSettings()
      .then((response) => {
        if (cancelled) return;
        setAlerts({
          enabled: Boolean(response.settings.securityAlertsEnabled),
          newDevice: Boolean(response.settings.securityAlertNewDevice ?? true),
          logout: Boolean(response.settings.securityAlertLogout ?? true),
          sessionRevoke: Boolean(response.settings.securityAlertSessionRevoke ?? true),
        });
      })
      .catch(() => {
        if (cancelled) return;
        setAlerts({ enabled: true, newDevice: true, logout: true, sessionRevoke: true });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateAlertFlag = async (key: keyof SecurityAlertsState, next: boolean) => {
    if (!alerts || alertsBusy) return;
    const previous = alerts;
    setAlerts({ ...alerts, [key]: next });
    setAlertsBusy(key);
    try {
      const fieldMap: Record<keyof SecurityAlertsState, string> = {
        enabled: 'securityAlertsEnabled',
        newDevice: 'securityAlertNewDevice',
        logout: 'securityAlertLogout',
        sessionRevoke: 'securityAlertSessionRevoke',
      };
      await api.updateSettings({ [fieldMap[key]]: next } as Record<string, boolean>);
    } catch (_error) {
      setAlerts(previous);
      showToast({ message: 'Не удалось сохранить настройку', variant: 'error' });
    } finally {
      setAlertsBusy(null);
    }
  };

  const handleExportData = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const data = await api.exportAccount();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `teacherbot-export-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast({ message: 'Архив с данными скачан', variant: 'success' });
    } catch (_error) {
      showToast({ message: 'Не удалось выгрузить данные', variant: 'error' });
    } finally {
      setExporting(false);
    }
  };

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
              <h2 className={styles.sectionHeading}>Уведомления безопасности</h2>
              <p className={styles.sectionDescription}>
                Бот напишет в Telegram, если с аккаунтом произойдёт что-то важное. В сообщении появится кнопка «Это был
                не я» — закроет все сессии одним нажатием.
              </p>
            </div>
          </div>
          <label className={`${controls.switch} ${styles.switchControl}`}>
            <input
              type="checkbox"
              checked={Boolean(alerts?.enabled)}
              disabled={!alerts || alertsBusy === 'enabled'}
              onChange={(event) => {
                void updateAlertFlag('enabled', event.target.checked);
              }}
            />
            <span className={controls.slider} />
          </label>
        </div>

        <div className={styles.cardStack}>
          <div className={styles.infoRow}>
            <div>
              <div className={styles.infoRowTitle}>Вход с нового устройства</div>
              <div className={styles.infoRowDescription}>
                Получать сообщение, когда в аккаунт зашли с нового браузера или приложения.
              </div>
            </div>
            <label className={`${controls.switch} ${styles.switchControl}`}>
              <input
                type="checkbox"
                checked={Boolean(alerts?.newDevice)}
                disabled={!alerts?.enabled || alertsBusy === 'newDevice'}
                onChange={(event) => {
                  void updateAlertFlag('newDevice', event.target.checked);
                }}
              />
              <span className={controls.slider} />
            </label>
          </div>

          <div className={styles.infoRow}>
            <div>
              <div className={styles.infoRowTitle}>Выход из аккаунта</div>
              <div className={styles.infoRowDescription}>
                Уведомление при нажатии «Выйти» — поможет понять, если кнопку нажал не вы.
              </div>
            </div>
            <label className={`${controls.switch} ${styles.switchControl}`}>
              <input
                type="checkbox"
                checked={Boolean(alerts?.logout)}
                disabled={!alerts?.enabled || alertsBusy === 'logout'}
                onChange={(event) => {
                  void updateAlertFlag('logout', event.target.checked);
                }}
              />
              <span className={controls.slider} />
            </label>
          </div>

          <div className={styles.infoRow}>
            <div>
              <div className={styles.infoRowTitle}>Завершение сессий на других устройствах</div>
              <div className={styles.infoRowDescription}>
                Подтверждение, когда вы нажимаете «Завершить все другие сессии» в этом разделе.
              </div>
            </div>
            <label className={`${controls.switch} ${styles.switchControl}`}>
              <input
                type="checkbox"
                checked={Boolean(alerts?.sessionRevoke)}
                disabled={!alerts?.enabled || alertsBusy === 'sessionRevoke'}
                onChange={(event) => {
                  void updateAlertFlag('sessionRevoke', event.target.checked);
                }}
              />
              <span className={controls.slider} />
            </label>
          </div>
        </div>

        <div className={styles.helperText}>
          В сообщении бот показывает примерное местоположение по IP. Список активных устройств — в разделе ниже.
        </div>
      </section>

      <section className={styles.settingsCard}>
        <div className={styles.sectionHeaderCompact}>
          <div className={`${styles.sectionIcon} ${styles.sectionIconPurple}`}>
            <SettingsIcon width={20} height={20} />
          </div>
          <div className={styles.sectionHeaderCopy}>
            <h2 className={styles.sectionHeading}>Мои данные</h2>
            <p className={styles.sectionDescription}>
              Скачайте все данные аккаунта (учеников, уроки, домашки, оплаты) в формате JSON.
            </p>
          </div>
        </div>
        <div className={styles.helperText}>Архив пригодится для резервной копии или переноса в другой сервис.</div>
        <button
          className={`${controls.primaryButton} ${styles.headerSecondaryButton}`}
          type="button"
          onClick={() => {
            void handleExportData();
          }}
          disabled={exporting}
        >
          <span aria-hidden style={{ marginRight: 6 }}>
            ⬇
          </span>
          {exporting ? 'Готовим архив…' : 'Скачать архив (JSON)'}
        </button>
      </section>

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
            <button
              className={`${controls.secondaryButton} ${styles.headerSecondaryButton}`}
              type="button"
              onClick={loadSessions}
            >
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

                      <div className={styles.sessionMetaLine}>
                        {(() => {
                          const displayIp = formatDisplayIp(session.ip);
                          return displayIp ? `IP: ${displayIp}` : 'IP не определён';
                        })()}
                      </div>
                      <div className={styles.sessionMetaSecondary}>
                        {formatSessionActivity(session.lastSeenAt ?? session.createdAt)}
                      </div>
                      <div className={styles.sessionMetaSecondary}>
                        Вход:{' '}
                        {new Date(session.createdAt).toLocaleString('ru-RU', {
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

      <section className={styles.settingsCard}>
        <div className={styles.sectionHeaderCompact}>
          <div className={`${styles.sectionIcon} ${styles.sectionIconPurple}`}>
            <SettingsIcon width={20} height={20} />
          </div>
          <div className={styles.sectionHeaderCopy}>
            <h2 className={styles.sectionHeading}>Текущая сессия</h2>
            <p className={styles.sectionDescription}>
              Выйти из аккаунта на этом устройстве. Чтобы вернуться, нужно будет заново войти через Telegram.
            </p>
          </div>
        </div>
        <button
          className={`${controls.secondaryButton} ${styles.dangerActionButton}`}
          type="button"
          onClick={() => setLogoutDialogOpen(true)}
          disabled={isLoggingOut}
        >
          {isLoggingOut ? 'Выходим…' : 'Выйти из аккаунта'}
        </button>
      </section>

      <DialogModal
        open={logoutDialogOpen}
        title="Выйти из аккаунта?"
        description="Сессия завершится на этом устройстве. Чтобы вернуться, нужно будет заново войти через Telegram."
        confirmText="Выйти"
        cancelText="Остаться"
        onClose={() => setLogoutDialogOpen(false)}
        onCancel={() => setLogoutDialogOpen(false)}
        onConfirm={async () => {
          await logout();
        }}
      />
    </div>
  );
};

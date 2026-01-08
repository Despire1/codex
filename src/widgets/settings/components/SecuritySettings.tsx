import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { TransferLinkCard } from '../../../features/auth/transfer';
import { SessionSummary, api } from '../../../shared/api/client';
import { useToast } from '../../../shared/lib/toast';
import { useTimeZone } from '../../../shared/lib/timezoneContext';
import controls from '../../../shared/styles/controls.module.css';
import styles from '../SettingsSection.module.css';

const formatSessionDate = (value: string, timeZone: string) =>
  new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(value));

const formatSessionTitle = (session: SessionSummary) => {
  if (session.userAgent) return session.userAgent;
  if (session.ip) return `IP ${session.ip}`;
  return 'Сессия';
};

export const SecuritySettings: FC = () => {
  const { showToast } = useToast();
  const timeZone = useTimeZone();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [actionLoading, setActionLoading] = useState(false);

  const loadSessions = useCallback(async () => {
    setStatus('loading');
    try {
      const data = await api.listSessions();
      setSessions(data.sessions ?? []);
      setStatus('ready');
    } catch (error) {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const hasOtherSessions = useMemo(() => sessions.some((session) => !session.isCurrent), [sessions]);

  const handleRevoke = async (sessionId: number) => {
    setActionLoading(true);
    try {
      await api.revokeSession(sessionId);
      setSessions((prev) => prev.filter((session) => session.id !== sessionId));
    } catch (error) {
      showToast({ message: 'Не удалось завершить сессию', variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokeOthers = async () => {
    setActionLoading(true);
    try {
      await api.revokeOtherSessions();
      setSessions((prev) => prev.filter((session) => session.isCurrent));
    } catch (error) {
      showToast({ message: 'Не удалось завершить другие сессии', variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className={styles.moduleStack}>
      <TransferLinkCard />

      <div className={styles.sectionBlock}>
        <div className={styles.sectionTitle}>Активные сессии</div>
        {status === 'loading' && <div className={styles.helperText}>Загрузка…</div>}
        {status === 'error' && (
          <div className={styles.errorBox}>
            Не удалось загрузить список сессий.
            <button className={controls.secondaryButton} type="button" onClick={loadSessions}>
              Повторить
            </button>
          </div>
        )}
        {status === 'ready' && (
          <div className={styles.sessionsList}>
            {sessions.length === 0 && <div className={styles.helperText}>Активных сессий не найдено.</div>}
            {sessions.map((session) => (
              <div key={session.id} className={styles.sessionRow}>
                <div>
                  <div className={styles.sessionTitle}>
                    {formatSessionTitle(session)}
                    {session.isCurrent && <span className={styles.sessionBadge}>Текущая</span>}
                  </div>
                  <div className={styles.helperText}>
                    {session.ip && <span>IP {session.ip} · </span>}
                    {formatSessionDate(session.createdAt, timeZone)}
                  </div>
                </div>
                {!session.isCurrent && (
                  <button
                    className={controls.smallButton}
                    type="button"
                    onClick={() => handleRevoke(session.id)}
                    disabled={actionLoading}
                  >
                    Завершить
                  </button>
                )}
              </div>
            ))}
            {sessions.length > 1 && (
              <button
                className={controls.secondaryButton}
                type="button"
                onClick={handleRevokeOthers}
                disabled={!hasOtherSessions || actionLoading}
              >
                Завершить все другие
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

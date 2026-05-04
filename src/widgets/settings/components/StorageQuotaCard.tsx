import { FC, useEffect, useState } from 'react';
import { api } from '../../../shared/api/client';
import { formatBytesShort } from '../../../shared/config/fileLimits';
import styles from '../SettingsSection.module.css';

type QuotaInfo = Awaited<ReturnType<typeof api.getStorageQuotaV2>>;

const resolveBarColor = (ratio: number): string => {
  if (ratio >= 0.95) return '#ef4444';
  if (ratio >= 0.8) return '#f97316';
  return 'var(--accent-primary, #a3e635)';
};

export const StorageQuotaCard: FC = () => {
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = async () => {
    setStatus('loading');
    try {
      const data = await api.getStorageQuotaV2();
      setQuota(data);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const ratio = quota && quota.quotaBytes > 0 ? Math.min(1, quota.usedBytes / quota.quotaBytes) : 0;
  const percent = Math.round(ratio * 100);
  const barColor = resolveBarColor(ratio);

  return (
    <section className={styles.settingsCard}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionHeaderCopy}>
          <h2 className={styles.sectionHeading}>Хранилище файлов</h2>
          <p className={styles.sectionDescription}>
            Сюда входят все материалы уроков, домашних заданий и работы учеников.
          </p>
        </div>
      </div>

      {status === 'loading' && (
        <div style={{ padding: '12px 0', color: 'var(--color-slate-500, #64748b)', fontSize: 13 }}>Загрузка…</div>
      )}

      {status === 'error' && (
        <div style={{ padding: '12px 0', color: '#ef4444', fontSize: 13 }}>
          Не удалось загрузить данные о квоте.{' '}
          <button
            type="button"
            onClick={() => void load()}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--accent-primary, #a3e635)',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
              fontSize: 13,
            }}
          >
            Повторить
          </button>
        </div>
      )}

      {status === 'ready' && quota && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 12,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-slate-900, #0f172a)' }}>
              {formatBytesShort(quota.usedBytes)}{' '}
              <span style={{ color: 'var(--color-slate-500, #64748b)', fontWeight: 400 }}>
                из {formatBytesShort(quota.quotaBytes)}
              </span>
            </span>
            <span style={{ fontSize: 13, color: 'var(--color-slate-500, #64748b)' }}>{percent}%</span>
          </div>

          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={quota.quotaBytes}
            aria-valuenow={quota.usedBytes}
            style={{
              width: '100%',
              height: 8,
              borderRadius: 999,
              background: 'var(--color-slate-100, #f1f5f9)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${percent}%`,
                height: '100%',
                background: barColor,
                transition: 'width 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
          </div>

          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-slate-500, #64748b)' }}>
            Один файл — до {formatBytesShort(quota.maxFileBytes)}. До {quota.maxFilesPerLesson} файлов на урок, до{' '}
            {quota.maxFilesPerHomeworkTemplate} в материалах ДЗ. Расширенные лимиты будут доступны в будущих тарифах.
          </p>
        </div>
      )}
    </section>
  );
};

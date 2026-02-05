import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Teacher } from '../../entities/types';
import { ChevronLeftIcon, ChevronRightIcon } from '../../icons/MaterialIcons';
import { api } from '../../shared/api/client';
import { formatTimeZoneLabel, getResolvedTimeZone, getTimeZoneOptions } from '../../shared/lib/timezones';
import { useToast } from '../../shared/lib/toast';
import { useIsMobile } from '../../shared/lib/useIsMobile';
import controls from '../../shared/styles/controls.module.css';
import { SETTINGS_TABS, SettingsTabId } from './constants';
import { NotificationsSettings } from './components/NotificationsSettings';
import { ProfileSettings } from './components/ProfileSettings';
import { ScheduleSettings } from './components/ScheduleSettings';
import { SecuritySettings } from './components/SecuritySettings';
import styles from './SettingsSection.module.css';

interface SettingsSectionProps {
  teacher: Teacher;
  onTeacherChange: (teacher: Teacher) => void;
}

type SettingsPatch = Partial<
  Pick<
    Teacher,
    | 'timezone'
    | 'receiptEmail'
    | 'defaultLessonDuration'
    | 'lessonReminderEnabled'
    | 'lessonReminderMinutes'
    | 'dailySummaryEnabled'
    | 'dailySummaryTime'
    | 'tomorrowSummaryEnabled'
    | 'tomorrowSummaryTime'
    | 'studentNotificationsEnabled'
    | 'studentUpcomingLessonTemplate'
    | 'studentPaymentDueTemplate'
    | 'autoConfirmLessons'
    | 'globalPaymentRemindersEnabled'
    | 'paymentReminderDelayHours'
    | 'paymentReminderRepeatHours'
    | 'paymentReminderMaxCount'
    | 'notifyTeacherOnAutoPaymentReminder'
    | 'notifyTeacherOnManualPaymentReminder'
  >
>;

const isSettingsTab = (value: string | null): value is SettingsTabId =>
  SETTINGS_TABS.some((tab) => tab.id === value);

export const SettingsSection: FC<SettingsSectionProps> = ({ teacher, onTeacherChange }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const isMobile = useIsMobile(720);
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const teacherRef = useRef(teacher);
  const pendingPatchRef = useRef<SettingsPatch>({});
  const saveTimerRef = useRef<number | null>(null);
  const autoTimeZoneRef = useRef(false);

  useEffect(() => {
    teacherRef.current = teacher;
  }, [teacher]);

  const timeZoneOptions = useMemo(() => {
    const options = getTimeZoneOptions();
    if (teacher.timezone && !options.some((option) => option.value === teacher.timezone)) {
      return [{ value: teacher.timezone, label: formatTimeZoneLabel(teacher.timezone) }, ...options];
    }
    return options;
  }, [teacher.timezone]);

  const applyTeacherPatch = useCallback(
    (patch: SettingsPatch) => {
      onTeacherChange({ ...teacherRef.current, ...patch });
    },
    [onTeacherChange],
  );

  const savePendingPatch = useCallback(async () => {
    const patch = pendingPatchRef.current;
    pendingPatchRef.current = {};
    if (Object.keys(patch).length === 0) return;
    setSaveStatus('saving');
    try {
      const data = await api.updateSettings(patch);
      applyTeacherPatch(data.settings);
      setSaveStatus('idle');
      showToast({ message: 'Сохранено', variant: 'success' });
    } catch (error) {
      setSaveStatus('error');
      showToast({ message: 'Не удалось сохранить изменения', variant: 'error' });
    }
  }, [applyTeacherPatch, showToast]);

  const scheduleSave = useCallback(
    (patch: SettingsPatch) => {
      pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        savePendingPatch();
      }, 600);
    },
    [savePendingPatch],
  );

  const saveSettingsNow = useCallback(
    async (patch: SettingsPatch) => {
      pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const nextPatch = pendingPatchRef.current;
      pendingPatchRef.current = {};
      if (Object.keys(nextPatch).length === 0) {
        return { ok: true } as const;
      }
      setSaveStatus('saving');
      try {
        const data = await api.updateSettings(nextPatch);
        applyTeacherPatch(data.settings);
        setSaveStatus('idle');
        showToast({ message: 'Сохранено', variant: 'success' });
        return { ok: true } as const;
      } catch (error) {
        setSaveStatus('error');
        showToast({ message: 'Не удалось сохранить изменения', variant: 'error' });
        return { ok: false, error: 'save_failed' } as const;
      }
    },
    [applyTeacherPatch, showToast],
  );

  useEffect(
    () => () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    },
    [],
  );

  const handleSettingsChange = useCallback(
    (patch: SettingsPatch) => {
      applyTeacherPatch(patch);
      scheduleSave(patch);
    },
    [applyTeacherPatch, scheduleSave],
  );

  const loadSettings = useCallback(async () => {
    setLoadStatus('loading');
    try {
      const data = await api.getSettings();
      applyTeacherPatch(data.settings);
      setLoadStatus('ready');
    } catch (error) {
      setLoadStatus('error');
    }
  }, [applyTeacherPatch]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (loadStatus !== 'ready') return;
    if (autoTimeZoneRef.current) return;
    if (teacher.timezone) return;
    const resolved = getResolvedTimeZone();
    if (!resolved) return;
    autoTimeZoneRef.current = true;
    handleSettingsChange({ timezone: resolved });
  }, [handleSettingsChange, loadStatus, teacher.timezone]);

  const tabFromQuery = new URLSearchParams(location.search).get('tab');
  const pathSegments = location.pathname.split('/').filter(Boolean);
  const tabFromPath = pathSegments[0] === 'settings' && pathSegments[1] ? pathSegments[1] : null;
  const activeTab: SettingsTabId = isSettingsTab(tabFromPath)
    ? tabFromPath
    : isSettingsTab(tabFromQuery)
      ? tabFromQuery
      : 'profile';

  const showMobileList = isMobile && !tabFromPath && !tabFromQuery;

  const activeTabLabel = SETTINGS_TABS.find((tab) => tab.id === activeTab)?.label ?? 'Настройки';

  const renderModule = () => {
    if (loadStatus === 'loading') {
      return <div className={styles.loadingState}>Загрузка…</div>;
    }
    if (loadStatus === 'error') {
      return (
        <div className={styles.errorState}>
          Не удалось загрузить настройки.
          <button className={controls.secondaryButton} type="button" onClick={loadSettings}>
            Повторить
          </button>
        </div>
      );
    }

    switch (activeTab) {
      case 'profile':
        return <ProfileSettings teacher={teacher} onChange={handleSettingsChange} timeZoneOptions={timeZoneOptions} />;
      case 'schedule':
        return (
          <ScheduleSettings
            teacher={teacher}
            onChange={handleSettingsChange}
            onComingSoonClick={() =>
              showToast({ message: 'Скоро, в следующих обновлениях', variant: 'success' })
            }
          />
        );
      case 'notifications':
        return <NotificationsSettings teacher={teacher} onChange={handleSettingsChange} onSaveNow={saveSettingsNow} />;
      case 'security':
        return <SecuritySettings />;
      default:
        return null;
    }
  };

  return (
    <section className={styles.page}>
      {showMobileList ? (
        <div className={styles.moduleStack}>
          <div className={`${styles.card} ${styles.mobileList}`}>
            {SETTINGS_TABS.map((tab) => (
              <button
                key={tab.id}
                className={styles.mobileItem}
                type="button"
                onClick={() => navigate(`/settings/${tab.id}`)}
              >
                {tab.label}
                <ChevronRightIcon width={20} height={20} />
              </button>
            ))}
          </div>
          {loadStatus === 'loading' && <div className={styles.loadingState}>Загрузка…</div>}
          {loadStatus === 'error' && (
            <div className={styles.errorState}>
              Не удалось загрузить настройки.
              <button className={controls.secondaryButton} type="button" onClick={loadSettings}>
                Повторить
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.layout}>
          {!isMobile && (
            <nav className={styles.card}>
              <div className={styles.navList}>
                {SETTINGS_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    className={`${styles.navItem} ${activeTab === tab.id ? styles.navItemActive : ''}`}
                    type="button"
                    onClick={() => navigate(`/settings/${tab.id}`)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </nav>
          )}

          <div className={`${styles.card} ${styles.moduleContent}`}>
            <div className={styles.moduleHeader}>
              {isMobile && (
                <button className={styles.backButton} type="button" onClick={() => navigate('/settings')}>
                  <ChevronLeftIcon width={20} height={20} />
                </button>
              )}
              <h3>{activeTabLabel}</h3>
              {saveStatus === 'saving' && <span className={styles.helperText}>Сохраняем…</span>}
            </div>
            {renderModule()}
            {saveStatus === 'error' && <div className={styles.helperText}>Ошибка сохранения.</div>}
          </div>
        </div>
      )}
    </section>
  );
};

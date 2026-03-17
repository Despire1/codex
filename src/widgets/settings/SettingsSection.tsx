import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Teacher, TeacherStudent, WeekendConflictPreview } from '../../entities/types';
import { ChevronLeftIcon, ChevronRightIcon } from '../../icons/MaterialIcons';
import { api, UpdateSettingsSuccessResponse } from '../../shared/api/client';
import { pluralizeRu } from '../../shared/lib/pluralizeRu';
import { formatTimeZoneLabel, getResolvedTimeZone, getTimeZoneOptions } from '../../shared/lib/timezones';
import { useToast } from '../../shared/lib/toast';
import { useIsMobile } from '../../shared/lib/useIsMobile';
import controls from '../../shared/styles/controls.module.css';
import { DialogModal } from '../../shared/ui/Modal/DialogModal';
import { SETTINGS_TABS, SettingsTabId } from './constants';
import { NotificationsSettings } from './components/NotificationsSettings';
import { ProfileSettings } from './components/ProfileSettings';
import { ScheduleSettings } from './components/ScheduleSettings';
import { SecuritySettings } from './components/SecuritySettings';
import styles from './SettingsSection.module.css';

interface SettingsSectionProps {
  teacher: Teacher;
  onTeacherChange: (teacher: Teacher) => void;
  onLinksPatched?: (links: TeacherStudent[]) => void;
  onLessonsRemoved?: (lessonIds: number[]) => void;
  onNavigate?: (to: string) => void;
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
    | 'weekendWeekdays'
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
    | 'homeworkNotifyOnAssign'
    | 'homeworkReminder24hEnabled'
    | 'homeworkReminderMorningEnabled'
    | 'homeworkReminderMorningTime'
    | 'homeworkReminder3hEnabled'
    | 'homeworkOverdueRemindersEnabled'
    | 'homeworkOverdueReminderTime'
    | 'homeworkOverdueReminderMaxCount'
  >
>;

const isSettingsTab = (value: string | null): value is SettingsTabId => SETTINGS_TABS.some((tab) => tab.id === value);

const hasPatchValues = (patch: SettingsPatch) => Object.keys(patch).length > 0;
const isWeekendConflictResponse = (
  response: Awaited<ReturnType<typeof api.updateSettings>>,
): response is Extract<Awaited<ReturnType<typeof api.updateSettings>>, { requiresWeekendConflictConfirmation: true }> =>
  'requiresWeekendConflictConfirmation' in response && response.requiresWeekendConflictConfirmation;

const buildWeekendConflictMessage = (conflict: WeekendConflictPreview) => {
  const lines = [
    `На выбранные выходные уже назначено ${pluralizeRu(conflict.conflictingLessonsCount, {
      one: 'будущий урок',
      few: 'будущих урока',
      many: 'будущих уроков',
    })}.`,
  ];

  if (conflict.paidLessonsCount > 0) {
    lines.push(
      `Оплачено: ${pluralizeRu(conflict.paidLessonsCount, {
        one: 'урок',
        few: 'урока',
        many: 'уроков',
      })}. На баланс вернётся ${pluralizeRu(conflict.refundAmount, {
        one: 'занятие',
        few: 'занятия',
        many: 'занятий',
      })}.`,
    );
  } else {
    lines.push('Оплаченных уроков среди них нет.');
  }

  if (conflict.affectedRecurringSeriesCount > 0) {
    lines.push(
      `Серии будут обновлены: ${pluralizeRu(conflict.seriesToUpdateCount, {
        one: 'серия',
        few: 'серии',
        many: 'серий',
      })}. Остановлены: ${pluralizeRu(conflict.seriesToStopCount, {
        one: 'серия',
        few: 'серии',
        many: 'серий',
      })}.`,
    );
  }

  if (conflict.affectedDates.length > 0) {
    const previewDates = conflict.affectedDates.slice(0, 5).join(', ');
    const moreSuffix =
      conflict.affectedDates.length > 5
        ? ` и ещё ${conflict.affectedDates.length - 5}`
        : '';
    lines.push(`Даты: ${previewDates}${moreSuffix}.`);
  }

  lines.push('Продолжить и применить выходные дни?');

  return lines.join('\n');
};

export const SettingsSection: FC<SettingsSectionProps> = ({
  teacher,
  onTeacherChange,
  onLinksPatched,
  onLessonsRemoved,
  onNavigate,
}) => {
  const navigate = onNavigate ?? useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const isMobile = useIsMobile(720);
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const teacherRef = useRef(teacher);
  const pendingPatchRef = useRef<SettingsPatch>({});
  const saveTimerRef = useRef<number | null>(null);
  const autoTimeZoneRef = useRef(false);
  const [weekendConflict, setWeekendConflict] = useState<WeekendConflictPreview | null>(null);
  const [pendingWeekendWeekdays, setPendingWeekendWeekdays] = useState<number[] | null>(null);

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

  const applySettingsSuccess = useCallback(
    (data: UpdateSettingsSuccessResponse, successMessage = 'Сохранено') => {
      applyTeacherPatch(data.settings);
      if (data.links && data.links.length > 0) {
        onLinksPatched?.(data.links);
      }
      if (data.removedLessonIds && data.removedLessonIds.length > 0) {
        onLessonsRemoved?.(data.removedLessonIds);
      }
      setWeekendConflict(null);
      setPendingWeekendWeekdays(null);
      setSaveStatus('idle');
      showToast({ message: successMessage, variant: 'success' });
    },
    [applyTeacherPatch, onLessonsRemoved, onLinksPatched, showToast],
  );

  const savePendingPatch = useCallback(async () => {
    const patch = pendingPatchRef.current;
    pendingPatchRef.current = {};
    if (!hasPatchValues(patch)) {
      return { ok: true } as const;
    }
    setSaveStatus('saving');
    try {
      const data = await api.updateSettings(patch);
      if (isWeekendConflictResponse(data)) {
        setSaveStatus('idle');
        setWeekendConflict(data.conflict);
        return { ok: false, error: 'weekend_confirmation_required' } as const;
      }
      applySettingsSuccess(data);
      return { ok: true } as const;
    } catch (error) {
      setSaveStatus('error');
      showToast({ message: 'Не удалось сохранить изменения', variant: 'error' });
      return { ok: false, error: 'save_failed' } as const;
    }
  }, [applySettingsSuccess, showToast]);

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
      if (!hasPatchValues(nextPatch)) {
        return { ok: true } as const;
      }
      setSaveStatus('saving');
      try {
        const data = await api.updateSettings(nextPatch);
        if (isWeekendConflictResponse(data)) {
          setSaveStatus('idle');
          setWeekendConflict(data.conflict);
          return { ok: false, error: 'weekend_confirmation_required' } as const;
        }
        applySettingsSuccess(data);
        return { ok: true } as const;
      } catch (error) {
        setSaveStatus('error');
        showToast({ message: 'Не удалось сохранить изменения', variant: 'error' });
        return { ok: false, error: 'save_failed' } as const;
      }
    },
    [applySettingsSuccess, showToast],
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

  const saveWeekendWeekdays = useCallback(
    async (weekendWeekdays: number[], confirmWeekendConflicts = false) => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      const pendingSaveResult = await savePendingPatch();
      if (!pendingSaveResult.ok) {
        return false;
      }

      setSaveStatus('saving');
      try {
        const data = await api.updateSettings({ weekendWeekdays, confirmWeekendConflicts });
        if (isWeekendConflictResponse(data)) {
          setWeekendConflict(data.conflict);
          setPendingWeekendWeekdays(weekendWeekdays);
          setSaveStatus('idle');
          return false;
        }

        const successMessage =
          data.removedLessonIds && data.removedLessonIds.length > 0
            ? `Выходные сохранены. Отменено ${pluralizeRu(data.removedLessonIds.length, {
                one: 'занятие',
                few: 'занятия',
                many: 'занятий',
              })}.`
            : 'Выходные сохранены';
        applySettingsSuccess(data, successMessage);
        return true;
      } catch (error) {
        setSaveStatus('error');
        showToast({ message: 'Не удалось сохранить выходные дни', variant: 'error' });
        return false;
      }
    },
    [applySettingsSuccess, savePendingPatch, showToast],
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
            onSaveWeekendWeekdays={saveWeekendWeekdays}
            isWeekendSaving={saveStatus === 'saving'}
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
      <DialogModal
        open={Boolean(weekendConflict)}
        title="Подтвердите выходные дни"
        description={weekendConflict ? buildWeekendConflictMessage(weekendConflict) : ''}
        confirmText="Подтвердить и отменить"
        cancelText="Отмена"
        onClose={() => {
          if (saveStatus === 'saving') return;
          setWeekendConflict(null);
          setPendingWeekendWeekdays(null);
        }}
        onCancel={() => {
          setWeekendConflict(null);
          setPendingWeekendWeekdays(null);
        }}
        onConfirm={async () => {
          if (!pendingWeekendWeekdays) return;
          await saveWeekendWeekdays(pendingWeekendWeekdays, true);
        }}
      />
    </section>
  );
};

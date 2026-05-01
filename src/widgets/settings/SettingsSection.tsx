import { FC, SVGProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Teacher, TeacherStudent, WeekendConflictPreview } from '../../entities/types';
import {
  CalendarIcon,
  CheckCircleOutlineIcon,
  NotificationsNoneOutlinedIcon,
  PaletteIcon,
  PersonOutlineIcon,
  SettingsIcon,
} from '../../icons/MaterialIcons';
import { api, UpdateSettingsSuccessResponse } from '../../shared/api/client';
import { pluralizeRu } from '../../shared/lib/pluralizeRu';
import { formatTimeZoneLabel, getResolvedTimeZone, getTimeZoneOptions } from '../../shared/lib/timezones';
import { useToast } from '../../shared/lib/toast';
import { useIsMobile } from '../../shared/lib/useIsMobile';
import { useUnsavedChanges } from '../../shared/lib/unsavedChanges';
import controls from '../../shared/styles/controls.module.css';
import { DialogModal } from '../../shared/ui/Modal/DialogModal';
import { SETTINGS_TABS, SettingsTabId, VISIBLE_SETTINGS_TABS } from './constants';
import { AppearanceSettings } from './components/AppearanceSettings';
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
    | 'name'
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

// Поля которые редактируются через общий Save/Cancel (исключены: шаблоны — у них свой UX,
// security alerts — мгновенный API в SecuritySettings, тема — Redux only).
const GLOBAL_DRAFT_FIELDS: ReadonlyArray<keyof SettingsPatch> = [
  'name',
  'timezone',
  'receiptEmail',
  'defaultLessonDuration',
  'autoConfirmLessons',
  'weekendWeekdays',
  'lessonReminderEnabled',
  'lessonReminderMinutes',
  'dailySummaryEnabled',
  'dailySummaryTime',
  'tomorrowSummaryEnabled',
  'tomorrowSummaryTime',
  'studentNotificationsEnabled',
  'globalPaymentRemindersEnabled',
  'paymentReminderDelayHours',
  'paymentReminderRepeatHours',
  'paymentReminderMaxCount',
  'notifyTeacherOnAutoPaymentReminder',
  'notifyTeacherOnManualPaymentReminder',
  'homeworkNotifyOnAssign',
  'homeworkReminder24hEnabled',
  'homeworkReminderMorningEnabled',
  'homeworkReminderMorningTime',
  'homeworkReminder3hEnabled',
  'homeworkOverdueRemindersEnabled',
  'homeworkOverdueReminderTime',
  'homeworkOverdueReminderMaxCount',
];

type TabMeta = {
  icon: (props: SVGProps<SVGSVGElement>) => JSX.Element;
  badge?: string;
};

const SETTINGS_TAB_META: Record<SettingsTabId, TabMeta> = {
  profile: {
    icon: PersonOutlineIcon,
  },
  schedule: {
    icon: CalendarIcon,
  },
  notifications: {
    icon: NotificationsNoneOutlinedIcon,
  },
  appearance: {
    icon: PaletteIcon,
  },
  security: {
    icon: SettingsIcon,
  },
};

const isSettingsTab = (value: string | null): value is SettingsTabId => SETTINGS_TABS.some((tab) => tab.id === value);

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
    const moreSuffix = conflict.affectedDates.length > 5 ? ` и ещё ${conflict.affectedDates.length - 5}` : '';
    lines.push(`Даты: ${previewDates}${moreSuffix}.`);
  }

  lines.push('Продолжить и применить выходные дни?');

  return lines.join('\n');
};

const getTeacherInitials = (teacher: Teacher) => {
  const parts = teacher.name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return 'TP';
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
};

const DEFAULT_PRICE_STORAGE_KEY = 'tb_default_student_price';

const readSavedDefaultPrice = () => {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(DEFAULT_PRICE_STORAGE_KEY) ?? '';
};

const validateDefaultPrice = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 'Введите неотрицательное число';
  }
  return null;
};

const persistDefaultPrice = (value: string) => {
  if (typeof window === 'undefined') return;
  const trimmed = value.trim();
  if (!trimmed) {
    window.localStorage.removeItem(DEFAULT_PRICE_STORAGE_KEY);
    return;
  }
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || numeric < 0) return;
  window.localStorage.setItem(DEFAULT_PRICE_STORAGE_KEY, String(Math.round(numeric)));
};

const isWeekendListEqual = (left: number[], right: number[]) => {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
};

const computeDraftPatch = (draft: Teacher, base: Teacher): SettingsPatch => {
  const patch: SettingsPatch = {};
  for (const field of GLOBAL_DRAFT_FIELDS) {
    const draftValue = draft[field];
    const baseValue = base[field];
    if (field === 'weekendWeekdays') {
      const draftWeekends = (draftValue as number[]) ?? [];
      const baseWeekends = (baseValue as number[]) ?? [];
      if (!isWeekendListEqual(draftWeekends, baseWeekends)) {
        (patch as Record<string, unknown>)[field] = draftWeekends;
      }
      continue;
    }
    if (draftValue !== baseValue) {
      (patch as Record<string, unknown>)[field] = draftValue;
    }
  }
  return patch;
};

export const SettingsSection: FC<SettingsSectionProps> = ({
  teacher,
  onTeacherChange,
  onLinksPatched,
  onLessonsRemoved,
  onNavigate,
}) => {
  const routerNavigate = useNavigate();
  const navigate = onNavigate ?? routerNavigate;
  const location = useLocation();
  const { showToast } = useToast();
  const isMobile = useIsMobile(720);
  const { setEntry, clearEntry } = useUnsavedChanges();
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [draft, setDraft] = useState<Teacher>(teacher);
  const draftRef = useRef(draft);
  const teacherRef = useRef(teacher);
  const autoTimeZoneRef = useRef(false);
  const [savedDefaultPrice, setSavedDefaultPrice] = useState<string>(readSavedDefaultPrice);
  const [defaultPriceDraft, setDefaultPriceDraft] = useState<string>(savedDefaultPrice);
  const defaultPriceDraftRef = useRef(defaultPriceDraft);
  const defaultPriceError = useMemo(() => validateDefaultPrice(defaultPriceDraft), [defaultPriceDraft]);
  const isDefaultPriceDirty = defaultPriceDraft.trim() !== savedDefaultPrice.trim();
  // true если юзер сам что-то редактировал — иначе разрешаем перезаписывать draft
  // при обновлении teacher извне (bootstrap, refresh из других секций приложения).
  const userDidEditRef = useRef(false);
  const [weekendConflict, setWeekendConflict] = useState<WeekendConflictPreview | null>(null);
  const pendingConflictPatchRef = useRef<SettingsPatch | null>(null);
  const [isFormValid, setIsFormValid] = useState(true);
  const validationErrorsRef = useRef<Record<string, string | null>>({});

  useEffect(() => {
    teacherRef.current = teacher;
  }, [teacher]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    defaultPriceDraftRef.current = defaultPriceDraft;
  }, [defaultPriceDraft]);

  // Если юзер ещё ничего не редактировал — синхронизируем draft с teacher.
  // Это покрывает: bootstrap из AppPage, обновления teacher из других экранов.
  // После первого редактирования (userDidEditRef=true) draft трогать нельзя —
  // иначе пользователь потеряет введённые значения; sync делаем явно в save/cancel.
  useEffect(() => {
    if (userDidEditRef.current) return;
    setDraft(teacher);
  }, [teacher]);

  const timeZoneOptions = useMemo(() => {
    const options = getTimeZoneOptions();
    if (draft.timezone && !options.some((option) => option.value === draft.timezone)) {
      return [{ value: draft.timezone, label: formatTimeZoneLabel(draft.timezone) }, ...options];
    }
    return options;
  }, [draft.timezone]);

  const draftPatch = useMemo(() => computeDraftPatch(draft, teacher), [draft, teacher]);
  const isDirty = Object.keys(draftPatch).length > 0 || isDefaultPriceDirty;
  const formHasErrors = !isFormValid || Boolean(defaultPriceError);

  const handleDraftChange = useCallback((partial: Partial<Teacher>) => {
    userDidEditRef.current = true;
    setDraft((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleDefaultPriceChange = useCallback((value: string) => {
    userDidEditRef.current = true;
    setDefaultPriceDraft(value);
  }, []);

  const handleValidationChange = useCallback((key: string, error: string | null) => {
    const prevErrors = validationErrorsRef.current;
    if ((prevErrors[key] ?? null) === error) return;
    const nextErrors = { ...prevErrors, [key]: error };
    validationErrorsRef.current = nextErrors;
    const hasErrors = Object.values(nextErrors).some((value) => Boolean(value));
    setIsFormValid(!hasErrors);
  }, []);

  const applySettingsSuccess = useCallback(
    (data: UpdateSettingsSuccessResponse, successMessage = 'Сохранено') => {
      // Бэк возвращает не все поля (например, name отсутствует в data.settings),
      // поэтому накатываем сначала draft (что отправил пользователь), затем серверный ответ —
      // чтобы серверные значения перебили клиентские, но клиентские не пропали.
      const nextTeacher: Teacher = { ...teacherRef.current, ...draftRef.current, ...data.settings };
      onTeacherChange(nextTeacher);
      setDraft(nextTeacher);
      if (data.links && data.links.length > 0) {
        onLinksPatched?.(data.links);
      }
      if (data.removedLessonIds && data.removedLessonIds.length > 0) {
        onLessonsRemoved?.(data.removedLessonIds);
      }
      setWeekendConflict(null);
      pendingConflictPatchRef.current = null;
      userDidEditRef.current = false;
      setSaveStatus('idle');
      showToast({ message: successMessage, variant: 'success' });
    },
    [onLessonsRemoved, onLinksPatched, onTeacherChange, showToast],
  );

  const executeSavePatch = useCallback(
    async (
      patch: SettingsPatch,
      options?: { confirmWeekendConflicts?: boolean; successMessage?: string },
    ): Promise<{ ok: true } | { ok: false; reason: 'conflict' | 'failed' }> => {
      if (Object.keys(patch).length === 0) {
        return { ok: true };
      }
      setSaveStatus('saving');
      try {
        const data = await api.updateSettings({
          ...patch,
          ...(options?.confirmWeekendConflicts ? { confirmWeekendConflicts: true } : {}),
        });
        if (isWeekendConflictResponse(data)) {
          setSaveStatus('idle');
          setWeekendConflict(data.conflict);
          pendingConflictPatchRef.current = patch;
          return { ok: false, reason: 'conflict' };
        }
        const successMessage =
          options?.successMessage ??
          (data.removedLessonIds && data.removedLessonIds.length > 0
            ? `Сохранено. Отменено ${pluralizeRu(data.removedLessonIds.length, {
                one: 'занятие',
                few: 'занятия',
                many: 'занятий',
              })}.`
            : 'Настройки сохранены');
        applySettingsSuccess(data, successMessage);
        return { ok: true };
      } catch (_error) {
        setSaveStatus('error');
        showToast({ message: 'Не удалось сохранить изменения', variant: 'error' });
        return { ok: false, reason: 'failed' };
      }
    },
    [applySettingsSuccess, showToast],
  );

  const handleSave = useCallback(async (): Promise<boolean> => {
    const priceError = validateDefaultPrice(defaultPriceDraftRef.current);
    if (!isFormValid || priceError) {
      showToast({ message: 'Исправьте ошибки в форме перед сохранением', variant: 'error' });
      return false;
    }
    const patch = computeDraftPatch(draftRef.current, teacherRef.current);
    const priceDirty = defaultPriceDraftRef.current.trim() !== savedDefaultPrice.trim();
    if (Object.keys(patch).length > 0) {
      const result = await executeSavePatch(patch);
      if (!result.ok) return false;
    }
    if (priceDirty) {
      persistDefaultPrice(defaultPriceDraftRef.current);
      setSavedDefaultPrice(defaultPriceDraftRef.current);
      // Если был только локальный patch (бэк не дёргали) — нужен свой toast и сброс userDidEdit.
      if (Object.keys(patch).length === 0) {
        showToast({ message: 'Цена по умолчанию сохранена', variant: 'success' });
        userDidEditRef.current = false;
      }
    }
    return true;
  }, [executeSavePatch, isFormValid, savedDefaultPrice, showToast]);

  const handleCancel = useCallback(() => {
    setDraft(teacherRef.current);
    setDefaultPriceDraft(savedDefaultPrice);
    userDidEditRef.current = false;
    setSaveStatus('idle');
  }, [savedDefaultPrice]);

  // Шаблоны (StudentNotificationTemplates) сохраняются отдельно через свой механизм
  // и не входят в общий draft — оставляем им маленький helper.
  const saveTemplatesPatch = useCallback(
    async (patch: SettingsPatch): Promise<{ ok: boolean; error?: string }> => {
      if (Object.keys(patch).length === 0) {
        return { ok: true };
      }
      setSaveStatus('saving');
      try {
        const data = await api.updateSettings(patch);
        if (isWeekendConflictResponse(data)) {
          setSaveStatus('idle');
          return { ok: false, error: 'weekend_confirmation_required' };
        }
        applySettingsSuccess(data, 'Шаблон сохранён');
        return { ok: true };
      } catch (_error) {
        setSaveStatus('error');
        showToast({ message: 'Не удалось сохранить шаблон', variant: 'error' });
        return { ok: false, error: 'save_failed' };
      }
    },
    [applySettingsSuccess, showToast],
  );

  // Регистрируем единый form-guard в UnsavedChangesProvider —
  // блокировка навигации и beforeunload будут срабатывать автоматически.
  useEffect(() => {
    if (!isDirty) {
      clearEntry('settings-form');
      return undefined;
    }
    setEntry('settings-form', {
      isDirty: true,
      onSave: handleSave,
      onDiscard: handleCancel,
      title: 'Несохранённые изменения',
      message: 'Вы изменили настройки, но не нажали «Сохранить». Сохранить перед выходом?',
      confirmText: 'Сохранить',
      cancelText: 'Выйти без сохранения',
      onSaveErrorMessage: 'Не удалось сохранить настройки',
    });
    return () => clearEntry('settings-form');
  }, [clearEntry, handleCancel, handleSave, isDirty, setEntry]);

  const loadSettings = useCallback(async () => {
    setLoadStatus('loading');
    try {
      const data = await api.getSettings();
      const next: Teacher = { ...teacherRef.current, ...data.settings };
      onTeacherChange(next);
      setDraft(next);
      setLoadStatus('ready');
    } catch (_error) {
      setLoadStatus('error');
    }
  }, [onTeacherChange]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Автодетект таймзоны при первой загрузке — пишем напрямую на сервер,
  // минуя draft, чтобы не заставлять юзера видеть dirty-форму без явного действия.
  useEffect(() => {
    if (loadStatus !== 'ready') return;
    if (autoTimeZoneRef.current) return;
    if (teacher.timezone) return;
    const resolved = getResolvedTimeZone();
    if (!resolved) return;
    autoTimeZoneRef.current = true;
    api
      .updateSettings({ timezone: resolved })
      .then((data) => {
        if (isWeekendConflictResponse(data)) return;
        const next: Teacher = { ...teacherRef.current, ...data.settings };
        onTeacherChange(next);
        setDraft(next);
      })
      .catch(() => {
        autoTimeZoneRef.current = false;
      });
  }, [loadStatus, onTeacherChange, teacher.timezone]);

  const tabFromQuery = new URLSearchParams(location.search).get('tab');
  const pathSegments = location.pathname.split('/').filter(Boolean);
  const tabFromPath = pathSegments[0] === 'settings' && pathSegments[1] ? pathSegments[1] : null;
  const activeTab: SettingsTabId = isSettingsTab(tabFromPath)
    ? tabFromPath
    : isSettingsTab(tabFromQuery)
      ? tabFromQuery
      : 'profile';

  const showMobileList = isMobile && !tabFromPath && !tabFromQuery;
  const showFormFooter = isDirty || saveStatus === 'saving' || saveStatus === 'error';

  const renderModule = () => {
    if (loadStatus === 'loading') {
      return <div className={styles.loadingState}>Загрузка…</div>;
    }
    if (loadStatus === 'error') {
      return (
        <div className={styles.errorState}>
          Не удалось загрузить настройки.
          <button
            className={`${controls.secondaryButton} ${styles.headerSecondaryButton}`}
            type="button"
            onClick={loadSettings}
          >
            Повторить
          </button>
        </div>
      );
    }

    switch (activeTab) {
      case 'profile':
        return (
          <ProfileSettings
            teacher={draft}
            onChange={handleDraftChange}
            onValidationChange={handleValidationChange}
            timeZoneOptions={timeZoneOptions}
            initials={getTeacherInitials(draft)}
            disabled={saveStatus === 'saving'}
          />
        );
      case 'schedule':
        return (
          <ScheduleSettings
            teacher={draft}
            onChange={handleDraftChange}
            defaultPriceDraft={defaultPriceDraft}
            onDefaultPriceChange={handleDefaultPriceChange}
            defaultPriceError={defaultPriceError}
            disabled={saveStatus === 'saving'}
            onComingSoonClick={() => showToast({ message: 'Скоро, в следующих обновлениях', variant: 'success' })}
          />
        );
      case 'notifications':
        return (
          <NotificationsSettings
            teacher={draft}
            savedTeacher={teacher}
            onChange={handleDraftChange}
            onSaveTemplates={saveTemplatesPatch}
            disabled={saveStatus === 'saving'}
          />
        );
      case 'appearance':
        return <AppearanceSettings />;
      case 'security':
        return <SecuritySettings />;
      default:
        return null;
    }
  };

  const sidebarNav = (
    <>
      <div className={styles.sidebarNav}>
        {VISIBLE_SETTINGS_TABS.map((tab) => {
          const meta = SETTINGS_TAB_META[tab.id];
          const Icon = meta.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              className={`${styles.sidebarButton} ${isActive ? styles.sidebarButtonActive : ''}`}
              type="button"
              onClick={() => navigate(`/settings/${tab.id}`)}
            >
              <span className={styles.sidebarButtonIcon}>
                <Icon width={18} height={18} />
              </span>
              <span className={styles.sidebarButtonCopy}>
                <span className={styles.sidebarButtonLabel}>{tab.label}</span>
              </span>
              {meta.badge ? <span className={styles.sidebarBadge}>{meta.badge}</span> : null}
            </button>
          );
        })}
      </div>

      <div className={styles.sidebarFooterCard}>
        <div className={styles.sidebarFooterTitleRow}>
          <span className={styles.sidebarFooterIcon}>
            <CheckCircleOutlineIcon width={18} height={18} />
          </span>
          <span className={styles.sidebarFooterTitle}>Совет</span>
        </div>
        <p className={styles.sidebarFooterText}>
          Настройте автоматические напоминания, чтобы не забывать о важных событиях.
        </p>
        <a
          className={styles.sidebarFooterLink}
          href="https://t.me/teacherbot_help"
          target="_blank"
          rel="noopener noreferrer"
        >
          Сообщить о проблеме →
        </a>
      </div>
    </>
  );

  // Tabs без редактируемых полей (appearance, security) не должны показывать общий footer:
  // в Appearance тема применяется мгновенно и draft там пуст, а в Security всё через свой API.
  const tabsWithGlobalForm: SettingsTabId[] = ['profile', 'schedule', 'notifications'];
  const footerVisible = showFormFooter && tabsWithGlobalForm.includes(activeTab);

  return (
    <section className={`${styles.page} ${footerVisible ? styles.pageWithFooter : ''}`}>
      {showMobileList ? (
        <div className={styles.mobileOverview}>
          <div className={styles.mobileSidebarCard}>{sidebarNav}</div>
          <a
            className={styles.mobileHelpCard}
            href="https://t.me/teacherbot_help"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className={styles.mobileHelpIcon} aria-hidden>
              ?
            </span>
            <span className={styles.mobileHelpCopy}>
              <strong>Помощь и поддержка</strong>
              <span>Связаться с нами в Telegram</span>
            </span>
            <span className={styles.mobileHelpArrow} aria-hidden>
              →
            </span>
          </a>
          {loadStatus === 'loading' && <div className={styles.loadingState}>Загрузка…</div>}
          {loadStatus === 'error' && (
            <div className={styles.errorState}>
              Не удалось загрузить настройки.
              <button
                className={`${controls.secondaryButton} ${styles.headerSecondaryButton}`}
                type="button"
                onClick={loadSettings}
              >
                Повторить
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.layout}>
          {!isMobile && <aside className={styles.sidebar}>{sidebarNav}</aside>}

          <div className={styles.moduleShell}>
            {renderModule()}
            {saveStatus === 'error' && (
              <div className={styles.saveErrorNote}>Ошибка сохранения. Попробуйте ещё раз.</div>
            )}
          </div>
        </div>
      )}

      {footerVisible ? (
        <div className={styles.formFooter} role="region" aria-label="Несохранённые изменения настроек">
          <div className={styles.formFooterInner}>
            <div className={styles.formFooterStatus} aria-live="polite">
              {saveStatus === 'saving'
                ? 'Сохраняем…'
                : saveStatus === 'error'
                  ? 'Не удалось сохранить — проверьте подключение и попробуйте ещё раз.'
                  : formHasErrors
                    ? 'Есть ошибки в полях — исправьте их перед сохранением.'
                    : 'Есть несохранённые изменения.'}
            </div>
            <div className={styles.formFooterActions}>
              <button
                type="button"
                className={styles.formFooterCancel}
                onClick={handleCancel}
                disabled={saveStatus === 'saving' || !isDirty}
              >
                Отменить
              </button>
              <button
                type="button"
                className={styles.formFooterSave}
                onClick={() => void handleSave()}
                disabled={!isDirty || formHasErrors || saveStatus === 'saving'}
              >
                <CheckCircleOutlineIcon width={18} height={18} />
                <span>{saveStatus === 'saving' ? 'Сохраняем…' : 'Сохранить'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <DialogModal
        open={Boolean(weekendConflict)}
        title="Подтвердите выходные дни"
        description={weekendConflict ? buildWeekendConflictMessage(weekendConflict) : ''}
        confirmText="Подтвердить и отменить"
        cancelText="Отмена"
        onClose={() => {
          if (saveStatus === 'saving') return;
          setWeekendConflict(null);
          pendingConflictPatchRef.current = null;
        }}
        onCancel={() => {
          setWeekendConflict(null);
          pendingConflictPatchRef.current = null;
        }}
        onConfirm={async () => {
          const pendingPatch = pendingConflictPatchRef.current;
          if (!pendingPatch) return;
          await executeSavePatch(pendingPatch, { confirmWeekendConflicts: true });
        }}
      />
    </section>
  );
};

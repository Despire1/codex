import { FC, useEffect, useMemo, useState } from 'react';
import { Teacher } from '../../../entities/types';
import {
  CalendarIcon,
  CalendarWeekReferenceIcon,
  CheckCircleOutlineIcon,
  ExpandLessOutlinedIcon,
  ExpandMoreOutlinedIcon,
} from '../../../icons/MaterialIcons';
import { useToast } from '../../../shared/lib/toast';
import { useUnsavedChanges } from '../../../shared/lib/unsavedChanges';
import { formatWeekdayShortList, normalizeWeekdayList } from '../../../shared/lib/weekdays';
import controls from '../../../shared/styles/controls.module.css';
import { WeekdayToggleGroup } from '../../../shared/ui/WeekdayToggleGroup';
import styles from '../SettingsSection.module.css';

interface ScheduleSettingsProps {
  teacher: Teacher;
  onChange: (patch: Partial<Teacher>) => void;
  onSaveNow: (patch: Partial<Teacher>) => Promise<{ ok: boolean; error?: string }>;
  onSaveWeekendWeekdays: (weekendWeekdays: number[]) => Promise<boolean>;
  isWeekendSaving: boolean;
  onComingSoonClick: () => void;
}

const MIN_LESSON_DURATION = 15;
const MAX_LESSON_DURATION = 240;

export const ScheduleSettings: FC<ScheduleSettingsProps> = ({
  teacher,
  onChange,
  onSaveNow,
  onSaveWeekendWeekdays,
  isWeekendSaving,
  onComingSoonClick,
}) => {
  const { setEntry, clearEntry } = useUnsavedChanges();
  const { showToast } = useToast();
  const [weekendsExpanded, setWeekendsExpanded] = useState(Boolean(teacher.weekendWeekdays.length));
  const [weekendDraft, setWeekendDraft] = useState(() => normalizeWeekdayList(teacher.weekendWeekdays));
  const [durationDraft, setDurationDraft] = useState(() => String(teacher.defaultLessonDuration));
  const [isDurationSaving, setIsDurationSaving] = useState(false);
  const [defaultPriceDraft, setDefaultPriceDraft] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem('tb_default_student_price') ?? '';
  });
  const handleSaveDefaultPrice = () => {
    if (typeof window === 'undefined') return;
    const trimmed = defaultPriceDraft.trim();
    if (!trimmed) {
      window.localStorage.removeItem('tb_default_student_price');
      showToast({ message: 'Цена по умолчанию очищена', variant: 'success' });
      return;
    }
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric) || numeric < 0) {
      showToast({ message: 'Введите неотрицательное число', variant: 'error' });
      return;
    }
    window.localStorage.setItem('tb_default_student_price', String(Math.round(numeric)));
    showToast({ message: 'Цена по умолчанию сохранена', variant: 'success' });
  };
  const isWeekendDirty = useMemo(() => {
    const saved = normalizeWeekdayList(teacher.weekendWeekdays);
    return saved.length !== weekendDraft.length || saved.some((weekday, index) => weekday !== weekendDraft[index]);
  }, [teacher.weekendWeekdays, weekendDraft]);
  const weekendSummary = useMemo(() => {
    const normalizedWeekends = normalizeWeekdayList(weekendDraft);
    return normalizedWeekends.length > 0 ? formatWeekdayShortList(normalizedWeekends) : 'Не выбраны';
  }, [weekendDraft]);

  useEffect(() => {
    if (teacher.weekendWeekdays.length > 0) {
      setWeekendsExpanded(true);
    }
  }, [teacher.weekendWeekdays.length]);

  useEffect(() => {
    setWeekendDraft(normalizeWeekdayList(teacher.weekendWeekdays));
  }, [teacher.weekendWeekdays]);

  useEffect(() => {
    setDurationDraft(String(teacher.defaultLessonDuration));
  }, [teacher.defaultLessonDuration]);

  const parsedDurationDraft = useMemo(() => {
    const trimmed = durationDraft.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) return null;
    return Math.round(numeric);
  }, [durationDraft]);

  const isDurationDirty = durationDraft.trim() !== String(teacher.defaultLessonDuration);
  const isDurationValid =
    parsedDurationDraft !== null &&
    parsedDurationDraft >= MIN_LESSON_DURATION &&
    parsedDurationDraft <= MAX_LESSON_DURATION;

  const saveDuration = async () => {
    if (!isDurationDirty || !isDurationValid || parsedDurationDraft === null) return;
    setIsDurationSaving(true);
    const result = await onSaveNow({ defaultLessonDuration: parsedDurationDraft });
    setIsDurationSaving(false);
    if (result.ok) {
      showToast({ message: 'Длительность урока сохранена', variant: 'success' });
    }
  };

  const resetDuration = () => {
    setDurationDraft(String(teacher.defaultLessonDuration));
  };

  useEffect(() => {
    const discardWeekendChanges = () => {
      setWeekendDraft(normalizeWeekdayList(teacher.weekendWeekdays));
    };

    setEntry('settings-schedule-weekends', {
      isDirty: isWeekendDirty,
      onSave: () => onSaveWeekendWeekdays(weekendDraft),
      onDiscard: discardWeekendChanges,
      message: 'Вы изменили выходные дни. Сохранить перед выходом?',
      cancelText: 'Выйти без сохранения',
    });

    return () => clearEntry('settings-schedule-weekends');
  }, [clearEntry, isWeekendDirty, onSaveWeekendWeekdays, setEntry, teacher.weekendWeekdays, weekendDraft]);

  useEffect(() => {
    setEntry('settings-schedule-duration', {
      isDirty: isDurationDirty,
      onSave: async () => {
        if (!isDurationValid || parsedDurationDraft === null) return false;
        const result = await onSaveNow({ defaultLessonDuration: parsedDurationDraft });
        return result.ok;
      },
      onDiscard: resetDuration,
      message: 'Вы изменили длительность урока. Сохранить перед выходом?',
      cancelText: 'Выйти без сохранения',
    });

    return () => clearEntry('settings-schedule-duration');
  }, [clearEntry, isDurationDirty, isDurationValid, onSaveNow, parsedDurationDraft, setEntry]);

  return (
    <div className={styles.moduleStack}>
      <section className={styles.settingsCard}>
        <div className={styles.sectionHeader}>
          <div className={`${styles.sectionIcon} ${styles.sectionIconBlue}`}>
            <CalendarIcon width={20} height={20} />
          </div>
          <div className={styles.sectionHeaderCopy}>
            <h2 className={styles.sectionHeading}>Параметры уроков</h2>
            <p className={styles.sectionDescription}>Базовые настройки занятий</p>
          </div>
        </div>

        <div className={styles.cardStack}>
          <div className={styles.fieldBlock}>
            <label className={styles.fieldLabel}>Длительность урока по умолчанию (минут)</label>
            <input
              className={`${controls.input} ${styles.fieldInput}`}
              type="number"
              inputMode="numeric"
              min={MIN_LESSON_DURATION}
              max={MAX_LESSON_DURATION}
              step={5}
              value={durationDraft}
              onKeyDown={(event) => {
                if (event.key === '-' || event.key === 'e' || event.key === 'E') {
                  event.preventDefault();
                  return;
                }
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void saveDuration();
                }
              }}
              onChange={(event) => {
                setDurationDraft(event.target.value);
              }}
            />
            <p className={styles.fieldHint}>
              Допустимо {MIN_LESSON_DURATION}–{MAX_LESSON_DURATION} минут.
              {isDurationDirty && !isDurationValid ? ' Введите значение в этом диапазоне.' : ''}
            </p>
            {isDurationDirty ? (
              <div className={styles.fieldActionsRow}>
                <button
                  type="button"
                  className={`${controls.primaryButton} ${styles.darkActionButton}`}
                  disabled={isDurationSaving || !isDurationValid}
                  onClick={() => void saveDuration()}
                >
                  <CheckCircleOutlineIcon width={16} height={16} />
                  <span>{isDurationSaving ? 'Сохраняем…' : 'Сохранить длительность'}</span>
                </button>
                <button
                  type="button"
                  className={styles.fieldSecondaryButton}
                  disabled={isDurationSaving}
                  onClick={resetDuration}
                >
                  Отменить
                </button>
              </div>
            ) : null}
          </div>

          <div className={styles.fieldBlock}>
            <label className={styles.fieldLabel}>Цена за урок по умолчанию (₽)</label>
            <input
              className={`${controls.input} ${styles.fieldInput}`}
              type="number"
              inputMode="numeric"
              min={0}
              step={50}
              value={defaultPriceDraft}
              placeholder="Например, 1500"
              onKeyDown={(event) => {
                if (event.key === '-' || event.key === 'e' || event.key === 'E') {
                  event.preventDefault();
                  return;
                }
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleSaveDefaultPrice();
                }
              }}
              onChange={(event) => setDefaultPriceDraft(event.target.value)}
            />
            <p className={styles.fieldHint}>
              Будет автоматически подставляться в форму нового ученика. Хранится локально в браузере.
            </p>
            <div className={styles.fieldActionsRow}>
              <button
                type="button"
                className={`${controls.primaryButton} ${styles.darkActionButton}`}
                onClick={handleSaveDefaultPrice}
              >
                <CheckCircleOutlineIcon width={16} height={16} />
                <span>Сохранить цену</span>
              </button>
            </div>
          </div>

          <div className={styles.infoRow}>
            <div>
              <div className={styles.infoRowTitle}>Автоматически отмечать уроки как проведённые</div>
              <div className={styles.infoRowDescription}>Если выключено, уроки нужно подтверждать вручную.</div>
            </div>
            <label className={`${controls.switch} ${styles.switchControl}`}>
              <input
                type="checkbox"
                checked={teacher.autoConfirmLessons}
                onChange={(event) => onChange({ autoConfirmLessons: event.target.checked })}
              />
              <span className={controls.slider} />
            </label>
          </div>
        </div>
      </section>

      <section className={styles.settingsCard}>
        <div className={styles.sectionHeaderBetween}>
          <div className={styles.sectionHeaderCompact}>
            <div className={`${styles.sectionIcon} ${styles.sectionIconPurple}`}>
              <CalendarWeekReferenceIcon width={20} height={20} />
            </div>
            <div className={styles.sectionHeaderCopy}>
              <h2 className={styles.sectionHeading}>Выходные дни</h2>
              <p className={styles.sectionDescription}>Дни, когда вы не проводите занятия</p>
            </div>
          </div>

          <button
            type="button"
            className={styles.roundIconButton}
            onClick={() => setWeekendsExpanded((current) => !current)}
            aria-expanded={weekendsExpanded}
          >
            {weekendsExpanded ? (
              <ExpandLessOutlinedIcon width={18} height={18} />
            ) : (
              <ExpandMoreOutlinedIcon width={18} height={18} />
            )}
          </button>
        </div>

        {weekendsExpanded ? (
          <div className={styles.cardStack}>
            <div className={styles.weekdayPanelMeta}>
              <span className={styles.weekdayPanelLabel}>Выбранные дни</span>
              <span className={styles.weekdayPanelValue}>{weekendSummary}</span>
            </div>

            <WeekdayToggleGroup value={weekendDraft} onChange={setWeekendDraft} ariaLabel="Выберите выходные дни" />

            {weekendDraft.length >= 7 ? (
              <p className={styles.sectionDescription}>
                Все 7 дней отмечены как выходные — должен остаться хотя бы один рабочий день, иначе планировать уроки не
                получится.
              </p>
            ) : !isWeekendDirty ? (
              <p className={styles.fieldHint}>Измените выбор дней, чтобы сохранить новые выходные.</p>
            ) : null}

            <button
              type="button"
              className={`${controls.primaryButton} ${styles.darkActionButton}`}
              disabled={isWeekendSaving || !isWeekendDirty || weekendDraft.length >= 7}
              onClick={() => void onSaveWeekendWeekdays(weekendDraft)}
            >
              <CheckCircleOutlineIcon width={16} height={16} />
              <span>{isWeekendSaving ? 'Сохраняем…' : 'Сохранить выходные'}</span>
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
};

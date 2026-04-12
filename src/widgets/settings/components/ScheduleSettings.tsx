import { FC, useEffect, useMemo, useState } from 'react';
import { Teacher } from '../../../entities/types';
import {
  CalendarIcon,
  CalendarWeekReferenceIcon,
  CheckCircleOutlineIcon,
  CoffeeIcon,
  ExpandLessOutlinedIcon,
  ExpandMoreOutlinedIcon,
} from '../../../icons/MaterialIcons';
import { useUnsavedChanges } from '../../../shared/lib/unsavedChanges';
import { formatWeekdayShortList, normalizeWeekdayList } from '../../../shared/lib/weekdays';
import controls from '../../../shared/styles/controls.module.css';
import { WeekdayToggleGroup } from '../../../shared/ui/WeekdayToggleGroup';
import styles from '../SettingsSection.module.css';

interface ScheduleSettingsProps {
  teacher: Teacher;
  onChange: (patch: Partial<Teacher>) => void;
  onSaveWeekendWeekdays: (weekendWeekdays: number[]) => Promise<boolean>;
  isWeekendSaving: boolean;
  onComingSoonClick: () => void;
}

export const ScheduleSettings: FC<ScheduleSettingsProps> = ({
  teacher,
  onChange,
  onSaveWeekendWeekdays,
  isWeekendSaving,
  onComingSoonClick,
}) => {
  const { setEntry, clearEntry } = useUnsavedChanges();
  const [weekendsExpanded, setWeekendsExpanded] = useState(Boolean(teacher.weekendWeekdays.length));
  const [weekendDraft, setWeekendDraft] = useState(() => normalizeWeekdayList(teacher.weekendWeekdays));
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
              min={15}
              max={240}
              step={5}
              value={teacher.defaultLessonDuration}
              onChange={(event) => {
                const numeric = Number(event.target.value);
                if (!Number.isFinite(numeric)) return;
                const clamped = Math.min(Math.max(Math.round(numeric), 15), 240);
                onChange({ defaultLessonDuration: clamped });
              }}
            />
          </div>

          <div className={styles.infoRow}>
            <div>
              <div className={styles.infoRowTitle}>Автоматически отмечать занятия как проведённые</div>
              <div className={styles.infoRowDescription}>
                Если выключено, занятия нужно подтверждать вручную.
              </div>
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
            {weekendsExpanded ? <ExpandLessOutlinedIcon width={18} height={18} /> : <ExpandMoreOutlinedIcon width={18} height={18} />}
          </button>
        </div>

        {weekendsExpanded ? (
          <div className={styles.cardStack}>
            <div className={styles.weekdayPanelMeta}>
              <span className={styles.weekdayPanelLabel}>Выбранные дни</span>
              <span className={styles.weekdayPanelValue}>{weekendSummary}</span>
            </div>

            <WeekdayToggleGroup value={weekendDraft} onChange={setWeekendDraft} ariaLabel="Выберите выходные дни" />

            <button
              type="button"
              className={`${controls.primaryButton} ${styles.darkActionButton}`}
              disabled={isWeekendSaving || !isWeekendDirty}
              onClick={() => void onSaveWeekendWeekdays(weekendDraft)}
            >
              <CheckCircleOutlineIcon width={16} height={16} />
              <span>{isWeekendSaving ? 'Сохраняем…' : 'Сохранить выходные'}</span>
            </button>
          </div>
        ) : null}
      </section>

      <section className={styles.comingSoonCard}>
        <div className={styles.sectionHeader}>
          <div className={`${styles.sectionIcon} ${styles.sectionIconDark}`}>
            <CoffeeIcon width={20} height={20} />
          </div>
          <div className={styles.sectionHeaderCopy}>
            <h2 className={styles.sectionHeadingOnDark}>Дополнительные настройки</h2>
            <p className={styles.sectionDescriptionOnDark}>Скоро появятся новые возможности</p>
          </div>
        </div>

        <div className={styles.comingSoonStack}>
          <button type="button" className={styles.comingSoonFeature} onClick={onComingSoonClick}>
            <span className={styles.comingSoonFeatureTitle}>Перерыв между уроками</span>
            <span className={styles.comingSoonBadgeAccent}>Скоро</span>
          </button>
          <button type="button" className={styles.comingSoonFeature} onClick={onComingSoonClick}>
            <span className={styles.comingSoonFeatureTitle}>Рабочие часы</span>
            <span className={styles.comingSoonBadgeAccent}>Скоро</span>
          </button>
        </div>
      </section>
    </div>
  );
};

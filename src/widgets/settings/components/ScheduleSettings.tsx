import { FC, useEffect, useMemo, useState } from 'react';
import { Teacher } from '../../../entities/types';
import {
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
    return (
      saved.length !== weekendDraft.length || saved.some((weekday, index) => weekday !== weekendDraft[index])
    );
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
      <div className={styles.sectionBlock}>
        <div className={styles.label}>Длительность урока по умолчанию (мин)</div>
        <input
          className={controls.input}
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
        <div className={styles.helperText}>Применяется при создании новых уроков.</div>
      </div>
      <div className={styles.sectionBlock}>
        <div className={styles.rowHeader}>
          <div>
            <div className={styles.label}>Автоматически отмечать занятия как проведённые</div>
            <div className={styles.helperText}>
              Если выключено, занятия нужно подтверждать вручную. Автосписание и напоминания об оплате начнут работать
              только после подтверждения занятия.
            </div>
          </div>
          <label className={controls.switch}>
            <input
              type="checkbox"
              checked={teacher.autoConfirmLessons}
              onChange={(event) => onChange({ autoConfirmLessons: event.target.checked })}
            />
            <span className={controls.slider} />
          </label>
        </div>
      </div>
      <div className={styles.sectionBlock}>
        <button
          type="button"
          className={styles.accordionButton}
          onClick={() => setWeekendsExpanded((current) => !current)}
          aria-expanded={weekendsExpanded}
        >
          <div className={styles.accordionHeaderCopy}>
            <div className={styles.label}>Выходные дни</div>
            <div className={styles.helperText}>
              В эти дни календарь пометит отдых, а создание уроков будет недоступно.
            </div>
          </div>
          <div className={styles.accordionMeta}>
            <span className={styles.accordionValue}>{weekendSummary}</span>
            {weekendsExpanded ? <ExpandLessOutlinedIcon width={18} height={18} /> : <ExpandMoreOutlinedIcon width={18} height={18} />}
          </div>
        </button>
        {weekendsExpanded && (
          <div className={styles.accordionContent}>
            <WeekdayToggleGroup
              value={weekendDraft}
              onChange={setWeekendDraft}
              ariaLabel="Выберите выходные дни"
            />
            {isWeekendDirty && (
              <div className={styles.weekendSavePanel}>
                <div className={styles.weekendSaveActions}>
                  <button
                    type="button"
                    className={controls.primaryButton}
                    disabled={isWeekendSaving}
                    onClick={() => void onSaveWeekendWeekdays(weekendDraft)}
                  >
                    {isWeekendSaving ? 'Сохраняем…' : 'Сохранить выходные'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <div className={styles.comingSoonGroup}>
        <div className={styles.comingSoonHeader}>Дополнительные настройки расписания</div>
        <div className={styles.comingSoonRow} onClick={onComingSoonClick} role="button" aria-disabled="true">
          <div>
            <div className={styles.label}>Перерыв между уроками (мин)</div>
            <div className={styles.helperText}>Будет доступно в следующих обновлениях.</div>
          </div>
          <span className={styles.comingSoonBadge}>Скоро</span>
        </div>
        <div className={styles.comingSoonRow} onClick={onComingSoonClick} role="button" aria-disabled="true">
          <div>
            <div className={styles.label}>Рабочие часы (с/по)</div>
            <div className={styles.helperText}>Будет доступно в следующих обновлениях.</div>
          </div>
          <span className={styles.comingSoonBadge}>Скоро</span>
        </div>
      </div>
    </div>
  );
};

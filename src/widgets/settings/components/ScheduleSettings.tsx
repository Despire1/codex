import { FC, useEffect, useMemo, useState } from 'react';
import { Teacher } from '../../../entities/types';
import {
  CalendarIcon,
  CalendarWeekReferenceIcon,
  ExpandLessOutlinedIcon,
  ExpandMoreOutlinedIcon,
} from '../../../icons/MaterialIcons';
import { formatWeekdayShortList, normalizeWeekdayList } from '../../../shared/lib/weekdays';
import controls from '../../../shared/styles/controls.module.css';
import { WeekdayToggleGroup } from '../../../shared/ui/WeekdayToggleGroup';
import styles from '../SettingsSection.module.css';

interface ScheduleSettingsProps {
  teacher: Teacher;
  onChange: (patch: Partial<Teacher>) => void;
  defaultPriceDraft: string;
  onDefaultPriceChange: (value: string) => void;
  defaultPriceError: string | null;
  disabled?: boolean;
  onComingSoonClick: () => void;
}

const MIN_LESSON_DURATION = 15;
const MAX_LESSON_DURATION = 240;

export const ScheduleSettings: FC<ScheduleSettingsProps> = ({
  teacher,
  onChange,
  defaultPriceDraft,
  onDefaultPriceChange,
  defaultPriceError,
  disabled = false,
}) => {
  const [weekendsExpanded, setWeekendsExpanded] = useState(Boolean(teacher.weekendWeekdays.length));

  const weekendValue = useMemo(() => normalizeWeekdayList(teacher.weekendWeekdays), [teacher.weekendWeekdays]);
  const weekendSummary = useMemo(
    () => (weekendValue.length > 0 ? formatWeekdayShortList(weekendValue) : 'Не выбраны'),
    [weekendValue],
  );

  useEffect(() => {
    if (teacher.weekendWeekdays.length > 0) {
      setWeekendsExpanded(true);
    }
  }, [teacher.weekendWeekdays.length]);

  const handleDurationChange = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) return;
    onChange({ defaultLessonDuration: Math.round(numeric) });
  };

  const handleWeekendChange = (next: number[]) => {
    onChange({ weekendWeekdays: normalizeWeekdayList(next) });
  };

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

        <fieldset className={styles.fieldset} disabled={disabled}>
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
                value={teacher.defaultLessonDuration}
                onKeyDown={(event) => {
                  if (event.key === '-' || event.key === 'e' || event.key === 'E') {
                    event.preventDefault();
                  }
                }}
                onChange={(event) => handleDurationChange(event.target.value)}
              />
              <p className={styles.fieldHint}>
                Допустимо {MIN_LESSON_DURATION}–{MAX_LESSON_DURATION} минут.
              </p>
            </div>

            <div className={styles.fieldBlock}>
              <label className={styles.fieldLabel}>Цена за урок по умолчанию (₽)</label>
              <input
                className={`${controls.input} ${styles.fieldInput} ${defaultPriceError ? styles.inputError : ''}`}
                type="number"
                inputMode="numeric"
                min={0}
                step={50}
                value={defaultPriceDraft}
                placeholder="Например, 1500"
                onKeyDown={(event) => {
                  if (event.key === '-' || event.key === 'e' || event.key === 'E') {
                    event.preventDefault();
                  }
                }}
                onChange={(event) => onDefaultPriceChange(event.target.value)}
              />
              {defaultPriceError ? (
                <div className={styles.errorText}>{defaultPriceError}</div>
              ) : (
                <p className={styles.fieldHint}>
                  Будет автоматически подставляться в форму нового ученика. Хранится локально в браузере.
                </p>
              )}
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
        </fieldset>
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
          <fieldset className={styles.fieldset} disabled={disabled}>
            <div className={styles.cardStack}>
              <div className={styles.weekdayPanelMeta}>
                <span className={styles.weekdayPanelLabel}>Выбранные дни</span>
                <span className={styles.weekdayPanelValue}>{weekendSummary}</span>
              </div>

              <WeekdayToggleGroup
                value={weekendValue}
                onChange={handleWeekendChange}
                ariaLabel="Выберите выходные дни"
              />

              {weekendValue.length >= 7 ? (
                <p className={styles.sectionDescription}>
                  Все 7 дней отмечены как выходные — должен остаться хотя бы один рабочий день, иначе планировать уроки
                  не получится.
                </p>
              ) : (
                <p className={styles.fieldHint}>
                  Изменения в выходных днях вступят в силу после нажатия «Сохранить» внизу страницы. Если на выбранные
                  дни уже назначены уроки — мы попросим подтвердить их отмену.
                </p>
              )}
            </div>
          </fieldset>
        ) : null}
      </section>
    </div>
  );
};

import { type ReactNode, useMemo } from 'react';
import { WEEKDAY_OPTIONS, normalizeWeekdayList } from '../../lib/weekdays';
import { Tooltip } from '../Tooltip/Tooltip';
import styles from './WeekdayToggleGroup.module.css';

interface WeekdayToggleGroupProps {
  value: number[];
  onChange: (value: number[]) => void;
  ariaLabel?: string;
  disabled?: boolean;
  blockedDays?: number[];
  blockedDayTooltip?: ReactNode;
}

export const WeekdayToggleGroup = ({
  value,
  onChange,
  ariaLabel = 'Дни недели',
  disabled = false,
  blockedDays,
  blockedDayTooltip,
}: WeekdayToggleGroupProps) => {
  const normalizedValue = useMemo(() => normalizeWeekdayList(value), [value]);
  const blockedSet = useMemo(() => new Set(normalizeWeekdayList(blockedDays)), [blockedDays]);
  const selectedSet = useMemo(() => new Set(normalizedValue), [normalizedValue]);

  const toggleDay = (day: number) => {
    const isSelected = selectedSet.has(day);
    if (disabled) return;
    if (!isSelected && blockedSet.has(day)) return;

    onChange(
      isSelected
        ? normalizedValue.filter((item) => item !== day)
        : normalizeWeekdayList([...normalizedValue, day]),
    );
  };

  return (
    <div className={styles.grid} role="group" aria-label={ariaLabel}>
      {WEEKDAY_OPTIONS.map((day) => {
        const isSelected = selectedSet.has(day.value);
        const isBlocked = blockedSet.has(day.value) && !isSelected;
        const className = [
          styles.button,
          isSelected ? styles.buttonActive : '',
          isBlocked ? styles.buttonBlocked : '',
          disabled ? styles.buttonDisabled : '',
        ]
          .filter(Boolean)
          .join(' ');

        const button = (
          <button
            key={day.value}
            type="button"
            className={className}
            onClick={() => toggleDay(day.value)}
            aria-pressed={isSelected}
            aria-label={day.fullLabel}
            disabled={disabled}
          >
            <span>{day.label}</span>
            <span className={`${styles.dot} ${isSelected ? styles.dotActive : ''}`} />
          </button>
        );

        if (!isBlocked || !blockedDayTooltip) {
          return button;
        }

        return (
          <Tooltip key={day.value} content={blockedDayTooltip} align="center">
            <span className={styles.tooltipTarget}>{button}</span>
          </Tooltip>
        );
      })}
    </div>
  );
};

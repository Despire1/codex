import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChangeEvent, type MutableRefObject, type Ref, useMemo, useRef, useState } from 'react';
import { CalendarMonthIcon } from '../../../icons/MaterialIcons';
import { DayPicker } from '../../day-picker';
import styles from './DatePickerField.module.css';
import { useTimeZone } from '../../lib/timezoneContext';
import { formatInTimeZone, toUtcDateFromDate, toUtcDateFromTimeZone, toZonedDate } from '../../lib/timezoneDates';
import { AnchoredPopover } from '../AnchoredPopover/AnchoredPopover';

interface DatePickerFieldProps {
  label?: string;
  value?: string;
  onChange: (value?: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  className?: string;
  allowClear?: boolean;
  disabled?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  mode?: 'date' | 'datetime';
  minuteStep?: number;
}

const DATE_VALUE_FORMAT = 'yyyy-MM-dd';

const pad = (value: number) => value.toString().padStart(2, '0');

const parseTimeParts = (value: string) => {
  const [hoursPart, minutesPart] = value.split(':');
  const hours = Number(hoursPart);
  const minutes = Number(minutesPart);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
};

const formatTimeParts = (hours: number, minutes: number) => `${pad(hours)}:${pad(minutes)}`;

const normalizeTimeToStep = (value: string, step: number) => {
  const parsed = parseTimeParts(value);
  if (!parsed) return '00:00';

  const nextMinutes = Math.floor(parsed.minutes / step) * step;
  return formatTimeParts(parsed.hours, nextMinutes);
};

export const DatePickerField = ({
  label,
  value,
  onChange,
  min,
  max,
  placeholder,
  className,
  allowClear = false,
  disabled = false,
  buttonRef,
  mode = 'date',
  minuteStep = 5,
}: DatePickerFieldProps) => {
  const timeZone = useTimeZone();
  const [open, setOpen] = useState(false);
  const controlRef = useRef<HTMLButtonElement>(null);

  const normalizedMinuteStep = useMemo(() => {
    const parsed = Math.trunc(minuteStep);
    if (!Number.isFinite(parsed) || parsed <= 0) return 5;
    return Math.min(parsed, 59);
  }, [minuteStep]);

  const parseDate = (input?: string | null) => {
    if (!input) return null;
    const parsed = toUtcDateFromDate(input, timeZone);
    return Number.isNaN(parsed.getTime()) ? null : toZonedDate(parsed, timeZone);
  };

  const parseDateTime = (input?: string | null) => {
    if (!input) return null;
    const [datePart, rawTimePart] = input.split('T');
    if (!datePart) return null;
    const timeValue = rawTimePart ? rawTimePart.slice(0, 5) : '00:00';
    if (!parseTimeParts(timeValue)) return null;
    const parsed = toUtcDateFromTimeZone(datePart, timeValue, timeZone);
    return Number.isNaN(parsed.getTime()) ? null : toZonedDate(parsed, timeZone);
  };

  const parseBoundary = (input?: string) => {
    if (!input) return null;
    if (mode === 'datetime' && input.includes('T')) {
      return parseDateTime(input);
    }
    return parseDate(input);
  };

  const selectedDate = useMemo(
    () => (mode === 'datetime' ? parseDateTime(value) : parseDate(value)),
    [mode, value, timeZone, normalizedMinuteStep],
  );
  const minDate = useMemo(() => parseBoundary(min), [min, mode, timeZone, normalizedMinuteStep]);
  const maxDate = useMemo(() => parseBoundary(max), [max, mode, timeZone, normalizedMinuteStep]);
  const today = useMemo(() => toZonedDate(new Date(), timeZone), [timeZone]);
  const initialMonth = useMemo(() => {
    if (selectedDate) return selectedDate;
    if (minDate && minDate > today) return minDate;
    if (maxDate && maxDate < today) return maxDate;
    return today;
  }, [maxDate, minDate, selectedDate, today]);

  const minDay = useMemo(
    () => (minDate ? new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()) : null),
    [minDate],
  );
  const maxDay = useMemo(
    () => (maxDate ? new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate()) : null),
    [maxDate],
  );

  const resolvedPlaceholder = placeholder ?? (mode === 'datetime' ? 'Выберите дату и время' : 'Выберите дату');
  const displayValue = selectedDate
    ? mode === 'datetime'
      ? format(selectedDate, 'dd.MM.yyyy HH:mm')
      : format(selectedDate, 'dd.MM.yyyy')
    : resolvedPlaceholder;

  const selectedTime = useMemo(() => {
    if (mode !== 'datetime') return null;
    if (selectedDate) {
      return normalizeTimeToStep(format(selectedDate, 'HH:mm'), normalizedMinuteStep);
    }
    return normalizeTimeToStep(formatInTimeZone(new Date(), 'HH:mm', { timeZone }), normalizedMinuteStep);
  }, [mode, normalizedMinuteStep, selectedDate, timeZone]);

  const [selectedHour, selectedMinute] = (selectedTime ?? '00:00').split(':');

  const minuteOptions = useMemo(() => {
    const options: string[] = [];
    for (let minute = 0; minute < 60; minute += normalizedMinuteStep) {
      options.push(pad(minute));
    }
    return options.length > 0 ? options : ['00'];
  }, [normalizedMinuteStep]);

  const isDateDisabled = (date: Date) => {
    const dayValue = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    return (minDay ? dayValue < minDay.getTime() : false) || (maxDay ? dayValue > maxDay.getTime() : false);
  };

  const emitDateTimeValue = (nextHours: string, nextMinutes: string) => {
    if (mode !== 'datetime') return;
    const baseDate = selectedDate ?? initialMonth;
    onChange(`${format(baseDate, DATE_VALUE_FORMAT)}T${nextHours}:${nextMinutes}`);
  };

  const handleSelect = (date?: Date) => {
    if (!date) return;
    if (isDateDisabled(date)) return;

    if (mode === 'datetime') {
      onChange(`${format(date, DATE_VALUE_FORMAT)}T${selectedTime ?? '00:00'}`);
      return;
    }

    onChange(format(date, DATE_VALUE_FORMAT));
    setOpen(false);
  };

  const handleClear = () => {
    if (!allowClear) return;
    onChange(undefined);
    setOpen(false);
  };

  const handleHourChange = (event: ChangeEvent<HTMLSelectElement>) => {
    emitDateTimeValue(event.target.value, selectedMinute);
  };

  const handleMinuteChange = (event: ChangeEvent<HTMLSelectElement>) => {
    emitDateTimeValue(selectedHour, event.target.value);
  };

  const setControlRef = (node: HTMLButtonElement | null) => {
    controlRef.current = node;
    if (!buttonRef) return;
    if (typeof buttonRef === 'function') {
      buttonRef(node);
    } else {
      (buttonRef as MutableRefObject<HTMLButtonElement | null>).current = node;
    }
  };

  return (
    <div className={`${styles.field} ${className ?? ''}`}>
      {label && <span className={styles.label}>{label}</span>}
      <div className={styles.controlRow}>
        <button
          type="button"
          className={`${styles.control} ${selectedDate ? styles.filled : ''}`}
          onClick={() => !disabled && setOpen((prev) => !prev)}
          aria-label={label ? `${label}. ${displayValue}` : displayValue}
          disabled={disabled}
          ref={setControlRef}
        >
          <span className={styles.value}>{displayValue}</span>
          <span aria-hidden className={styles.icon}>
            <CalendarMonthIcon width={18} height={18} />
          </span>
        </button>
        {allowClear && value && !disabled && (
          <button
            type="button"
            className={styles.clear}
            onClick={handleClear}
            aria-label={mode === 'datetime' ? 'Очистить дату и время' : 'Очистить дату'}
          >
            ×
          </button>
        )}
      </div>
      <AnchoredPopover
        isOpen={open && !disabled}
        anchorEl={controlRef.current}
        onClose={() => setOpen(false)}
        side="bottom"
        align="start"
        className={`${styles.popover} ${mode === 'datetime' ? styles.popoverDatetime : ''}`}
      >
        <div className={styles.pickerContent}>
          <DayPicker
            selected={selectedDate ?? undefined}
            onSelect={handleSelect}
            weekStartsOn={1}
            locale={ru}
            defaultMonth={initialMonth}
            disabled={isDateDisabled}
          />
          {mode === 'datetime' && (
            <div className={styles.timePanel}>
              <span className={styles.timePanelLabel}>Время</span>
              <div className={styles.timeControls}>
                <label className={styles.timeField}>
                  <span>Часы</span>
                  <select
                    className={styles.timeSelect}
                    value={selectedHour}
                    onChange={handleHourChange}
                    aria-label="Выбор часа"
                  >
                    {Array.from({ length: 24 }, (_, hour) => pad(hour)).map((hour) => (
                      <option key={hour} value={hour}>
                        {hour}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.timeField}>
                  <span>Минуты</span>
                  <select
                    className={styles.timeSelect}
                    value={selectedMinute}
                    onChange={handleMinuteChange}
                    aria-label="Выбор минут"
                  >
                    {minuteOptions.map((minute) => (
                      <option key={minute} value={minute}>
                        {minute}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}
        </div>
      </AnchoredPopover>
    </div>
  );
};

export default DatePickerField;

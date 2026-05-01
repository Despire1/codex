import ru, { format } from 'date-fns';
import {
  ChangeEvent,
  type KeyboardEvent,
  type MutableRefObject,
  type ReactNode,
  type Ref,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  buttonRef?: Ref<HTMLInputElement>;
  mode?: 'date' | 'datetime';
  minuteStep?: number;
  disabledDateReason?: (date: Date) => ReactNode | undefined;
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
  disabledDateReason,
}: DatePickerFieldProps) => {
  const timeZone = useTimeZone();
  const [open, setOpen] = useState(false);
  const controlRef = useRef<HTMLInputElement>(null);
  const [inputDraft, setInputDraft] = useState<string | null>(null);

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
    // parse* пересоздаются каждый рендер, но читают только mode/timeZone (уже в deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, value, timeZone, normalizedMinuteStep],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const minDate = useMemo(() => parseBoundary(min), [min, mode, timeZone, normalizedMinuteStep]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const resolvedPlaceholder = placeholder ?? (mode === 'datetime' ? 'ДД.ММ.ГГГГ ЧЧ:ММ' : 'ДД.ММ.ГГГГ');

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

  const setControlRef = (node: HTMLInputElement | null) => {
    controlRef.current = node;
    if (!buttonRef) return;
    if (typeof buttonRef === 'function') {
      buttonRef(node);
    } else {
      (buttonRef as MutableRefObject<HTMLInputElement | null>).current = node;
    }
  };

  const dateOnlyDisplay = selectedDate ? format(selectedDate, 'dd.MM.yyyy') : '';
  const dateTimeDisplay = selectedDate ? format(selectedDate, 'dd.MM.yyyy HH:mm') : '';
  const presentationValue = mode === 'datetime' ? dateTimeDisplay : dateOnlyDisplay;
  const inputValue = inputDraft ?? presentationValue;

  useEffect(() => {
    setInputDraft(null);
  }, [value]);

  const parseManualInput = (raw: string): { iso: string } | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (mode === 'datetime') {
      const match = trimmed.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})(?:[ T](\d{1,2}):(\d{1,2}))?$/);
      if (!match) return null;
      const [, dd, mm, yyyyRaw, hhRaw, miRaw] = match;
      const yyyy = yyyyRaw.length === 2 ? `20${yyyyRaw}` : yyyyRaw;
      const dateStr = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
      const timeStr = `${(hhRaw ?? selectedHour ?? '00').padStart(2, '0')}:${(miRaw ?? selectedMinute ?? '00').padStart(2, '0')}`;
      const parsed = toUtcDateFromTimeZone(dateStr, timeStr, timeZone);
      if (Number.isNaN(parsed.getTime())) return null;
      return { iso: `${dateStr}T${timeStr}` };
    }
    const match = trimmed.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
    if (!match) return null;
    const [, dd, mm, yyyyRaw] = match;
    const yyyy = yyyyRaw.length === 2 ? `20${yyyyRaw}` : yyyyRaw;
    const dateStr = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    const parsed = toUtcDateFromDate(dateStr, timeZone);
    if (Number.isNaN(parsed.getTime())) return null;
    return { iso: dateStr };
  };

  const commitManualInput = (raw: string) => {
    if (raw.trim() === '') {
      if (allowClear) onChange(undefined);
      setInputDraft(null);
      return;
    }
    const result = parseManualInput(raw);
    if (!result) {
      setInputDraft(null);
      return;
    }
    const parsedDate =
      mode === 'datetime'
        ? toUtcDateFromTimeZone(result.iso.split('T')[0], result.iso.split('T')[1] ?? '00:00', timeZone)
        : toUtcDateFromDate(result.iso, timeZone);
    const zonedDate = toZonedDate(parsedDate, timeZone);
    if (isDateDisabled(zonedDate)) {
      setInputDraft(null);
      return;
    }
    onChange(result.iso);
    setInputDraft(null);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setInputDraft(event.target.value);
  };

  const handleInputBlur = () => {
    if (inputDraft === null) return;
    commitManualInput(inputDraft);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (inputDraft !== null) commitManualInput(inputDraft);
      setOpen(false);
    } else if (event.key === 'ArrowDown' && !open) {
      event.preventDefault();
      setOpen(true);
    }
  };

  return (
    <div className={`${styles.field} ${className ?? ''}`}>
      {label && <span className={styles.label}>{label}</span>}
      <div className={styles.controlRow}>
        <div
          className={`${styles.control} ${disabled ? styles.controlDisabled : ''} ${selectedDate ? styles.filled : ''}`}
        >
          <input
            ref={setControlRef}
            type="text"
            className={styles.input}
            value={inputValue}
            placeholder={mode === 'datetime' ? 'ДД.ММ.ГГГГ ЧЧ:ММ' : (resolvedPlaceholder ?? 'ДД.ММ.ГГГГ')}
            inputMode="numeric"
            autoComplete="off"
            disabled={disabled}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onKeyDown={handleInputKeyDown}
            aria-label={label ?? (mode === 'datetime' ? 'Дата и время' : 'Дата')}
          />
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => !disabled && setOpen((prev) => !prev)}
            disabled={disabled}
            aria-label={open ? 'Скрыть календарь' : 'Открыть календарь'}
            tabIndex={-1}
          >
            <CalendarMonthIcon width={18} height={18} />
          </button>
        </div>
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
            disabledReason={disabledDateReason}
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

import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarMonthIcon } from '../../../icons/MaterialIcons';
import { DayPicker } from 'react-day-picker';
import styles from './DatePickerField.module.css';

interface DatePickerFieldProps {
  label?: string;
  value?: string;
  onChange: (value?: string) => void;
  min?: string;
  placeholder?: string;
  className?: string;
  allowClear?: boolean;
  disabled?: boolean;
}

const parseDate = (value?: string) => {
  if (!value) return null;
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const DatePickerField = ({
  label,
  value,
  onChange,
  min,
  placeholder = 'Выберите дату',
  className,
  allowClear = false,
  disabled = false,
}: DatePickerFieldProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedDate = useMemo(() => parseDate(value), [value]);
  const minDate = useMemo(() => parseDate(min), [min]);
  const displayValue = selectedDate ? format(selectedDate, 'dd.MM.yyyy') : placeholder;

  useEffect(() => {
    if (!open) return undefined;

    const handleOutside = (event: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const handleSelect = (date?: Date) => {
    if (!date) return;
    if (minDate && date < minDate) return;
    onChange(format(date, 'yyyy-MM-dd'));
    setOpen(false);
  };

  const handleClear = () => {
    if (!allowClear) return;
    onChange(undefined);
    setOpen(false);
  };

  return (
    <div className={`${styles.field} ${className ?? ''}`} ref={ref}>
      {label && <span className={styles.label}>{label}</span>}
      <div className={styles.controlRow}>
        <button
          type="button"
          className={`${styles.control} ${selectedDate ? styles.filled : ''}`}
          onClick={() => !disabled && setOpen((prev) => !prev)}
          aria-label={label ? `${label}. ${displayValue}` : displayValue}
          disabled={disabled}
        >
          <span className={styles.value}>{displayValue}</span>
          <span aria-hidden className={styles.icon}>
            <CalendarMonthIcon width={18} height={18} />
          </span>
        </button>
        {allowClear && value && !disabled && (
          <button type="button" className={styles.clear} onClick={handleClear} aria-label="Очистить дату">
            ×
          </button>
        )}
      </div>
      {open && !disabled && (
        <div className={styles.popover}>
          <DayPicker
            selected={selectedDate ?? undefined}
            onSelect={handleSelect}
            weekStartsOn={1}
            locale={ru}
          />
        </div>
      )}
    </div>
  );
};

export default DatePickerField;

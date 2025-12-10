import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  const controlRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ vertical: 'top' | 'bottom'; align: 'left' | 'right' }>(
    { vertical: 'bottom', align: 'left' },
  );

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

  useLayoutEffect(() => {
    if (!open) return undefined;

    const updatePlacement = () => {
      if (!controlRef.current || !popoverRef.current) return;

      const controlRect = controlRef.current.getBoundingClientRect();
      const popoverRect = popoverRef.current.getBoundingClientRect();

      const spaceBelow = window.innerHeight - controlRect.bottom;
      const spaceAbove = controlRect.top;
      const fitsBelow = spaceBelow >= popoverRect.height;
      const fitsAbove = spaceAbove >= popoverRect.height;

      const vertical: 'top' | 'bottom' = !fitsBelow && fitsAbove ? 'top' : 'bottom';

      const spaceRight = window.innerWidth - controlRect.left;
      const fitsRight = spaceRight >= popoverRect.width;
      const align: 'left' | 'right' = fitsRight ? 'left' : 'right';

      setPlacement((prev) => (prev.vertical === vertical && prev.align === align ? prev : { vertical, align }));
    };

    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);

    return () => {
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
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
          ref={controlRef}
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
        <div
          className={`${styles.popover} ${placement.vertical === 'top' ? styles.popoverTop : styles.popoverBottom} ${placement.align === 'right' ? styles.popoverRight : ''}`}
          ref={popoverRef}
        >
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

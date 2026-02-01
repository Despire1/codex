import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarMonthIcon } from '../../../icons/MaterialIcons';
import { DayPicker } from 'react-day-picker';
import styles from './DatePickerField.module.css';
import { useTimeZone } from '../../lib/timezoneContext';
import { toUtcDateFromDate, toZonedDate } from '../../lib/timezoneDates';

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
  const timeZone = useTimeZone();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const controlRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});

  const parseDate = (input?: string) => {
    if (!input) return null;
    const parsed = toUtcDateFromDate(input, timeZone);
    return Number.isNaN(parsed.getTime()) ? null : toZonedDate(parsed, timeZone);
  };
  const selectedDate = useMemo(() => parseDate(value), [value, timeZone]);
  const minDate = useMemo(() => parseDate(min), [min, timeZone]);
  const today = useMemo(() => toZonedDate(new Date(), timeZone), [timeZone]);
  const initialMonth = useMemo(() => {
    if (selectedDate) return selectedDate;
    if (minDate && minDate > today) return minDate;
    return today;
  }, [minDate, selectedDate, today]);
  const displayValue = selectedDate ? format(selectedDate, 'dd.MM.yyyy') : placeholder;

  useEffect(() => {
    if (!open) return undefined;

    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
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

      const gap = 6;
      const viewportPadding = 12;
      const top =
        vertical === 'bottom' ? controlRect.bottom + gap : controlRect.top - popoverRect.height - gap;
      const left = align === 'left' ? controlRect.left : controlRect.right - popoverRect.width;
      const clampedLeft = Math.min(
        window.innerWidth - popoverRect.width - viewportPadding,
        Math.max(viewportPadding, left),
      );
      const clampedTop = Math.min(
        window.innerHeight - popoverRect.height - viewportPadding,
        Math.max(viewportPadding, top),
      );

      setPopoverStyle((prev) =>
        prev.top === clampedTop && prev.left === clampedLeft ? prev : { top: clampedTop, left: clampedLeft },
      );

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

  const portalTarget = typeof document === 'undefined' ? null : document.body;
  const popover = open && !disabled && portalTarget
    ? createPortal(
      <div className={styles.popover} ref={popoverRef} style={popoverStyle}>
        <DayPicker
          selected={selectedDate ?? undefined}
          onSelect={handleSelect}
          weekStartsOn={1}
          locale={ru}
          defaultMonth={initialMonth}
        />
      </div>,
      portalTarget,
    )
    : null;

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
      {popover}
    </div>
  );
};

export default DatePickerField;

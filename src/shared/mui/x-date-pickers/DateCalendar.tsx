import { format, parseISO } from 'date-fns';
import { useMemo } from 'react';
import styles from './x-date-pickers.module.css';

type DateCalendarProps = {
  value: Date | null;
  onChange: (value: Date | null) => void;
  className?: string;
};

export const DateCalendar: React.FC<DateCalendarProps> = ({ value, onChange, className }) => {
  const inputValue = useMemo(() => (value ? format(value, 'yyyy-MM-dd') : ''), [value]);

  return (
    <div className={`${styles.calendarWrapper} ${className ?? ''}`}>
      <input
        type="date"
        className={styles.dateInput}
        value={inputValue}
        onChange={(event) => {
          const nextValue = event.target.value ? parseISO(event.target.value) : null;
          onChange(nextValue);
        }}
      />
    </div>
  );
};

export default DateCalendar;

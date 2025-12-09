import { DayPicker } from 'react-day-picker';
import styles from './x-date-pickers.module.css';

type DateCalendarProps = {
  value: Date | null;
  onChange: (value: Date | null) => void;
  className?: string;
};

export const DateCalendar: React.FC<DateCalendarProps> = ({ value, onChange, className }) => {
  return (
    <div className={`${styles.calendarWrapper} ${className ?? ''}`}>
      <DayPicker selected={value ?? undefined} onSelect={(date) => onChange(date ?? null)} weekStartsOn={1} />
    </div>
  );
};

export default DateCalendar;

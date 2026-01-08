import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { addTask } from '@/entities/task/model/taskSlice';
import { Button } from '@/shared/ui/Button/Button';
import { Select } from '@/shared/ui/Select/Select';
import styles from './TaskForm.module.css';
import { Input } from '@/shared/ui/Input/Input';
import { DatePickerField } from '@/shared/ui/DatePickerField';
import { useTimeZone } from '@/shared/lib/timezoneContext';
import { todayISO } from '@/shared/lib/timezoneDates';

const durationOptions = [30, 45, 60, 90, 120];

interface TaskFormProps {
  initialDate?: string;
  initialStartTime?: string;
  onSuccess?: () => void;
}

export const TaskForm = ({ initialDate, initialStartTime, onSuccess }: TaskFormProps) => {
  const dispatch = useDispatch();
  const timeZone = useTimeZone();
  const today = useMemo(() => todayISO(timeZone), [timeZone]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(initialDate ?? today);
  const [startTime, setStartTime] = useState(initialStartTime ?? '09:00');
  const [duration, setDuration] = useState(60);

  useEffect(() => {
    if (initialDate) setDate(initialDate);
  }, [initialDate]);

  useEffect(() => {
    if (initialStartTime) setStartTime(initialStartTime);
  }, [initialStartTime]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return;

    dispatch(
      addTask({
        title: title.trim(),
        date,
        startTime,
        durationMinutes: duration,
      }),
    );
    setTitle('');
    onSuccess?.();
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <p className={styles.heading}>Новая задача</p>
      <Input label="Название" value={title} onChange={(e) => setTitle(e.target.value)} required />
      <DatePickerField label="Дата" value={date} onChange={(nextDate) => setDate(nextDate ?? today)} />
      <Input
        label="Начало"
        type="time"
        value={startTime}
        onChange={(e) => setStartTime(e.target.value)}
        step={300}
      />
      <Select
        label="Длительность"
        value={duration}
        onChange={(e) => setDuration(Number(e.target.value))}
      >
        {durationOptions.map((option) => (
          <option key={option} value={option}>
            {option} мин
          </option>
        ))}
      </Select>
      <div className={styles.actions}>
        <Button type="submit" disabled={!title.trim()}>
          Добавить
        </Button>
      </div>
    </form>
  );
};

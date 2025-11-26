import { useMemo, useState } from 'react';
import { format, startOfWeek, endOfWeek, startOfMonth } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Task, ViewMode } from '@/entities/task/model/types';
import { WeekView } from '@/widgets/WeekView/WeekView';
import { MonthView } from '@/widgets/MonthView/MonthView';
import styles from './Calendar.module.css';

interface Props {
  tasks: Task[];
}

export const Calendar = ({ tasks }: Props) => {
  const [mode, setMode] = useState<ViewMode>('week');
  const today = useMemo(() => new Date(), []);

  const weekLabel = useMemo(() => {
    const start = startOfWeek(today, { weekStartsOn: 1 });
    const end = endOfWeek(today, { weekStartsOn: 1 });
    return `${format(start, 'd MMM', { locale: ru })} — ${format(end, 'd MMM', { locale: ru })}`;
  }, [today]);

  const monthLabel = useMemo(() => format(startOfMonth(today), 'LLLL yyyy', { locale: ru }), [today]);
  const currentLabel = mode === 'week' ? `Неделя: ${weekLabel}` : `Месяц: ${monthLabel}`;

  return (
    <section>
      <div className={styles.controls}>
        <h3 className={styles.title}>{currentLabel}</h3>
        <div className={styles.toggle}>
          <button className={mode === 'week' ? 'active' : ''} onClick={() => setMode('week')}>
            Неделя
          </button>
          <button className={mode === 'month' ? 'active' : ''} onClick={() => setMode('month')}>
            Месяц
          </button>
        </div>
      </div>
      {mode === 'week' ? <WeekView baseDate={today} tasks={tasks} /> : <MonthView baseDate={today} tasks={tasks} />}
    </section>
  );
};

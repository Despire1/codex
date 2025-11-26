import { addDays, eachDayOfInterval, endOfMonth, format, getDay, startOfMonth } from 'date-fns';
import { useDispatch } from 'react-redux';
import { Task } from '@/entities/task/model/types';
import { toggleTaskCompletion } from '@/entities/task/model/taskSlice';
import { addExperience } from '@/entities/account/model/accountSlice';
import { EXPERIENCE_PER_TASK } from '@/entities/account/model/types';
import styles from './MonthView.module.css';

interface Props {
  baseDate: Date;
  tasks: Task[];
}

const weekdayTitles = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export const MonthView = ({ baseDate, tasks }: Props) => {
  const dispatch = useDispatch();
  const start = startOfMonth(baseDate);
  const end = endOfMonth(baseDate);

  const firstWeekday = (getDay(start) + 6) % 7;
  const days = eachDayOfInterval({ start, end });
  const offsetDays = Array.from({ length: firstWeekday }, (_, index) => addDays(start, index - firstWeekday));
  const calendarDays = [...offsetDays, ...days];

  const tasksByDate = tasks.reduce<Record<string, Task[]>>((acc, task) => {
    if (!acc[task.date]) acc[task.date] = [];
    acc[task.date].push(task);
    return acc;
  }, {});

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        {weekdayTitles.map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>
      <div className={styles.grid}>
        {calendarDays.map((day, index) => {
          const key = format(day, 'yyyy-MM-dd');
          const isCurrentMonth = day.getMonth() === baseDate.getMonth();
          return (
            <div key={`${key}-${index}`} className={styles.cell} style={{ opacity: isCurrentMonth ? 1 : 0.45 }}>
              <span className={styles.dateLabel}>{format(day, 'd')}</span>
              <div className={styles.tasks}>
                {(tasksByDate[key] ?? []).map((task) => (
                  <label
                    key={task.id}
                    className={`${styles.taskChip} ${task.completed ? styles.completed : ''}`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className={styles.taskRow}>
                      <input
                        type="checkbox"
                        checked={task.completed}
                        disabled={task.completed}
                        onChange={() => {
                          if (task.completed) return;
                          dispatch(toggleTaskCompletion(task.id));
                          dispatch(addExperience(EXPERIENCE_PER_TASK));
                        }}
                      />
                      <div>
                        <p className={styles.taskTitle}>{task.title}</p>
                        <p className={styles.taskMeta}>
                          {task.startTime} • {task.durationMinutes} мин
                        </p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

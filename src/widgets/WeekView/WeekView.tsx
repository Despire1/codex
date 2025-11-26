import { Fragment, useState } from 'react';
import { useDispatch } from 'react-redux';
import { addDays, addMinutes, format, startOfWeek } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Task } from '@/entities/task/model/types';
import { toggleTaskCompletion } from '@/entities/task/model/taskSlice';
import { addExperience } from '@/entities/account/model/accountSlice';
import { EXPERIENCE_PER_TASK } from '@/entities/account/model/types';
import { AddTaskModal } from '@/features/taskForm/ui/AddTaskModal';
import styles from './WeekView.module.css';

interface Props {
  baseDate: Date;
  tasks: Task[];
}

const hours = Array.from({ length: 14 }, (_, index) => index + 7); // 7:00 - 20:00

export const WeekView = ({ baseDate, tasks }: Props) => {
  const dispatch = useDispatch();
  const start = startOfWeek(baseDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedStart, setSelectedStart] = useState<string>('09:00');

  const tasksByDay: Record<string, Task[]> = days.reduce((acc, day) => {
    const iso = format(day, 'yyyy-MM-dd');
    acc[iso] = tasks.filter((task) => task.date === iso);
    return acc;
  }, {} as Record<string, Task[]>);

  const renderTasks = (dayKey: string, hour: number) => {
    const list = tasksByDay[dayKey] ?? [];
    return list
      .filter((task) => Number(task.startTime.split(':')[0]) === hour)
      .map((task) => {
        const [, minutes] = task.startTime.split(':').map(Number);
        const height = Math.max(36, (task.durationMinutes / 60) * 64);
        const top = (minutes / 60) * 64;
        const end = addMinutes(new Date(`${task.date}T${task.startTime}`), task.durationMinutes);

        return (
          <div
            key={task.id}
            className={`${styles.task} ${task.completed ? styles.completed : ''}`}
            style={{ top, height }}
            onClick={(event) => event.stopPropagation()}
          >
            <label className={styles.taskRow}>
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
                <p className={styles.taskTime}>
                  {task.startTime} — {format(end, 'HH:mm')}
                </p>
              </div>
            </label>
          </div>
        );
      });
  };

  const handleCellClick = (day: Date, hour: number) => {
    setSelectedDate(format(day, 'yyyy-MM-dd'));
    setSelectedStart(`${hour.toString().padStart(2, '0')}:00`);
    setModalOpen(true);
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <div />
        {days.map((day) => (
            <div key={day.toISOString()} className={styles.dayTitle}>
              <div>{format(day, 'EEEE', { locale: ru })}</div>
              <div>{format(day, 'd MMM', { locale: ru })}</div>
          </div>
        ))}
      </div>
      <div className={styles.grid}>
        {hours.map((hour) => (
          <Fragment key={`row-${hour}`}>
            <div className={styles.hourLabel}>{`${hour}:00`}</div>
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              return (
                <div key={`${key}-${hour}`} className={styles.cell} onClick={() => handleCellClick(day, hour)}>
                  {renderTasks(key, hour)}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
      <AddTaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initialDate={selectedDate}
        initialStartTime={selectedStart}
      />
    </div>
  );
};

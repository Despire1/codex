import { Calendar } from '@/widgets/Calendar/Calendar';
import { TaskForm } from '@/features/taskForm/ui/TaskForm';
import { useTasks } from '@/entities/task/model/useTasks';
import styles from './App.module.css';

export const App = () => {
  const { tasks } = useTasks();

  return (
    <div className={styles.app}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Календарь</h1>
            <p className={styles.desc}>Неделя с почасовым расписанием и месячный обзор в голубой теме</p>
          </div>
          <TaskForm />
        </header>
        <Calendar tasks={tasks} />
      </div>
    </div>
  );
};

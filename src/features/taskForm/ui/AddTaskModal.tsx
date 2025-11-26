import { TaskForm } from './TaskForm';
import { Modal } from '@/shared/ui/Modal/Modal';
import styles from './AddTaskModal.module.css';

interface AddTaskModalProps {
  open: boolean;
  onClose: () => void;
  initialDate?: string;
  initialStartTime?: string;
}

export const AddTaskModal = ({ open, onClose, initialDate, initialStartTime }: AddTaskModalProps) => (
  <Modal open={open} onClose={onClose} title="Новая задача">
    <div className={styles.layout}>
      <div className={styles.hero}>
        <div className={styles.badge}>+XP за выполнение</div>
        <h3 className={styles.heading}>Спланируйте задачу</h3>
        <p className={styles.subheading}>
          Закрепите цель, время и длительность — после завершения задача автоматически добавит опыт в ваш
          профиль.
        </p>
        <div className={styles.perks}>
          <span>🎯 Фокус на цели</span>
          <span>⏱️ Учет времени</span>
          <span>🏆 Бонус за выполнение</span>
        </div>
      </div>
      <div className={styles.formCard}>
        <TaskForm initialDate={initialDate} initialStartTime={initialStartTime} onSuccess={onClose} />
      </div>
    </div>
  </Modal>
);

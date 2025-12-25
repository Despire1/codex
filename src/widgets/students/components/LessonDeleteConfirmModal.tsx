import { Modal } from '../../../shared/ui/Modal/Modal';
import controls from '../../../shared/styles/controls.module.css';
import styles from '../StudentsSection.module.css';

interface LessonDeleteConfirmModalProps {
  open: boolean;
  lessonId?: number;
  onClose: () => void;
  onConfirm: () => void;
}

export const LessonDeleteConfirmModal = ({
  open,
  lessonId,
  onClose,
  onConfirm,
}: LessonDeleteConfirmModalProps) => (
  <Modal open={open} onClose={onClose} title="Удалить занятие?">
    <p>
      {lessonId ? `Занятие #${lessonId}` : 'Занятие'} будет удалено навсегда. Это действие необратимо, вернуть
      занятие будет невозможно.
    </p>
    <p>Если вы уверены, подтвердите удаление.</p>
    <div className={styles.modalFooter}>
      <button type="button" className={controls.secondaryButton} onClick={onClose}>
        Отмена
      </button>
      <button type="button" className={controls.dangerButton} onClick={onConfirm}>
        Удалить занятие
      </button>
    </div>
  </Modal>
);

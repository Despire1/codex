import { type FC } from 'react';
import controls from '../../../shared/styles/controls.module.css';
import modalStyles from '../modal.module.css';

interface StudentModalProps {
  open: boolean;
  onClose: () => void;
  draft: { customName: string; username: string; pricePerLesson: string };
  isEditing: boolean;
  onDraftChange: (draft: { customName: string; username: string; pricePerLesson: string }) => void;
  onSubmit: () => void;
}

export const StudentModal: FC<StudentModalProps> = ({
  open,
  onClose,
  draft,
  isEditing,
  onDraftChange,
  onSubmit,
}) => {
  if (!open) return null;

  return (
    <div className={modalStyles.modalOverlay} onClick={onClose}>
      <div className={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={modalStyles.modalHeader}>
          <div>
            <div className={modalStyles.modalLabel}>
              {isEditing ? 'Редактирование ученика' : 'Добавление ученика'}
            </div>
            <div className={modalStyles.modalTitle}>
              {isEditing ? 'Обновить данные ученика' : 'Создать связь Teacher ↔ Student'}
            </div>
          </div>
          <button className={modalStyles.closeButton} onClick={onClose} aria-label="Закрыть модалку">
            ×
          </button>
        </div>
        <div className={modalStyles.modalBody}>
          <div className={controls.formRow}>
            <input
              className={controls.input}
              placeholder="Имя ученика"
              required
              value={draft.customName}
              onChange={(e) => onDraftChange({ ...draft, customName: e.target.value })}
            />
            <input
              className={controls.input}
              placeholder="Telegram username (опционально)"
              value={draft.username}
              onChange={(e) => onDraftChange({ ...draft, username: e.target.value })}
            />
          </div>
          <div className={controls.formRow}>
            <input
              className={controls.input}
              placeholder="Цена занятия"
              type="number"
              min={0}
              required
              value={draft.pricePerLesson}
              onChange={(e) => onDraftChange({ ...draft, pricePerLesson: e.target.value })}
            />
          </div>
        </div>
        <div className={modalStyles.modalActions}>
          <button className={controls.secondaryButton} onClick={onClose}>
            Отмена
          </button>
          <button className={controls.primaryButton} onClick={onSubmit}>
            {isEditing ? 'Сохранить изменения' : 'Сохранить ученика'}
          </button>
        </div>
      </div>
    </div>
  );
};

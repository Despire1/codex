import { type FC } from 'react';
import controls from '../../../shared/styles/controls.module.css';
import modalStyles from '../modal.module.css';

interface StudentModalProps {
  open: boolean;
  onClose: () => void;
  draft: { customName: string; username: string };
  onDraftChange: (draft: { customName: string; username: string }) => void;
  onSubmit: () => void;
}

export const StudentModal: FC<StudentModalProps> = ({ open, onClose, draft, onDraftChange, onSubmit }) => {
  if (!open) return null;

  return (
    <div className={modalStyles.modalOverlay} onClick={onClose}>
      <div className={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={modalStyles.modalHeader}>
          <div>
            <div className={modalStyles.modalLabel}>Добавление ученика</div>
            <div className={modalStyles.modalTitle}>Создать связь Teacher ↔ Student</div>
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
        </div>
        <div className={modalStyles.modalActions}>
          <button className={controls.secondaryButton} onClick={onClose}>
            Отмена
          </button>
          <button className={controls.primaryButton} onClick={onSubmit}>
            Сохранить ученика
          </button>
        </div>
      </div>
    </div>
  );
};

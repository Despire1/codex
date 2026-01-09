import { type FC } from 'react';
import controls from '../../../shared/styles/controls.module.css';
import styles from './StudentModal.module.css';
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
              {isEditing ? 'Обновить данные ученика' : 'Создание ученика'}
            </div>
          </div>
          <button className={modalStyles.closeButton} onClick={onClose} aria-label="Закрыть модалку">
            ×
          </button>
        </div>
        <div className={modalStyles.modalBody}>
          <div className={controls.formRow}>
            <div className={modalStyles.field}>
              <label className={modalStyles.fieldLabel} htmlFor="student-custom-name">
                Имя ученика
              </label>
              <input
                id="student-custom-name"
                className={controls.input}
                placeholder="Имя ученика"
                required
                value={draft.customName}
                onChange={(e) => onDraftChange({ ...draft, customName: e.target.value })}
              />
            </div>
            <div className={modalStyles.field}>
              <label className={modalStyles.fieldLabel} htmlFor="student-telegram-username">
                Telegram username (обязательно)
              </label>
              <div className={styles.usernameField}>
                <span className={styles.usernamePrefix}>@</span>
                <input
                  id="student-telegram-username"
                  className={`${controls.input} ${styles.usernameInput}`}
                  placeholder="telegram_username"
                  required
                  value={draft.username}
                  onChange={(e) =>
                    onDraftChange({
                      ...draft,
                      username: e.target.value.replace(/^@+/, ''),
                    })
                  }
                />
              </div>
            </div>
          </div>
          <div className={controls.formRow}>
            <div className={modalStyles.field}>
              <label className={modalStyles.fieldLabel} htmlFor="student-price">
                Цена занятия
              </label>
              <input
                id="student-price"
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

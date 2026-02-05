import { type FC } from 'react';
import controls from '../../../shared/styles/controls.module.css';
import styles from './StudentModal.module.css';
import modalStyles from '../modal.module.css';
import { BottomSheet } from '../../../shared/ui/BottomSheet/BottomSheet';

interface StudentModalProps {
  open: boolean;
  onClose: () => void;
  draft: { customName: string; username: string; pricePerLesson: string };
  isEditing: boolean;
  onDraftChange: (draft: { customName: string; username: string; pricePerLesson: string }) => void;
  onSubmit: () => void;
  variant?: 'modal' | 'sheet';
}

export const StudentModal: FC<StudentModalProps> = ({
  open,
  onClose,
  draft,
  isEditing,
  onDraftChange,
  onSubmit,
  variant = 'modal',
}) => {
  if (!open) return null;

  const modalContent = (
    <div
      className={`${modalStyles.modal} ${variant === 'sheet' ? styles.sheetModal : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
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
                      username: e.target.value.replace(/[@\u0400-\u04ff]/g, ''),
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
              <div className={styles.priceField}>
                <span className={styles.pricePrefix}>₽</span>
                <input
                  id="student-price"
                  className={`${controls.input} ${styles.priceInput}`}
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
  );

  if (variant === 'sheet') {
    return (
      <BottomSheet isOpen={open} onClose={onClose}>
        {modalContent}
      </BottomSheet>
    );
  }

  return (
    <div className={modalStyles.modalOverlay} onClick={onClose}>
      {modalContent}
    </div>
  );
};

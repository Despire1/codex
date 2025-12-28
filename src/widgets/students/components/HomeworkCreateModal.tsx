import { FC } from 'react';
import { CloseIcon } from '../../../icons/MaterialIcons';
import { HomeworkStatus } from '../../../entities/types';
import controls from '../../../shared/styles/controls.module.css';
import styles from '../StudentsSection.module.css';
import { NewHomeworkDraft } from '../types';

interface HomeworkCreateModalProps {
  isOpen: boolean;
  draft: NewHomeworkDraft;
  onDraftChange: (draft: NewHomeworkDraft) => void;
  onAddHomework: () => void;
  onClose: () => void;
  onCreateStatusChange: (status: HomeworkStatus) => void;
  onSendNowToggle: (value: boolean) => void;
}

export const HomeworkCreateModal: FC<HomeworkCreateModalProps> = ({
  isOpen,
  draft,
  onDraftChange,
  onAddHomework,
  onClose,
  onCreateStatusChange,
  onSendNowToggle,
}) => {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>Новое домашнее задание</div>
          </div>
          <button className={controls.iconButton} aria-label="Закрыть" onClick={onClose}>
            <CloseIcon width={18} height={18} />
          </button>
        </div>
        <div className={styles.modalBody}>
          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Текст задания</span>
            <textarea
              className={styles.modalTextarea}
              placeholder="Например: Разобрать тему 3 и сделать 10 задач"
              value={draft.text}
              onChange={(e) => onDraftChange({ ...draft, text: e.target.value })}
            />
          </label>
          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Дедлайн</span>
            <input
              className={styles.modalInput}
              type="date"
              value={draft.deadline}
              onChange={(e) => onDraftChange({ ...draft, deadline: e.target.value })}
            />
          </label>
          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Время выполнения (мин)</span>
            <input
              className={styles.modalInput}
              type="number"
              min={0}
              step={5}
              value={draft.timeSpentMinutes}
              onChange={(e) => onDraftChange({ ...draft, timeSpentMinutes: e.target.value })}
              placeholder="Например, 30"
            />
          </label>
          <div className={styles.modalField}>
            <span className={styles.modalLabel}>Статус</span>
            <div className={styles.toggleGroup}>
              <button
                className={`${controls.secondaryButton} ${
                  (draft.baseStatus ?? 'DRAFT') === 'DRAFT' ? styles.activeChip : ''
                }`}
                onClick={() => onCreateStatusChange('DRAFT')}
                disabled={draft.sendNow}
              >
                Черновик
              </button>
              <button
                className={`${controls.secondaryButton} ${
                  (draft.baseStatus ?? 'DRAFT') === 'ASSIGNED' ? styles.activeChip : ''
                }`}
                onClick={() => onCreateStatusChange('ASSIGNED')}
                disabled={draft.sendNow}
              >
                Назначено
              </button>
            </div>
          </div>
          <label className={styles.checkboxRow}>
            <input
              className={styles.modalCheckbox}
              type="checkbox"
              checked={draft.sendNow}
              onChange={(e) => onSendNowToggle(e.target.checked)}
            />
            <span>Сразу отправить ученику</span>
          </label>
          <label className={styles.checkboxRow}>
            <input
              className={styles.modalCheckbox}
              type="checkbox"
              checked={draft.remindBefore}
              onChange={(e) => onDraftChange({ ...draft, remindBefore: e.target.checked })}
            />
            <span>Включить напоминание за 24 часа</span>
          </label>
        </div>
        <div className={styles.modalFooter}>
          <button className={controls.secondaryButton} onClick={onClose}>
            Отмена
          </button>
          <button
            className={controls.primaryButton}
            onClick={() => {
              onAddHomework();
              if (draft.text.trim()) {
                onClose();
              }
            }}
          >
            Создать
          </button>
        </div>
      </div>
    </div>
  );
};

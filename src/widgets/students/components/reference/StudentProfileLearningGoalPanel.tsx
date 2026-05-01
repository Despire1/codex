import { FC, useEffect, useRef, useState } from 'react';
import { StudentListItem } from '../../../../entities/types';
import { DeleteOutlineIcon, EditOutlinedIcon } from '../../../../icons/MaterialIcons';
import { DialogModal } from '../../../../shared/ui/Modal/DialogModal';
import styles from './StudentProfileLearningGoalPanel.module.css';

interface StudentProfileLearningGoalPanelProps {
  studentEntry: StudentListItem;
  onSaveGoal?: (studentEntry: StudentListItem, value: string) => Promise<void>;
}

const TargetIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 512 512" fill="currentColor" aria-hidden focusable="false" className={className}>
    <path d="M256 48a208 208 0 1 0 208 208A208.2 208.2 0 0 0 256 48zm0 352a144 144 0 1 1 144-144A144.16 144.16 0 0 1 256 400zm0-240a96 96 0 1 0 96 96 96.11 96.11 0 0 0-96-96zm0 128a32 32 0 1 1 32-32 32 32 0 0 1-32 32zm0-288a32 32 0 0 0 0 64c106 0 192 86 192 192a32 32 0 0 0 64 0C512 114.62 397.38 0 256 0z" />
  </svg>
);

export const StudentProfileLearningGoalPanel: FC<StudentProfileLearningGoalPanelProps> = ({
  studentEntry,
  onSaveGoal,
}) => {
  const learningGoal = studentEntry.link.learningGoal?.trim() ?? '';
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(learningGoal);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!isEditing) {
      setDraftValue(learningGoal);
    }
  }, [isEditing, learningGoal]);

  useEffect(() => {
    if (isEditing) {
      textareaRef.current?.focus();
    }
  }, [isEditing]);

  if (!onSaveGoal) {
    if (!learningGoal) return null;
    return (
      <section className={styles.card}>
        <div className={styles.header}>
          <h3 className={styles.title}>Цель занятий</h3>
        </div>
        <article className={styles.goalCard}>
          <div className={styles.goalHeader}>
            <div className={styles.goalBody}>
              <div className={styles.goalIconWrap} aria-hidden>
                <TargetIcon className={styles.goalIcon} />
              </div>
              <p className={styles.goalContent}>{learningGoal}</p>
            </div>
          </div>
        </article>
      </section>
    );
  }

  const handleStartEdit = () => {
    setDraftValue(learningGoal);
    setIsEditing(true);
  };

  const handleCancel = () => {
    if (isSaving) return;
    setIsEditing(false);
    setDraftValue(learningGoal);
  };

  const handleSave = async () => {
    const next = draftValue.trim();
    if (next === learningGoal) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    try {
      await onSaveGoal(studentEntry, next);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onSaveGoal(studentEntry, '');
      setConfirmDelete(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>Цель занятий</h3>
        {!learningGoal && !isEditing ? (
          <button type="button" className={styles.addButton} onClick={handleStartEdit}>
            + Добавить
          </button>
        ) : null}
      </div>

      {isEditing ? (
        <article className={styles.goalCard}>
          <textarea
            ref={textareaRef}
            className={styles.goalTextarea}
            rows={3}
            value={draftValue}
            disabled={isSaving}
            placeholder="Например: подготовка к экзамену, разговорная практика..."
            onChange={(event) => setDraftValue(event.target.value)}
          />
          <div className={styles.goalEditActions}>
            <button type="button" className={styles.goalCancelButton} onClick={handleCancel} disabled={isSaving}>
              Отмена
            </button>
            <button
              type="button"
              className={styles.goalSaveButton}
              onClick={() => {
                void handleSave();
              }}
              disabled={isSaving}
            >
              {isSaving ? 'Сохраняем...' : 'Сохранить'}
            </button>
          </div>
        </article>
      ) : learningGoal ? (
        <article className={styles.goalCard}>
          <div className={styles.goalHeader}>
            <div className={styles.goalBody}>
              <div className={styles.goalIconWrap} aria-hidden>
                <TargetIcon className={styles.goalIcon} />
              </div>
              <p className={styles.goalContent}>{learningGoal}</p>
            </div>
            <div className={styles.goalQuickActions}>
              <button
                type="button"
                className={styles.goalActionButton}
                aria-label="Редактировать цель"
                onClick={handleStartEdit}
              >
                <EditOutlinedIcon className={styles.goalActionIcon} />
              </button>
              <button
                type="button"
                className={styles.goalActionButton}
                aria-label="Удалить цель"
                onClick={() => setConfirmDelete(true)}
              >
                <DeleteOutlineIcon className={styles.goalActionIcon} />
              </button>
            </div>
          </div>
        </article>
      ) : (
        <div className={styles.goalEmptyState}>Цель ещё не задана</div>
      )}

      <DialogModal
        open={confirmDelete}
        title="Удалить цель занятий?"
        description="Цель будет удалена. Вы сможете задать её снова в любой момент."
        confirmText={isSaving ? 'Удаляем...' : 'Удалить'}
        cancelText="Отмена"
        onClose={() => {
          if (!isSaving) setConfirmDelete(false);
        }}
        onCancel={() => {
          if (!isSaving) setConfirmDelete(false);
        }}
        onConfirm={() => {
          void handleDelete();
        }}
      />
    </section>
  );
};

import { type FC } from 'react';
import { LinkedStudent } from '../../../entities/types';
import controls from '../../../shared/styles/controls.module.css';
import modalStyles from '../modal.module.css';

interface LessonModalProps {
  open: boolean;
  editingLessonId: number | null;
  defaultDuration: number;
  linkedStudents: LinkedStudent[];
  draft: { studentId: number | undefined; date: string; time: string; durationMinutes: number };
  onDraftChange: (draft: {
    studentId: number | undefined;
    date: string;
    time: string;
    durationMinutes: number;
  }) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export const LessonModal: FC<LessonModalProps> = ({
  open,
  editingLessonId,
  defaultDuration,
  linkedStudents,
  draft,
  onDraftChange,
  onClose,
  onSubmit,
}) => {
  if (!open) return null;

  return (
    <div className={modalStyles.modalOverlay} onClick={onClose}>
      <div className={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={modalStyles.modalHeader}>
          <div>
            <div className={modalStyles.modalLabel}>{editingLessonId ? 'Редактирование урока' : 'Новый урок'}</div>
            <div className={modalStyles.modalTitle}>По умолчанию {defaultDuration} мин</div>
          </div>
          <button className={modalStyles.closeButton} onClick={onClose} aria-label="Закрыть модалку">
            ×
          </button>
        </div>
        <div className={modalStyles.modalBody}>
          <div className={controls.formRow}>
            <select
              className={controls.input}
              value={draft.studentId ?? ''}
              onChange={(e) =>
                onDraftChange({ ...draft, studentId: e.target.value ? Number(e.target.value) : undefined })
              }
            >
              <option value="">Выберите ученика</option>
              {linkedStudents.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.link.customName}
                </option>
              ))}
            </select>
            <input
              className={controls.input}
              type="date"
              value={draft.date}
              onChange={(e) => onDraftChange({ ...draft, date: e.target.value })}
            />
            <input
              className={controls.input}
              type="time"
              value={draft.time}
              onChange={(e) => onDraftChange({ ...draft, time: e.target.value })}
            />
            <input
              className={controls.input}
              type="number"
              value={draft.durationMinutes}
              onChange={(e) => onDraftChange({ ...draft, durationMinutes: Number(e.target.value) })}
              placeholder={`${defaultDuration}`}
            />
          </div>
        </div>
        <div className={modalStyles.modalActions}>
          <button className={controls.secondaryButton} onClick={onClose}>
            Отмена
          </button>
          <button className={controls.primaryButton} onClick={onSubmit}>
            Сохранить урок
          </button>
        </div>
      </div>
    </div>
  );
};

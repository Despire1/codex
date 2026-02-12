import { ChangeEvent, FC, FormEvent, useEffect, useState } from 'react';
import { HomeworkTemplate } from '../../../entities/types';
import controls from '../../../shared/styles/controls.module.css';
import { Modal } from '../../../shared/ui/Modal/Modal';
import { TeacherAssignmentCreatePayload, TeacherHomeworkStudentOption } from '../../../widgets/homeworks/types';
import styles from '../../../widgets/homeworks/teacher/TeacherHomeworksView.module.css';

interface HomeworkAssignModalProps {
  open: boolean;
  templates: HomeworkTemplate[];
  students: TeacherHomeworkStudentOption[];
  submitting: boolean;
  defaultStudentId: number | null;
  onSubmit: (payload: TeacherAssignmentCreatePayload) => Promise<boolean>;
  onClose: () => void;
}

type AssignmentDraft = {
  title: string;
  studentId: number | null;
  templateId: number | null;
  sendMode: 'MANUAL' | 'AUTO_AFTER_LESSON_DONE';
  sendNow: boolean;
  deadlineAt: string;
};

const buildInitialDraft = (defaultStudentId: number | null): AssignmentDraft => ({
  title: '',
  studentId: defaultStudentId,
  templateId: null,
  sendMode: 'MANUAL',
  sendNow: false,
  deadlineAt: '',
});

export const HomeworkAssignModal: FC<HomeworkAssignModalProps> = ({
  open,
  templates,
  students,
  submitting,
  defaultStudentId,
  onSubmit,
  onClose,
}) => {
  const [draft, setDraft] = useState<AssignmentDraft>(buildInitialDraft(defaultStudentId));

  useEffect(() => {
    if (!open) return;
    setDraft(buildInitialDraft(defaultStudentId));
  }, [defaultStudentId, open]);

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.studentId) return;
    const success = await onSubmit({
      studentId: draft.studentId,
      templateId: draft.templateId,
      title: draft.title,
      sendMode: draft.sendMode,
      sendNow: draft.sendNow,
      deadlineAt: draft.deadlineAt ? new Date(draft.deadlineAt).toISOString() : null,
    });
    if (success) onClose();
  };

  const handleTextChange =
    (field: 'title' | 'deadlineAt') => (event: ChangeEvent<HTMLInputElement>) => {
      setDraft((prev) => ({
        ...prev,
        [field]: event.target.value,
      }));
    };

  return (
    <Modal open={open} onClose={handleClose} title="Выдать домашку ученику">
      <form className={styles.modalForm} onSubmit={handleSubmit}>
        <label className={styles.fieldLabel}>
          Ученик
          <select
            className={controls.input}
            value={draft.studentId ? String(draft.studentId) : ''}
            onChange={(event) => {
              const value = event.target.value;
              setDraft((prev) => ({ ...prev, studentId: value ? Number(value) : null }));
            }}
            required
          >
            <option value="" disabled>
              Выберите ученика
            </option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.fieldLabel}>
          Шаблон (опционально)
          <select
            className={controls.input}
            value={draft.templateId ? String(draft.templateId) : ''}
            onChange={(event) => {
              const value = event.target.value;
              setDraft((prev) => ({ ...prev, templateId: value ? Number(value) : null }));
            }}
          >
            <option value="">Без шаблона</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.title}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.fieldLabel}>
          Название домашки (опционально)
          <input
            className={controls.input}
            type="text"
            value={draft.title}
            onChange={handleTextChange('title')}
            placeholder="Если пусто, возьмем название из шаблона"
          />
        </label>
        <label className={styles.fieldLabel}>
          Дедлайн
          <input
            className={controls.input}
            type="datetime-local"
            value={draft.deadlineAt}
            onChange={handleTextChange('deadlineAt')}
          />
        </label>
        <label className={styles.fieldLabel}>
          Режим отправки
          <select
            className={controls.input}
            value={draft.sendMode}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                sendMode: event.target.value === 'AUTO_AFTER_LESSON_DONE' ? 'AUTO_AFTER_LESSON_DONE' : 'MANUAL',
              }))
            }
          >
            <option value="MANUAL">Вручную</option>
            <option value="AUTO_AFTER_LESSON_DONE">Авто после завершения урока</option>
          </select>
        </label>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={draft.sendNow}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                sendNow: event.target.checked,
              }))
            }
          />
          Отправить сразу после создания
        </label>
        {!students.length ? <div className={styles.inlineHint}>Нет учеников. Сначала добавь ученика в разделе «Ученики».</div> : null}
        <div className={styles.modalActions}>
          <button type="button" className={controls.secondaryButton} onClick={handleClose} disabled={submitting}>
            Отмена
          </button>
          <button type="submit" className={controls.primaryButton} disabled={submitting || !students.length || !draft.studentId}>
            {submitting ? 'Сохраняю…' : draft.sendNow ? 'Создать и отправить' : 'Создать домашку'}
          </button>
        </div>
      </form>
    </Modal>
  );
};


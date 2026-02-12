import { ChangeEvent, FC, FormEvent, useEffect, useMemo, useState } from 'react';
import { HomeworkTemplate } from '../../../entities/types';
import controls from '../../../shared/styles/controls.module.css';
import { Modal } from '../../../shared/ui/Modal/Modal';
import { TeacherAssignmentCreatePayload, TeacherHomeworkStudentOption } from '../../../widgets/homeworks/types';
import { describeTemplateBlocks } from '../../../entities/homework-template/model/lib/describeTemplateBlocks';
import styles from './HomeworkAssignModal.module.css';

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

type AssignmentDeliveryMode = 'SEND_NOW' | 'SAVE_DRAFT' | 'AUTO_AFTER_LESSON';

const buildInitialDraft = (defaultStudentId: number | null): AssignmentDraft => ({
  title: '',
  studentId: defaultStudentId,
  templateId: null,
  sendMode: 'MANUAL',
  sendNow: false,
  deadlineAt: '',
});

const toDateTimeLocalValue = (value: Date) => {
  const shifted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
};

const createQuickDeadline = (daysFromNow: number, hour: number) => {
  const now = new Date();
  const date = new Date(now);
  date.setDate(now.getDate() + daysFromNow);
  date.setHours(hour, 0, 0, 0);
  return toDateTimeLocalValue(date);
};

const resolveDeliveryMode = (draft: AssignmentDraft): AssignmentDeliveryMode => {
  if (draft.sendNow) return 'SEND_NOW';
  if (draft.sendMode === 'AUTO_AFTER_LESSON_DONE') return 'AUTO_AFTER_LESSON';
  return 'SAVE_DRAFT';
};

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
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === draft.templateId) ?? null,
    [draft.templateId, templates],
  );
  const selectedTemplateDescription = useMemo(
    () => (selectedTemplate ? describeTemplateBlocks(selectedTemplate.blocks) : null),
    [selectedTemplate],
  );
  const deliveryMode = resolveDeliveryMode(draft);

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

  const setDeliveryMode = (mode: AssignmentDeliveryMode) => {
    if (mode === 'SEND_NOW') {
      setDraft((prev) => ({
        ...prev,
        sendNow: true,
        sendMode: 'MANUAL',
      }));
      return;
    }
    if (mode === 'AUTO_AFTER_LESSON') {
      setDraft((prev) => ({
        ...prev,
        sendNow: false,
        sendMode: 'AUTO_AFTER_LESSON_DONE',
      }));
      return;
    }
    setDraft((prev) => ({
      ...prev,
      sendNow: false,
      sendMode: 'MANUAL',
    }));
  };

  const submitLabel =
    deliveryMode === 'SEND_NOW'
      ? 'Создать и отправить'
      : deliveryMode === 'AUTO_AFTER_LESSON'
        ? 'Создать и запланировать'
        : 'Создать черновик';

  return (
    <Modal open={open} onClose={handleClose} title="Выдать домашку ученику">
      <form className={styles.modalForm} onSubmit={handleSubmit}>
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>1. Кому выдаем</h4>
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
          {!students.length ? (
            <div className={styles.inlineHint}>Нет учеников. Сначала добавь ученика в разделе «Ученики».</div>
          ) : null}
        </section>

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>2. Что выдаем</h4>
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
              placeholder="Если пусто, возьмем название из шаблона или «Домашнее задание»"
            />
          </label>
          {selectedTemplate ? (
            <div className={styles.templatePreview}>
              <div className={styles.previewTitle}>Шаблон: {selectedTemplate.title}</div>
              <div className={styles.previewBlocks}>
                {selectedTemplateDescription?.items.map((item) => (
                  <span key={item.id} className={styles.previewChip}>
                    {item.title}
                    {item.details ? `: ${item.details}` : ''}
                  </span>
                ))}
              </div>
              {selectedTemplateDescription?.firstTextPreview ? (
                <div className={styles.previewText}>{selectedTemplateDescription.firstTextPreview}</div>
              ) : null}
            </div>
          ) : (
            <div className={styles.inlineText}>
              Можно выдать домашку без шаблона: ученик получит задание с базовым названием.
            </div>
          )}
        </section>

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>3. Когда отправить</h4>
          <div className={styles.deliveryModes}>
            <button
              type="button"
              className={`${styles.deliveryButton} ${deliveryMode === 'SEND_NOW' ? styles.deliveryButtonActive : ''}`}
              onClick={() => setDeliveryMode('SEND_NOW')}
            >
              Сразу ученику
            </button>
            <button
              type="button"
              className={`${styles.deliveryButton} ${deliveryMode === 'SAVE_DRAFT' ? styles.deliveryButtonActive : ''}`}
              onClick={() => setDeliveryMode('SAVE_DRAFT')}
            >
              Сохранить как черновик
            </button>
            <button
              type="button"
              className={`${styles.deliveryButton} ${deliveryMode === 'AUTO_AFTER_LESSON' ? styles.deliveryButtonActive : ''}`}
              onClick={() => setDeliveryMode('AUTO_AFTER_LESSON')}
            >
              Авто после урока
            </button>
          </div>
          <div className={styles.inlineText}>
            {deliveryMode === 'SEND_NOW'
              ? 'Домашка сразу появится у ученика.'
              : deliveryMode === 'AUTO_AFTER_LESSON'
                ? 'Домашка отправится автоматически при завершении урока.'
                : 'Домашка сохранится у тебя в черновиках без отправки ученику.'}
          </div>
        </section>

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>4. Дедлайн</h4>
          <label className={styles.fieldLabel}>
            Дата и время
            <input
              className={controls.input}
              type="datetime-local"
              value={draft.deadlineAt}
              onChange={handleTextChange('deadlineAt')}
            />
          </label>
          <div className={styles.quickButtons}>
            <button
              type="button"
              className={controls.smallButton}
              onClick={() => setDraft((prev) => ({ ...prev, deadlineAt: createQuickDeadline(1, 20) }))}
            >
              Завтра в 20:00
            </button>
            <button
              type="button"
              className={controls.smallButton}
              onClick={() => setDraft((prev) => ({ ...prev, deadlineAt: createQuickDeadline(2, 20) }))}
            >
              Через 2 дня в 20:00
            </button>
            <button
              type="button"
              className={controls.smallButton}
              onClick={() => setDraft((prev) => ({ ...prev, deadlineAt: '' }))}
            >
              Без дедлайна
            </button>
          </div>
        </section>

        <div className={styles.modalActions}>
          <button type="button" className={controls.secondaryButton} onClick={handleClose} disabled={submitting}>
            Отмена
          </button>
          <button type="submit" className={controls.primaryButton} disabled={submitting || !students.length || !draft.studentId}>
            {submitting ? 'Сохраняю…' : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
};

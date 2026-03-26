import { FC, FormEvent, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HomeworkTemplate, HomeworkGroupListItem } from '../../../entities/types';
import { CalendarMonthIcon } from '../../../icons/MaterialIcons';
import { api } from '../../../shared/api/client';
import { useFocusTrap } from '../../../shared/lib/useFocusTrap';
import { useTimeZone } from '../../../shared/lib/timezoneContext';
import { formatInTimeZone } from '../../../shared/lib/timezoneDates';
import {
  HomeworkChevronDownIcon,
  HomeworkCircleCheckIcon,
  HomeworkFileLinesIcon,
  HomeworkPlayIcon,
  HomeworkXMarkIcon,
} from '../../../shared/ui/icons/HomeworkFaIcons';
import { BottomSheet } from '../../../shared/ui/BottomSheet/BottomSheet';
import { TeacherAssignmentEditorPrefill, TeacherHomeworkStudentOption } from '../../../widgets/homeworks/types';
import {
  createQuickDeadlineValue,
  resolveNextUpcomingLesson,
  toLocalDateTimeValue,
  toUtcIsoFromLocal,
} from '../model/lib/assignmentStarter';
import styles from './HomeworkAssignModal.module.css';

interface HomeworkAssignModalProps {
  open: boolean;
  templates: HomeworkTemplate[];
  groups: HomeworkGroupListItem[];
  students: TeacherHomeworkStudentOption[];
  loading?: boolean;
  submitting: boolean;
  defaultStudentId: number | null;
  defaultLessonId?: number | null;
  defaultTemplateId?: number | null;
  defaultGroupId?: number | null;
  onSubmit: (payload: TeacherAssignmentEditorPrefill) => Promise<boolean>;
  onClose: () => void;
  variant?: 'modal' | 'sheet';
}

type AssignmentDraft = {
  studentId: number | null;
  templateId: number | null;
  groupId: number | null;
  deadlineLocal: string;
  sendMode: TeacherAssignmentEditorPrefill['sendMode'];
  lessonId: number | null;
};

type NextLessonRef = {
  id: number;
  startAt: string;
};

const FAVORITE_TAG = '__favorite';

const isFavoriteTemplate = (template: HomeworkTemplate) =>
  template.tags.some((tag) => tag.trim().toLowerCase() === FAVORITE_TAG);

const sortTemplatesForModal = (templates: HomeworkTemplate[]) =>
  templates
    .slice()
    .sort((left, right) => {
      const leftFavorite = isFavoriteTemplate(left) ? 1 : 0;
      const rightFavorite = isFavoriteTemplate(right) ? 1 : 0;
      if (leftFavorite !== rightFavorite) return rightFavorite - leftFavorite;
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });

const resolveTemplateCategory = (template: HomeworkTemplate) => {
  const subject = template.subject?.trim();
  if (subject) return subject;
  const firstTag = template.tags
    .map((tag) => tag.trim())
    .find((tag) => tag.length > 0 && tag.toLowerCase() !== FAVORITE_TAG);
  return firstTag ?? 'Общее';
};

const estimateQuestionMinutes = (block: HomeworkTemplate['blocks'][number]) => {
  if (block.type !== 'TEST') return 0;
  const questionsCount = Array.isArray(block.questions) ? block.questions.length : 0;
  return Math.max(questionsCount * 2, questionsCount > 0 ? 3 : 0);
};

const estimateTextMinutes = (block: HomeworkTemplate['blocks'][number]) => {
  if (block.type !== 'TEXT') return 0;
  const words = block.content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 120));
};

const estimateMediaMinutes = (block: HomeworkTemplate['blocks'][number]) => {
  if (block.type !== 'MEDIA') return 0;
  return Array.isArray(block.attachments) ? block.attachments.length * 3 : 0;
};

const estimateStudentResponseMinutes = (block: HomeworkTemplate['blocks'][number]) => {
  if (block.type !== 'STUDENT_RESPONSE') return 0;
  let score = 0;
  if (block.allowText) score += 5;
  if (block.allowVoice) score += 4;
  if (block.allowFiles || block.allowDocuments || block.allowPhotos || block.allowAudio || block.allowVideo) score += 3;
  return score;
};

const estimateTemplateDuration = (template: HomeworkTemplate) => {
  const estimated = template.blocks.reduce((total, block) => {
    return total + estimateQuestionMinutes(block) + estimateTextMinutes(block) + estimateMediaMinutes(block) + estimateStudentResponseMinutes(block);
  }, 0);
  return Math.max(estimated, 5);
};

const formatTemplateDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (restMinutes === 0) return `${hours} ч`;
  return `${hours} ч ${restMinutes} мин`;
};

const pickInitialStudentId = (students: TeacherHomeworkStudentOption[], defaultStudentId: number | null) => {
  const hasDefault =
    typeof defaultStudentId === 'number' && students.some((student) => student.id === defaultStudentId);
  if (hasDefault) return defaultStudentId;
  return students[0]?.id ?? null;
};

const pickInitialTemplateId = (templates: HomeworkTemplate[], defaultTemplateId: number | null) => {
  const hasDefault =
    typeof defaultTemplateId === 'number' && templates.some((template) => template.id === defaultTemplateId);
  if (hasDefault) return defaultTemplateId;
  return templates[0]?.id ?? null;
};

const buildInitialDraft = (params: {
  students: TeacherHomeworkStudentOption[];
  templates: HomeworkTemplate[];
  groups: HomeworkGroupListItem[];
  defaultStudentId: number | null;
  defaultLessonId: number | null;
  defaultTemplateId: number | null;
  defaultGroupId: number | null;
}): AssignmentDraft => {
  const initialStudentId = pickInitialStudentId(params.students, params.defaultStudentId);
  const initialTemplateId = pickInitialTemplateId(params.templates, params.defaultTemplateId);
  const hasTemplates = params.templates.length > 0;
  const availableGroups = params.groups.filter((group) => !group.isSystem && !group.isArchived);
  const hasDefaultGroup =
    typeof params.defaultGroupId === 'number' && availableGroups.some((group) => group.id === params.defaultGroupId);

  return {
    studentId: initialStudentId,
    templateId: hasTemplates ? initialTemplateId : null,
    groupId: hasDefaultGroup ? params.defaultGroupId : null,
    deadlineLocal: '',
    sendMode: 'MANUAL',
    lessonId: typeof params.defaultLessonId === 'number' ? params.defaultLessonId : null,
  };
};

export const HomeworkAssignModal: FC<HomeworkAssignModalProps> = ({
  open,
  templates,
  groups,
  students,
  loading = false,
  submitting,
  defaultStudentId,
  defaultLessonId = null,
  defaultTemplateId = null,
  defaultGroupId = null,
  onSubmit,
  onClose,
  variant = 'modal',
}) => {
  const timeZone = useTimeZone();
  const containerRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  useFocusTrap(open, containerRef);

  const sortedTemplates = useMemo(() => sortTemplatesForModal(templates), [templates]);
  const assignmentGroups = useMemo(
    () =>
      groups
        .filter((group) => !group.isSystem && !group.isArchived)
        .slice()
        .sort((left, right) => {
          if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
          return left.title.localeCompare(right.title, 'ru');
        }),
    [groups],
  );
  const quickTemplates = useMemo(() => sortedTemplates.slice(0, 5), [sortedTemplates]);
  const templatesById = useMemo(() => new Map(sortedTemplates.map((template) => [template.id, template])), [sortedTemplates]);

  const [draft, setDraft] = useState<AssignmentDraft>(() =>
    buildInitialDraft({
      students,
      templates: sortedTemplates,
      groups: assignmentGroups,
      defaultStudentId,
      defaultLessonId,
      defaultTemplateId,
      defaultGroupId,
    }),
  );
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
  const [isResolvingNextLesson, setIsResolvingNextLesson] = useState(false);
  const [nextLessonError, setNextLessonError] = useState<string | null>(null);
  const [nextLesson, setNextLesson] = useState<NextLessonRef | null>(null);

  const selectedTemplate = useMemo(
    () => (draft.templateId ? templatesById.get(draft.templateId) ?? null : null),
    [draft.templateId, templatesById],
  );

  const hasStudents = students.length > 0;
  const hasValidTemplate = Boolean(draft.templateId && templatesById.has(draft.templateId));
  const requiresLesson = draft.sendMode === 'AUTO_AFTER_LESSON_DONE';
  const hasValidLesson = !requiresLesson || Boolean(draft.lessonId);
  const isFormDisabled = submitting || loading;
  const canSubmit = hasStudents && Boolean(draft.studentId) && hasValidTemplate && hasValidLesson && !isFormDisabled;

  const selectedLessonLabel = useMemo(() => {
    if (!draft.lessonId) return null;
    if (nextLesson?.id === draft.lessonId) {
      return `Следующий урок: ${formatInTimeZone(nextLesson.startAt, 'd MMM, HH:mm', { timeZone })}`;
    }
    return `Привязка к уроку #${draft.lessonId}`;
  }, [draft.lessonId, nextLesson, timeZone]);

  const closeRequest = useCallback(() => {
    if (submitting) return;
    onClose();
  }, [onClose, submitting]);

  useEffect(() => {
    if (!open) return;
    setDraft(
      buildInitialDraft({
        students,
        templates: sortedTemplates,
        groups: assignmentGroups,
        defaultStudentId,
        defaultLessonId,
        defaultTemplateId,
        defaultGroupId,
      }),
    );
    setIsTemplatePickerOpen(false);
    setIsResolvingNextLesson(false);
    setNextLessonError(null);
    setNextLesson(null);
  }, [assignmentGroups, defaultGroupId, defaultLessonId, defaultStudentId, defaultTemplateId, open, sortedTemplates, students]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRequest();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeRequest, open]);

  useEffect(() => {
    if (!open) return;
    if (draft.templateId && templatesById.has(draft.templateId)) return;
    const fallbackTemplateId = quickTemplates[0]?.id ?? sortedTemplates[0]?.id ?? null;
    setDraft((prev) => ({ ...prev, templateId: fallbackTemplateId }));
  }, [draft.templateId, open, quickTemplates, sortedTemplates, templatesById]);

  const resolveNextLesson = useCallback(async (studentId: number) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsResolvingNextLesson(true);
    setNextLessonError(null);

    try {
      const response = await api.listStudentLessons(studentId, {
        status: 'not_completed',
        sort: 'asc',
      });
      if (requestIdRef.current !== requestId) return null;

      const resolved = resolveNextUpcomingLesson(response.items);
      if (!resolved) {
        setNextLesson(null);
        setNextLessonError('У ученика нет ближайшего активного урока.');
        return null;
      }

      const nextLessonRef = { id: resolved.id, startAt: resolved.startAt };
      setNextLesson(nextLessonRef);
      setNextLessonError(null);
      return nextLessonRef;
    } catch (error) {
      if (requestIdRef.current !== requestId) return null;
      setNextLesson(null);
      setNextLessonError('Не удалось загрузить ближайший урок.');
      return null;
    } finally {
      if (requestIdRef.current === requestId) {
        setIsResolvingNextLesson(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (!draft.studentId) return;
    void resolveNextLesson(draft.studentId);
  }, [draft.studentId, open, resolveNextLesson]);

  const applyNextLesson = useCallback(async () => {
    if (!draft.studentId) return;
    const resolvedLesson = await resolveNextLesson(draft.studentId);
    if (!resolvedLesson) {
      setDraft((prev) => ({ ...prev, lessonId: null }));
      return;
    }

    setDraft((prev) => ({
      ...prev,
      lessonId: resolvedLesson.id,
      deadlineLocal: toLocalDateTimeValue(resolvedLesson.startAt, timeZone),
    }));
  }, [draft.studentId, resolveNextLesson, timeZone]);

  const handleBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    closeRequest();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.studentId || !canSubmit) return;

    const deadlineAt = draft.deadlineLocal ? toUtcIsoFromLocal(draft.deadlineLocal, timeZone) : null;

    const success = await onSubmit({
      studentId: draft.studentId,
      lessonId: draft.lessonId,
      templateId: draft.templateId,
      groupId: draft.groupId,
      sendMode: draft.sendMode,
      deadlineAt,
    });

    if (success) {
      onClose();
    }
  };

  const content = (
    <div
      className={`${styles.modal} ${variant === 'sheet' ? styles.sheetModal : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Создать домашнее задание по шаблону"
      ref={containerRef}
    >
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.header}>
            <h2 className={styles.title}>Создать домашку по шаблону</h2>
            <button
              type="button"
              className={styles.closeButton}
              onClick={closeRequest}
              aria-label="Закрыть модальное окно"
              disabled={submitting}
            >
              <HomeworkXMarkIcon size={16} />
            </button>
          </div>

          <div className={styles.body}>
            <section className={styles.section}>
              <label className={styles.label} htmlFor="homework-assign-student">
                Кому
              </label>
              <div className={styles.selectWrap}>
                <select
                  id="homework-assign-student"
                  className={styles.selectField}
                  value={draft.studentId ? String(draft.studentId) : ''}
                  onChange={(event) => {
                    const nextStudentId = event.target.value ? Number(event.target.value) : null;
                    setDraft((prev) => ({ ...prev, studentId: nextStudentId, lessonId: null }));
                    setNextLesson(null);
                    setNextLessonError(null);
                  }}
                  disabled={!hasStudents || isFormDisabled}
                >
                  <option value="" disabled>
                    Выберите ученика...
                  </option>
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name}
                    </option>
                  ))}
                </select>
                <span className={styles.selectIcon} aria-hidden>
                  <HomeworkChevronDownIcon size={12} />
                </span>
              </div>
              {!hasStudents && !loading ? (
                <p className={styles.inlineWarning}>Нет учеников. Добавьте ученика в разделе «Ученики».</p>
              ) : null}
            </section>

            <section className={styles.section}>
              <span className={styles.label}>Что (Шаблон)</span>
              <div className={styles.templateModeGrid}>
                <button
                  type="button"
                  className={`${styles.templateModeCard} ${styles.templateModeCardActive}`}
                  disabled
                >
                  <span className={styles.templateModeIcon} aria-hidden>
                    <HomeworkCircleCheckIcon size={16} />
                  </span>
                  <span className={styles.templateModeTitle}>Шаблон обязателен</span>
                  <span className={styles.templateModeHint}>Сначала выбираем основу, потом донастраиваем в редакторе</span>
                </button>
              </div>

              <div className={styles.templatePreviewCard}>
                <div className={styles.templatePreviewLeft}>
                  <span className={styles.templatePreviewIcon} aria-hidden>
                    <HomeworkFileLinesIcon size={16} />
                  </span>
                  <div className={styles.templatePreviewText}>
                    <div className={styles.templatePreviewTitle}>{selectedTemplate?.title ?? 'Шаблон не выбран'}</div>
                    <div className={styles.templatePreviewMeta}>
                      {selectedTemplate
                        ? `${resolveTemplateCategory(selectedTemplate)} · ${formatTemplateDuration(estimateTemplateDuration(selectedTemplate))}`
                        : 'Выберите шаблон из списка'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.templateChangeButton}
                  onClick={() => setIsTemplatePickerOpen((prev) => !prev)}
                  disabled={!sortedTemplates.length || isFormDisabled}
                >
                  Изменить
                </button>
              </div>

              {isTemplatePickerOpen ? (
                <div className={styles.templatePicker}>
                  {sortedTemplates.map((template) => {
                    const active = template.id === draft.templateId;
                    return (
                      <button
                        key={template.id}
                        type="button"
                        className={`${styles.templatePickerOption} ${active ? styles.templatePickerOptionActive : ''}`}
                        onClick={() => {
                          setDraft((prev) => ({ ...prev, templateId: template.id }));
                          setIsTemplatePickerOpen(false);
                        }}
                      >
                        <span className={styles.templatePickerTitle}>{template.title}</span>
                        <span className={styles.templatePickerMeta}>
                          {resolveTemplateCategory(template)} · {formatTemplateDuration(estimateTemplateDuration(template))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {!hasValidTemplate ? (
                <p className={styles.validationError}>Выберите шаблон для выдачи домашки.</p>
              ) : null}
            </section>

            <section className={styles.settingsGrid}>
              <div className={styles.section}>
                <label className={styles.label} htmlFor="homework-assign-group">
                  Группа
                </label>
                <div className={styles.selectWrap}>
                  <select
                    id="homework-assign-group"
                    className={styles.selectField}
                    value={draft.groupId ? String(draft.groupId) : ''}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, groupId: event.target.value ? Number(event.target.value) : null }))
                    }
                    disabled={isFormDisabled}
                  >
                    <option value="">Без группы</option>
                    {assignmentGroups.map((group) => (
                      <option key={group.id} value={group.id ?? ''}>
                        {group.title}
                      </option>
                    ))}
                  </select>
                  <span className={styles.selectIcon} aria-hidden>
                    <HomeworkChevronDownIcon size={12} />
                  </span>
                </div>
              </div>

              <div className={styles.section}>
                <label className={styles.label} htmlFor="homework-assign-deadline">
                  Дедлайн
                </label>
                <div className={styles.datetimeWrap}>
                  <input
                    id="homework-assign-deadline"
                    className={styles.datetimeField}
                    type="datetime-local"
                    value={draft.deadlineLocal}
                    onChange={(event) => setDraft((prev) => ({ ...prev, deadlineLocal: event.target.value }))}
                    disabled={isFormDisabled}
                  />
                  <span className={styles.datetimeIcon} aria-hidden>
                    <CalendarMonthIcon width={16} height={16} />
                  </span>
                </div>

                <div className={styles.quickActions}>
                  <button
                    type="button"
                    className={styles.quickButton}
                    onClick={() => setDraft((prev) => ({ ...prev, deadlineLocal: createQuickDeadlineValue(2, timeZone) }))}
                    disabled={isFormDisabled}
                  >
                    +2 дня
                  </button>
                  <button
                    type="button"
                    className={styles.quickButton}
                    onClick={() => {
                      void applyNextLesson();
                    }}
                    disabled={isFormDisabled || !draft.studentId || isResolvingNextLesson}
                  >
                    {isResolvingNextLesson ? 'Ищем...' : 'След. урок'}
                  </button>
                </div>

                {selectedLessonLabel ? <p className={styles.inlineInfo}>{selectedLessonLabel}</p> : null}
                {nextLessonError ? <p className={styles.inlineWarning}>{nextLessonError}</p> : null}
              </div>

              <div className={styles.section}>
                <span className={styles.label}>Отправка</span>
                <div className={styles.radioGroup}>
                  <label className={styles.radioRow}>
                    <input
                      type="radio"
                      name="homework-assign-send-type"
                      value="MANUAL"
                      checked={draft.sendMode === 'MANUAL'}
                      onChange={() => setDraft((prev) => ({ ...prev, sendMode: 'MANUAL' }))}
                      disabled={isFormDisabled}
                    />
                    <span>Вручную</span>
                  </label>
                  <label className={styles.radioRow}>
                    <input
                      type="radio"
                      name="homework-assign-send-type"
                      value="AUTO_AFTER_LESSON"
                      checked={draft.sendMode === 'AUTO_AFTER_LESSON_DONE'}
                      onChange={() => {
                        setDraft((prev) => ({ ...prev, sendMode: 'AUTO_AFTER_LESSON_DONE' }));
                        if (!draft.lessonId) {
                          void applyNextLesson();
                        }
                      }}
                      disabled={isFormDisabled || !draft.studentId}
                    />
                    <span>Авто после урока</span>
                  </label>
                </div>

                {requiresLesson && !hasValidLesson ? (
                  <p className={styles.validationError}>Для авто-отправки нужен ближайший урок. Нажмите «След. урок».</p>
                ) : null}
              </div>
            </section>
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.cancelButton} onClick={closeRequest} disabled={submitting}>
              Отмена
            </button>
            <button type="submit" className={styles.submitButton} disabled={!canSubmit}>
              <span>{submitting ? 'Открываю редактор…' : loading ? 'Загружаю…' : 'Продолжить'}</span>
              <HomeworkPlayIcon size={12} className={styles.submitIcon} />
            </button>
          </div>
        </form>
    </div>
  );

  if (variant === 'sheet') {
    return (
      <BottomSheet isOpen={open} onClose={closeRequest} contentScrollable={false}>
        {content}
      </BottomSheet>
    );
  }

  if (!open) return null;

  return (
    <div className={styles.overlay} onMouseDown={handleBackdropMouseDown}>
      {content}
    </div>
  );
};

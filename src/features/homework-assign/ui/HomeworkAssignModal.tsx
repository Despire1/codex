import { FC, FormEvent, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { HomeworkTemplate, HomeworkGroupListItem, Lesson } from '../../../entities/types';
import { CalendarMonthIcon } from '../../../icons/MaterialIcons';
import { api } from '../../../shared/api/client';
import { useFocusTrap } from '../../../shared/lib/useFocusTrap';
import { useTimeZone } from '../../../shared/lib/timezoneContext';
import { formatInTimeZone, toUtcDateFromTimeZone, toZonedDate } from '../../../shared/lib/timezoneDates';
import {
  HomeworkChevronDownIcon,
  HomeworkCircleCheckIcon,
  HomeworkFileLinesIcon,
  HomeworkPaperPlaneIcon,
  HomeworkXMarkIcon,
} from '../../../shared/ui/icons/HomeworkFaIcons';
import { BottomSheet } from '../../../shared/ui/BottomSheet/BottomSheet';
import { TeacherAssignmentCreatePayload, TeacherHomeworkStudentOption } from '../../../widgets/homeworks/types';
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
  onSubmit: (payload: TeacherAssignmentCreatePayload) => Promise<boolean>;
  onClose: () => void;
  variant?: 'modal' | 'sheet';
}

type TemplateMode = 'FAVORITES' | 'NEW';
type SendType = 'NOW' | 'AUTO_AFTER_LESSON';

type AssignmentDraft = {
  studentId: number | null;
  templateMode: TemplateMode;
  templateId: number | null;
  groupId: number | null;
  deadlineLocal: string;
  sendType: SendType;
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

const createQuickDeadlineValue = (daysFromNow: number, timeZone: string) => {
  const now = toZonedDate(new Date(), timeZone);
  now.setDate(now.getDate() + daysFromNow);
  now.setHours(20, 0, 0, 0);
  return format(now, "yyyy-MM-dd'T'HH:mm");
};

const toLocalDateTimeValue = (iso: string, timeZone: string) =>
  formatInTimeZone(iso, "yyyy-MM-dd'T'HH:mm", { timeZone });

const toUtcIsoFromLocal = (value: string, timeZone: string) => {
  const [datePart, timePart] = value.split('T');
  if (!datePart || !timePart) return null;
  const utcDate = toUtcDateFromTimeZone(datePart, timePart, timeZone);
  if (Number.isNaN(utcDate.getTime())) return null;
  return utcDate.toISOString();
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

const resolveNextUpcomingLesson = (lessons: Lesson[]) => {
  const nowTs = Date.now();
  return lessons
    .filter((lesson) => {
      if (lesson.status === 'CANCELED') return false;
      const lessonTs = new Date(lesson.startAt).getTime();
      return Number.isFinite(lessonTs) && lessonTs > nowTs;
    })
    .sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime())[0] ?? null;
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
    templateMode: hasTemplates ? 'FAVORITES' : 'NEW',
    templateId: hasTemplates ? initialTemplateId : null,
    groupId: hasDefaultGroup ? params.defaultGroupId : null,
    deadlineLocal: '',
    sendType: 'NOW',
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
    () => (draft.templateMode === 'FAVORITES' && draft.templateId ? templatesById.get(draft.templateId) ?? null : null),
    [draft.templateId, draft.templateMode, templatesById],
  );

  const hasStudents = students.length > 0;
  const requiresTemplate = draft.templateMode === 'FAVORITES' && sortedTemplates.length > 0;
  const hasValidTemplate = !requiresTemplate || Boolean(draft.templateId && templatesById.has(draft.templateId));
  const requiresLesson = draft.sendType === 'AUTO_AFTER_LESSON';
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
    if (draft.templateMode !== 'FAVORITES') return;
    if (draft.templateId && templatesById.has(draft.templateId)) return;
    const fallbackTemplateId = quickTemplates[0]?.id ?? sortedTemplates[0]?.id ?? null;
    setDraft((prev) => ({ ...prev, templateId: fallbackTemplateId }));
  }, [draft.templateId, draft.templateMode, open, quickTemplates, sortedTemplates, templatesById]);

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

    const templateId = draft.templateMode === 'FAVORITES' ? draft.templateId : null;
    const deadlineAt = draft.deadlineLocal ? toUtcIsoFromLocal(draft.deadlineLocal, timeZone) : null;
    const sendNow = draft.sendType === 'NOW';

    const success = await onSubmit({
      studentId: draft.studentId,
      lessonId: draft.lessonId,
      templateId,
      groupId: draft.groupId,
      sendMode: sendNow ? 'MANUAL' : 'AUTO_AFTER_LESSON_DONE',
      sendNow,
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
      aria-label="Выдать домашнее задание"
      ref={containerRef}
    >
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.header}>
            <h2 className={styles.title}>Выдать домашнее задание</h2>
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
                  className={`${styles.templateModeCard} ${draft.templateMode === 'FAVORITES' ? styles.templateModeCardActive : ''}`}
                  onClick={() => {
                    const fallbackTemplateId = draft.templateId ?? quickTemplates[0]?.id ?? sortedTemplates[0]?.id ?? null;
                    setDraft((prev) => ({
                      ...prev,
                      templateMode: 'FAVORITES',
                      templateId: fallbackTemplateId,
                    }));
                  }}
                  disabled={!sortedTemplates.length || isFormDisabled}
                >
                  {draft.templateMode === 'FAVORITES' ? (
                    <span className={styles.templateModeIcon} aria-hidden>
                      <HomeworkCircleCheckIcon size={16} />
                    </span>
                  ) : null}
                  <span className={styles.templateModeTitle}>Из избранного</span>
                  <span className={styles.templateModeHint}>Быстрый выбор из топ-5</span>
                </button>

                <button
                  type="button"
                  className={`${styles.templateModeCard} ${draft.templateMode === 'NEW' ? styles.templateModeCardActive : ''}`}
                  onClick={() => {
                    setDraft((prev) => ({
                      ...prev,
                      templateMode: 'NEW',
                      templateId: null,
                    }));
                    setIsTemplatePickerOpen(false);
                  }}
                  disabled={isFormDisabled}
                >
                  {draft.templateMode === 'NEW' ? (
                    <span className={styles.templateModeIcon} aria-hidden>
                      <HomeworkCircleCheckIcon size={16} />
                    </span>
                  ) : null}
                  <span className={styles.templateModeTitle}>Новое задание</span>
                  <span className={styles.templateModeHint}>Создать с нуля</span>
                </button>
              </div>

              {draft.templateMode === 'FAVORITES' ? (
                <>
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
                </>
              ) : (
                <div className={styles.templatePreviewCard}>
                  <div className={styles.templatePreviewText}>
                    <div className={styles.templatePreviewTitle}>Новое домашнее задание</div>
                    <div className={styles.templatePreviewMeta}>Домашка будет создана без шаблона.</div>
                  </div>
                </div>
              )}

              {requiresTemplate && !hasValidTemplate ? (
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
                      value="NOW"
                      checked={draft.sendType === 'NOW'}
                      onChange={() => setDraft((prev) => ({ ...prev, sendType: 'NOW' }))}
                      disabled={isFormDisabled}
                    />
                    <span>Отправить сейчас</span>
                  </label>
                  <label className={styles.radioRow}>
                    <input
                      type="radio"
                      name="homework-assign-send-type"
                      value="AUTO_AFTER_LESSON"
                      checked={draft.sendType === 'AUTO_AFTER_LESSON'}
                      onChange={() => {
                        setDraft((prev) => ({ ...prev, sendType: 'AUTO_AFTER_LESSON' }));
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
              <span>{submitting ? 'Выдаю…' : loading ? 'Загружаю…' : 'Выдать'}</span>
              <HomeworkPaperPlaneIcon size={12} className={styles.submitIcon} />
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

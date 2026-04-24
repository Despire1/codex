import { FC, FormEvent, MouseEvent, UIEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ru } from 'date-fns/locale';
import { HomeworkAssignment, HomeworkGroupListItem, HomeworkTemplate, Lesson } from '../../../entities/types';
import { api } from '../../../shared/api/client';
import { useFocusTrap } from '../../../shared/lib/useFocusTrap';
import { useTimeZone } from '../../../shared/lib/timezoneContext';
import { formatInTimeZone } from '../../../shared/lib/timezoneDates';
import controls from '../../../shared/styles/controls.module.css';
import { BottomSheet } from '../../../shared/ui/BottomSheet/BottomSheet';
import { DatePickerField } from '../../../shared/ui/DatePickerField';
import { SideSheet } from '../../../shared/ui/SideSheet/SideSheet';
import { AdaptivePopover } from '../../../shared/ui/AdaptivePopover/AdaptivePopover';
import {
  HomeworkCheckIcon,
  HomeworkChevronDownIcon,
  HomeworkFileLinesIcon,
  HomeworkMagnifyingGlassIcon,
  HomeworkXMarkIcon,
} from '../../../shared/ui/icons/HomeworkFaIcons';
import { TeacherAssignmentEditorPrefill, TeacherHomeworkStudentOption } from '../../../widgets/homeworks/types';
import {
  buildStudentInitials,
  resolveAssignmentStudentOptionAvatarColor,
  resolveAssignmentStudentOptionAvatarTextColor,
} from '../../homework-template-editor/model/lib/assignmentCreateScreen';
import { AssignmentSettingsSelect } from '../../homework-template-editor/ui/create-screen/AssignmentSettingsSelect';
import {
  createEndOfWeekDeadlineValue,
  createQuickDateTimeValue,
  createQuickDeadlineValue,
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
  variant?: 'modal' | 'sheet' | 'side-sheet';
}

type AssignmentDraft = {
  studentId: number | null;
  templateId: number | null;
  groupId: number | null;
  deadlineLocal: string;
  scheduledLocal: string;
  sendMode: TeacherAssignmentEditorPrefill['sendMode'];
  lessonId: number | null;
};

type FutureLessonRef = Pick<Lesson, 'id' | 'startAt' | 'durationMinutes'> & {
  linkedAssignmentTitle?: string | null;
  linkedAssignmentStatus?: HomeworkAssignment['status'] | null;
};

const FAVORITE_TAG = '__favorite';
const INITIAL_TEMPLATE_PAGE_SIZE = 20;
const TEMPLATE_PAGE_STEP = 20;

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
  const hasDefaultLesson = typeof params.defaultLessonId === 'number' && Number.isFinite(params.defaultLessonId);

  return {
    studentId: initialStudentId,
    templateId: hasTemplates ? initialTemplateId : null,
    groupId: hasDefaultGroup ? params.defaultGroupId : null,
    deadlineLocal: '',
    scheduledLocal: '',
    sendMode: hasDefaultLesson ? 'AUTO_AFTER_LESSON_DONE' : 'MANUAL',
    lessonId: hasDefaultLesson ? params.defaultLessonId : null,
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
  const lessonsRequestIdRef = useRef(0);
  const templatesRequestIdRef = useRef(0);
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
  const [isStudentSelectOpen, setStudentSelectOpen] = useState(false);
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
  const [isAdditionalOpen, setIsAdditionalOpen] = useState(false);
  const [templateSearchQuery, setTemplateSearchQuery] = useState('');
  const [templateSearchResults, setTemplateSearchResults] = useState<HomeworkTemplate[]>(sortedTemplates);
  const [isTemplateSearchLoading, setIsTemplateSearchLoading] = useState(false);
  const [templateVisibleCount, setTemplateVisibleCount] = useState(INITIAL_TEMPLATE_PAGE_SIZE);
  const [isResolvingLessons, setIsResolvingLessons] = useState(false);
  const [nextLessonError, setNextLessonError] = useState<string | null>(null);
  const [futureLessons, setFutureLessons] = useState<FutureLessonRef[]>([]);

  const templatesById = useMemo(() => {
    const map = new Map<number, HomeworkTemplate>();
    sortedTemplates.forEach((template) => map.set(template.id, template));
    templateSearchResults.forEach((template) => map.set(template.id, template));
    return map;
  }, [sortedTemplates, templateSearchResults]);

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === draft.studentId) ?? null,
    [draft.studentId, students],
  );
  const selectedStudentAvatarColor = useMemo(
    () => resolveAssignmentStudentOptionAvatarColor(selectedStudent?.uiColor),
    [selectedStudent?.uiColor],
  );
  const selectedStudentAvatarTextColor = useMemo(
    () => resolveAssignmentStudentOptionAvatarTextColor(selectedStudentAvatarColor),
    [selectedStudentAvatarColor],
  );
  const selectedTemplate = useMemo(
    () => (draft.templateId ? templatesById.get(draft.templateId) ?? null : null),
    [draft.templateId, templatesById],
  );
  const selectedLesson = useMemo(
    () => futureLessons.find((lesson) => lesson.id === draft.lessonId) ?? null,
    [draft.lessonId, futureLessons],
  );

  const selectedTemplateMeta = useMemo(() => {
    if (!selectedTemplate) return 'Выберите домашнее задание из списка';
    return `${resolveTemplateCategory(selectedTemplate)} • ${formatTemplateDuration(estimateTemplateDuration(selectedTemplate))}`;
  }, [selectedTemplate]);

  const lessonOptions = useMemo(
    () =>
      futureLessons.map((lesson) => {
        const dateLabel = formatInTimeZone(lesson.startAt, 'd MMM, HH:mm', { timeZone, locale: ru });
        const assignmentMeta = lesson.linkedAssignmentTitle
          ? `Уже есть ДЗ: ${lesson.linkedAssignmentTitle}`
          : lesson.durationMinutes > 0
            ? `${lesson.durationMinutes} мин`
            : undefined;

        return {
          value: String(lesson.id),
          label: dateLabel,
          description: assignmentMeta,
        };
      }),
    [futureLessons, timeZone],
  );

  const availableTemplates = useMemo(
    () => (templateSearchQuery.trim() ? templateSearchResults : sortedTemplates),
    [sortedTemplates, templateSearchQuery, templateSearchResults],
  );
  const visibleTemplates = useMemo(
    () => availableTemplates.slice(0, templateVisibleCount),
    [availableTemplates, templateVisibleCount],
  );

  const hasStudents = students.length > 0;
  const hasValidTemplate = Boolean(draft.templateId && templatesById.has(draft.templateId));
  const scheduledFor = useMemo(
    () => (draft.scheduledLocal ? toUtcIsoFromLocal(draft.scheduledLocal, timeZone) : null),
    [draft.scheduledLocal, timeZone],
  );
  const deadlineAt = useMemo(
    () => (draft.deadlineLocal ? toUtcIsoFromLocal(draft.deadlineLocal, timeZone) : null),
    [draft.deadlineLocal, timeZone],
  );
  const requiresLesson = draft.sendMode === 'AUTO_AFTER_LESSON_DONE';
  const hasValidLesson = !requiresLesson || Boolean(draft.lessonId);
  const hasValidSchedule = draft.sendMode !== 'SCHEDULED' || Boolean(scheduledFor);
  const isFormDisabled = submitting || loading;
  const canSubmit =
    hasStudents && Boolean(draft.studentId) && hasValidTemplate && hasValidLesson && hasValidSchedule && !isFormDisabled;

  const resolveFutureLessons = useCallback(async (studentId: number) => {
    const requestId = lessonsRequestIdRef.current + 1;
    lessonsRequestIdRef.current = requestId;
    setIsResolvingLessons(true);
    setNextLessonError(null);

    try {
      const [lessonsResponse, assignmentsResponse] = await Promise.all([
        api.listStudentLessons(studentId, {
          status: 'not_completed',
          sort: 'asc',
        }),
        api.listHomeworkAssignmentsV2({
          studentId,
          limit: 200,
        }),
      ]);

      if (lessonsRequestIdRef.current !== requestId) return [];

      const assignmentByLessonId = new Map<number, HomeworkAssignment>();
      assignmentsResponse.items.forEach((assignment) => {
        if (!assignment.lessonId || assignmentByLessonId.has(assignment.lessonId)) return;
        assignmentByLessonId.set(assignment.lessonId, assignment);
      });

      const nowTs = Date.now();
      const nextLessons = lessonsResponse.items
        .filter((lesson) => lesson.status !== 'CANCELED')
        .filter((lesson) => {
          const lessonTs = new Date(lesson.startAt).getTime();
          return Number.isFinite(lessonTs) && lessonTs > nowTs;
        })
        .map((lesson) => {
          const linkedAssignment = assignmentByLessonId.get(lesson.id);
          return {
            id: lesson.id,
            startAt: lesson.startAt,
            durationMinutes: lesson.durationMinutes,
            linkedAssignmentTitle: linkedAssignment?.title ?? null,
            linkedAssignmentStatus: linkedAssignment?.status ?? null,
          };
        });

      setFutureLessons(nextLessons);
      if (nextLessons.length === 0) {
        setNextLessonError('У ученика пока нет ближайших активных уроков.');
      }
      return nextLessons;
    } catch {
      if (lessonsRequestIdRef.current !== requestId) return [];
      setFutureLessons([]);
      setNextLessonError('Не удалось загрузить список уроков.');
      return [];
    } finally {
      if (lessonsRequestIdRef.current === requestId) {
        setIsResolvingLessons(false);
      }
    }
  }, []);

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
    setStudentSelectOpen(false);
    setIsTemplatePickerOpen(false);
    setIsAdditionalOpen(false);
    setTemplateSearchQuery('');
    setTemplateSearchResults(sortedTemplates);
    setTemplateVisibleCount(INITIAL_TEMPLATE_PAGE_SIZE);
    setFutureLessons([]);
    setNextLessonError(null);
  }, [assignmentGroups, defaultGroupId, defaultLessonId, defaultStudentId, defaultTemplateId, open, sortedTemplates, students]);

  useEffect(() => {
    if (!open) return;
    if (draft.templateId && templatesById.has(draft.templateId)) return;
    const fallbackTemplateId = sortedTemplates[0]?.id ?? null;
    setDraft((prev) => ({ ...prev, templateId: fallbackTemplateId }));
  }, [draft.templateId, open, sortedTemplates, templatesById]);

  useEffect(() => {
    if (!open || !draft.studentId) {
      setFutureLessons([]);
      return;
    }
    void resolveFutureLessons(draft.studentId);
  }, [draft.studentId, open, resolveFutureLessons]);

  useEffect(() => {
    if (!open) return;
    if (draft.sendMode !== 'AUTO_AFTER_LESSON_DONE') return;
    if (draft.lessonId) return;
    const nextLesson = futureLessons[0] ?? null;
    if (!nextLesson) return;
    setDraft((prev) => {
      if (prev.sendMode !== 'AUTO_AFTER_LESSON_DONE' || prev.lessonId) return prev;
      return { ...prev, lessonId: nextLesson.id };
    });
  }, [draft.lessonId, draft.sendMode, futureLessons, open]);

  useEffect(() => {
    if (!open) return;
    if (!isTemplatePickerOpen) return;

    const normalizedQuery = templateSearchQuery.trim();
    if (!normalizedQuery) {
      templatesRequestIdRef.current += 1;
      setIsTemplateSearchLoading(false);
      setTemplateSearchResults(sortedTemplates);
      return;
    }

    const requestId = templatesRequestIdRef.current + 1;
    templatesRequestIdRef.current = requestId;
    setIsTemplateSearchLoading(true);

    const timerId = window.setTimeout(() => {
      void api
        .listHomeworkTemplatesV2({ query: normalizedQuery, includeArchived: false })
        .then((response) => {
          if (templatesRequestIdRef.current !== requestId) return;
          setTemplateSearchResults(sortTemplatesForModal(response.items));
        })
        .catch(() => {
          if (templatesRequestIdRef.current !== requestId) return;
          setTemplateSearchResults([]);
        })
        .finally(() => {
          if (templatesRequestIdRef.current === requestId) {
            setIsTemplateSearchLoading(false);
          }
        });
    }, 180);

    return () => window.clearTimeout(timerId);
  }, [isTemplatePickerOpen, open, sortedTemplates, templateSearchQuery]);

  useEffect(() => {
    setTemplateVisibleCount(INITIAL_TEMPLATE_PAGE_SIZE);
  }, [isTemplatePickerOpen, templateSearchQuery]);

  const closeRequest = useCallback(() => {
    if (submitting) return;
    onClose();
  }, [onClose, submitting]);

  const handleBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    closeRequest();
  };

  const handleSendModeChange = (nextMode: TeacherAssignmentEditorPrefill['sendMode']) => {
    setDraft((prev) => {
      if (nextMode === 'MANUAL') {
        return {
          ...prev,
          sendMode: 'MANUAL',
          lessonId: null,
          scheduledLocal: '',
        };
      }

      if (nextMode === 'AUTO_AFTER_LESSON_DONE') {
        return {
          ...prev,
          sendMode: 'AUTO_AFTER_LESSON_DONE',
          lessonId: futureLessons[0]?.id ?? prev.lessonId,
          scheduledLocal: '',
        };
      }

      return {
        ...prev,
        sendMode: 'SCHEDULED',
        lessonId: null,
        scheduledLocal: prev.scheduledLocal || createQuickDateTimeValue(1, timeZone, { hours: 10, minutes: 0 }),
      };
    });
  };

  const applyNextLessonAsDeadline = useCallback(async () => {
    if (!draft.studentId) return;
    const availableLessons = futureLessons.length > 0 ? futureLessons : await resolveFutureLessons(draft.studentId);
    const nextLesson = availableLessons[0] ?? null;
    if (!nextLesson) return;

    setDraft((prev) => ({
      ...prev,
      deadlineLocal: toLocalDateTimeValue(nextLesson.startAt, timeZone),
    }));
  }, [draft.studentId, futureLessons, resolveFutureLessons, timeZone]);

  const handleTemplateListScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (element.scrollTop + element.clientHeight < element.scrollHeight - 48) return;
    setTemplateVisibleCount((prev) => Math.min(prev + TEMPLATE_PAGE_STEP, availableTemplates.length));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.studentId || !canSubmit) return;

    const success = await onSubmit({
      studentId: draft.studentId,
      lessonId: draft.sendMode === 'AUTO_AFTER_LESSON_DONE' ? draft.lessonId : null,
      templateId: draft.templateId,
      groupId: draft.groupId,
      sendMode: draft.sendMode,
      scheduledFor: draft.sendMode === 'SCHEDULED' ? scheduledFor : null,
      deadlineAt,
    });

    if (success) {
      onClose();
    }
  };

  const submitLabel = submitting
    ? 'Выдаю…'
    : loading
      ? 'Загружаю…'
      : draft.sendMode === 'MANUAL'
        ? 'Выдать сейчас'
        : 'Запланировать выдачу';

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
            aria-label="Закрыть окно"
            disabled={submitting}
          >
            <HomeworkXMarkIcon size={16} />
          </button>
        </div>

        <div className={styles.body}>
          <section className={styles.section}>
            <label className={styles.label}>
              Кому <span className={styles.requiredMark}>*</span>
            </label>
            <AdaptivePopover
              isOpen={isStudentSelectOpen && !isFormDisabled}
              onClose={() => setStudentSelectOpen(false)}
              side="bottom"
              align="start"
              offset={10}
              matchTriggerWidth
              rootClassName={styles.studentSelectPopoverRoot}
              triggerClassName={styles.studentSelectPopoverTrigger}
              className={`${styles.studentSelectPopover} ${styles.floatingPopover}`}
              trigger={
                <button
                  type="button"
                  className={`${styles.studentSelect} ${isStudentSelectOpen ? styles.studentSelectOpen : ''}`}
                  onClick={() => {
                    if (!hasStudents || isFormDisabled) return;
                    setStudentSelectOpen((prev) => !prev);
                  }}
                  aria-haspopup="listbox"
                  aria-expanded={isStudentSelectOpen}
                  disabled={!hasStudents || isFormDisabled}
                >
                  <span
                    className={styles.studentAvatar}
                    style={{ background: selectedStudentAvatarColor, color: selectedStudentAvatarTextColor }}
                  >
                    {buildStudentInitials(selectedStudent?.name ?? 'Ученик')}
                  </span>
                  <span className={styles.studentMeta}>
                    <strong>{selectedStudent?.name ?? 'Выберите ученика'}</strong>
                    <span>{selectedStudent?.level?.trim() || 'Без уровня'}</span>
                  </span>
                  <HomeworkChevronDownIcon
                    size={12}
                    className={`${styles.studentChevron} ${isStudentSelectOpen ? styles.studentChevronOpen : ''}`}
                  />
                </button>
              }
            >
              <div className={styles.studentOptionsList} role="listbox" aria-label="Выбор ученика">
                {students.map((student) => {
                  const isSelected = student.id === draft.studentId;
                  const avatarColor = resolveAssignmentStudentOptionAvatarColor(student.uiColor);
                  const avatarTextColor = resolveAssignmentStudentOptionAvatarTextColor(avatarColor);

                  return (
                    <button
                      key={student.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`${styles.studentOption} ${isSelected ? styles.studentOptionSelected : ''}`}
                      onClick={() => {
                        setDraft((prev) => ({
                          ...prev,
                          studentId: student.id,
                          lessonId: prev.sendMode === 'AUTO_AFTER_LESSON_DONE' ? null : prev.lessonId,
                        }));
                        setStudentSelectOpen(false);
                        setNextLessonError(null);
                        setFutureLessons([]);
                      }}
                    >
                      <span className={styles.studentOptionAvatar} style={{ background: avatarColor, color: avatarTextColor }}>
                        {buildStudentInitials(student.name)}
                      </span>
                      <span className={styles.studentOptionMeta}>
                        <span className={styles.studentOptionLabel}>{student.name}</span>
                        <span className={styles.studentOptionDescription}>{student.level?.trim() || 'Без уровня'}</span>
                      </span>
                      <HomeworkCheckIcon
                        size={11}
                        className={`${styles.studentOptionCheck} ${isSelected ? styles.studentOptionCheckVisible : ''}`}
                      />
                    </button>
                  );
                })}
              </div>
            </AdaptivePopover>
            {!hasStudents && !loading ? (
              <p className={styles.inlineWarning}>Нет учеников. Добавьте ученика в разделе «Ученики».</p>
            ) : null}
          </section>

          <section className={styles.section}>
            <label className={styles.label}>
              Задание <span className={styles.requiredMark}>*</span>
            </label>
            <AdaptivePopover
              isOpen={isTemplatePickerOpen && !isFormDisabled}
              onClose={() => setIsTemplatePickerOpen(false)}
              side="bottom"
              align="start"
              offset={10}
              matchTriggerWidth
              rootClassName={styles.templatePopoverRoot}
              triggerClassName={styles.templatePopoverTrigger}
              className={`${styles.templatePopover} ${styles.floatingPopover}`}
              trigger={
                <button
                  type="button"
                  className={styles.templateCard}
                  onClick={() => {
                    if (!sortedTemplates.length || isFormDisabled) return;
                    setIsTemplatePickerOpen((prev) => !prev);
                  }}
                  disabled={!sortedTemplates.length || isFormDisabled}
                >
                  <span className={styles.templateCardMain}>
                    <span className={styles.templateCardIcon} aria-hidden>
                      <HomeworkFileLinesIcon size={16} />
                    </span>
                    <span className={styles.templateCardCopy}>
                      <span className={styles.templateCardTitle}>
                        {selectedTemplate?.title ?? 'Выберите домашнее задание'}
                      </span>
                      <span className={styles.templateCardMeta}>{selectedTemplateMeta}</span>
                    </span>
                  </span>
                  <HomeworkChevronDownIcon
                    size={12}
                    className={`${styles.templateCardChevron} ${isTemplatePickerOpen ? styles.templateCardChevronOpen : ''}`}
                  />
                </button>
              }
            >
              <div className={styles.templateSearchShell}>
                <HomeworkMagnifyingGlassIcon size={14} className={styles.templateSearchIcon} />
                <input
                  type="search"
                  className={`${controls.input} ${styles.templateSearchInput}`}
                  value={templateSearchQuery}
                  onChange={(event) => setTemplateSearchQuery(event.target.value)}
                  placeholder="Поиск домашнего задания..."
                />
              </div>

              <div className={styles.templatePickerMetaRow}>
                <span>{templateSearchQuery.trim() ? 'Результаты поиска' : 'Все домашние задания'}</span>
                <span>{availableTemplates.length}</span>
              </div>

              <div className={styles.templatePicker} role="listbox" aria-label="Выбор домашнего задания" onScroll={handleTemplateListScroll}>
                {visibleTemplates.map((template) => {
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
                      <span className={styles.templatePickerOptionTitle}>{template.title}</span>
                      <span className={styles.templatePickerOptionMeta}>
                        {resolveTemplateCategory(template)} • {formatTemplateDuration(estimateTemplateDuration(template))}
                      </span>
                    </button>
                  );
                })}

                {isTemplateSearchLoading ? <div className={styles.templatePickerState}>Ищем домашние задания…</div> : null}
                {!isTemplateSearchLoading && availableTemplates.length === 0 ? (
                  <div className={styles.templatePickerState}>Ничего не найдено.</div>
                ) : null}
              </div>
            </AdaptivePopover>

            {!hasValidTemplate ? (
              <p className={styles.validationError}>Выберите домашнее задание для выдачи.</p>
            ) : null}
          </section>

          <div className={styles.divider} />

          <section className={styles.section}>
            <label className={styles.label}>
              Когда отправить <span className={styles.requiredMark}>*</span>
            </label>
            <div className={styles.sendModeGrid}>
              <button
                type="button"
                className={`${styles.modeButton} ${draft.sendMode === 'MANUAL' ? styles.modeButtonActive : ''}`}
                onClick={() => handleSendModeChange('MANUAL')}
                disabled={isFormDisabled}
              >
                Сейчас
              </button>
              <button
                type="button"
                className={`${styles.modeButton} ${draft.sendMode === 'AUTO_AFTER_LESSON_DONE' ? styles.modeButtonActive : ''}`}
                onClick={() => handleSendModeChange('AUTO_AFTER_LESSON_DONE')}
                disabled={isFormDisabled || !draft.studentId}
              >
                После урока
              </button>
              <button
                type="button"
                className={`${styles.modeButton} ${draft.sendMode === 'SCHEDULED' ? styles.modeButtonActive : ''}`}
                onClick={() => handleSendModeChange('SCHEDULED')}
                disabled={isFormDisabled}
              >
                В дату
              </button>
            </div>

            {draft.sendMode === 'AUTO_AFTER_LESSON_DONE' ? (
              <div className={styles.subSection}>
                <span className={styles.subLabel}>После какого урока отправить</span>
                <AssignmentSettingsSelect
                  value={draft.lessonId ? String(draft.lessonId) : ''}
                  options={lessonOptions}
                  placeholder={isResolvingLessons ? 'Загружаем уроки…' : 'Выберите урок'}
                  ariaLabel="Выбор урока для автоматической отправки домашнего задания"
                  disabled={isFormDisabled || !draft.studentId || isResolvingLessons || lessonOptions.length === 0}
                  rootClassName={styles.lessonSelectRoot}
                  triggerClassName={styles.lessonSelectTrigger}
                  popoverClassName={`${styles.lessonSelectPopover} ${styles.floatingPopover}`}
                  matchTriggerWidth
                  onChange={(nextValue) =>
                    setDraft((prev) => ({
                      ...prev,
                      lessonId: nextValue ? Number(nextValue) : null,
                    }))
                  }
                />
                {selectedLesson?.linkedAssignmentTitle ? (
                  <p className={styles.inlineInfo}>На этот урок уже привязано: {selectedLesson.linkedAssignmentTitle}</p>
                ) : null}
              </div>
            ) : null}

            {draft.sendMode === 'SCHEDULED' ? (
              <div className={styles.subSection}>
                <span className={styles.subLabel}>Дата отправки</span>
                <DatePickerField
                  mode="datetime"
                  className={styles.datePickerField}
                  placeholder="Выберите дату и время"
                  value={draft.scheduledLocal || undefined}
                  allowClear
                  disabled={isFormDisabled}
                  onChange={(nextValue) =>
                    setDraft((prev) => ({
                      ...prev,
                      scheduledLocal: nextValue ?? '',
                    }))
                  }
                />
              </div>
            ) : null}

            {requiresLesson && !hasValidLesson ? (
              <p className={styles.validationError}>Выберите урок, после которого нужно отправить домашнее задание.</p>
            ) : null}
            {draft.sendMode === 'SCHEDULED' && !hasValidSchedule ? (
              <p className={styles.validationError}>Укажите дату и время, когда нужно отправить задание.</p>
            ) : null}
            {nextLessonError ? <p className={styles.inlineWarning}>{nextLessonError}</p> : null}
          </section>

          <section className={styles.section}>
            <label className={styles.label}>Сдать до</label>
            <DatePickerField
              mode="datetime"
              className={styles.datePickerField}
              placeholder="Выберите дату и время"
              value={draft.deadlineLocal || undefined}
              allowClear
              disabled={isFormDisabled}
              onChange={(nextValue) =>
                setDraft((prev) => ({
                  ...prev,
                  deadlineLocal: nextValue ?? '',
                }))
              }
            />

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
                  void applyNextLessonAsDeadline();
                }}
                disabled={isFormDisabled || !draft.studentId || isResolvingLessons}
              >
                {isResolvingLessons ? 'Ищем…' : 'След. урок'}
              </button>
              <button
                type="button"
                className={styles.quickButton}
                onClick={() => setDraft((prev) => ({ ...prev, deadlineLocal: createEndOfWeekDeadlineValue(timeZone) }))}
                disabled={isFormDisabled}
              >
                Конец недели
              </button>
            </div>
          </section>

          <section className={styles.section}>
            <button
              type="button"
              className={`${styles.additionalToggle} ${isAdditionalOpen ? styles.additionalToggleOpen : ''}`}
              onClick={() => setIsAdditionalOpen((prev) => !prev)}
            >
              <span>Дополнительные настройки</span>
              <HomeworkChevronDownIcon
                size={12}
                className={`${styles.additionalToggleIcon} ${isAdditionalOpen ? styles.additionalToggleIconOpen : ''}`}
              />
            </button>
            {isAdditionalOpen ? (
              <div className={styles.additionalPanel}>
                <p className={styles.additionalText}>
                  Здесь оставил место под дополнительные параметры выдачи. Основной сценарий выдачи теперь выполняется прямо из этого side-sheet.
                </p>
              </div>
            ) : null}
          </section>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.cancelButton} onClick={closeRequest} disabled={submitting}>
            Отмена
          </button>
          <button type="submit" className={styles.submitButton} disabled={!canSubmit}>
            {submitLabel}
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

  if (variant === 'side-sheet') {
    return (
      <SideSheet isOpen={open} onClose={closeRequest}>
        {content}
      </SideSheet>
    );
  }

  if (!open) return null;

  return (
    <div className={styles.overlay} onMouseDown={handleBackdropMouseDown}>
      {content}
    </div>
  );
};

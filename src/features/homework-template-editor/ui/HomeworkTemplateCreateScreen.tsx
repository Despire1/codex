import { FC, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HomeworkAssignment, HomeworkGroupListItem, HomeworkTemplate } from '../../../entities/types';
import { canTeacherEditHomeworkAssignment } from '../../../entities/homework-assignment/model/lib/workflow';
import { HomeworkEditorDraft, HomeworkEditorVariant } from '../model/types';
import {
  buildTemplateCreateStats,
  detectCreateTemplateType,
  ensurePrimaryMediaBlock,
  ensurePrimaryTestBlock,
  extractEstimatedMinutes,
  getPrimaryMediaBlockEntry,
  getPrimaryTestBlockEntry,
  getPrimaryTextContent,
  parseTagsText,
  readTemplateQuizSettings,
  serializeEstimatedMinutes,
  setPrimaryTextContent,
  stringifyTags,
  writeTemplateQuizSettings,
  type TemplateQuizSettings,
} from '../model/lib/createTemplateScreen';
import { resolveHomeworkQuizCapabilities } from '../../../entities/homework-template/model/lib/quizProgress';
import {
  createMediaBlock,
  projectHomeworkEditorToTemplateDraft,
} from '../model/lib/blocks';
import {
  clearStoredCreateTemplateDraft,
  formatStoredDraftTimeLabel,
  saveStoredCreateTemplateDraft,
} from '../model/lib/createTemplateDraftStorage';
import {
  clearHomeworkTemplateCreateTopbarState,
  publishHomeworkTemplateCreateTopbarState,
  subscribeHomeworkTemplateCreateTopbarCommand,
} from '../model/lib/createTemplateTopbarBridge';
import { validateTemplateDraft } from '../model/lib/templateValidation';
import { filterIssuesBySeverity, isPathPrefix, pathToKey } from '../../../shared/lib/form-validation/path';
import { FormValidationIssue, FormValidationPath } from '../../../shared/lib/form-validation/types';
import { useValidationSession } from '../../../shared/lib/form-validation/useValidationSession';
import { useIsDesktop } from '../../../shared/lib/useIsDesktop';
import { CreateTemplateHeader } from './create-screen/CreateTemplateHeader';
import { TemplateBasicsSection } from './create-screen/TemplateBasicsSection';
import { TemplateQuestionsSection } from './create-screen/TemplateQuestionsSection';
import { TemplateMaterialsSection } from './create-screen/TemplateMaterialsSection';
import { TemplateSettingsSidebar } from './create-screen/TemplateSettingsSidebar';
import { TemplatePreviewModal } from './create-screen/TemplatePreviewModal';
import { AssignmentPreviewScreen } from './create-screen/AssignmentPreviewScreen';
import { AssignmentCreateHeader } from './create-screen/AssignmentCreateHeader';
import { AssignmentBasicsSection } from './create-screen/AssignmentBasicsSection';
import { AssignmentPlanningSidebar } from './create-screen/AssignmentPlanningSidebar';
import { AssignmentBasicsReadOnlySection } from './create-screen/AssignmentBasicsReadOnlySection';
import { AssignmentQuestionsReadOnlySection } from './create-screen/AssignmentQuestionsReadOnlySection';
import { AssignmentMaterialsReadOnlySection } from './create-screen/AssignmentMaterialsReadOnlySection';
import { AssignmentPlanningReadOnlySidebar } from './create-screen/AssignmentPlanningReadOnlySidebar';
import assignmentScreenStyles from './create-screen/AssignmentCreateScreen.module.css';
import styles from './HomeworkTemplateCreateScreen.module.css';

export interface HomeworkTemplateCreateSubmitResult {
  success: boolean;
  issues?: FormValidationIssue[];
  closeOnSuccess?: boolean;
}

interface HomeworkTemplateCreateScreenProps {
  variant?: HomeworkEditorVariant;
  mode: 'create' | 'edit';
  draft: HomeworkEditorDraft;
  submitting: boolean;
  readOnly?: boolean;
  readOnlyAssignment?: HomeworkAssignment | null;
  readOnlyAssignments?: HomeworkAssignment[];
  readOnlyAssignmentsCount?: number;
  saveAsTemplateSubmitting?: boolean;
  students?: Array<{ id: number; name: string; level?: string | null }>;
  groups?: HomeworkGroupListItem[];
  templates?: HomeworkTemplate[];
  lockAssignmentStudent?: boolean;
  assignmentPrimaryActionMode?: 'create' | 'save' | 'issue';
  assignmentPrimaryActionDisabled?: boolean;
  primaryActionDisabled?: boolean;
  showCancelIssueAction?: boolean;
  cancelIssueSubmitting?: boolean;
  onDraftChange: (draft: HomeworkEditorDraft) => void;
  onSubmit: (action: 'save' | 'submit') => Promise<HomeworkTemplateCreateSubmitResult>;
  onSaveAsTemplate?: () => Promise<HomeworkTemplateCreateSubmitResult>;
  onAssignmentTemplateSelect?: (templateId: number | null) => void;
  onCancelIssue?: () => Promise<void>;
  onReadOnlyEdit?: () => void;
  onBack: () => void;
  onOpenMobileSidebar?: () => void;
}

export const HomeworkTemplateCreateScreen: FC<HomeworkTemplateCreateScreenProps> = ({
  variant = 'template',
  mode,
  draft,
  submitting,
  readOnly = false,
  readOnlyAssignment = null,
  readOnlyAssignments = [],
  readOnlyAssignmentsCount = 0,
  saveAsTemplateSubmitting = false,
  students = [],
  groups = [],
  lockAssignmentStudent = false,
  assignmentPrimaryActionMode = 'create',
  assignmentPrimaryActionDisabled = false,
  primaryActionDisabled = false,
  showCancelIssueAction = false,
  cancelIssueSubmitting = false,
  onDraftChange,
  onSubmit,
  onSaveAsTemplate,
  onCancelIssue,
  onReadOnlyEdit,
  onBack,
  onOpenMobileSidebar,
}) => {
  const hasSkippedTemplateAutoSaveRef = useRef(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const [activeSubmitAction, setActiveSubmitAction] = useState<'save' | 'submit' | null>(null);
  const [quizSettings, setQuizSettings] = useState<TemplateQuizSettings>(() => readTemplateQuizSettings(draft.blocks));
  const [draftSavedAtLabel, setDraftSavedAtLabel] = useState<string | null>(null);
  const [isPreviewOpen, setPreviewOpen] = useState(false);
  const [serverIssues, setServerIssues] = useState<FormValidationIssue[]>([]);
  const [isAssignmentMenuOpen, setAssignmentMenuOpen] = useState(false);
  const [isAssignmentHeaderCompact, setAssignmentHeaderCompact] = useState(false);
  const isDesktop = useIsDesktop();
  const assignmentScrollBodyRef = useRef<HTMLDivElement | null>(null);
  const templateDraft = useMemo(() => projectHomeworkEditorToTemplateDraft(draft), [draft]);
  const usesAssignmentLayout = variant === 'assignment' || (variant === 'template' && mode === 'edit');
  const assignmentHasSelectedStudent = draft.assignment.studentId !== null;
  const assignmentPrimarySavesHomework = variant === 'assignment' && mode === 'create' && !assignmentHasSelectedStudent;
  const templateEditAssignsHomework = variant === 'template' && mode === 'edit' && assignmentHasSelectedStudent;

  const selectedType = useMemo(
    () => draft.template.selectedType || detectCreateTemplateType(draft.blocks),
    [draft.blocks, draft.template.selectedType],
  );
  const description = useMemo(() => getPrimaryTextContent(draft.blocks), [draft.blocks]);
  const validation = useMemo(() => validateTemplateDraft(templateDraft), [templateDraft]);
  const mergedIssues = useMemo(() => {
    const merged = new Map<string, FormValidationIssue>();
    [...validation.issues, ...serverIssues].forEach((issue) => {
      const key = `${issue.severity}:${issue.code}:${issue.message}:${pathToKey(issue.path)}`;
      if (!merged.has(key)) {
        merged.set(key, issue);
      }
    });
    return Array.from(merged.values());
  }, [serverIssues, validation.issues]);
  const validationSession = useValidationSession(mergedIssues);
  const {
    getIssueForPath,
    clearIssueAtPath,
    markSubmitAttempt,
    resetValidationSession,
    hasVisibleErrors,
    submitAttempted,
  } = validationSession;
  const validationErrorIssues = useMemo(
    () => filterIssuesBySeverity(mergedIssues, 'error'),
    [mergedIssues],
  );
  const validationWarningIssues = useMemo(
    () => filterIssuesBySeverity(mergedIssues, 'warning'),
    [mergedIssues],
  );
  const validationErrorMessages = useMemo(
    () => Array.from(new Set(validationErrorIssues.map((issue) => issue.message))),
    [validationErrorIssues],
  );
  const validationWarningMessages = useMemo(
    () => Array.from(new Set(validationWarningIssues.map((issue) => issue.message))),
    [validationWarningIssues],
  );
  const shouldValidateAssignmentFields =
    variant === 'assignment' || (variant === 'template' && mode === 'edit' && assignmentHasSelectedStudent);
  const assignmentValidationIssues = useMemo(() => {
    if (!shouldValidateAssignmentFields) return [] as Array<{ path: FormValidationPath; message: string }>;
    const issues: Array<{ path: FormValidationPath; message: string }> = [];
    if (mode === 'edit' && !draft.assignment.studentId) {
      issues.push({
        path: ['assignment', 'studentId'],
        message: 'Выберите ученика.',
      });
    }
    if (draft.assignment.studentId && draft.assignment.sendMode === 'AUTO_AFTER_LESSON_DONE' && !draft.assignment.lessonId) {
      issues.push({
        path: ['assignment', 'lessonId'],
        message: 'Для авто-отправки нужен ближайший урок.',
      });
    }
    if (draft.assignment.studentId && draft.assignment.sendMode === 'SCHEDULED') {
      if (!draft.assignment.scheduledFor) {
        issues.push({
          path: ['assignment', 'scheduledFor'],
          message: 'Укажите дату и время запланированной отправки.',
        });
      } else if (new Date(draft.assignment.scheduledFor).getTime() <= Date.now()) {
        issues.push({
          path: ['assignment', 'scheduledFor'],
          message: 'Запланированная отправка должна быть в будущем.',
        });
      }
    }
    return issues;
  }, [draft.assignment, mode, shouldValidateAssignmentFields]);
  const hasAssignmentValidationErrors = assignmentValidationIssues.length > 0;
  const showAssignmentValidationErrors = submitAttempted && hasAssignmentValidationErrors;
  const tags = useMemo(() => parseTagsText(templateDraft.tagsText), [templateDraft.tagsText]);
  const estimatedMinutes = useMemo(() => extractEstimatedMinutes(templateDraft.level), [templateDraft.level]);
  const stats = useMemo(() => buildTemplateCreateStats(templateDraft, quizSettings), [quizSettings, templateDraft]);
  const quizCapabilities = useMemo(() => resolveHomeworkQuizCapabilities(draft.blocks), [draft.blocks]);
  const primaryTestEntry = useMemo(() => getPrimaryTestBlockEntry(draft.blocks), [draft.blocks]);
  const primaryMediaEntry = useMemo(() => getPrimaryMediaBlockEntry(draft.blocks), [draft.blocks]);
  const titlePath = useMemo<FormValidationPath>(() => ['title'], []);
  const titleValidationPath = useMemo(() => pathToKey(titlePath), [titlePath]);
  const titleError = getIssueForPath(titlePath)?.message ?? null;
  const testBlockPath = useMemo<FormValidationPath | null>(
    () => (primaryTestEntry ? ['blocks', primaryTestEntry.index] : null),
    [primaryTestEntry],
  );

  const mediaBlock = useMemo(
    () =>
      primaryMediaEntry?.block ?? {
        ...createMediaBlock(),
        id: 'virtual_media_block',
      },
    [primaryMediaEntry],
  );
  const previewQuestionsCount = useMemo(
    () =>
      draft.blocks.reduce((sum, block) => {
        if (block.type !== 'TEST') return sum;
        return sum + (block.questions?.length ?? 0);
      }, 0),
    [draft.blocks],
  );
  const previewDisabled = previewQuestionsCount === 0;

  const focusPathInput = useCallback((path: FormValidationPath | null | undefined) => {
    if (!path || typeof document === 'undefined') return;
    const targetPath = pathToKey(path);
    const node = Array.from(document.querySelectorAll<HTMLElement>('[data-validation-path]')).find(
      (item) => item.getAttribute('data-validation-path') === targetPath,
    );
    if (!node) return;

    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) {
      node.focus({ preventScroll: true });
      return;
    }

    const focusable = node.querySelector<HTMLElement>('input, textarea, select, button');
    focusable?.focus({ preventScroll: true });
  }, []);

  const clearServerIssueByPath = useCallback((path: FormValidationPath) => {
    setServerIssues((previous) => previous.filter((issue) => !isPathPrefix(issue.path, path)));
  }, []);

  const handleFieldEdit = useCallback((path: FormValidationPath) => {
    clearIssueAtPath(path);
    clearServerIssueByPath(path);
  }, [clearIssueAtPath, clearServerIssueByPath]);

  useEffect(() => {
    setServerIssues([]);
    resetValidationSession();

    if (mode !== 'create' || variant !== 'template') {
      setDraftSavedAtLabel(null);
      return;
    }

    // Each fresh visit to template creation must start from a clean state.
    clearStoredCreateTemplateDraft();
    setDraftSavedAtLabel(null);

    return () => {
      clearStoredCreateTemplateDraft();
    };
  }, [mode, resetValidationSession, variant]);

  useEffect(() => {
    if (!draft.blocks.some((block) => block.type === 'TEST')) return;
    setQuizSettings(readTemplateQuizSettings(draft.blocks));
  }, [draft.blocks]);

  const updateDraft = useCallback(
    (nextDraft: HomeworkEditorDraft) => {
      onDraftChange(nextDraft);
    },
    [onDraftChange],
  );

  const updateBlocks = (nextBlocks: HomeworkEditorDraft['blocks']) => {
    updateDraft({
      ...draft,
      blocks: nextBlocks,
    });
  };

  const updateTemplateContext = useCallback(
    (patch: Partial<HomeworkEditorDraft['template']>) => {
      updateDraft({
        ...draft,
        template: {
          ...draft.template,
          ...patch,
        },
      });
    },
    [draft, updateDraft],
  );

  const updatePrimaryTestBlock = (nextBlock: NonNullable<typeof primaryTestEntry>['block']) => {
    const ensured = ensurePrimaryTestBlock(draft.blocks);
    const replaced = ensured.blocks.map((block, index) => (index === ensured.index ? nextBlock : block));
    const withSettings = writeTemplateQuizSettings(replaced, quizSettings);
    updateBlocks(withSettings);
  };

  const updatePrimaryMediaBlock = (nextBlock: typeof mediaBlock) => {
    const ensured = ensurePrimaryMediaBlock(draft.blocks);
    const replaced = ensured.blocks.map((block, index) =>
      index === ensured.index
        ? {
            ...nextBlock,
            id: ensured.block.id,
          }
        : block,
    );
    updateBlocks(replaced);
  };

  const handleTemplateTypeSelect = (type: ReturnType<typeof detectCreateTemplateType>) => {
    updateTemplateContext({
      selectedType: type,
    });
  };

  const handleQuizSettingsChange = (nextSettings: TemplateQuizSettings) => {
    setQuizSettings(nextSettings);
    const nextBlocks = writeTemplateQuizSettings(draft.blocks, nextSettings);
    if (nextBlocks !== draft.blocks) {
      updateBlocks(nextBlocks);
    }
  };

  const handleSaveDraft = useCallback(() => {
    if (mode !== 'create' || variant !== 'template') return;
    const now = new Date().toISOString();
    saveStoredCreateTemplateDraft({
      draft: templateDraft,
      quizSettings: quizSettings as unknown as Record<string, unknown>,
      savedAt: now,
    });
    setDraftSavedAtLabel(formatStoredDraftTimeLabel(now));
  }, [mode, quizSettings, templateDraft, variant]);

  useEffect(() => {
    if (mode !== 'create' || variant !== 'template') return;
    if (!hasSkippedTemplateAutoSaveRef.current) {
      hasSkippedTemplateAutoSaveRef.current = true;
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const now = new Date().toISOString();
      saveStoredCreateTemplateDraft({
        draft: templateDraft,
        quizSettings: quizSettings as unknown as Record<string, unknown>,
        savedAt: now,
      });
      setDraftSavedAtLabel(formatStoredDraftTimeLabel(now));
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [mode, quizSettings, templateDraft, variant]);

  const runValidatedAction = useCallback(async (action: 'save' | 'submit') => {
    markSubmitAttempt();

    if (hasAssignmentValidationErrors) {
      window.requestAnimationFrame(() => focusPathInput(assignmentValidationIssues[0]?.path));
      return;
    }

    if (validationErrorIssues.length > 0) {
      const firstErrorPath = validationErrorIssues[0]?.path;
      window.requestAnimationFrame(() => focusPathInput(firstErrorPath));
      return;
    }

    const submitHandler =
      assignmentPrimarySavesHomework && action === 'save' && onSaveAsTemplate
        ? onSaveAsTemplate
        : () => onSubmit(action);

    setActiveSubmitAction(action);
    try {
      const result = await submitHandler();
      if (!result.success) {
        const nextServerIssues = result.issues ?? [];
        if (nextServerIssues.length > 0) {
          setServerIssues(nextServerIssues);
          const firstServerError = nextServerIssues.find((issue) => issue.severity === 'error');
          if (firstServerError) {
            window.requestAnimationFrame(() => focusPathInput(firstServerError.path));
          }
        }
        return;
      }

      setServerIssues([]);
      resetValidationSession();
      if (mode === 'create' && variant === 'template') {
        clearStoredCreateTemplateDraft();
        setDraftSavedAtLabel(null);
      }
      if (result.closeOnSuccess ?? true) {
        onBack();
      }
    } finally {
      setActiveSubmitAction(null);
    }
  }, [
    assignmentValidationIssues,
    assignmentPrimarySavesHomework,
    focusPathInput,
    hasAssignmentValidationErrors,
    markSubmitAttempt,
    mode,
    onBack,
    onSaveAsTemplate,
    onSubmit,
    resetValidationSession,
    validationErrorIssues,
    variant,
  ]);

  const handleSecondaryAction = useCallback(() => {
    if (readOnly) return;
    if (variant === 'template') {
      handleSaveDraft();
      return;
    }
    void runValidatedAction('save');
  }, [handleSaveDraft, readOnly, runValidatedAction, variant]);

  const handlePrimaryAction = useCallback(() => {
    if (readOnly) return;
    if (variant === 'assignment' && assignmentPrimaryActionMode === 'save') {
      void runValidatedAction('save');
      return;
    }
    void runValidatedAction(assignmentPrimarySavesHomework ? 'save' : 'submit');
  }, [assignmentPrimaryActionMode, assignmentPrimarySavesHomework, readOnly, runValidatedAction, variant]);

  const assignmentPrimaryActionLabel =
    assignmentPrimarySavesHomework
      ? 'Сохранить в библиотеку'
      : assignmentPrimaryActionMode === 'create'
      ? 'Создать'
      : assignmentPrimaryActionMode === 'save'
        ? 'Сохранить изменения'
        : 'Выдать';
  const assignmentPrimarySubmittingLabel =
    assignmentPrimarySavesHomework
      ? 'Сохраняю в библиотеку…'
      : assignmentPrimaryActionMode === 'create'
      ? 'Создаю…'
      : assignmentPrimaryActionMode === 'save'
        ? 'Сохраняю…'
        : 'Выдаю…';
  const templateEditAssignSubmittingLabel =
    draft.assignment.sendMode === 'MANUAL'
      ? 'Задаю…'
      : draft.assignment.sendMode === 'SCHEDULED'
        ? 'Планирую…'
        : 'Сохраняю…';
  const assignmentReadOnlyNotice =
    variant === 'assignment' && readOnly
      ? 'Домашка уже выдана. Чтобы изменить её, сначала отмените выдачу.'
      : null;

  useLayoutEffect(() => {
    const showSecondaryAction = !readOnly && (variant === 'assignment' || mode === 'create');
    const secondaryActionLabel = variant === 'assignment' ? 'Сохранить черновик' : 'Сохранить черновик';
    const showPrimaryAction = !readOnly;
    const primaryActionLabel =
      variant === 'assignment'
        ? assignmentPrimaryActionLabel
        : templateEditAssignsHomework
          ? 'Задать домашку'
        : mode === 'edit'
          ? 'Сохранить домашнее задание'
          : 'Создать домашнее задание';
    const primarySubmittingLabel =
      activeSubmitAction === 'save'
        ? 'Сохраняю…'
        : variant === 'assignment'
          ? assignmentPrimarySubmittingLabel
          : templateEditAssignsHomework
            ? templateEditAssignSubmittingLabel
          : mode === 'edit'
            ? 'Сохраняю…'
            : 'Создаю…';
    publishHomeworkTemplateCreateTopbarState({
      submitting,
      hasValidationErrors: hasVisibleErrors || showAssignmentValidationErrors,
      primaryActionDisabled:
        variant === 'assignment'
          ? (assignmentPrimarySavesHomework ? false : assignmentPrimaryActionDisabled)
          : primaryActionDisabled,
      draftSavedAtLabel: variant === 'template' && mode === 'create' ? draftSavedAtLabel : null,
      subtitleOverride: assignmentReadOnlyNotice,
      showSecondaryAction,
      showPrimaryAction,
      secondaryActionLabel,
      primaryActionLabel,
      primarySubmittingLabel,
    });
  }, [
    activeSubmitAction,
    assignmentPrimaryActionLabel,
    assignmentPrimaryActionDisabled,
    assignmentPrimarySubmittingLabel,
    assignmentPrimarySavesHomework,
    assignmentHasSelectedStudent,
    showAssignmentValidationErrors,
    assignmentReadOnlyNotice,
    draftSavedAtLabel,
    hasAssignmentValidationErrors,
    hasVisibleErrors,
    mode,
    primaryActionDisabled,
    readOnly,
    submitting,
    templateEditAssignSubmittingLabel,
    templateEditAssignsHomework,
    variant,
  ]);

  useEffect(() => {
    const unsubscribeSave = subscribeHomeworkTemplateCreateTopbarCommand('save', handleSecondaryAction);
    const unsubscribeSubmit = subscribeHomeworkTemplateCreateTopbarCommand('submit', () => {
      handlePrimaryAction();
    });
    return () => {
      unsubscribeSave();
      unsubscribeSubmit();
    };
  }, [handlePrimaryAction, handleSecondaryAction]);

  useEffect(() => {
    return () => {
      clearHomeworkTemplateCreateTopbarState();
    };
  }, []);

  const handleAssignmentScroll = useCallback(() => {
    const nextCompact = !isDesktop && (assignmentScrollBodyRef.current?.scrollTop ?? 0) > 28;
    setAssignmentHeaderCompact((current) => (current === nextCompact ? current : nextCompact));
  }, [isDesktop]);

  if (usesAssignmentLayout) {
    const assignmentEstimatedMinutes = Math.max(stats.estimatedMinutes, previewQuestionsCount > 0 ? previewQuestionsCount * 3 : 5);
    const assignmentFooterPrimaryLabel =
      variant === 'template'
        ? templateEditAssignsHomework
          ? 'Задать домашку'
          : 'Сохранить изменения'
        : assignmentPrimarySavesHomework
          ? 'Сохранить в библиотеку'
        : assignmentPrimaryActionMode === 'create'
          ? 'Задать домашку'
          : assignmentPrimaryActionMode === 'issue'
            ? 'Выдать домашку'
            : 'Сохранить изменения';
    const assignmentFooterSubmittingLabel =
      variant === 'template'
        ? templateEditAssignsHomework
          ? templateEditAssignSubmittingLabel
          : 'Сохраняем…'
        : assignmentPrimarySavesHomework
          ? 'Сохраняем в библиотеку…'
        : activeSubmitAction === 'save'
          ? 'Сохраняем…'
          : draft.assignment.sendMode === 'SCHEDULED'
            ? 'Планируем…'
            : draft.assignment.sendMode === 'AUTO_AFTER_LESSON_DONE'
              ? 'Сохраняем…'
              : 'Отправляем…';
    const assignmentPrimaryActionIcon =
      variant === 'template'
        ? templateEditAssignsHomework
          ? 'check'
          : 'save'
        : assignmentPrimarySavesHomework || assignmentPrimaryActionMode === 'save'
          ? 'save'
          : 'check';
    const assignmentHeaderTitle = variant === 'template' ? 'Редактирование домашнего задания' : undefined;
    const assignmentHeaderSubtitle =
      variant === 'template' ? 'Поля предзаполнены • Сохраните изменения после редактирования' : undefined;
    const shouldShowAssignmentSidebarErrors = submitAttempted && shouldValidateAssignmentFields;
    const isTemplateReadOnlyView = variant === 'template' && readOnly;
    const isAssignmentReadOnlyView = variant === 'assignment' && readOnly;
    const canEditReadOnlyAssignment = Boolean(
      isAssignmentReadOnlyView && readOnlyAssignment && canTeacherEditHomeworkAssignment(readOnlyAssignment),
    );

    if (isTemplateReadOnlyView || isAssignmentReadOnlyView) {
      return (
        <section className={assignmentScreenStyles.page}>
          <AssignmentCreateHeader
            questionCount={stats.questionCount}
            totalPoints={stats.totalPoints}
            estimatedMinutes={assignmentEstimatedMinutes}
            title="Просмотр домашнего задания"
            subtitle={
              isTemplateReadOnlyView
                ? 'Задание в режиме просмотра — как его увидит ученик'
                : 'Просмотр выданного задания'
            }
            primaryActionLabel=""
            primarySubmittingLabel=""
            submitting={false}
            actionsDisabled={false}
            menuOpen={false}
            showSecondaryAction={canEditReadOnlyAssignment || isTemplateReadOnlyView}
            showPreviewAction={false}
          showMenuAction={false}
          showPrimaryAction={false}
          onBack={onBack}
          onSecondaryAction={onReadOnlyEdit}
          onOpenSidebar={onOpenMobileSidebar}
        />

          <div className={assignmentScreenStyles.scrollBody}>
            <div className={assignmentScreenStyles.container}>
              <div className={assignmentScreenStyles.grid}>
                <div className={assignmentScreenStyles.mainColumn}>
                  <AssignmentBasicsReadOnlySection
                    title={draft.title}
                    description={description}
                    issuedAssignments={isTemplateReadOnlyView ? readOnlyAssignments : []}
                    issuedAssignmentsCount={isTemplateReadOnlyView ? readOnlyAssignmentsCount : 0}
                  />

                  <AssignmentQuestionsReadOnlySection testBlock={primaryTestEntry?.block ?? null} />

                  <AssignmentMaterialsReadOnlySection mediaBlock={mediaBlock} />
                </div>

                <div className={assignmentScreenStyles.sidebarColumn}>
                  <AssignmentPlanningReadOnlySidebar
                    assignment={draft.assignment}
                    students={students}
                    quizSettings={quizSettings}
                    quizCapabilities={quizCapabilities}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      );
    }

    return (
      <section className={assignmentScreenStyles.page}>
        <AssignmentCreateHeader
          questionCount={stats.questionCount}
          totalPoints={stats.totalPoints}
          estimatedMinutes={assignmentEstimatedMinutes}
          title={assignmentHeaderTitle}
          subtitle={assignmentHeaderSubtitle}
          primaryActionIcon={assignmentPrimaryActionIcon}
          primaryActionLabel={assignmentFooterPrimaryLabel}
          primarySubmittingLabel={assignmentFooterSubmittingLabel}
          submitting={assignmentPrimarySavesHomework ? saveAsTemplateSubmitting : submitting}
          actionsDisabled={
            variant === 'assignment'
              ? assignmentPrimaryActionDisabled
              : primaryActionDisabled
          }
          compact={!isDesktop && isAssignmentHeaderCompact}
          menuOpen={isAssignmentMenuOpen}
          onBack={onBack}
          onOpenSidebar={onOpenMobileSidebar}
          onPreview={() => {
            if (previewDisabled) return;
            setPreviewOpen(true);
          }}
          onToggleMenu={() => setAssignmentMenuOpen((current) => !current)}
          onPrimaryAction={handlePrimaryAction}
        />

        <div
          ref={assignmentScrollBodyRef}
          className={assignmentScreenStyles.scrollBody}
          onScroll={handleAssignmentScroll}
        >
          <div className={assignmentScreenStyles.container}>
            <div className={assignmentScreenStyles.grid}>
              <div className={assignmentScreenStyles.mainColumn}>
                {assignmentReadOnlyNotice ? <div className={styles.readOnlyNotice}>{assignmentReadOnlyNotice}</div> : null}

                <AssignmentBasicsSection
                  title={draft.title}
                  description={description}
                  titleError={titleError}
                  titleValidationPath={titleValidationPath}
                  titleInputRef={titleInputRef}
                  onTitleChange={(value) => {
                    handleFieldEdit(titlePath);
                    updateDraft({
                      ...draft,
                      title: value,
                    });
                  }}
                  onDescriptionChange={(value) => updateBlocks(setPrimaryTextContent(draft.blocks, value))}
                />

                <TemplateQuestionsSection
                  testBlock={primaryTestEntry?.block ?? null}
                  testBlockPath={testBlockPath}
                  getIssueForPath={getIssueForPath}
                  onFieldEdit={handleFieldEdit}
                  onTestBlockChange={updatePrimaryTestBlock}
                  addQuestionMode="default-choice"
                  enableQuestionKindSelect
                />

                <TemplateMaterialsSection mediaBlock={mediaBlock} onMediaBlockChange={updatePrimaryMediaBlock} />
              </div>

              <div className={assignmentScreenStyles.sidebarColumn}>
                <AssignmentPlanningSidebar
                  assignment={draft.assignment}
                  students={students}
                  quizSettings={quizSettings}
                  quizCapabilities={quizCapabilities}
                  studentLocked={variant === 'assignment' ? lockAssignmentStudent : false}
                  studentRequired={variant === 'assignment' && mode === 'edit'}
                  studentError={
                    variant === 'assignment' && shouldShowAssignmentSidebarErrors
                      ? assignmentValidationIssues.find((issue) => pathToKey(issue.path) === 'assignment.studentId')?.message ?? null
                      : null
                  }
                  lessonError={
                    shouldShowAssignmentSidebarErrors
                      ? assignmentValidationIssues.find((issue) => pathToKey(issue.path) === 'assignment.lessonId')?.message ?? null
                      : null
                  }
                  scheduledError={
                    shouldShowAssignmentSidebarErrors
                      ? assignmentValidationIssues.find((issue) => pathToKey(issue.path) === 'assignment.scheduledFor')?.message ?? null
                      : null
                  }
                  showCancelIssueAction={variant === 'assignment' ? showCancelIssueAction : false}
                  cancelIssueSubmitting={variant === 'assignment' ? cancelIssueSubmitting : false}
                  onChange={(assignment) =>
                    updateDraft({
                      ...draft,
                      assignment,
                    })
                  }
                  onQuizSettingsChange={handleQuizSettingsChange}
                  onCancelIssue={() => {
                    void onCancelIssue?.();
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {isPreviewOpen ? (
          <div className={styles.previewOverlay}>
            <AssignmentPreviewScreen draft={draft} students={students} groups={groups} onClose={() => setPreviewOpen(false)} />
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className={styles.page}>
      {!isDesktop && !isPreviewOpen ? (
        <CreateTemplateHeader
          variant="template"
          mode={mode}
          submitting={submitting}
          hasValidationErrors={hasVisibleErrors}
          primaryActionDisabled={primaryActionDisabled}
          draftSavedAtLabel={mode === 'create' ? draftSavedAtLabel : null}
          subtitleOverride={null}
          showSecondaryAction={!readOnly && mode === 'create'}
          showPrimaryAction={!readOnly}
          secondaryActionLabel="Сохранить черновик"
          primaryActionLabel={mode === 'edit' ? 'Сохранить домашнее задание' : 'Создать домашнее задание'}
          primarySubmittingLabel={
            activeSubmitAction === 'save'
              ? 'Сохраняю…'
              : mode === 'edit'
                ? 'Сохраняю…'
                : 'Создаю…'
          }
          onBack={onBack}
          onSecondaryAction={handleSecondaryAction}
          onPrimaryAction={handlePrimaryAction}
        />
      ) : null}

      <div className={styles.contentGrid}>
        <div className={styles.mainColumn}>
          <div className={styles.readOnlySectionWrap}>
            <fieldset className={styles.readOnlyFieldset} disabled={readOnly}>
              <TemplateBasicsSection
                disabled={readOnly}
                titleLabel="Название домашнего задания"
                titlePlaceholder="Например: Present Perfect Practice"
                title={draft.title}
                titleError={titleError}
                titleValidationPath={titleValidationPath}
                titleInputRef={titleInputRef}
                description={description}
                category={draft.template.subject}
                estimatedMinutes={estimatedMinutes}
                tags={tags}
                onTitleChange={(value) => {
                  handleFieldEdit(titlePath);
                  updateDraft({
                    ...draft,
                    title: value,
                  });
                }}
                onDescriptionChange={(value) => updateBlocks(setPrimaryTextContent(draft.blocks, value))}
                onCategoryChange={(value) =>
                  updateTemplateContext({
                    subject: value,
                  })
                }
                onEstimatedMinutesChange={(value) =>
                  updateTemplateContext({
                    level: serializeEstimatedMinutes(value),
                  })
                }
                onTagAdd={(value) => {
                  if (tags.includes(value)) return;
                  const nextTags = [...tags, value];
                  updateTemplateContext({
                    tagsText: stringifyTags(nextTags),
                  });
                }}
                onTagRemove={(value) => {
                  const nextTags = tags.filter((tag) => tag !== value);
                  updateTemplateContext({
                    tagsText: stringifyTags(nextTags),
                  });
                }}
                selectedType={selectedType}
                assignmentTemplateId={draft.assignment.sourceTemplateId ? String(draft.assignment.sourceTemplateId) : ''}
                assignmentTemplateOptions={undefined}
                onAssignmentTemplateChange={undefined}
                assignmentGroupId={draft.assignment.groupId ? String(draft.assignment.groupId) : ''}
                assignmentGroupOptions={undefined}
                onAssignmentGroupChange={undefined}
                onTypeChange={handleTemplateTypeSelect}
              />
            </fieldset>
            {readOnly ? <div className={styles.readOnlyOverlay} aria-hidden /> : null}
          </div>

          <div className={styles.readOnlySectionWrap}>
            <fieldset className={styles.readOnlyFieldset} disabled={readOnly}>
              <TemplateQuestionsSection
                testBlock={primaryTestEntry?.block ?? null}
                testBlockPath={testBlockPath}
                getIssueForPath={getIssueForPath}
                onFieldEdit={handleFieldEdit}
                onTestBlockChange={updatePrimaryTestBlock}
              />
            </fieldset>
            {readOnly ? <div className={styles.readOnlyOverlay} aria-hidden /> : null}
          </div>

          <div className={styles.readOnlySectionWrap}>
            <fieldset className={styles.readOnlyFieldset} disabled={readOnly}>
              <TemplateMaterialsSection
                disabled={readOnly}
                mediaBlock={mediaBlock}
                onMediaBlockChange={updatePrimaryMediaBlock}
              />
            </fieldset>
            {readOnly ? <div className={styles.readOnlyOverlay} aria-hidden /> : null}
          </div>
        </div>

        <aside className={styles.sidebarColumn}>
          <TemplateSettingsSidebar
            settings={quizSettings}
            capabilities={quizCapabilities}
            stats={stats}
            validationErrors={validationErrorMessages}
            validationWarnings={validationWarningMessages}
            onOpenPreview={() => setPreviewOpen(true)}
            onSettingsChange={handleQuizSettingsChange}
          />
        </aside>
      </div>

      <TemplatePreviewModal open={isPreviewOpen} draft={templateDraft} onClose={() => setPreviewOpen(false)} />
    </section>
  );
};

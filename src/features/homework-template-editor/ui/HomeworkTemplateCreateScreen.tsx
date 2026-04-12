import { FC, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HomeworkAssignment, HomeworkGroupListItem, HomeworkTemplate } from '../../../entities/types';
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
import {
  applyTemplateDraftToHomeworkEditorDraft,
  createMediaBlock,
  projectHomeworkEditorToTemplateDraft,
} from '../model/lib/blocks';
import {
  clearStoredCreateTemplateDraft,
  formatStoredDraftTimeLabel,
  loadStoredCreateTemplateDraft,
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
import { AssignmentSettingsSidebar } from './create-screen/AssignmentSettingsSidebar';
import { AssignmentPreviewScreen } from './create-screen/AssignmentPreviewScreen';
import { AssignmentReadOnlyScreen } from './create-screen/AssignmentReadOnlyScreen';
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
  saveAsTemplateSubmitting?: boolean;
  students?: Array<{ id: number; name: string }>;
  groups?: HomeworkGroupListItem[];
  templates?: HomeworkTemplate[];
  lockAssignmentStudent?: boolean;
  assignmentPrimaryActionMode?: 'create' | 'save' | 'issue';
  assignmentPrimaryActionDisabled?: boolean;
  showCancelIssueAction?: boolean;
  cancelIssueSubmitting?: boolean;
  onDraftChange: (draft: HomeworkEditorDraft) => void;
  onSubmit: (action: 'save' | 'submit') => Promise<HomeworkTemplateCreateSubmitResult>;
  onSaveAsTemplate?: () => Promise<void>;
  onAssignmentTemplateSelect?: (templateId: number | null) => void;
  onCancelIssue?: () => Promise<void>;
  onBack: () => void;
}

const isInitialTemplateDraft = (draft: HomeworkEditorDraft) => {
  const templateDraft = projectHomeworkEditorToTemplateDraft(draft);
  return (
    !templateDraft.title.trim() &&
    !templateDraft.tagsText.trim() &&
    !templateDraft.subject.trim() &&
    !templateDraft.level.trim() &&
    templateDraft.blocks.length === 1 &&
    templateDraft.blocks[0]?.type === 'TEXT' &&
    !templateDraft.blocks[0].content.trim()
  );
};

export const HomeworkTemplateCreateScreen: FC<HomeworkTemplateCreateScreenProps> = ({
  variant = 'template',
  mode,
  draft,
  submitting,
  readOnly = false,
  readOnlyAssignment = null,
  saveAsTemplateSubmitting = false,
  students = [],
  groups = [],
  templates = [],
  lockAssignmentStudent = false,
  assignmentPrimaryActionMode = 'create',
  assignmentPrimaryActionDisabled = false,
  showCancelIssueAction = false,
  cancelIssueSubmitting = false,
  onDraftChange,
  onSubmit,
  onSaveAsTemplate,
  onAssignmentTemplateSelect,
  onCancelIssue,
  onBack,
}) => {
  const hasRestoredDraftRef = useRef(false);
  const hasSkippedTemplateAutoSaveRef = useRef(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const [activeSubmitAction, setActiveSubmitAction] = useState<'save' | 'submit' | null>(null);
  const [quizSettings, setQuizSettings] = useState<TemplateQuizSettings>(() => readTemplateQuizSettings(draft.blocks));
  const [draftSavedAtLabel, setDraftSavedAtLabel] = useState<string | null>(null);
  const [isPreviewOpen, setPreviewOpen] = useState(false);
  const [serverIssues, setServerIssues] = useState<FormValidationIssue[]>([]);
  const isDesktop = useIsDesktop();
  const templateDraft = useMemo(() => projectHomeworkEditorToTemplateDraft(draft), [draft]);

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
    visibleErrorIssues,
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
  const assignmentValidationIssues = useMemo(() => {
    if (variant !== 'assignment') return [] as Array<{ path: FormValidationPath; message: string }>;
    const issues: Array<{ path: FormValidationPath; message: string }> = [];
    if (!draft.assignment.studentId) {
      issues.push({
        path: ['assignment', 'studentId'],
        message: 'Выберите ученика.',
      });
    }
    if (draft.assignment.sendMode === 'AUTO_AFTER_LESSON_DONE' && !draft.assignment.lessonId) {
      issues.push({
        path: ['assignment', 'lessonId'],
        message: 'Для авто-отправки нужен ближайший урок.',
      });
    }
    return issues;
  }, [draft.assignment, variant]);
  const hasAssignmentValidationErrors = assignmentValidationIssues.length > 0;
  const showAssignmentValidationErrors = submitAttempted && hasAssignmentValidationErrors;
  const tags = useMemo(() => parseTagsText(templateDraft.tagsText), [templateDraft.tagsText]);
  const estimatedMinutes = useMemo(() => extractEstimatedMinutes(templateDraft.level), [templateDraft.level]);
  const stats = useMemo(() => buildTemplateCreateStats(templateDraft, quizSettings), [quizSettings, templateDraft]);
  const assignmentGroupOptions = useMemo(
    () => [
      { value: '', label: 'Без группы' },
      ...groups
        .filter((group) => !group.isArchived && !group.isUngrouped && group.id !== null)
        .sort((left, right) => {
          if (left.sortOrder !== right.sortOrder) {
            return left.sortOrder - right.sortOrder;
          }
          return left.title.localeCompare(right.title, 'ru');
        })
        .map((group) => ({
          value: String(group.id),
          label: group.title,
        })),
    ],
    [groups],
  );
  const assignmentTemplateOptions = useMemo(
    () =>
      templates
        .filter((template) => !template.isArchived || template.id === draft.assignment.sourceTemplateId)
        .sort((left, right) => left.title.localeCompare(right.title, 'ru'))
        .map((template) => ({
          value: String(template.id),
          label: template.title,
          description: template.isArchived ? 'Архивный шаблон' : undefined,
        })),
    [draft.assignment.sourceTemplateId, templates],
  );

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
    hasRestoredDraftRef.current = false;
    setServerIssues([]);
    resetValidationSession();
    if (mode !== 'create' || variant !== 'template') {
      setDraftSavedAtLabel(null);
    }
  }, [mode, resetValidationSession, variant]);

  useEffect(() => {
    if (!draft.blocks.some((block) => block.type === 'TEST')) return;
    setQuizSettings(readTemplateQuizSettings(draft.blocks));
  }, [draft.blocks]);

  useEffect(() => {
    if (mode !== 'create' || variant !== 'template') return;
    if (hasRestoredDraftRef.current) return;
    hasRestoredDraftRef.current = true;
    if (!isInitialTemplateDraft(draft)) return;

    const storedDraft = loadStoredCreateTemplateDraft();
    if (!storedDraft) return;

    onDraftChange(applyTemplateDraftToHomeworkEditorDraft(draft, storedDraft.draft));
    setDraftSavedAtLabel(formatStoredDraftTimeLabel(storedDraft.savedAt));
  }, [draft, mode, onDraftChange, variant]);

  const updateDraft = (nextDraft: HomeworkEditorDraft) => {
    onDraftChange(nextDraft);
  };

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
    [draft],
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

    setActiveSubmitAction(action);
    try {
      const result = await onSubmit(action);
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
    focusPathInput,
    hasAssignmentValidationErrors,
    markSubmitAttempt,
    mode,
    onBack,
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
    void runValidatedAction('submit');
  }, [assignmentPrimaryActionMode, readOnly, runValidatedAction, variant]);

  const assignmentPrimaryActionLabel =
    assignmentPrimaryActionMode === 'create'
      ? 'Создать'
      : assignmentPrimaryActionMode === 'save'
        ? 'Сохранить изменения'
        : 'Выдать';
  const assignmentPrimarySubmittingLabel =
    assignmentPrimaryActionMode === 'create'
      ? 'Создаю…'
      : assignmentPrimaryActionMode === 'save'
        ? 'Сохраняю…'
        : 'Выдаю…';
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
        : mode === 'edit'
          ? 'Сохранить шаблон'
          : 'Создать шаблон';
    const primarySubmittingLabel =
      activeSubmitAction === 'save'
        ? 'Сохраняю…'
        : variant === 'assignment'
          ? assignmentPrimarySubmittingLabel
          : mode === 'edit'
            ? 'Сохраняю…'
            : 'Создаю…';
    publishHomeworkTemplateCreateTopbarState({
      submitting,
      hasValidationErrors: hasVisibleErrors || showAssignmentValidationErrors,
      primaryActionDisabled: assignmentPrimaryActionDisabled,
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
    assignmentReadOnlyNotice,
    draftSavedAtLabel,
    hasAssignmentValidationErrors,
    hasVisibleErrors,
    mode,
    readOnly,
    submitting,
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

  const shouldInlineAssignmentSidebar = !isDesktop && variant === 'assignment';
  const assignmentSidebar =
    variant === 'assignment' ? (
      <AssignmentSettingsSidebar
        assignment={draft.assignment}
        students={students}
        disabled={submitting}
        readOnly={readOnly}
        studentLocked={lockAssignmentStudent}
        previewDisabled={previewDisabled}
        saveAsTemplateSubmitting={saveAsTemplateSubmitting}
        showCancelIssueAction={showCancelIssueAction}
        cancelIssueSubmitting={cancelIssueSubmitting}
        studentError={
          submitAttempted
            ? assignmentValidationIssues.find((issue) => pathToKey(issue.path) === 'assignment.studentId')?.message ?? null
            : null
        }
        lessonError={
          submitAttempted
            ? assignmentValidationIssues.find((issue) => pathToKey(issue.path) === 'assignment.lessonId')?.message ?? null
            : null
        }
        onChange={(assignment) =>
          updateDraft({
            ...draft,
            assignment,
          })
        }
        onOpenPreview={() => {
          if (previewDisabled) return;
          setPreviewOpen(true);
        }}
        onSaveAsTemplate={() => {
          void onSaveAsTemplate?.();
        }}
        onCancelIssue={() => {
          void onCancelIssue?.();
        }}
      />
    ) : null;

  if (variant === 'assignment' && readOnly) {
    return (
      <section className={styles.page}>
        <AssignmentReadOnlyScreen
          draft={draft}
          assignment={readOnlyAssignment}
          students={students}
          groups={groups}
          templates={templates}
          previewDisabled={previewDisabled}
          showCancelIssueAction={showCancelIssueAction}
          cancelIssueSubmitting={cancelIssueSubmitting}
          onOpenPreview={() => {
            if (previewDisabled) return;
            setPreviewOpen(true);
          }}
          onCancelIssue={() => {
            void onCancelIssue?.();
          }}
          onBack={onBack}
        />

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
      {!isDesktop && !(variant === 'assignment' && isPreviewOpen) ? (
        <CreateTemplateHeader
          variant={variant}
          mode={mode}
          submitting={submitting}
          hasValidationErrors={hasVisibleErrors || showAssignmentValidationErrors}
          primaryActionDisabled={assignmentPrimaryActionDisabled}
          draftSavedAtLabel={variant === 'template' && mode === 'create' ? draftSavedAtLabel : null}
          subtitleOverride={assignmentReadOnlyNotice}
          showSecondaryAction={!readOnly && (variant === 'assignment' || mode === 'create')}
          showPrimaryAction={!readOnly}
          secondaryActionLabel="Сохранить черновик"
          primaryActionLabel={
            variant === 'assignment'
              ? assignmentPrimaryActionLabel
              : mode === 'edit'
                ? 'Сохранить шаблон'
                : 'Создать шаблон'
          }
          primarySubmittingLabel={
            activeSubmitAction === 'save'
              ? 'Сохраняю…'
              : variant === 'assignment'
                ? assignmentPrimarySubmittingLabel
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
          {assignmentReadOnlyNotice ? <div className={styles.readOnlyNotice}>{assignmentReadOnlyNotice}</div> : null}
          <div className={styles.readOnlySectionWrap}>
            <fieldset className={styles.readOnlyFieldset} disabled={readOnly}>
              <TemplateBasicsSection
                disabled={readOnly}
                titleLabel={variant === 'assignment' ? 'Название домашнего задания' : 'Название шаблона'}
                titlePlaceholder={
                  variant === 'assignment'
                    ? 'Например: Домашка после урока 18 марта'
                    : 'Например: Present Perfect Practice'
                }
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
                assignmentTemplateOptions={variant === 'assignment' ? assignmentTemplateOptions : undefined}
                onAssignmentTemplateChange={
                  variant === 'assignment' && onAssignmentTemplateSelect
                    ? (value) => {
                        if (!value) {
                          onAssignmentTemplateSelect(null);
                          return;
                        }
                        onAssignmentTemplateSelect(Number(value));
                      }
                    : undefined
                }
                assignmentGroupId={draft.assignment.groupId ? String(draft.assignment.groupId) : ''}
                assignmentGroupOptions={variant === 'assignment' ? assignmentGroupOptions : undefined}
                onAssignmentGroupChange={
                  variant === 'assignment'
                    ? (value) =>
                        updateDraft({
                          ...draft,
                          assignment: {
                            ...draft.assignment,
                            groupId: value ? Number(value) : null,
                          },
                        })
                    : undefined
                }
                onTypeChange={handleTemplateTypeSelect}
              />
            </fieldset>
            {readOnly ? <div className={styles.readOnlyOverlay} aria-hidden /> : null}
          </div>

          {shouldInlineAssignmentSidebar ? assignmentSidebar : null}

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

        {variant !== 'assignment' || !shouldInlineAssignmentSidebar ? (
          <aside className={styles.sidebarColumn}>
            {variant === 'assignment' ? (
              assignmentSidebar
            ) : (
              <TemplateSettingsSidebar
                settings={quizSettings}
                stats={stats}
                validationErrors={validationErrorMessages}
                validationWarnings={validationWarningMessages}
                onOpenPreview={() => setPreviewOpen(true)}
                onSettingsChange={handleQuizSettingsChange}
              />
            )}
          </aside>
        ) : null}
      </div>

      {variant === 'assignment' && isPreviewOpen ? (
        <div className={styles.previewOverlay}>
          <AssignmentPreviewScreen draft={draft} students={students} groups={groups} onClose={() => setPreviewOpen(false)} />
        </div>
      ) : null}
      {variant !== 'assignment' ? (
        <TemplatePreviewModal open={isPreviewOpen} draft={templateDraft} onClose={() => setPreviewOpen(false)} />
      ) : null}
    </section>
  );
};

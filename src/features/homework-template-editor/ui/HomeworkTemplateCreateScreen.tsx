import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HomeworkTemplateEditorDraft } from '../model/types';
import {
  applyCreateTemplateType,
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
import { createMediaBlock } from '../model/lib/blocks';
import { filterIssuesBySeverity, isPathPrefix, pathToKey } from '../../../shared/lib/form-validation/path';
import { FormValidationIssue, FormValidationPath } from '../../../shared/lib/form-validation/types';
import { useValidationSession } from '../../../shared/lib/form-validation/useValidationSession';
import { useIsDesktop } from '../../../shared/lib/useIsDesktop';
import { CreateTemplateHeader } from './create-screen/CreateTemplateHeader';
import { TemplateBasicsSection } from './create-screen/TemplateBasicsSection';
import { TemplateTypeSection } from './create-screen/TemplateTypeSection';
import { TemplateQuestionsSection } from './create-screen/TemplateQuestionsSection';
import { TemplateMaterialsSection } from './create-screen/TemplateMaterialsSection';
import { TemplateSettingsSidebar } from './create-screen/TemplateSettingsSidebar';
import { TemplatePreviewModal } from './create-screen/TemplatePreviewModal';
import styles from './HomeworkTemplateCreateScreen.module.css';

export interface HomeworkTemplateCreateSubmitResult {
  success: boolean;
  issues?: FormValidationIssue[];
}

interface HomeworkTemplateCreateScreenProps {
  mode: 'create' | 'edit';
  draft: HomeworkTemplateEditorDraft;
  submitting: boolean;
  onDraftChange: (draft: HomeworkTemplateEditorDraft) => void;
  onSubmit: () => Promise<HomeworkTemplateCreateSubmitResult>;
  onBack: () => void;
}

const isInitialDraft = (draft: HomeworkTemplateEditorDraft) =>
  !draft.title.trim() &&
  !draft.tagsText.trim() &&
  !draft.subject.trim() &&
  !draft.level.trim() &&
  draft.blocks.length === 1 &&
  draft.blocks[0]?.type === 'TEXT' &&
  !draft.blocks[0].content.trim();

export const HomeworkTemplateCreateScreen: FC<HomeworkTemplateCreateScreenProps> = ({
  mode,
  draft,
  submitting,
  onDraftChange,
  onSubmit,
  onBack,
}) => {
  const hasRestoredDraftRef = useRef(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const [quizSettings, setQuizSettings] = useState<TemplateQuizSettings>(() => readTemplateQuizSettings(draft.blocks));
  const [draftSavedAtLabel, setDraftSavedAtLabel] = useState<string | null>(null);
  const [isPreviewOpen, setPreviewOpen] = useState(false);
  const [serverIssues, setServerIssues] = useState<FormValidationIssue[]>([]);
  const isDesktop = useIsDesktop();

  const selectedType = useMemo(() => detectCreateTemplateType(draft.blocks), [draft.blocks]);
  const description = useMemo(() => getPrimaryTextContent(draft.blocks), [draft.blocks]);
  const validation = useMemo(() => validateTemplateDraft(draft), [draft]);
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
  const tags = useMemo(() => parseTagsText(draft.tagsText), [draft.tagsText]);
  const estimatedMinutes = useMemo(() => extractEstimatedMinutes(draft.level), [draft.level]);
  const stats = useMemo(() => buildTemplateCreateStats(draft, quizSettings), [draft, quizSettings]);

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
    if (mode !== 'create') {
      setDraftSavedAtLabel(null);
    }
  }, [mode, resetValidationSession]);

  useEffect(() => {
    if (!draft.blocks.some((block) => block.type === 'TEST')) return;
    setQuizSettings(readTemplateQuizSettings(draft.blocks));
  }, [draft.blocks]);

  useEffect(() => {
    if (mode !== 'create') return;
    if (hasRestoredDraftRef.current) return;
    hasRestoredDraftRef.current = true;
    if (!isInitialDraft(draft)) return;

    const storedDraft = loadStoredCreateTemplateDraft();
    if (!storedDraft) return;

    onDraftChange(storedDraft.draft);
    setDraftSavedAtLabel(formatStoredDraftTimeLabel(storedDraft.savedAt));
  }, [draft, mode, onDraftChange]);

  const updateDraft = (nextDraft: HomeworkTemplateEditorDraft) => {
    onDraftChange(nextDraft);
  };

  const updateBlocks = (nextBlocks: HomeworkTemplateEditorDraft['blocks']) => {
    updateDraft({
      ...draft,
      blocks: nextBlocks,
    });
  };

  const ensureTestBlock = () => {
    const ensured = ensurePrimaryTestBlock(draft.blocks);
    if (ensured.blocks === draft.blocks) return;
    const withSettings = writeTemplateQuizSettings(ensured.blocks, quizSettings);
    updateBlocks(withSettings);
  };

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
    const nextBlocks = applyCreateTemplateType(draft.blocks, type);
    const withSettings = writeTemplateQuizSettings(nextBlocks, quizSettings);
    updateBlocks(withSettings);
  };

  const handleQuizSettingsChange = (nextSettings: TemplateQuizSettings) => {
    setQuizSettings(nextSettings);
    const nextBlocks = writeTemplateQuizSettings(draft.blocks, nextSettings);
    if (nextBlocks !== draft.blocks) {
      updateBlocks(nextBlocks);
    }
  };

  const handleSaveDraft = useCallback(() => {
    if (mode !== 'create') return;
    const now = new Date().toISOString();
    saveStoredCreateTemplateDraft({
      draft,
      quizSettings: quizSettings as unknown as Record<string, unknown>,
      savedAt: now,
    });
    setDraftSavedAtLabel(formatStoredDraftTimeLabel(now));
  }, [draft, mode, quizSettings]);

  const handleSubmit = useCallback(async () => {
    markSubmitAttempt();

    if (validationErrorIssues.length > 0) {
      const firstErrorPath = validationErrorIssues[0]?.path;
      window.requestAnimationFrame(() => focusPathInput(firstErrorPath));
      return;
    }

    const result = await onSubmit();
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
    if (mode === 'create') {
      clearStoredCreateTemplateDraft();
      setDraftSavedAtLabel(null);
    }
    onBack();
  }, [focusPathInput, markSubmitAttempt, mode, onBack, onSubmit, resetValidationSession, validationErrorIssues]);

  useEffect(() => {
    publishHomeworkTemplateCreateTopbarState({
      submitting,
      hasValidationErrors: hasVisibleErrors,
      draftSavedAtLabel: mode === 'create' ? draftSavedAtLabel : null,
    });
  }, [draftSavedAtLabel, hasVisibleErrors, mode, submitting]);

  useEffect(() => {
    const unsubscribeSave = subscribeHomeworkTemplateCreateTopbarCommand('save', handleSaveDraft);
    const unsubscribeSubmit = subscribeHomeworkTemplateCreateTopbarCommand('submit', () => {
      void handleSubmit();
    });
    return () => {
      unsubscribeSave();
      unsubscribeSubmit();
      clearHomeworkTemplateCreateTopbarState();
    };
  }, [handleSaveDraft, handleSubmit]);

  return (
    <section className={styles.page}>
      {!isDesktop ? (
        <CreateTemplateHeader
          mode={mode}
          submitting={submitting}
          hasValidationErrors={hasVisibleErrors}
          draftSavedAtLabel={mode === 'create' ? draftSavedAtLabel : null}
          onBack={onBack}
          onSaveDraft={handleSaveDraft}
          onSubmit={() => {
            void handleSubmit();
          }}
        />
      ) : null}

      <div className={styles.contentGrid}>
        <div className={styles.mainColumn}>
          <TemplateBasicsSection
            title={draft.title}
            titleError={titleError}
            titleValidationPath={titleValidationPath}
            titleInputRef={titleInputRef}
            description={description}
            category={draft.subject}
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
              updateDraft({
                ...draft,
                subject: value,
              })
            }
            onEstimatedMinutesChange={(value) =>
              updateDraft({
                ...draft,
                level: serializeEstimatedMinutes(value),
              })
            }
            onTagAdd={(value) => {
              if (tags.includes(value)) return;
              const nextTags = [...tags, value];
              updateDraft({
                ...draft,
                tagsText: stringifyTags(nextTags),
              });
            }}
            onTagRemove={(value) => {
              const nextTags = tags.filter((tag) => tag !== value);
              updateDraft({
                ...draft,
                tagsText: stringifyTags(nextTags),
              });
            }}
          />

          <TemplateTypeSection selectedType={selectedType} onSelectType={handleTemplateTypeSelect} />

          <TemplateQuestionsSection
            testBlock={primaryTestEntry?.block ?? null}
            testBlockPath={testBlockPath}
            getIssueForPath={getIssueForPath}
            onFieldEdit={handleFieldEdit}
            onEnsureTestBlock={ensureTestBlock}
            onTestBlockChange={updatePrimaryTestBlock}
          />

          <TemplateMaterialsSection mediaBlock={mediaBlock} onMediaBlockChange={updatePrimaryMediaBlock} />
        </div>

        <aside className={styles.sidebarColumn}>
          <TemplateSettingsSidebar
            settings={quizSettings}
            stats={stats}
            validationErrors={validationErrorMessages}
            validationWarnings={validationWarningMessages}
            onOpenPreview={() => setPreviewOpen(true)}
            onSettingsChange={handleQuizSettingsChange}
          />
        </aside>
      </div>

      <TemplatePreviewModal open={isPreviewOpen} draft={draft} onClose={() => setPreviewOpen(false)} />
    </section>
  );
};

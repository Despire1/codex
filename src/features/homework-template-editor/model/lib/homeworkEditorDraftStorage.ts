import { HomeworkSendMode } from '../../../../entities/types';
import { HomeworkEditorDraft, HomeworkEditorTaskType } from '../types';

export interface StoredHomeworkEditorDraft {
  draft: HomeworkEditorDraft;
  savedAt: string;
}

interface HomeworkEditorDraftStorageScope {
  variant: 'template' | 'assignment';
  mode: 'create' | 'edit';
  entityId?: number | null;
}

const HOMEWORK_EDITOR_DRAFT_STORAGE_PREFIX = 'homework_editor_draft_v1';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isHomeworkEditorTaskType = (value: unknown): value is HomeworkEditorTaskType =>
  value === 'TEST' ||
  value === 'WRITTEN' ||
  value === 'ORAL' ||
  value === 'FILE' ||
  value === 'COMBO' ||
  value === 'EXTERNAL';

const isHomeworkSendMode = (value: unknown): value is HomeworkSendMode =>
  value === 'MANUAL' || value === 'AUTO_AFTER_LESSON_DONE' || value === 'SCHEDULED';

const toNullableNumber = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
};

const toNullableString = (value: unknown) => {
  if (typeof value !== 'string') return null;
  return value;
};

const toDraft = (value: unknown): HomeworkEditorDraft | null => {
  if (!isRecord(value)) return null;
  const assignment = isRecord(value.assignment) ? value.assignment : {};
  const template = isRecord(value.template) ? value.template : {};
  const blocks = Array.isArray(value.blocks)
    ? (value.blocks.filter((item) => isRecord(item)) as unknown as HomeworkEditorDraft['blocks'])
    : [];

  return {
    title: typeof value.title === 'string' ? value.title : '',
    blocks,
    assignment: {
      studentId: toNullableNumber(assignment.studentId),
      lessonId: toNullableNumber(assignment.lessonId),
      groupId: toNullableNumber(assignment.groupId),
      scheduledFor: toNullableString(assignment.scheduledFor),
      deadlineAt: toNullableString(assignment.deadlineAt),
      sendMode: isHomeworkSendMode(assignment.sendMode) ? assignment.sendMode : 'MANUAL',
      sourceTemplateId: toNullableNumber(assignment.sourceTemplateId),
    },
    template: {
      tagsText: typeof template.tagsText === 'string' ? template.tagsText : '',
      subject: typeof template.subject === 'string' ? template.subject : '',
      level: typeof template.level === 'string' ? template.level : '',
      selectedType: isHomeworkEditorTaskType(template.selectedType) ? template.selectedType : 'TEST',
    },
  };
};

export const buildHomeworkEditorDraftStorageKey = ({
  variant,
  mode,
  entityId,
}: HomeworkEditorDraftStorageScope) => {
  if (mode === 'edit' && entityId && Number.isFinite(entityId)) {
    return `${HOMEWORK_EDITOR_DRAFT_STORAGE_PREFIX}:${variant}:${mode}:${entityId}`;
  }
  return `${HOMEWORK_EDITOR_DRAFT_STORAGE_PREFIX}:${variant}:${mode}`;
};

export const loadStoredHomeworkEditorDraft = (
  storageKey: string,
): StoredHomeworkEditorDraft | null => {
  if (typeof window === 'undefined') return null;

  let rawValue: string | null = null;
  try {
    rawValue = window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    const draft = toDraft(parsed.draft);
    if (!draft) return null;

    return {
      draft,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
};

export const saveStoredHomeworkEditorDraft = (storageKey: string, payload: StoredHomeworkEditorDraft) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // Ignore localStorage write errors
  }
};

export const clearStoredHomeworkEditorDraft = (storageKey: string) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore localStorage write errors
  }
};

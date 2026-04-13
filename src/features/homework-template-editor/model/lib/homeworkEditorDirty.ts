import { createInitialHomeworkEditorDraft } from './blocks';
import { HomeworkEditorDraft } from '../types';

const normalizeString = (value: unknown) => (typeof value === 'string' ? value.trim() : value);

const normalizeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key, nestedValue]) => key !== 'id' && nestedValue !== undefined)
      .map(([key, nestedValue]) => [key, normalizeValue(nestedValue)] as const);

    return Object.fromEntries(entries);
  }

  return normalizeString(value);
};

const normalizeContent = (draft: HomeworkEditorDraft) => ({
  title: draft.title.trim(),
  blocks: normalizeValue(draft.blocks),
  template: {
    tagsText: draft.template.tagsText.trim(),
    subject: draft.template.subject.trim(),
    level: draft.template.level.trim(),
    selectedType: draft.template.selectedType,
  },
});

const normalizeDraft = (draft: HomeworkEditorDraft) => ({
  ...normalizeContent(draft),
  assignment: {
    studentId: draft.assignment.studentId ?? null,
    lessonId: draft.assignment.lessonId ?? null,
    groupId: draft.assignment.groupId ?? null,
    scheduledFor: draft.assignment.scheduledFor ?? null,
    deadlineAt: draft.assignment.deadlineAt ?? null,
    sendMode: draft.assignment.sendMode,
    sourceTemplateId: draft.assignment.sourceTemplateId ?? null,
  },
});

const serializeDraft = (draft: HomeworkEditorDraft) => JSON.stringify(normalizeDraft(draft));
const serializeDraftContent = (draft: HomeworkEditorDraft) => JSON.stringify(normalizeContent(draft));

export const areHomeworkEditorDraftsEqual = (left: HomeworkEditorDraft, right: HomeworkEditorDraft) =>
  serializeDraft(left) === serializeDraft(right);

export const hasHomeworkEditorContent = (draft: HomeworkEditorDraft) =>
  serializeDraftContent(draft) !== serializeDraftContent(createInitialHomeworkEditorDraft());

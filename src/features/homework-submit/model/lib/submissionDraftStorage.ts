import { HomeworkAttachment } from '../../../../entities/types';

export interface StoredStudentHomeworkSubmissionDraft {
  assignmentId: number;
  assignmentUpdatedAt: string;
  answerText: string;
  attachments: HomeworkAttachment[];
  voice: HomeworkAttachment[];
  testAnswers: Record<string, unknown>;
  savedAt: string;
}

const STUDENT_HOMEWORK_SUBMISSION_DRAFT_STORAGE_PREFIX = 'student_homework_submission_draft_v1';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isAttachment = (value: unknown): value is HomeworkAttachment => {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.url === 'string' &&
    typeof value.fileName === 'string' &&
    typeof value.size === 'number' &&
    Number.isFinite(value.size)
  );
};

export const buildStudentHomeworkSubmissionDraftStorageKey = (assignmentId: number) =>
  `${STUDENT_HOMEWORK_SUBMISSION_DRAFT_STORAGE_PREFIX}:${assignmentId}`;

export const loadStoredStudentHomeworkSubmissionDraft = (
  assignmentId: number,
  assignmentUpdatedAt?: string | null,
): StoredStudentHomeworkSubmissionDraft | null => {
  if (typeof window === 'undefined') return null;

  let rawValue: string | null = null;
  try {
    rawValue = window.localStorage.getItem(buildStudentHomeworkSubmissionDraftStorageKey(assignmentId));
  } catch {
    return null;
  }
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    if (parsed.assignmentId !== assignmentId) return null;
    if (
      assignmentUpdatedAt &&
      (typeof parsed.assignmentUpdatedAt !== 'string' || parsed.assignmentUpdatedAt !== assignmentUpdatedAt)
    ) {
      clearStoredStudentHomeworkSubmissionDraft(assignmentId);
      return null;
    }
    return {
      assignmentId,
      assignmentUpdatedAt:
        typeof parsed.assignmentUpdatedAt === 'string' ? parsed.assignmentUpdatedAt : assignmentUpdatedAt ?? '',
      answerText: typeof parsed.answerText === 'string' ? parsed.answerText : '',
      attachments: Array.isArray(parsed.attachments) ? parsed.attachments.filter(isAttachment) : [],
      voice: Array.isArray(parsed.voice) ? parsed.voice.filter(isAttachment) : [],
      testAnswers:
        parsed.testAnswers && isRecord(parsed.testAnswers)
          ? (parsed.testAnswers as Record<string, unknown>)
          : {},
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
};

export const saveStoredStudentHomeworkSubmissionDraft = (
  payload: StoredStudentHomeworkSubmissionDraft,
) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      buildStudentHomeworkSubmissionDraftStorageKey(payload.assignmentId),
      JSON.stringify(payload),
    );
  } catch {
    // Ignore localStorage write errors
  }
};

export const clearStoredStudentHomeworkSubmissionDraft = (assignmentId: number) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(buildStudentHomeworkSubmissionDraftStorageKey(assignmentId));
  } catch {
    // Ignore localStorage write errors
  }
};

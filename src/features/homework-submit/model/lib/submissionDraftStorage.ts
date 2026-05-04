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
const STUDENT_HOMEWORK_SUBMISSION_DRAFT_ARCHIVE_PREFIX = 'student_homework_submission_draft_archive_v1';
const ARCHIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

const buildStudentHomeworkSubmissionDraftArchiveKey = (assignmentId: number) =>
  `${STUDENT_HOMEWORK_SUBMISSION_DRAFT_ARCHIVE_PREFIX}:${assignmentId}`;

const archiveDiscardedDraft = (rawValue: string, assignmentId: number) => {
  if (typeof window === 'undefined') return;
  try {
    const archiveKey = buildStudentHomeworkSubmissionDraftArchiveKey(assignmentId);
    window.localStorage.setItem(
      archiveKey,
      JSON.stringify({ archivedAt: new Date().toISOString(), payload: rawValue }),
    );
  } catch {
    // ignore
  }
};

export const loadArchivedStudentHomeworkSubmissionDraft = (
  assignmentId: number,
): StoredStudentHomeworkSubmissionDraft | null => {
  if (typeof window === 'undefined') return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(buildStudentHomeworkSubmissionDraftArchiveKey(assignmentId));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { archivedAt?: unknown; payload?: unknown };
    const archivedAt = typeof parsed.archivedAt === 'string' ? Date.parse(parsed.archivedAt) : NaN;
    if (!Number.isFinite(archivedAt) || Date.now() - archivedAt > ARCHIVE_TTL_MS) {
      try {
        window.localStorage.removeItem(buildStudentHomeworkSubmissionDraftArchiveKey(assignmentId));
      } catch {
        // ignore
      }
      return null;
    }
    if (typeof parsed.payload !== 'string') return null;
    const inner = JSON.parse(parsed.payload) as Record<string, unknown>;
    if (inner.assignmentId !== assignmentId) return null;
    return {
      assignmentId,
      assignmentUpdatedAt: typeof inner.assignmentUpdatedAt === 'string' ? inner.assignmentUpdatedAt : '',
      answerText: typeof inner.answerText === 'string' ? inner.answerText : '',
      attachments: Array.isArray(inner.attachments) ? inner.attachments.filter(isAttachment) : [],
      voice: Array.isArray(inner.voice) ? inner.voice.filter(isAttachment) : [],
      testAnswers:
        inner.testAnswers && isRecord(inner.testAnswers) ? (inner.testAnswers as Record<string, unknown>) : {},
      savedAt: typeof inner.savedAt === 'string' ? inner.savedAt : '',
    };
  } catch {
    return null;
  }
};

export const clearArchivedStudentHomeworkSubmissionDraft = (assignmentId: number) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(buildStudentHomeworkSubmissionDraftArchiveKey(assignmentId));
  } catch {
    // ignore
  }
};

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
      archiveDiscardedDraft(rawValue, assignmentId);
      clearStoredStudentHomeworkSubmissionDraft(assignmentId);
      return null;
    }
    return {
      assignmentId,
      assignmentUpdatedAt:
        typeof parsed.assignmentUpdatedAt === 'string' ? parsed.assignmentUpdatedAt : (assignmentUpdatedAt ?? ''),
      answerText: typeof parsed.answerText === 'string' ? parsed.answerText : '',
      attachments: Array.isArray(parsed.attachments) ? parsed.attachments.filter(isAttachment) : [],
      voice: Array.isArray(parsed.voice) ? parsed.voice.filter(isAttachment) : [],
      testAnswers:
        parsed.testAnswers && isRecord(parsed.testAnswers) ? (parsed.testAnswers as Record<string, unknown>) : {},
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
};

export const saveStoredStudentHomeworkSubmissionDraft = (payload: StoredStudentHomeworkSubmissionDraft): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(
      buildStudentHomeworkSubmissionDraftStorageKey(payload.assignmentId),
      JSON.stringify(payload),
    );
    return true;
  } catch (error) {
    console.warn('[homework-draft] localStorage write failed', error);
    return false;
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

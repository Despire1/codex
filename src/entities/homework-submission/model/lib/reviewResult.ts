import {
  HomeworkReviewItemResult,
  HomeworkReviewResult,
  HomeworkSubmission,
} from '../../../types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeReviewItemResult = (value: unknown): HomeworkReviewItemResult | null => {
  if (!isRecord(value)) return null;
  const decision =
    value.decision === 'ACCEPTED' || value.decision === 'REWORK_REQUIRED' ? value.decision : null;
  if (!decision) return null;
  const score = Number(value.score);
  if (!Number.isFinite(score)) return null;
  return {
    decision,
    score,
    comment: typeof value.comment === 'string' && value.comment.trim() ? value.comment : null,
  };
};

export const normalizeHomeworkReviewResult = (value: unknown): HomeworkReviewResult | null => {
  if (typeof value === 'string') {
    try {
      return normalizeHomeworkReviewResult(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (!isRecord(value)) return null;
  const submissionId = Number(value.submissionId);
  if (!Number.isFinite(submissionId) || submissionId <= 0) return null;
  const rawItems = isRecord(value.items) ? value.items : null;
  if (!rawItems) return null;
  const items = Object.entries(rawItems).reduce<Record<string, HomeworkReviewItemResult>>((acc, [key, item]) => {
    if (!key.trim()) return acc;
    const normalized = normalizeReviewItemResult(item);
    if (!normalized) return acc;
    acc[key] = normalized;
    return acc;
  }, {});
  return {
    submissionId,
    generalComment: typeof value.generalComment === 'string' ? value.generalComment : '',
    items,
  };
};

export const getSubmissionReviewResult = (submission: Pick<HomeworkSubmission, 'reviewResult'>) =>
  normalizeHomeworkReviewResult(submission.reviewResult ?? null);

export const isReviewItemAccepted = (
  reviewResult: HomeworkReviewResult | null | undefined,
  itemId: string,
) => reviewResult?.items[itemId]?.decision === 'ACCEPTED';

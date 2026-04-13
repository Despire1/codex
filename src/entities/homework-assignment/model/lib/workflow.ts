import {
  HomeworkAssignment,
  HomeworkAssignmentProblemFlag,
  HomeworkAssignmentStatus,
  HomeworkLateState,
  HomeworkSendMode,
  HomeworkSubmissionStatus,
} from '../../../types';

type DateLike = string | Date | null | undefined;

export type HomeworkAssignmentBucketId = 'all' | 'draft' | 'sent' | 'review' | 'reviewed' | 'overdue';
export type HomeworkAssignmentsTabId =
  | 'all'
  | 'inbox'
  | 'draft'
  | 'scheduled'
  | 'in_progress'
  | 'review'
  | 'closed'
  | 'overdue';

export type HomeworkWorkflowSource = Pick<
  HomeworkAssignment,
  | 'status'
  | 'latestSubmissionStatus'
  | 'latestSubmissionSubmittedAt'
  | 'reviewedAt'
> & {
  deadlineAt?: DateLike;
  sendMode?: HomeworkSendMode;
  lessonId?: number | null;
  scheduledFor?: DateLike;
  latestSubmissionSubmittedAt?: DateLike;
  reviewedAt?: DateLike;
};

export type HomeworkAssignmentWorkflow = {
  persistedStatus: HomeworkAssignmentStatus;
  status: HomeworkAssignmentStatus;
  isOverdue: boolean;
  lateState: HomeworkLateState | null;
  hasConfigError: boolean;
  problemFlags: HomeworkAssignmentProblemFlag[];
  needsStudentAction: boolean;
  needsTeacherAction: boolean;
  canTeacherEditAssignment: boolean;
  canStudentEdit: boolean;
  canTeacherReview: boolean;
  canCancelIssueByStatus: boolean;
  canReissue: boolean;
  isStudentVisible: boolean;
};

const STUDENT_VISIBLE_STATUSES: HomeworkAssignmentStatus[] = [
  'SENT',
  'SUBMITTED',
  'IN_REVIEW',
  'RETURNED',
  'REVIEWED',
  'OVERDUE',
];

const toValidDate = (value: DateLike) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

export const normalizeHomeworkAssignmentStatus = (value: unknown): HomeworkAssignmentStatus => {
  const normalized = typeof value === 'string' ? value.toUpperCase() : '';
  if (
    normalized === 'DRAFT' ||
    normalized === 'SCHEDULED' ||
    normalized === 'SENT' ||
    normalized === 'SUBMITTED' ||
    normalized === 'IN_REVIEW' ||
    normalized === 'RETURNED' ||
    normalized === 'REVIEWED' ||
    normalized === 'OVERDUE'
  ) {
    return normalized;
  }
  return 'DRAFT';
};

export const normalizeHomeworkSubmissionStatus = (value: unknown): HomeworkSubmissionStatus => {
  const normalized = typeof value === 'string' ? value.toUpperCase() : '';
  if (normalized === 'DRAFT' || normalized === 'SUBMITTED' || normalized === 'REVIEWED') {
    return normalized;
  }
  return 'DRAFT';
};

export const normalizeHomeworkSendMode = (value: unknown): HomeworkSendMode =>
  value === 'AUTO_AFTER_LESSON_DONE' || value === 'SCHEDULED' ? value : 'MANUAL';

export const hasRealHomeworkSubmissionStatus = (status: HomeworkSubmissionStatus | null | undefined) =>
  status === 'SUBMITTED' || status === 'REVIEWED';

const resolveLegacyOverdueStatus = (
  status: HomeworkAssignmentStatus,
  latestSubmissionStatus: HomeworkSubmissionStatus | null | undefined,
  reviewedAt: DateLike,
) => {
  if (status !== 'OVERDUE') return status;
  const latestStatus = normalizeHomeworkSubmissionStatus(latestSubmissionStatus);
  if (latestStatus === 'SUBMITTED') return 'SUBMITTED';
  if (latestStatus === 'REVIEWED' && toValidDate(reviewedAt)) return 'REVIEWED';
  return 'SENT';
};

export const resolveHomeworkAssignmentWorkflow = (
  assignment: HomeworkWorkflowSource,
  now = new Date(),
): HomeworkAssignmentWorkflow => {
  const persistedStatus = normalizeHomeworkAssignmentStatus(assignment.status);
  const normalizedSubmissionStatus = assignment.latestSubmissionStatus
    ? normalizeHomeworkSubmissionStatus(assignment.latestSubmissionStatus)
    : null;
  const deadlineAt = toValidDate(assignment.deadlineAt);
  const scheduledFor = toValidDate(assignment.scheduledFor);
  const latestSubmissionSubmittedAt = toValidDate(assignment.latestSubmissionSubmittedAt);
  const reviewedAt = toValidDate(assignment.reviewedAt);
  const baseStatus = resolveLegacyOverdueStatus(persistedStatus, normalizedSubmissionStatus, reviewedAt);
  const needsStudentAction = baseStatus === 'SENT' || baseStatus === 'RETURNED';
  const isOverdue = needsStudentAction && Boolean(deadlineAt && deadlineAt.getTime() < now.getTime());
  const status = isOverdue ? 'OVERDUE' : baseStatus;
  const canTeacherEditAssignment = persistedStatus === 'DRAFT' || persistedStatus === 'SCHEDULED';
  const lateState =
    deadlineAt && latestSubmissionSubmittedAt
      ? latestSubmissionSubmittedAt.getTime() > deadlineAt.getTime()
        ? 'LATE'
        : 'ON_TIME'
      : null;
  const hasConfigError =
    (normalizeHomeworkSendMode(assignment.sendMode) === 'AUTO_AFTER_LESSON_DONE' &&
      (assignment.lessonId === null || assignment.lessonId === undefined)) ||
    (normalizeHomeworkSendMode(assignment.sendMode) === 'SCHEDULED' && !scheduledFor);
  const problemFlags = Array.from(
    new Set(
      [
        isOverdue ? 'OVERDUE' : null,
        baseStatus === 'RETURNED' ? 'RETURNED' : null,
        hasConfigError ? 'CONFIG_ERROR' : null,
        baseStatus === 'SUBMITTED' ? 'SUBMITTED' : null,
        baseStatus === 'IN_REVIEW' ? 'IN_REVIEW' : null,
      ].filter((value): value is HomeworkAssignmentProblemFlag => Boolean(value)),
    ),
  );

  return {
    persistedStatus,
    status,
    isOverdue,
    lateState,
    hasConfigError,
    problemFlags,
    needsStudentAction,
    needsTeacherAction: baseStatus === 'SUBMITTED' || baseStatus === 'IN_REVIEW',
    canTeacherEditAssignment,
    canStudentEdit: needsStudentAction,
    canTeacherReview: baseStatus === 'SUBMITTED' || baseStatus === 'IN_REVIEW',
    canCancelIssueByStatus: persistedStatus === 'SCHEDULED' || needsStudentAction,
    canReissue: baseStatus === 'REVIEWED',
    isStudentVisible: STUDENT_VISIBLE_STATUSES.includes(status),
  };
};

export const resolveHomeworkAssignmentViewStatus = (assignment: HomeworkWorkflowSource, now = new Date()) =>
  resolveHomeworkAssignmentWorkflow(assignment, now).status;

export const isHomeworkAssignmentVisibleToStudent = (status: HomeworkAssignmentStatus) =>
  STUDENT_VISIBLE_STATUSES.includes(normalizeHomeworkAssignmentStatus(status));

export const assignmentBelongsToBucket = (
  assignment: HomeworkWorkflowSource,
  bucket: HomeworkAssignmentBucketId,
  now = new Date(),
) => {
  const workflow = resolveHomeworkAssignmentWorkflow(assignment, now);
  if (bucket === 'draft') return workflow.persistedStatus === 'DRAFT' || workflow.persistedStatus === 'SCHEDULED';
  if (bucket === 'sent') return workflow.needsStudentAction && !workflow.isOverdue;
  if (bucket === 'review') return workflow.needsTeacherAction;
  if (bucket === 'reviewed') return workflow.status === 'REVIEWED';
  if (bucket === 'overdue') return workflow.isOverdue;
  return true;
};

export const assignmentBelongsToTab = (
  assignment: HomeworkWorkflowSource,
  tab: HomeworkAssignmentsTabId,
  now = new Date(),
) => {
  const workflow = resolveHomeworkAssignmentWorkflow(assignment, now);
  if (tab === 'draft') return workflow.persistedStatus === 'DRAFT';
  if (tab === 'scheduled') return workflow.persistedStatus === 'SCHEDULED';
  if (tab === 'in_progress') return workflow.needsStudentAction && !workflow.isOverdue;
  if (tab === 'review') return workflow.needsTeacherAction;
  if (tab === 'closed') return workflow.status === 'REVIEWED';
  if (tab === 'overdue') return workflow.isOverdue;
  if (tab === 'inbox') {
    return workflow.needsTeacherAction || workflow.status === 'RETURNED' || workflow.isOverdue || workflow.hasConfigError;
  }
  return true;
};

export const canCancelHomeworkAssignmentIssue = (assignment: HomeworkWorkflowSource) =>
  resolveHomeworkAssignmentWorkflow(assignment).canCancelIssueByStatus;

export const canReissueHomeworkAssignment = (assignment: HomeworkWorkflowSource) =>
  resolveHomeworkAssignmentWorkflow(assignment).canReissue;

export const canTeacherEditHomeworkAssignment = (assignment: HomeworkWorkflowSource) =>
  resolveHomeworkAssignmentWorkflow(assignment).canTeacherEditAssignment;

import crypto from 'node:crypto';
import { URL } from 'node:url';
import { addDays } from 'date-fns';
import type { HomeworkAssignment, HomeworkBlock, HomeworkSubmission, HomeworkTestQuestion } from '../../../../entities/types';
import {
  HomeworkAssignmentBucketId,
  HomeworkAssignmentsTabId,
  normalizeHomeworkAssignmentStatus,
  normalizeHomeworkSendMode,
  normalizeHomeworkSubmissionStatus,
  resolveHomeworkAssignmentWorkflow,
} from '../../../../entities/homework-assignment/model/lib/workflow';
import { normalizeHomeworkReviewResult } from '../../../../entities/homework-submission/model/lib/reviewResult';
import {
  readHomeworkTemplateQuizSettingsFromBlocks,
  resolveHomeworkAttemptTimerConfig,
} from '../../../../entities/homework-template/model/lib/quizSettings';
import {
  isHomeworkQuestionAutoGradable,
  resolveHomeworkQuizCapabilities,
} from '../../../../entities/homework-template/model/lib/quizProgress';
import { buildHomeworkReviewItems, normalizeReviewPoints } from '../../../../features/homework-review/model/lib/questionReview';
import {
  formatInTimeZone,
  resolveTimeZone,
  toUtcDateFromTimeZone,
} from '../../../../shared/lib/timezoneDates';
import prisma from '../../../prismaClient';
import { clampNumber } from '../../lib/runtimeLimits';

export type HttpError = Error & { statusCode?: number };

export const createHttpError = (message: string, statusCode: number): HttpError => {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  return error;
};

const parseJsonValue = <T>(value: unknown, fallback: T): T => {
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    return value as T;
  }
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const parseStringArray = (value: unknown): string[] => {
  const parsed = parseJsonValue<unknown[]>(value, []);
  return parsed
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
};

const parseObjectArray = (value: unknown): Record<string, unknown>[] => {
  const parsed = parseJsonValue<unknown[]>(value, []);
  return parsed.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
};

export const parseObjectRecord = (value: unknown): Record<string, unknown> | null => {
  const parsed = parseJsonValue<unknown>(value, null);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
};

export const toValidDate = (value: unknown): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

export const clampHomeworkScore = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return clampNumber(Math.round(numeric), 0, 100);
};

export const normalizeHomeworkTemplateTags = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return parseStringArray(value);
};

export const normalizeHomeworkBlocks = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'object' && item !== null) as Record<string, unknown>[];
  }
  return parseObjectArray(value);
};

const normalizeHomeworkAttachmentUrl = (value: unknown) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/api/v2/files/object/')) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.pathname.startsWith('/api/v2/files/object/')) {
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
      return trimmed;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
};

export const normalizeHomeworkAttachments = (value: unknown) => {
  if (Array.isArray(value)) {
    const normalized = value
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({
        id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
        url: normalizeHomeworkAttachmentUrl(item.url),
        fileName: typeof item.fileName === 'string' ? item.fileName : '',
        size: Number.isFinite(Number(item.size)) ? Math.max(0, Number(item.size)) : 0,
      }))
      .filter((item) => item.url);
    return Array.from(
      new Map(
        normalized.map((item) => [`${item.fileName.trim().toLowerCase()}_${item.size}`, item] as const),
      ).values(),
    );
  }
  return parseObjectArray(value);
};

export type HomeworkAssignmentBucketV2 = HomeworkAssignmentBucketId;
export type HomeworkAssignmentsTabV2 = HomeworkAssignmentsTabId;
export type HomeworkAssignmentsSortV2 = 'urgency' | 'deadline' | 'student' | 'updated' | 'created';
export type HomeworkAssignmentProblemFilterV2 = 'overdue' | 'returned' | 'config_error';

export const DEFAULT_HOMEWORK_GROUP_ICON_KEY = 'layer-group';
export const DEFAULT_HOMEWORK_GROUP_BG_COLOR = '#F3F4F6';
const HOMEWORK_GROUP_BG_COLOR_REGEX = /^#(?:[0-9a-f]{6}|[0-9a-f]{3})$/i;

export const normalizeHomeworkGroupTitle = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export const normalizeHomeworkGroupDescription = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

export const normalizeHomeworkGroupIconKey = (value: unknown) => {
  if (typeof value !== 'string') return DEFAULT_HOMEWORK_GROUP_ICON_KEY;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : DEFAULT_HOMEWORK_GROUP_ICON_KEY;
};

export const normalizeHomeworkGroupBgColor = (value: unknown) => {
  if (typeof value !== 'string') return DEFAULT_HOMEWORK_GROUP_BG_COLOR;
  const normalized = value.trim();
  if (!HOMEWORK_GROUP_BG_COLOR_REGEX.test(normalized)) return DEFAULT_HOMEWORK_GROUP_BG_COLOR;
  if (normalized.length === 4) {
    const expanded = normalized
      .slice(1)
      .split('')
      .map((char) => `${char}${char}`)
      .join('');
    return `#${expanded}`.toUpperCase();
  }
  return normalized.toUpperCase();
};

export const normalizeHomeworkGroupSortOrder = (value: unknown, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(-1_000_000, Math.min(1_000_000, Math.trunc(numeric)));
};

export const normalizeHomeworkAssignmentBucketV2 = (value: unknown): HomeworkAssignmentBucketV2 => {
  const normalized = typeof value === 'string' ? value.toLowerCase() : '';
  if (
    normalized === 'all' ||
    normalized === 'draft' ||
    normalized === 'sent' ||
    normalized === 'review' ||
    normalized === 'reviewed' ||
    normalized === 'overdue'
  ) {
    return normalized;
  }
  return 'all';
};

export const normalizeHomeworkAssignmentsTabV2 = (value: unknown): HomeworkAssignmentsTabV2 => {
  const normalized = typeof value === 'string' ? value.toLowerCase() : '';
  if (
    normalized === 'all' ||
    normalized === 'inbox' ||
    normalized === 'draft' ||
    normalized === 'scheduled' ||
    normalized === 'in_progress' ||
    normalized === 'review' ||
    normalized === 'closed' ||
    normalized === 'overdue'
  ) {
    return normalized;
  }
  return 'all';
};

export const normalizeHomeworkAssignmentsSortV2 = (value: unknown): HomeworkAssignmentsSortV2 => {
  const normalized = typeof value === 'string' ? value.toLowerCase() : '';
  if (
    normalized === 'urgency' ||
    normalized === 'deadline' ||
    normalized === 'student' ||
    normalized === 'updated' ||
    normalized === 'created'
  ) {
    return normalized;
  }
  return 'urgency';
};

export const normalizeHomeworkAssignmentProblemFiltersV2 = (
  value: unknown,
): HomeworkAssignmentProblemFilterV2[] => {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

  const normalized = rawItems
    .map((item) => String(item).toLowerCase())
    .filter(
      (item): item is HomeworkAssignmentProblemFilterV2 =>
        item === 'overdue' || item === 'returned' || item === 'config_error',
    );
  return Array.from(new Set(normalized));
};

export const attachLatestSubmissionMetaToAssignments = async (items: any[]) => {
  if (!items.length) return items;
  const assignmentIds = items
    .map((item) => Number(item.id))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (!assignmentIds.length) return items;

  const submissions = await (prisma as any).homeworkSubmission.findMany({
    where: { assignmentId: { in: assignmentIds } },
    orderBy: [{ assignmentId: 'asc' }, { attemptNo: 'desc' }, { id: 'desc' }],
    select: {
      assignmentId: true,
      attemptNo: true,
      status: true,
      submittedAt: true,
    },
  });

  const latestByAssignmentId = new Map<number, any>();
  submissions.forEach((submission: any) => {
    if (!latestByAssignmentId.has(submission.assignmentId)) {
      latestByAssignmentId.set(submission.assignmentId, submission);
    }
  });

  return items.map((item) => {
    const latest = latestByAssignmentId.get(item.id);
    return {
      ...item,
      latestSubmissionAttemptNo: latest?.attemptNo ?? null,
      latestSubmissionStatus: latest ? normalizeHomeworkSubmissionStatus(latest.status) : null,
      latestSubmissionSubmittedAt: latest?.submittedAt ?? null,
    };
  });
};

export const attachAssignmentDisplayMeta = async (teacherId: bigint, assignments: any[], now: Date) => {
  if (!assignments.length) return assignments;
  const studentIds = Array.from(
    new Set(
      assignments
        .map((item) => Number(item.studentId))
        .filter((studentId) => Number.isFinite(studentId) && studentId > 0),
    ),
  );
  const links = studentIds.length
    ? await prisma.teacherStudent.findMany({
        where: { teacherId, studentId: { in: studentIds }, isArchived: false },
        select: { studentId: true, customName: true, uiColor: true },
      })
    : [];
  const linkByStudentId = new Map<number, { studentId: number; customName: string; uiColor: string }>(
    links.map((link) => [link.studentId, link]),
  );

  return assignments.map((assignment) => {
    const workflow = resolveHomeworkAssignmentWorkflow(assignment, now);
    const studentLink = linkByStudentId.get(assignment.studentId);
    const studentName =
      studentLink?.customName?.trim() ||
      assignment.student?.username?.trim() ||
      `Ученик #${assignment.studentId}`;
    return {
      ...assignment,
      studentName,
      studentUsername: assignment.student?.username ?? null,
      studentUiColor: studentLink?.uiColor ?? null,
      lessonStartAt: assignment.lesson?.startAt ?? null,
      templateTitle: assignment.template?.title ?? null,
      groupTitle: assignment.group?.title ?? null,
      hasConfigError: workflow.hasConfigError,
      isOverdue: workflow.isOverdue,
      lateState: workflow.lateState,
      problemFlags: workflow.problemFlags,
    };
  });
};

export const matchesAssignmentSearchQuery = (assignment: any, queryLower: string) => {
  const fields = [
    assignment.title,
    assignment.studentName,
    assignment.studentUsername,
    assignment.templateTitle,
    assignment.groupTitle,
  ]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toLowerCase());
  return fields.some((value) => value.includes(queryLower));
};

export const sortHomeworkAssignmentsV2 = (items: any[], sort: HomeworkAssignmentsSortV2) => {
  if (sort === 'created') {
    return items.sort((left, right) => {
      const rightCreated = new Date(right.createdAt).getTime();
      const leftCreated = new Date(left.createdAt).getTime();
      return rightCreated - leftCreated || Number(right.id) - Number(left.id);
    });
  }
  if (sort === 'updated') {
    return items.sort((left, right) => {
      const rightUpdated = new Date(right.updatedAt).getTime();
      const leftUpdated = new Date(left.updatedAt).getTime();
      return rightUpdated - leftUpdated || Number(right.id) - Number(left.id);
    });
  }
  if (sort === 'deadline') {
    return items.sort((left, right) => {
      const leftDeadline = toValidDate(left.deadlineAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightDeadline = toValidDate(right.deadlineAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return leftDeadline - rightDeadline || Number(right.id) - Number(left.id);
    });
  }
  if (sort === 'student') {
    return items.sort((left, right) => {
      const leftStudent = String(left.studentName ?? '').toLowerCase();
      const rightStudent = String(right.studentName ?? '').toLowerCase();
      if (leftStudent < rightStudent) return -1;
      if (leftStudent > rightStudent) return 1;
      const rightCreated = new Date(right.createdAt).getTime();
      const leftCreated = new Date(left.createdAt).getTime();
      return rightCreated - leftCreated;
    });
  }

  const priority = (item: any) => {
    if (item.hasConfigError) return 0;
    if (item.isOverdue) return 1;
    if (item.status === 'SUBMITTED' || item.status === 'IN_REVIEW') return 2;
    if (item.status === 'RETURNED') return 3;
    if (item.status === 'SCHEDULED') return 4;
    if (item.status === 'SENT') return 5;
    if (item.status === 'DRAFT') return 6;
    if (item.status === 'REVIEWED') return 7;
    return 8;
  };

  return items.sort((left, right) => {
    const priorityDiff = priority(left) - priority(right);
    if (priorityDiff !== 0) return priorityDiff;
    const leftDeadline = toValidDate(left.deadlineAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const rightDeadline = toValidDate(right.deadlineAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (leftDeadline !== rightDeadline) return leftDeadline - rightDeadline;
    const rightCreated = new Date(right.createdAt).getTime();
    const leftCreated = new Date(left.createdAt).getTime();
    return rightCreated - leftCreated;
  });
};

export const serializeHomeworkTemplateV2 = (template: any) => ({
  id: template.id,
  teacherId: Number(template.teacherId),
  createdByTeacherId: template.createdByTeacherId ? Number(template.createdByTeacherId) : null,
  title: template.title ?? '',
  tags: normalizeHomeworkTemplateTags(template.tags),
  subject: template.subject ?? null,
  level: template.level ?? null,
  blocks: normalizeHomeworkBlocks(template.blocks),
  isArchived: Boolean(template.isArchived),
  issuedAssignmentsCount: Number.isFinite(Number(template.issuedAssignmentsCount))
    ? Number(template.issuedAssignmentsCount)
    : 0,
  canTeacherEdit:
    typeof template.canTeacherEdit === 'boolean'
      ? template.canTeacherEdit
      : !(Number.isFinite(Number(template.issuedAssignmentsCount)) && Number(template.issuedAssignmentsCount) > 0),
  canTeacherDelete:
    typeof template.canTeacherDelete === 'boolean'
      ? template.canTeacherDelete
      : !(Number.isFinite(Number(template.issuedAssignmentsCount)) && Number(template.issuedAssignmentsCount) > 0),
  createdAt: template.createdAt,
  updatedAt: template.updatedAt,
});

export const serializeHomeworkGroupV2 = (group: any) => ({
  id: group.id,
  teacherId: Number(group.teacherId),
  title: group.title ?? '',
  description: group.description ?? null,
  iconKey: normalizeHomeworkGroupIconKey(group.iconKey),
  bgColor: normalizeHomeworkGroupBgColor(group.bgColor),
  sortOrder: normalizeHomeworkGroupSortOrder(group.sortOrder, 0),
  isArchived: Boolean(group.isArchived),
  createdAt: group.createdAt,
  updatedAt: group.updatedAt,
});

export const serializeHomeworkGroupListItemV2 = (
  group: any,
  assignmentsCount: number,
  options?: { isSystem?: boolean; isUngrouped?: boolean },
) => {
  const isSystem = Boolean(options?.isSystem);
  const isUngrouped = Boolean(options?.isUngrouped);
  if (isSystem && isUngrouped) {
    return {
      id: null,
      teacherId: Number(group.teacherId),
      title: group.title ?? 'Без группы',
      description: group.description ?? 'Задания без категории',
      iconKey: normalizeHomeworkGroupIconKey(group.iconKey),
      bgColor: normalizeHomeworkGroupBgColor(group.bgColor),
      sortOrder: normalizeHomeworkGroupSortOrder(group.sortOrder, -1),
      isArchived: false,
      createdAt: null,
      updatedAt: null,
      assignmentsCount: Math.max(0, assignmentsCount),
      isSystem: true,
      isUngrouped: true,
    };
  }
  const serialized = serializeHomeworkGroupV2(group);
  return {
    ...serialized,
    assignmentsCount: Math.max(0, assignmentsCount),
    isSystem: isSystem || false,
    isUngrouped: isUngrouped || false,
  };
};

export const serializeHomeworkAssignmentV2 = (assignment: any, now = new Date()) => {
  const workflow = resolveHomeworkAssignmentWorkflow(assignment, now);

  return {
    id: assignment.id,
    teacherId: Number(assignment.teacherId),
    studentId: assignment.studentId,
    studentName: assignment.studentName ?? null,
    studentUsername: assignment.studentUsername ?? assignment.student?.username ?? null,
    studentUiColor: assignment.studentUiColor ?? null,
    lessonId: assignment.lessonId ?? null,
    lessonStartAt: assignment.lessonStartAt ?? assignment.lesson?.startAt ?? null,
    templateId: assignment.templateId ?? null,
    templateTitle: assignment.templateTitle ?? assignment.template?.title ?? null,
    groupId: assignment.groupId ?? assignment.group?.id ?? null,
    groupTitle: assignment.groupTitle ?? assignment.group?.title ?? null,
    legacyHomeworkId: assignment.legacyHomeworkId ?? null,
    title: assignment.title ?? '',
    status: workflow.status,
    isOverdue: workflow.isOverdue,
    lateState: workflow.lateState,
    hasConfigError: workflow.hasConfigError,
    problemFlags: workflow.problemFlags,
    sendMode: normalizeHomeworkSendMode(assignment.sendMode),
    scheduledFor: assignment.scheduledFor ?? null,
    deadlineAt: assignment.deadlineAt ?? null,
    sentAt: assignment.sentAt ?? null,
    contentSnapshot: normalizeHomeworkBlocks(assignment.contentSnapshot),
    teacherComment: assignment.teacherComment ?? null,
    reviewedAt: assignment.reviewedAt ?? null,
    reminder24hSentAt: assignment.reminder24hSentAt ?? null,
    reminderMorningSentAt: assignment.reminderMorningSentAt ?? null,
    reminder3hSentAt: assignment.reminder3hSentAt ?? null,
    overdueReminderCount: Number.isFinite(Number(assignment.overdueReminderCount))
      ? Number(assignment.overdueReminderCount)
      : 0,
    lastOverdueReminderAt: assignment.lastOverdueReminderAt ?? null,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
    latestSubmissionAttemptNo: Number.isFinite(Number(assignment.latestSubmissionAttemptNo))
      ? Number(assignment.latestSubmissionAttemptNo)
      : null,
    latestSubmissionStatus: assignment.latestSubmissionStatus
      ? normalizeHomeworkSubmissionStatus(assignment.latestSubmissionStatus)
      : null,
    latestSubmissionSubmittedAt: assignment.latestSubmissionSubmittedAt ?? null,
    score: {
      autoScore: clampHomeworkScore(assignment.autoScore),
      manualScore: clampHomeworkScore(assignment.manualScore),
      finalScore: clampHomeworkScore(assignment.finalScore),
    },
  };
};

export type HomeworkReviewDraftV2 = {
  submissionId: number;
  scoresById: Record<string, number>;
  commentsById: Record<string, string>;
  generalComment: string;
};

export const normalizeHomeworkReviewDraftV2 = (value: unknown): HomeworkReviewDraftV2 | null => {
  const raw = parseObjectRecord(value);
  if (!raw) return null;

  const submissionId = Number(raw.submissionId);
  if (!Number.isFinite(submissionId) || submissionId <= 0) return null;

  const rawScores = parseObjectRecord(raw.scoresById) ?? {};
  const scoresById = Object.entries(rawScores).reduce<Record<string, number>>((acc, [key, score]) => {
    if (typeof key !== 'string' || !key.trim()) return acc;
    const numeric = Number(score);
    if (!Number.isFinite(numeric)) return acc;
    acc[key] = clampNumber(numeric, 0, 1000);
    return acc;
  }, {});

  const rawComments = parseObjectRecord(raw.commentsById) ?? {};
  const commentsById = Object.entries(rawComments).reduce<Record<string, string>>((acc, [key, comment]) => {
    if (typeof key !== 'string' || !key.trim()) return acc;
    if (typeof comment !== 'string') return acc;
    acc[key] = comment;
    return acc;
  }, {});

  return {
    submissionId,
    scoresById,
    commentsById,
    generalComment: typeof raw.generalComment === 'string' ? raw.generalComment : '',
  };
};

export const buildHomeworkReviewResultV2 = ({
  assignment,
  submission,
  reviewDraft,
  reviewResult,
}: {
  assignment: any;
  submission: any;
  reviewDraft: HomeworkReviewDraftV2 | null;
  reviewResult: unknown;
}) => {
  const serializedAssignment = serializeHomeworkAssignmentV2(assignment) as unknown as HomeworkAssignment;
  const serializedSubmission = serializeHomeworkSubmissionV2(submission) as HomeworkSubmission;
  const reviewItems = buildHomeworkReviewItems(serializedAssignment, serializedSubmission);
  const normalizedReviewResult = normalizeHomeworkReviewResult(reviewResult);

  const items = reviewItems.reduce<
    Record<string, { decision: 'ACCEPTED' | 'REWORK_REQUIRED'; score: number; comment: string | null }>
  >((acc, item) => {
    const reviewItem = normalizedReviewResult?.items[item.id] ?? null;
    const draftScore = reviewDraft?.scoresById[item.id];
    const draftComment = reviewDraft?.commentsById[item.id];
    const score = reviewItem
      ? normalizeReviewPoints(reviewItem.score, item.maxPoints)
      : Number.isFinite(draftScore)
        ? normalizeReviewPoints(Number(draftScore), item.maxPoints)
        : normalizeReviewPoints(item.initialPoints, item.maxPoints);
    acc[item.id] = {
      decision: reviewItem?.decision ?? (score >= item.maxPoints ? 'ACCEPTED' : 'REWORK_REQUIRED'),
      score,
      comment: reviewItem?.comment ?? (typeof draftComment === 'string' && draftComment.trim() ? draftComment : null),
    };
    return acc;
  }, {});

  return {
    submissionId: submission.id,
    generalComment: normalizedReviewResult?.generalComment ?? reviewDraft?.generalComment ?? '',
    items,
  };
};

export const serializeHomeworkSubmissionV2 = (submission: any) => ({
  id: submission.id,
  assignmentId: submission.assignmentId,
  studentId: submission.studentId,
  reviewerTeacherId: submission.reviewerTeacherId ? Number(submission.reviewerTeacherId) : null,
  attemptNo: submission.attemptNo,
  status: normalizeHomeworkSubmissionStatus(submission.status),
  answerText: submission.answerText ?? null,
  attachments: normalizeHomeworkAttachments(submission.attachments),
  voice: normalizeHomeworkAttachments(submission.voice),
  testAnswers: parseObjectRecord(submission.testAnswers),
  teacherComment: submission.teacherComment ?? null,
  reviewDraft: normalizeHomeworkReviewDraftV2(submission.reviewDraft),
  reviewResult: normalizeHomeworkReviewResult(submission.reviewResult),
  submittedAt: submission.submittedAt ?? null,
  reviewedAt: submission.reviewedAt ?? null,
  createdAt: submission.createdAt,
  updatedAt: submission.updatedAt,
  score: {
    autoScore: clampHomeworkScore(submission.autoScore),
    manualScore: clampHomeworkScore(submission.manualScore),
    finalScore: clampHomeworkScore(submission.finalScore),
  },
});

export const resolveTimedAttemptState = (assignmentContentSnapshot: unknown, startedAt: unknown, now = new Date()) => {
  const blocks = normalizeHomeworkBlocks(assignmentContentSnapshot) as unknown as HomeworkBlock[];
  const timerConfig = resolveHomeworkAttemptTimerConfig(blocks);
  const startedAtDate = toValidDate(startedAt);
  if (!timerConfig.enabled || timerConfig.durationMs === null || !startedAtDate) {
    return {
      enabled: false,
      startedAt: startedAtDate,
      expiresAt: null as Date | null,
      isExpired: false,
    };
  }

  const expiresAt = new Date(startedAtDate.getTime() + timerConfig.durationMs);
  return {
    enabled: true,
    startedAt: startedAtDate,
    expiresAt,
    isExpired: expiresAt.getTime() <= now.getTime(),
  };
};

export const resolveHomeworkAutoScoreForSubmission = (
  assignmentContentSnapshot: unknown,
  testAnswersRaw: unknown,
): number | null => {
  const blocks = normalizeHomeworkBlocks(assignmentContentSnapshot) as unknown as HomeworkBlock[];
  const quizCapabilities = resolveHomeworkQuizCapabilities(blocks);
  if (!quizCapabilities.autoCheckActive) return null;
  return calculateHomeworkAutoScore(blocks as unknown as Record<string, unknown>[], testAnswersRaw);
};

export const resolveHomeworkSubmittedAttemptState = ({
  assignmentContentSnapshot,
  attemptNo,
  autoScore,
  submittedAt,
}: {
  assignmentContentSnapshot: unknown;
  attemptNo: number;
  autoScore: number | null;
  submittedAt: Date;
}) => {
  const blocks = normalizeHomeworkBlocks(assignmentContentSnapshot) as unknown as HomeworkBlock[];
  const quizSettings = readHomeworkTemplateQuizSettingsFromBlocks(blocks);
  const quizCapabilities = resolveHomeworkQuizCapabilities(blocks);

  if (!quizCapabilities.autoCheckActive || autoScore === null) {
    return {
      submissionStatus: 'SUBMITTED' as const,
      submissionReviewedAt: null,
      assignmentStatus: 'SUBMITTED' as const,
      assignmentReviewedAt: null,
      autoScore: null,
      finalScore: null,
      isFinalAutoResult: false,
    };
  }

  const latestAttemptPassed = autoScore >= quizSettings.passingScorePercent;
  const attemptsExhausted = quizSettings.attemptsLimit !== null && attemptNo >= quizSettings.attemptsLimit;
  const isFinalAutoResult = latestAttemptPassed || attemptsExhausted;

  return {
    submissionStatus: 'REVIEWED' as const,
    submissionReviewedAt: submittedAt,
    assignmentStatus: isFinalAutoResult ? ('REVIEWED' as const) : ('SENT' as const),
    assignmentReviewedAt: isFinalAutoResult ? submittedAt : null,
    autoScore,
    finalScore: autoScore,
    isFinalAutoResult,
  };
};

const isAssignmentAcceptingStudentWork = (status: unknown) => {
  const normalized = normalizeHomeworkAssignmentStatus(status);
  return normalized === 'SENT' || normalized === 'RETURNED' || normalized === 'OVERDUE';
};

export const finalizeTimedOutDraftSubmission = async (
  assignment: any,
  draftSubmission: any,
  now = new Date(),
): Promise<{ assignment: any; submission: any } | null> => {
  if (!assignment || !draftSubmission) return null;
  if (normalizeHomeworkSubmissionStatus(draftSubmission.status) !== 'DRAFT') return null;
  if (!isAssignmentAcceptingStudentWork(assignment.status)) return null;

  const timerState = resolveTimedAttemptState(assignment.contentSnapshot, draftSubmission.createdAt, now);
  if (!timerState.enabled || !timerState.isExpired) return null;

  const submittedAt = timerState.expiresAt ?? now;
  const autoScore = resolveHomeworkAutoScoreForSubmission(assignment.contentSnapshot, draftSubmission.testAnswers);
  const attemptState = resolveHomeworkSubmittedAttemptState({
    assignmentContentSnapshot: assignment.contentSnapshot,
    attemptNo: Number(draftSubmission.attemptNo ?? 1),
    autoScore,
    submittedAt,
  });
  const [updatedSubmission, updatedAssignment] = await Promise.all([
    (prisma as any).homeworkSubmission.update({
      where: { id: draftSubmission.id },
      data: {
        status: attemptState.submissionStatus,
        submittedAt,
        reviewedAt: attemptState.submissionReviewedAt,
        autoScore: attemptState.autoScore,
        manualScore: null,
        finalScore: attemptState.finalScore,
      },
    }),
    (prisma as any).homeworkAssignment.update({
      where: { id: assignment.id },
      data: {
        status: attemptState.assignmentStatus,
        autoScore: attemptState.autoScore,
        manualScore: null,
        finalScore: attemptState.finalScore,
        reviewedAt: attemptState.assignmentReviewedAt,
        teacherComment: null,
      },
    }),
  ]);

  return {
    assignment: updatedAssignment,
    submission: updatedSubmission,
  };
};

export const assignmentWasExplicitlyReissued = (assignment: any, latestSubmission: any) => {
  if (!assignment || !latestSubmission) return false;
  if (normalizeHomeworkAssignmentStatus(assignment.status) !== 'SENT') return false;
  if (normalizeHomeworkSubmissionStatus(latestSubmission.status) !== 'REVIEWED') return false;
  const sentAt = toValidDate(assignment.sentAt);
  const reviewedAt = toValidDate(latestSubmission.reviewedAt);
  if (!sentAt || !reviewedAt) return false;
  return sentAt.getTime() > reviewedAt.getTime();
};

const normalizeAnswerString = (value: unknown, caseSensitive = false) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return caseSensitive ? trimmed : trimmed.toLowerCase();
};

const normalizeQuestionPoints = (question: Record<string, unknown>) => {
  const points = Number(question.points);
  if (!Number.isFinite(points) || points <= 0) return 1;
  return points;
};

export const calculateHomeworkAutoScore = (blocks: Record<string, unknown>[], testAnswersRaw: unknown): number | null => {
  const answers = parseObjectRecord(testAnswersRaw) ?? {};
  const questions = blocks
    .filter((block) => block.type === 'TEST')
    .flatMap((block) => {
      const q = block.questions;
      return Array.isArray(q) ? q : [];
    })
    .filter((question): question is Record<string, unknown> => typeof question === 'object' && question !== null);

  const autoQuestions = questions.filter((question) =>
    isHomeworkQuestionAutoGradable(question as unknown as HomeworkTestQuestion),
  );
  if (autoQuestions.length === 0) return null;

  let earned = 0;
  let maxPoints = 0;

  for (const question of autoQuestions) {
    const questionId = typeof question.id === 'string' ? question.id : '';
    if (!questionId) continue;
    const points = normalizeQuestionPoints(question);
    maxPoints += points;
    const answer = answers[questionId];
    const type = String(question.type ?? '');
    const kind = typeof question.uiQuestionKind === 'string' ? question.uiQuestionKind : '';

    if (type === 'SINGLE_CHOICE') {
      const correctIds = Array.isArray(question.correctOptionIds)
        ? question.correctOptionIds.filter((item): item is string => typeof item === 'string')
        : [];
      const selected = Array.isArray(answer) ? answer[0] : answer;
      if (typeof selected === 'string' && correctIds.length === 1 && selected === correctIds[0]) {
        earned += points;
      }
      continue;
    }

    if (type === 'MULTIPLE_CHOICE') {
      const correctIds = Array.isArray(question.correctOptionIds)
        ? question.correctOptionIds.filter((item): item is string => typeof item === 'string')
        : [];
      const selectedIds = Array.isArray(answer)
        ? answer.filter((item): item is string => typeof item === 'string')
        : [];
      const correctSet = new Set(correctIds);
      const selectedSet = new Set(selectedIds);
      const correctTotal = correctSet.size;
      if (correctTotal === 0) continue;
      let correctSelected = 0;
      let incorrectSelected = 0;
      selectedSet.forEach((selectedId) => {
        if (correctSet.has(selectedId)) correctSelected += 1;
        else incorrectSelected += 1;
      });
      const ratio = Math.max(0, (correctSelected - incorrectSelected) / correctTotal);
      earned += ratio * points;
      continue;
    }

    if (type === 'MATCHING') {
      const pairs = Array.isArray(question.matchingPairs)
        ? question.matchingPairs.filter(
            (pair): pair is { left: string; right: string } =>
              typeof pair === 'object' &&
              pair !== null &&
              typeof (pair as { left?: unknown }).left === 'string' &&
              typeof (pair as { right?: unknown }).right === 'string',
          )
        : [];
      if (pairs.length === 0) continue;
      const answerPairsMap = new Map<string, string>();
      if (Array.isArray(answer)) {
        answer.forEach((entry) => {
          if (
            typeof entry === 'object' &&
            entry !== null &&
            typeof (entry as { left?: unknown }).left === 'string' &&
            typeof (entry as { right?: unknown }).right === 'string'
          ) {
            answerPairsMap.set((entry as { left: string }).left, (entry as { right: string }).right);
          }
        });
      } else if (answer && typeof answer === 'object') {
        Object.entries(answer as Record<string, unknown>).forEach(([left, right]) => {
          if (typeof right === 'string') {
            answerPairsMap.set(left, right);
          }
        });
      }
      const correctPairs = pairs.filter((pair) => answerPairsMap.get(pair.left) === pair.right).length;
      earned += (correctPairs / pairs.length) * points;
      continue;
    }

    if (type === 'SHORT_ANSWER' && kind === 'FILL_WORD') {
      const caseSensitive = Boolean(question.caseSensitive);
      const allowPartialCredit = question.allowPartialCredit !== false;
      const expectedAnswers = Array.isArray(question.acceptedAnswers)
        ? question.acceptedAnswers.filter((item): item is string => typeof item === 'string').map((item) => item.trim())
        : [];
      if (expectedAnswers.length === 0) continue;
      const submittedAnswers = Array.isArray(answer)
        ? answer.filter((item): item is string => typeof item === 'string')
        : [];
      const correctCount = expectedAnswers.reduce((sum, expectedAnswer, index) => {
        const submitted = submittedAnswers[index];
        if (!expectedAnswer) return sum;
        if (normalizeAnswerString(submitted, caseSensitive) === normalizeAnswerString(expectedAnswer, caseSensitive)) {
          return sum + 1;
        }
        return sum;
      }, 0);

      if (allowPartialCredit) {
        earned += (correctCount / expectedAnswers.length) * points;
      } else if (correctCount === expectedAnswers.length) {
        earned += points;
      }
      continue;
    }

    if (type === 'SHORT_ANSWER' && kind === 'ORDERING') {
      const expectedOrderIds = Array.isArray(question.orderingItems)
        ? question.orderingItems
            .filter(
              (item): item is { id: string; text?: string } =>
                typeof item === 'object' && item !== null && typeof (item as { id?: unknown }).id === 'string',
            )
            .map((item) => item.id)
        : [];
      if (expectedOrderIds.length < 2) continue;
      const submittedOrderIds = Array.isArray(answer)
        ? answer.filter((item): item is string => typeof item === 'string')
        : [];
      const correctPositions = expectedOrderIds.reduce((sum, expectedId, index) => {
        if (submittedOrderIds[index] === expectedId) return sum + 1;
        return sum;
      }, 0);
      const allowPartialCredit = Boolean(question.allowPartialCredit);
      if (allowPartialCredit) {
        earned += (correctPositions / expectedOrderIds.length) * points;
      } else if (correctPositions === expectedOrderIds.length) {
        earned += points;
      }
      continue;
    }

    if (type === 'SHORT_ANSWER' && kind === 'TABLE') {
      const table = question.table;
      if (!table || typeof table !== 'object' || Array.isArray(table)) continue;
      const tableRecord = table as Record<string, unknown>;
      const rows = Array.isArray(tableRecord.rows)
        ? tableRecord.rows.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
        : [];
      if (rows.length === 0) continue;

      const answerMap =
        answer && typeof answer === 'object' && !Array.isArray(answer) ? (answer as Record<string, unknown>) : {};

      let totalCells = 0;
      let correctCells = 0;
      const caseSensitive = Boolean(question.caseSensitive);

      rows.forEach((row) => {
        const rowId = typeof row.id === 'string' ? row.id : '';
        if (!rowId) return;
        const expectedAnswers = Array.isArray(row.answers)
          ? row.answers.filter((item): item is string => typeof item === 'string')
          : [];
        const submittedRow = answerMap[rowId];
        const submittedAnswers = Array.isArray(submittedRow)
          ? submittedRow.filter((item): item is string => typeof item === 'string')
          : [];

        expectedAnswers.forEach((expectedAnswer, columnIndex) => {
          const normalizedExpected = normalizeAnswerString(expectedAnswer, caseSensitive);
          if (!normalizedExpected) return;
          totalCells += 1;
          const normalizedSubmitted = normalizeAnswerString(submittedAnswers[columnIndex], caseSensitive);
          if (normalizedExpected === normalizedSubmitted) {
            correctCells += 1;
          }
        });
      });

      if (totalCells === 0) continue;
      const tablePartialCredit =
        tableRecord.partialCredit === undefined ? undefined : Boolean(tableRecord.partialCredit);
      const allowPartialCredit =
        question.allowPartialCredit === undefined
          ? (tablePartialCredit ?? true)
          : Boolean(question.allowPartialCredit);
      if (allowPartialCredit) {
        earned += (correctCells / totalCells) * points;
      } else if (correctCells === totalCells) {
        earned += points;
      }
      continue;
    }
  }

  if (maxPoints <= 0) return null;
  return clampNumber(Math.round((earned / maxPoints) * 100), 0, 100);
};

export const normalizeHomeworkGroupIdInput = (value: unknown): number | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) throw new Error('Некорректный groupId');
  return numeric;
};

export const resolveHomeworkGroupForTeacherV2 = async (
  teacherId: bigint,
  groupId: number,
  options?: { allowArchived?: boolean },
) => {
  const allowArchived = Boolean(options?.allowArchived);
  const group = await (prisma as any).homeworkGroup.findFirst({
    where: {
      id: groupId,
      teacherId,
      ...(allowArchived ? {} : { isArchived: false }),
    },
  });
  if (!group) throw createHttpError('Группа не найдена', 404);
  return group;
};

export const resolveHomeworkFallbackDeadline = (now: Date, timeZone?: string | null) => {
  const dateKey = formatInTimeZone(addDays(now, 2), 'yyyy-MM-dd', { timeZone: resolveTimeZone(timeZone) });
  return toUtcDateFromTimeZone(dateKey, '20:00', timeZone);
};

export const resolveHomeworkAttemptLimit = (contentSnapshot: unknown) =>
  readHomeworkTemplateQuizSettingsFromBlocks(
    normalizeHomeworkBlocks(contentSnapshot) as unknown as HomeworkBlock[],
  ).attemptsLimit;

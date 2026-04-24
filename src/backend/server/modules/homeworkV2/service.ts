import { addDays, format } from 'date-fns';
import type { HomeworkBlock, HomeworkSendMode } from '../../../../entities/types';
import type { User } from '@prisma/client';
import {
  canCancelHomeworkAssignmentIssueByStatus,
  hasRealHomeworkSubmissionStatus,
  isHomeworkAssignmentVisibleToStudent,
} from '../../../../entities/homework-assignment/model/lib/assignmentIssuance';
import {
  assignmentBelongsToBucket,
  assignmentBelongsToTab,
  canReissueHomeworkAssignment,
  normalizeHomeworkAssignmentStatus,
  normalizeHomeworkSubmissionStatus,
  resolveHomeworkAssignmentWorkflow,
} from '../../../../entities/homework-assignment/model/lib/workflow';
import {
  formatInTimeZone,
  resolveTimeZone,
  toUtcDateFromTimeZone,
  toUtcEndOfDay,
  toZonedDate,
} from '../../../../shared/lib/timezoneDates';
import prisma from '../../../prismaClient';
import { RequestValidationError } from '../../lib/requestValidationError';
import { clampNumber, isValidTimeString } from '../../lib/runtimeLimits';
import {
  attachAssignmentDisplayMeta,
  attachLatestSubmissionMetaToAssignments,
  assignmentWasExplicitlyReissued,
  buildHomeworkReviewResultV2,
  clampHomeworkScore,
  createHttpError,
  DEFAULT_HOMEWORK_GROUP_BG_COLOR,
  DEFAULT_HOMEWORK_GROUP_ICON_KEY,
  finalizeTimedOutDraftSubmission,
  matchesAssignmentSearchQuery,
  normalizeHomeworkAssignmentBucketV2,
  normalizeHomeworkAssignmentProblemFiltersV2,
  normalizeHomeworkAssignmentsSortV2,
  normalizeHomeworkAssignmentsTabV2,
  normalizeHomeworkAttachments,
  normalizeHomeworkBlocks,
  normalizeHomeworkGroupBgColor,
  normalizeHomeworkGroupDescription,
  normalizeHomeworkGroupIconKey,
  normalizeHomeworkGroupIdInput,
  normalizeHomeworkGroupSortOrder,
  normalizeHomeworkGroupTitle,
  normalizeHomeworkReviewDraftV2,
  normalizeHomeworkTemplateTags,
  parseObjectRecord,
  resolveHomeworkAutoScoreForSubmission,
  resolveHomeworkAttemptLimit,
  resolveHomeworkGroupForTeacherV2,
  resolveHomeworkSubmittedAttemptState,
  serializeHomeworkAssignmentV2,
  serializeHomeworkGroupListItemV2,
  serializeHomeworkGroupV2,
  serializeHomeworkSubmissionV2,
  serializeHomeworkTemplateV2,
  sortHomeworkAssignmentsV2,
  toValidDate,
} from './shared';
import { buildHomeworkNotificationText, sendHomeworkNotificationToStudent } from './notifications';

type RequestRole = 'TEACHER' | 'STUDENT';

type EnsureTeacher = (user: User) => Promise<any>;
type EnsureStudentAccessLink = (
  user: User,
  requestedTeacherId?: number | null,
  requestedStudentId?: number | null,
) => Promise<{ links: any[]; active: any }>;
type EnsureTeacherStudentLinkV2 = (teacherId: bigint, studentId: number) => Promise<any>;
type SafeLogActivityEvent = (payload: any) => Promise<void>;
type FilterSuppressedLessons = (tx: any, lessons: any[]) => Promise<any[]>;
type ValidateHomeworkTemplatePayload = (payload: { title: string; blocks: HomeworkBlock[] }) => {
  issues: any[];
  errorIssues: any[];
};

type CreateHomeworkV2ServiceDeps = {
  defaultPageSize: number;
  maxPageSize: number;
  ensureTeacher: EnsureTeacher;
  ensureStudentAccessLink: EnsureStudentAccessLink;
  ensureTeacherStudentLinkV2: EnsureTeacherStudentLinkV2;
  resolveHomeworkDefaultDeadline: (
    teacherId: bigint,
    studentId: number,
    lessonId?: number | null,
  ) => Promise<{ deadlineAt: Date; warning: string | null }>;
  safeLogActivityEvent: SafeLogActivityEvent;
  filterSuppressedLessons: FilterSuppressedLessons;
  validateHomeworkTemplatePayload: ValidateHomeworkTemplatePayload;
};

export const createHomeworkV2Service = ({
  defaultPageSize,
  maxPageSize,
  ensureTeacher,
  ensureStudentAccessLink,
  ensureTeacherStudentLinkV2,
  resolveHomeworkDefaultDeadline,
  safeLogActivityEvent,
  validateHomeworkTemplatePayload,
}: CreateHomeworkV2ServiceDeps) => {
  const normalizeAssignmentSendModeInput = (value: unknown): HomeworkSendMode => {
    if (value === 'AUTO_AFTER_LESSON_DONE' || value === 'SCHEDULED') return value;
    return 'MANUAL';
  };

  const resolveScheduledForInput = (value: unknown) => {
    if (value === null || value === undefined || value === '') return null;
    return toValidDate(value);
  };

  const ensureScheduledForIsFuture = (value: Date | null) => {
    if (!value) {
      throw new Error('Укажите дату и время запланированной отправки');
    }
    if (value.getTime() <= Date.now()) {
      throw new Error('Запланированная отправка должна быть в будущем');
    }
    return value;
  };

  const sendManualHomeworkReminderForAssignmentV2 = async (teacher: any, assignment: any) => {
    const result = await sendHomeworkNotificationToStudent({
      teacherId: teacher.chatId,
      studentId: assignment.studentId,
      type: 'HOMEWORK_REMINDER_MANUAL',
      dedupeKey: `HOMEWORK_REMINDER_MANUAL:${assignment.id}:${Date.now()}`,
      text: buildHomeworkNotificationText('MANUAL_REMINDER', assignment, teacher.timezone),
      assignmentId: assignment.id,
    });

    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId: assignment.studentId,
      category: 'HOMEWORK',
      action: 'REMIND',
      status: result.status === 'sent' ? 'SUCCESS' : 'FAILED',
      source: 'USER',
      title: 'Отправлено напоминание по домашке',
      details: `Assignment #${assignment.id}`,
      payload: { assignmentId: assignment.id, status: result.status },
    });

    return result;
  };

  const listHomeworkGroupsV2 = async (user: User, params: { includeArchived?: boolean }) => {
    const teacher = await ensureTeacher(user);
    const groups = await (prisma as any).homeworkGroup.findMany({
      where: {
        teacherId: teacher.chatId,
        ...(params.includeArchived ? {} : { isArchived: false }),
      },
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }, { id: 'desc' }],
    });

    const groupIds = groups
      .map((group: any) => Number(group.id))
      .filter((id: number) => Number.isFinite(id) && id > 0);
    const countsRows = groupIds.length
      ? await (prisma as any).homeworkAssignment.groupBy({
          by: ['groupId'],
          where: {
            teacherId: teacher.chatId,
            groupId: { in: groupIds },
          },
          _count: { _all: true },
        })
      : [];
    const countsByGroupId = new Map<number, number>(
      countsRows
        .map((row: any) => [Number(row.groupId), Number(row._count?._all ?? 0)] as const)
        .filter(([groupId]) => Number.isFinite(groupId) && groupId > 0),
    );
    const ungroupedCount = await (prisma as any).homeworkAssignment.count({
      where: { teacherId: teacher.chatId, groupId: null },
    });

    const systemUngrouped = serializeHomeworkGroupListItemV2(
      {
        teacherId: teacher.chatId,
        title: 'Без группы',
        description: 'Задания без категории',
        iconKey: DEFAULT_HOMEWORK_GROUP_ICON_KEY,
        bgColor: DEFAULT_HOMEWORK_GROUP_BG_COLOR,
        sortOrder: -1,
      },
      ungroupedCount,
      { isSystem: true, isUngrouped: true },
    );

    return {
      items: [
        systemUngrouped,
        ...groups.map((group: any) =>
          serializeHomeworkGroupListItemV2(group, countsByGroupId.get(Number(group.id)) ?? 0),
        ),
      ],
    };
  };

  const createHomeworkGroupV2 = async (user: User, body: Record<string, unknown>) => {
    const teacher = await ensureTeacher(user);
    const title = normalizeHomeworkGroupTitle(body.title);
    if (!title) throw new Error('Название группы обязательно');
    const description = normalizeHomeworkGroupDescription(body.description);
    const iconKey = normalizeHomeworkGroupIconKey(body.iconKey);
    const bgColor = normalizeHomeworkGroupBgColor(body.bgColor);

    const maxSortResult = await (prisma as any).homeworkGroup.aggregate({
      where: { teacherId: teacher.chatId },
      _max: { sortOrder: true },
    });
    const fallbackSort = Number(maxSortResult?._max?.sortOrder ?? 0) + 100;
    const sortOrder = normalizeHomeworkGroupSortOrder(body.sortOrder, fallbackSort);

    const group = await (prisma as any).homeworkGroup.create({
      data: {
        teacherId: teacher.chatId,
        title,
        description,
        iconKey,
        bgColor,
        sortOrder,
        isArchived: false,
      },
    });
    return { group: serializeHomeworkGroupV2(group) };
  };

  const updateHomeworkGroupV2 = async (user: User, groupId: number, body: Record<string, unknown>) => {
    const teacher = await ensureTeacher(user);
    await resolveHomeworkGroupForTeacherV2(teacher.chatId, groupId, { allowArchived: true });

    const data: Record<string, unknown> = {};
    if ('title' in body) {
      const title = normalizeHomeworkGroupTitle(body.title);
      if (!title) throw new Error('Название группы обязательно');
      data.title = title;
    }
    if ('description' in body) data.description = normalizeHomeworkGroupDescription(body.description);
    if ('iconKey' in body) data.iconKey = normalizeHomeworkGroupIconKey(body.iconKey);
    if ('bgColor' in body) data.bgColor = normalizeHomeworkGroupBgColor(body.bgColor);
    if ('sortOrder' in body) data.sortOrder = normalizeHomeworkGroupSortOrder(body.sortOrder, 0);
    if ('isArchived' in body) data.isArchived = Boolean(body.isArchived);

    const updated = await (prisma as any).homeworkGroup.update({
      where: { id: groupId },
      data,
    });
    return { group: serializeHomeworkGroupV2(updated) };
  };

  const deleteHomeworkGroupV2 = async (user: User, groupId: number) => {
    const teacher = await ensureTeacher(user);
    await resolveHomeworkGroupForTeacherV2(teacher.chatId, groupId, { allowArchived: true });
    await (prisma as any).homeworkGroup.delete({
      where: { id: groupId },
    });
    return { deletedId: groupId };
  };

  const loadHomeworkTemplateAccessMeta = async (teacherId: bigint, templateIds: number[]) => {
    const validTemplateIds = Array.from(
      new Set(templateIds.filter((templateId) => Number.isFinite(templateId) && templateId > 0)),
    );

    const defaultMetaByTemplateId = new Map(
      validTemplateIds.map((templateId) => [
        templateId,
        {
          issuedAssignmentsCount: 0,
          canTeacherEdit: true,
          canTeacherDelete: true,
        },
      ]),
    );

    if (!validTemplateIds.length) return defaultMetaByTemplateId;

    const rawAssignments = await (prisma as any).homeworkAssignment.findMany({
      where: {
        teacherId,
        templateId: { in: validTemplateIds },
        status: { not: 'DRAFT' },
      },
      select: {
        id: true,
        templateId: true,
        studentId: true,
        status: true,
        deadlineAt: true,
        sendMode: true,
        lessonId: true,
        scheduledFor: true,
        reviewedAt: true,
      },
    });

    const assignments = await attachLatestSubmissionMetaToAssignments(rawAssignments);
    const now = new Date();
    const assignmentsByTemplateId = new Map<number, typeof assignments>();

    assignments.forEach((assignment) => {
      const templateId = Number(assignment.templateId);
      if (!Number.isFinite(templateId)) return;
      const existing = assignmentsByTemplateId.get(templateId);
      if (existing) {
        existing.push(assignment);
        return;
      }
      assignmentsByTemplateId.set(templateId, [assignment]);
    });

    validTemplateIds.forEach((templateId) => {
      const templateAssignments = assignmentsByTemplateId.get(templateId) ?? [];
      if (!templateAssignments.length) return;

      const issuedStudentIds = new Set<number>();
      templateAssignments.forEach((assignment) => {
        const workflow = resolveHomeworkAssignmentWorkflow(assignment, now);
        if (workflow.persistedStatus === 'DRAFT' || workflow.persistedStatus === 'SCHEDULED') {
          return;
        }

        const studentId = Number(assignment.studentId);
        if (!Number.isFinite(studentId) || studentId <= 0) return;
        issuedStudentIds.add(studentId);
      });

      const canTeacherDelete = templateAssignments.every(
        (assignment) => resolveHomeworkAssignmentWorkflow(assignment, now).status === 'REVIEWED',
      );

      defaultMetaByTemplateId.set(templateId, {
        issuedAssignmentsCount: issuedStudentIds.size,
        canTeacherEdit: false,
        canTeacherDelete,
      });
    });

    return defaultMetaByTemplateId;
  };

  const listHomeworkTemplatesV2 = async (
    user: User,
    params: { query?: string | null; includeArchived?: boolean },
  ) => {
    const teacher = await ensureTeacher(user);
    const query = params.query?.trim() ?? '';
    const where: Record<string, unknown> = {
      teacherId: teacher.chatId,
      ...(params.includeArchived ? {} : { isArchived: false }),
    };
    if (query) {
      where.OR = [{ title: { contains: query } }, { tags: { contains: query } }];
    }

    const templates = await (prisma as any).homeworkTemplate.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });

    const templateIds = templates
      .map((template: { id: number }) => template.id)
      .filter((id: number) => Number.isFinite(id));
    const templateAccessMetaById = await loadHomeworkTemplateAccessMeta(teacher.chatId, templateIds);

    return {
      items: templates.map((template: any) => {
        const accessMeta = templateAccessMetaById.get(template.id);
        return serializeHomeworkTemplateV2({
          ...template,
          ...accessMeta,
        });
      }),
    };
  };

  const createHomeworkTemplateV2 = async (user: User, body: Record<string, unknown>) => {
    const teacher = await ensureTeacher(user);
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const blocks = normalizeHomeworkBlocks(body.blocks) as unknown as HomeworkBlock[];
    const validationResult = validateHomeworkTemplatePayload({
      title,
      blocks,
    });
    if (validationResult.errorIssues.length > 0) {
      throw new RequestValidationError('Проверьте обязательные поля домашнего задания.', validationResult.issues);
    }

    if (!title) throw new Error('Название домашнего задания обязательно');
    const template = await (prisma as any).homeworkTemplate.create({
      data: {
        teacherId: teacher.chatId,
        createdByTeacherId: teacher.chatId,
        title,
        tags: JSON.stringify(normalizeHomeworkTemplateTags(body.tags)),
        subject: typeof body.subject === 'string' ? body.subject.trim() || null : null,
        level: typeof body.level === 'string' ? body.level.trim() || null : null,
        blocks: JSON.stringify(blocks),
        isArchived: false,
      },
    });
    return {
      template: serializeHomeworkTemplateV2({
        ...template,
        issuedAssignmentsCount: 0,
        canTeacherEdit: true,
        canTeacherDelete: true,
      }),
    };
  };

  const updateHomeworkTemplateV2 = async (user: User, templateId: number, body: Record<string, unknown>) => {
    const teacher = await ensureTeacher(user);
    const template = await (prisma as any).homeworkTemplate.findUnique({ where: { id: templateId } });
    if (!template || template.teacherId !== teacher.chatId) throw new Error('Домашнее задание не найдено');

    const issuedAssignmentsCount = await (prisma as any).homeworkAssignment.count({
      where: {
        teacherId: teacher.chatId,
        templateId,
        status: { not: 'DRAFT' },
      },
    });

    const hasTitleUpdate = typeof body.title === 'string';
    const hasBlocksUpdate = 'blocks' in body;
    const nextTitle = typeof body.title === 'string' ? body.title.trim() : template.title;
    const nextBlocks = hasBlocksUpdate
      ? (normalizeHomeworkBlocks(body.blocks) as unknown as HomeworkBlock[])
      : (normalizeHomeworkBlocks(template.blocks) as unknown as HomeworkBlock[]);
    const nextTags = 'tags' in body ? normalizeHomeworkTemplateTags(body.tags) : normalizeHomeworkTemplateTags(template.tags);
    const normalizedCurrentTags = normalizeHomeworkTemplateTags(template.tags);
    const currentTagsWithoutFavorite = normalizedCurrentTags.filter((tag) => tag.trim().toLowerCase() !== '__favorite');
    const nextTagsWithoutFavorite = nextTags.filter((tag) => tag.trim().toLowerCase() !== '__favorite');
    const onlyFavoriteTagChanged =
      currentTagsWithoutFavorite.length === nextTagsWithoutFavorite.length &&
      currentTagsWithoutFavorite.every((tag, index) => tag === nextTagsWithoutFavorite[index]);
    const isContentMutation =
      hasTitleUpdate ||
      hasBlocksUpdate ||
      Object.prototype.hasOwnProperty.call(body, 'subject') ||
      Object.prototype.hasOwnProperty.call(body, 'level') ||
      ('tags' in body && !onlyFavoriteTagChanged);

    if (issuedAssignmentsCount > 0 && isContentMutation) {
      throw createHttpError(
        'Эту домашку уже выдавали ученикам. Исходную версию больше нельзя менять: создайте новую на основе текущей.',
        409,
      );
    }

    if (hasTitleUpdate || hasBlocksUpdate) {
      const validationResult = validateHomeworkTemplatePayload({
        title: nextTitle,
        blocks: nextBlocks,
      });
      if (validationResult.errorIssues.length > 0) {
        throw new RequestValidationError('Проверьте обязательные поля домашнего задания.', validationResult.issues);
      }
    }

    const data: Record<string, unknown> = {};
    if (hasTitleUpdate) {
      if (!nextTitle) throw new Error('Название домашнего задания обязательно');
      data.title = nextTitle;
    }
    if ('tags' in body) data.tags = JSON.stringify(nextTags);
    if ('subject' in body) data.subject = typeof body.subject === 'string' ? body.subject.trim() || null : null;
    if ('level' in body) data.level = typeof body.level === 'string' ? body.level.trim() || null : null;
    if (hasBlocksUpdate) data.blocks = JSON.stringify(nextBlocks);
    if (typeof body.isArchived === 'boolean') data.isArchived = body.isArchived;

    const updated = await (prisma as any).homeworkTemplate.update({
      where: { id: templateId },
      data,
    });
    const templateAccessMetaById = await loadHomeworkTemplateAccessMeta(teacher.chatId, [templateId]);
    return {
      template: serializeHomeworkTemplateV2({
        ...updated,
        ...templateAccessMetaById.get(templateId),
      }),
    };
  };

  const deleteHomeworkTemplateV2 = async (user: User, templateId: number) => {
    const teacher = await ensureTeacher(user);
    const template = await (prisma as any).homeworkTemplate.findUnique({ where: { id: templateId } });
    if (!template || template.teacherId !== teacher.chatId) throw new Error('Домашнее задание не найдено');

    const templateAccessMetaById = await loadHomeworkTemplateAccessMeta(teacher.chatId, [templateId]);
    const accessMeta = templateAccessMetaById.get(templateId);

    if (!accessMeta?.canTeacherDelete) {
      throw createHttpError(
        'Удалить домашнее задание можно только пока оно никому не выдано или когда все выданные версии уже проверены.',
        409,
      );
    }

    await (prisma as any).homeworkTemplate.delete({
      where: { id: templateId },
    });

    return { deletedId: templateId };
  };

  const listHomeworkAssignmentsV2 = async (
    user: User,
    params: {
      studentId?: number | null;
      lessonId?: number | null;
      templateId?: number | null;
      groupId?: number | null;
      ungrouped?: boolean | null;
      status?: string | null;
      bucket?: string | null;
      tab?: string | null;
      q?: string | null;
      sort?: string | null;
      problemFilters?: string | null;
      limit?: number;
      offset?: number;
    },
  ) => {
    const teacher = await ensureTeacher(user);
    const limit = clampNumber(Number(params.limit ?? defaultPageSize), 1, maxPageSize);
    const offset = clampNumber(Number(params.offset ?? 0), 0, 100_000);
    const now = new Date();
    const where: Record<string, any> = { teacherId: teacher.chatId };
    if (params.studentId !== null && params.studentId !== undefined && Number.isFinite(Number(params.studentId))) {
      where.studentId = Number(params.studentId);
    }
    if (params.lessonId !== null && params.lessonId !== undefined && Number.isFinite(Number(params.lessonId))) {
      where.lessonId = Number(params.lessonId);
    }
    if (params.templateId !== null && params.templateId !== undefined && Number.isFinite(Number(params.templateId))) {
      where.templateId = Number(params.templateId);
    }
    const includeUngroupedOnly = params.ungrouped === true;
    if (includeUngroupedOnly) {
      where.groupId = null;
    } else if (params.groupId !== null && params.groupId !== undefined && Number.isFinite(Number(params.groupId))) {
      const resolvedGroupId = Number(params.groupId);
      await resolveHomeworkGroupForTeacherV2(teacher.chatId, resolvedGroupId, { allowArchived: true });
      where.groupId = resolvedGroupId;
    }
    const tab = normalizeHomeworkAssignmentsTabV2(params.tab);
    const bucket = normalizeHomeworkAssignmentBucketV2(params.bucket);
    const sort = normalizeHomeworkAssignmentsSortV2(params.sort);
    const problemFilters = normalizeHomeworkAssignmentProblemFiltersV2(params.problemFilters);
    const query = typeof params.q === 'string' ? params.q.trim() : '';
    const requestedStatus =
      params.status && params.status !== 'all' ? normalizeHomeworkAssignmentStatus(params.status) : null;

    if (query) {
      const matchedLinks = await prisma.teacherStudent.findMany({
        where: {
          teacherId: teacher.chatId,
          isArchived: false,
          customName: { contains: query, mode: 'insensitive' },
        },
        select: { studentId: true },
      });
      const matchedStudentIds = matchedLinks.map((link) => link.studentId);
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { student: { username: { contains: query, mode: 'insensitive' } } },
            { template: { title: { contains: query, mode: 'insensitive' } } },
            { group: { title: { contains: query, mode: 'insensitive' } } },
            ...(matchedStudentIds.length ? [{ studentId: { in: matchedStudentIds } }] : []),
          ],
        },
      ];
    }

    const shouldSortInMemory = sort === 'urgency' || sort === 'student' || Boolean(query);
    const orderBy: Record<string, 'asc' | 'desc'>[] =
      sort === 'deadline'
        ? [{ deadlineAt: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }]
        : sort === 'updated'
          ? [{ updatedAt: 'desc' }, { id: 'desc' }]
          : [{ createdAt: 'desc' }, { id: 'desc' }];

    const total = shouldSortInMemory ? undefined : await (prisma as any).homeworkAssignment.count({ where });
    const rawItems = await (prisma as any).homeworkAssignment.findMany({
      where,
      include: {
        student: {
          select: { username: true },
        },
        lesson: {
          select: { startAt: true },
        },
        template: {
          select: { title: true },
        },
        group: {
          select: { id: true, title: true },
        },
      },
      orderBy,
      ...(shouldSortInMemory ? {} : { skip: offset, take: limit }),
    });
    const withSubmissionMeta = await attachLatestSubmissionMetaToAssignments(rawItems);
    const withDisplayMeta = await attachAssignmentDisplayMeta(teacher.chatId, withSubmissionMeta, now);
    const filteredByQuery = query
      ? withDisplayMeta.filter((item) => matchesAssignmentSearchQuery(item, query.toLowerCase()))
      : withDisplayMeta;
    const filtered = filteredByQuery.filter((item) => {
      const workflow = resolveHomeworkAssignmentWorkflow(item, now);
      if (requestedStatus && workflow.status !== requestedStatus) return false;
      if (!requestedStatus && tab !== 'all' && !assignmentBelongsToTab(item, tab, now)) return false;
      if (!requestedStatus && tab === 'all' && !assignmentBelongsToBucket(item, bucket, now)) return false;
      if (problemFilters.length > 0) {
        const matchesProblemFilter = problemFilters.some((filterName) => {
          if (filterName === 'overdue') return workflow.isOverdue;
          if (filterName === 'returned') return workflow.status === 'RETURNED';
          return workflow.hasConfigError;
        });
        if (!matchesProblemFilter) return false;
      }
      return true;
    });
    const sorted = sortHomeworkAssignmentsV2(filtered, sort);
    const pagedItems = shouldSortInMemory ? sorted.slice(offset, offset + limit) : sorted;
    const resolvedTotal = shouldSortInMemory ? sorted.length : total ?? sorted.length;
    return {
      items: pagedItems.map((item: any) => serializeHomeworkAssignmentV2(item, now)),
      total: resolvedTotal,
      nextOffset: offset + limit < resolvedTotal ? offset + limit : null,
    };
  };

  const getHomeworkAssignmentsSummaryV2 = async (
    user: User,
    params: { studentId?: number | null; lessonId?: number | null },
  ) => {
    const teacher = await ensureTeacher(user);
    const now = new Date();
    const resolvedTimeZone = resolveTimeZone(teacher.timezone);
    const baseWhere: Record<string, unknown> = { teacherId: teacher.chatId };
    if (params.studentId !== null && params.studentId !== undefined && Number.isFinite(Number(params.studentId))) {
      baseWhere.studentId = Number(params.studentId);
    }
    if (params.lessonId !== null && params.lessonId !== undefined && Number.isFinite(Number(params.lessonId))) {
      baseWhere.lessonId = Number(params.lessonId);
    }

    const todayZoned = toZonedDate(now, resolvedTimeZone);
    const todayKey = formatInTimeZone(now, 'yyyy-MM-dd', { timeZone: resolvedTimeZone });
    const todayStart = toUtcDateFromTimeZone(todayKey, '00:00', resolvedTimeZone);
    const todayEnd = toUtcEndOfDay(todayKey, resolvedTimeZone);
    const monthStartKey = formatInTimeZone(now, 'yyyy-MM-01', { timeZone: resolvedTimeZone });
    const monthStart = toUtcDateFromTimeZone(monthStartKey, '00:00', resolvedTimeZone);
    const nextMonthZoned = toZonedDate(monthStart, resolvedTimeZone);
    nextMonthZoned.setMonth(nextMonthZoned.getMonth() + 1);
    const nextMonthStart = toUtcDateFromTimeZone(format(nextMonthZoned, 'yyyy-MM-dd'), '00:00', resolvedTimeZone);
    const scoreWindowStartKey = format(addDays(todayZoned, -29), 'yyyy-MM-dd');
    const scoreWindowStart = toUtcDateFromTimeZone(scoreWindowStartKey, '00:00', resolvedTimeZone);
    const currentWeekWindowStartKey = format(addDays(todayZoned, -6), 'yyyy-MM-dd');
    const currentWeekWindowStart = toUtcDateFromTimeZone(currentWeekWindowStartKey, '00:00', resolvedTimeZone);
    const previousWeekWindowStartKey = format(addDays(todayZoned, -13), 'yyyy-MM-dd');
    const previousWeekWindowStart = toUtcDateFromTimeZone(previousWeekWindowStartKey, '00:00', resolvedTimeZone);
    const previousWeekWindowEndKey = format(addDays(todayZoned, -7), 'yyyy-MM-dd');
    const previousWeekWindowEnd = toUtcEndOfDay(previousWeekWindowEndKey, resolvedTimeZone);

    const assignments = await (prisma as any).homeworkAssignment.findMany({
      where: baseWhere,
      select: {
        id: true,
        status: true,
        sendMode: true,
        lessonId: true,
        scheduledFor: true,
        deadlineAt: true,
        reviewedAt: true,
        sentAt: true,
        autoScore: true,
        manualScore: true,
        finalScore: true,
      },
    });
    const assignmentsWithSubmissions = await attachLatestSubmissionMetaToAssignments(assignments);

    let draftCount = 0;
    let sentCount = 0;
    let reviewCount = 0;
    let reviewedCount = 0;
    let overdueCount = 0;
    let scheduledCount = 0;
    let inProgressCount = 0;
    let closedCount = 0;
    let configErrorCount = 0;
    let returnedCount = 0;
    let reviewedThisMonthCount = 0;
    let sentTodayCount = 0;
    let inboxCount = 0;
    let dueTodayCount = 0;
    let reviewedThisWeekCount = 0;
    let reviewedPreviousWeekCount = 0;

    const normalizedScores = assignmentsWithSubmissions
      .filter((assignment: any) => {
        const workflow = resolveHomeworkAssignmentWorkflow(assignment, now);
        const reviewedAt = toValidDate(assignment.reviewedAt);
        return workflow.status === 'REVIEWED' && Boolean(reviewedAt && reviewedAt >= scoreWindowStart && reviewedAt <= todayEnd);
      })
      .map((item: any) => {
        const raw = item.finalScore ?? item.manualScore ?? item.autoScore;
        if (!Number.isFinite(raw)) return null;
        const normalizedRaw = Number(raw);
        const normalized = normalizedRaw > 10 ? normalizedRaw / 10 : normalizedRaw;
        return Math.max(0, Math.min(10, normalized));
      })
      .filter((score): score is number => Number.isFinite(score));

    assignmentsWithSubmissions.forEach((assignment: any) => {
      const workflow = resolveHomeworkAssignmentWorkflow(assignment, now);
      const reviewedAt = toValidDate(assignment.reviewedAt);
      const sentAt = toValidDate(assignment.sentAt);
      const deadlineAt = toValidDate(assignment.deadlineAt);

      if (assignmentBelongsToBucket(assignment, 'draft', now)) draftCount += 1;
      if (assignmentBelongsToBucket(assignment, 'sent', now)) sentCount += 1;
      if (assignmentBelongsToBucket(assignment, 'review', now)) reviewCount += 1;
      if (assignmentBelongsToBucket(assignment, 'reviewed', now)) {
        reviewedCount += 1;
        closedCount += 1;
      }
      if (assignmentBelongsToBucket(assignment, 'overdue', now)) overdueCount += 1;
      if (workflow.persistedStatus === 'SCHEDULED') scheduledCount += 1;
      if (workflow.needsStudentAction && !workflow.isOverdue) inProgressCount += 1;
      if (workflow.hasConfigError) configErrorCount += 1;
      if (workflow.status === 'RETURNED') returnedCount += 1;
      if (workflow.needsTeacherAction || workflow.status === 'RETURNED' || workflow.isOverdue || workflow.hasConfigError) {
        inboxCount += 1;
      }
      if (workflow.needsStudentAction && deadlineAt && deadlineAt >= todayStart && deadlineAt <= todayEnd) {
        dueTodayCount += 1;
      }
      if (sentAt && sentAt >= todayStart && sentAt <= todayEnd) {
        sentTodayCount += 1;
      }
      if (workflow.status === 'REVIEWED' && reviewedAt && reviewedAt >= monthStart && reviewedAt < nextMonthStart) {
        reviewedThisMonthCount += 1;
      }
      if (workflow.status === 'REVIEWED' && reviewedAt && reviewedAt >= currentWeekWindowStart && reviewedAt <= now) {
        reviewedThisWeekCount += 1;
      }
      if (
        workflow.status === 'REVIEWED' &&
        reviewedAt &&
        reviewedAt >= previousWeekWindowStart &&
        reviewedAt <= previousWeekWindowEnd
      ) {
        reviewedPreviousWeekCount += 1;
      }
    });

    const averageScore30d =
      normalizedScores.length > 0
        ? Number((normalizedScores.reduce((sum, score) => sum + score, 0) / normalizedScores.length).toFixed(1))
        : null;
    const reviewedWeekDeltaPercent =
      reviewedPreviousWeekCount > 0
        ? Math.round(((reviewedThisWeekCount - reviewedPreviousWeekCount) / reviewedPreviousWeekCount) * 100)
        : reviewedThisWeekCount > 0
          ? 100
          : 0;

    return {
      totalCount: assignmentsWithSubmissions.length,
      draftCount,
      sentCount,
      reviewCount,
      reviewedCount,
      overdueCount,
      inboxCount,
      scheduledCount,
      inProgressCount,
      closedCount,
      configErrorCount,
      returnedCount,
      reviewedThisMonthCount,
      sentTodayCount,
      dueTodayCount,
      reviewedWeekDeltaPercent,
      averageScore30d,
      permissions: {
        canStartReviewQueue: reviewCount > 0,
      },
    };
  };

  const createHomeworkAssignmentV2 = async (user: User, body: Record<string, unknown>) => {
    const teacher = await ensureTeacher(user);
    const studentId = Number(body.studentId);
    if (!Number.isFinite(studentId)) throw new Error('studentId обязателен');
    await ensureTeacherStudentLinkV2(teacher.chatId, studentId);

    const templateId = Number(body.templateId);
    const hasTemplateId = Number.isFinite(templateId);
    const template = hasTemplateId
      ? await (prisma as any).homeworkTemplate.findFirst({
          where: { id: templateId, teacherId: teacher.chatId },
        })
      : null;
    if (hasTemplateId && !template) throw new Error('Домашнее задание не найдено');

    const lessonIdRaw = Number(body.lessonId);
    const lessonId = Number.isFinite(lessonIdRaw) ? lessonIdRaw : null;
    if (lessonId !== null) {
      const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
      if (!lesson || lesson.teacherId !== teacher.chatId) throw new Error('Урок не найден');
    }
    const normalizedGroupId = normalizeHomeworkGroupIdInput(body.groupId);
    let groupId: number | null = null;
    if (typeof normalizedGroupId === 'number') {
      const group = await resolveHomeworkGroupForTeacherV2(teacher.chatId, normalizedGroupId);
      groupId = group.id;
    }

    const resolvedTitle =
      (typeof body.title === 'string' && body.title.trim()) ||
      (template?.title ? String(template.title) : '') ||
      'Домашнее задание';
    const snapshot = normalizeHomeworkBlocks(body.contentSnapshot ?? template?.blocks ?? []);
    const sendMode = normalizeAssignmentSendModeInput(body.sendMode);
    const scheduledFor =
      sendMode === 'SCHEDULED' ? ensureScheduledForIsFuture(resolveScheduledForInput(body.scheduledFor)) : null;
    const resolvedStatus = sendMode === 'MANUAL' ? 'DRAFT' : 'SCHEDULED';
    const deadlineAt =
      toValidDate(body.deadlineAt) ??
      (await resolveHomeworkDefaultDeadline(teacher.chatId, studentId, lessonId)).deadlineAt;

    // TEA-24: Идемпотентность создания черновика из шаблона.
    // Если для (teacher, student, template) уже есть неотправленный DRAFT — переиспользуем его,
    // чтобы не плодить дубликатов (частый сценарий: открыли «Выдать из шаблона» дважды).
    if (template?.id && resolvedStatus === 'DRAFT') {
      const existingDraft = await (prisma as any).homeworkAssignment.findFirst({
        where: {
          teacherId: teacher.chatId,
          studentId,
          templateId: template.id,
          status: 'DRAFT',
        },
        orderBy: { updatedAt: 'desc' },
      });
      if (existingDraft) {
        const updated = await (prisma as any).homeworkAssignment.update({
          where: { id: existingDraft.id },
          data: {
            lessonId,
            groupId,
            title: resolvedTitle,
            sendMode,
            deadlineAt,
            contentSnapshot: JSON.stringify(snapshot),
          },
        });
        return { assignment: serializeHomeworkAssignmentV2(updated) };
      }
    }

    const assignment = await (prisma as any).homeworkAssignment.create({
      data: {
        teacherId: teacher.chatId,
        studentId,
        lessonId,
        templateId: template?.id ?? null,
        groupId,
        legacyHomeworkId: Number.isFinite(Number(body.legacyHomeworkId)) ? Number(body.legacyHomeworkId) : null,
        title: resolvedTitle,
        status: resolvedStatus,
        sendMode,
        scheduledFor,
        deadlineAt,
        sentAt: null,
        contentSnapshot: JSON.stringify(snapshot),
      },
    });

    return { assignment: serializeHomeworkAssignmentV2(assignment) };
  };

  const getHomeworkAssignmentV2 = async (user: User, assignmentId: number) => {
    const teacher = await ensureTeacher(user);
    const assignment = await (prisma as any).homeworkAssignment.findFirst({
      where: {
        id: assignmentId,
        teacherId: teacher.chatId,
      },
      include: {
        student: {
          select: { username: true },
        },
        lesson: {
          select: { startAt: true },
        },
        template: {
          select: { title: true },
        },
        group: {
          select: { id: true, title: true },
        },
      },
    });
    if (!assignment) throw createHttpError('Домашка не найдена', 404);

    const [withSubmissionMeta] = await attachLatestSubmissionMetaToAssignments([assignment]);
    const [withDisplayMeta] = await attachAssignmentDisplayMeta(teacher.chatId, [withSubmissionMeta], new Date());
    return {
      assignment: serializeHomeworkAssignmentV2(withDisplayMeta),
    };
  };

  const updateHomeworkAssignmentV2 = async (user: User, assignmentId: number, body: Record<string, unknown>) => {
    const teacher = await ensureTeacher(user);
    const existing = await (prisma as any).homeworkAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!existing) throw createHttpError('Домашка не найдена', 404);
    if (existing.teacherId !== teacher.chatId) throw createHttpError('forbidden', 403);

    const forbiddenFields = ['status', 'sentAt', 'teacherComment', 'autoScore', 'manualScore', 'finalScore'];
    const forbiddenField = forbiddenFields.find((fieldName) => Object.prototype.hasOwnProperty.call(body, fieldName));
    if (forbiddenField) {
      throw createHttpError('Lifecycle-поля домашки нельзя менять через обычное редактирование.', 409);
    }

    const existingWorkflow = resolveHomeworkAssignmentWorkflow(existing);
    if (!existingWorkflow.canTeacherEditAssignment) {
      throw createHttpError(
        'После выдачи домашку нельзя редактировать. Сначала отмените выдачу, чтобы вернуть её в черновик.',
        409,
      );
    }

    const data: Record<string, unknown> = {};
    if (typeof body.title === 'string') {
      const title = body.title.trim();
      if (!title) throw new Error('Название обязательно');
      data.title = title;
    }
    if ('sendMode' in body) data.sendMode = normalizeAssignmentSendModeInput(body.sendMode);
    if ('lessonId' in body) {
      const lessonIdRaw = Number(body.lessonId);
      if (body.lessonId === null || body.lessonId === undefined || body.lessonId === '') {
        data.lessonId = null;
      } else if (Number.isFinite(lessonIdRaw)) {
        const lesson = await prisma.lesson.findUnique({ where: { id: lessonIdRaw } });
        if (!lesson || lesson.teacherId !== teacher.chatId) throw new Error('Урок не найден');
        data.lessonId = lessonIdRaw;
      } else {
        throw new Error('Некорректный lessonId');
      }
    }
    if ('templateId' in body) {
      const templateIdRaw = Number(body.templateId);
      if (body.templateId === null || body.templateId === undefined || body.templateId === '') {
        data.templateId = null;
      } else if (Number.isFinite(templateIdRaw)) {
        const template = await (prisma as any).homeworkTemplate.findFirst({
          where: { id: templateIdRaw, teacherId: teacher.chatId },
        });
        if (!template) throw new Error('Домашнее задание не найдено');
        data.templateId = templateIdRaw;
      } else {
        throw new Error('Некорректный templateId');
      }
    }
    if ('groupId' in body) {
      const resolvedGroupId = normalizeHomeworkGroupIdInput(body.groupId);
      if (resolvedGroupId === null) {
        data.groupId = null;
      } else if (typeof resolvedGroupId === 'number') {
        const group = await resolveHomeworkGroupForTeacherV2(teacher.chatId, resolvedGroupId);
        data.groupId = group.id;
      } else {
        data.groupId = null;
      }
    }
    if ('scheduledFor' in body) {
      data.scheduledFor = resolveScheduledForInput(body.scheduledFor);
    }
    if ('deadlineAt' in body) data.deadlineAt = toValidDate(body.deadlineAt);
    if ('contentSnapshot' in body) {
      data.contentSnapshot = JSON.stringify(normalizeHomeworkBlocks(body.contentSnapshot));
    }

    const nextSendMode = normalizeAssignmentSendModeInput(data.sendMode ?? existing.sendMode);
    const nextScheduledFor = toValidDate(
      Object.prototype.hasOwnProperty.call(data, 'scheduledFor') ? data.scheduledFor : existing.scheduledFor,
    );
    if (nextSendMode === 'SCHEDULED') {
      data.scheduledFor = ensureScheduledForIsFuture(nextScheduledFor);
    } else {
      data.scheduledFor = null;
    }
    data.status = nextSendMode === 'MANUAL' ? 'DRAFT' : 'SCHEDULED';

    const updated = await (prisma as any).homeworkAssignment.update({
      where: { id: assignmentId },
      data,
    });

    return { assignment: serializeHomeworkAssignmentV2(updated) };
  };

  const sendHomeworkAssignmentV2 = async (user: User, assignmentId: number) => {
    const teacher = await ensureTeacher(user);
    const assignment = await (prisma as any).homeworkAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) throw createHttpError('Домашка не найдена', 404);
    if (assignment.teacherId !== teacher.chatId) throw createHttpError('forbidden', 403);

    const workflow = resolveHomeworkAssignmentWorkflow(assignment);
    if (workflow.persistedStatus !== 'DRAFT' && workflow.persistedStatus !== 'SCHEDULED') {
      throw createHttpError('Отправить можно только черновик или запланированную домашку.', 409);
    }

    const updated = await (prisma as any).homeworkAssignment.update({
      where: { id: assignmentId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        reviewedAt: null,
        reminder24hSentAt: null,
        reminderMorningSentAt: null,
        reminder3hSentAt: null,
        overdueReminderCount: 0,
        lastOverdueReminderAt: null,
      },
    });

    if (teacher.homeworkNotifyOnAssign) {
      await sendHomeworkNotificationToStudent({
        teacherId: teacher.chatId,
        studentId: updated.studentId,
        type: 'HOMEWORK_ASSIGNED',
        dedupeKey: `HOMEWORK_ASSIGNED:${updated.id}:${updated.sentAt?.toISOString?.() ?? Date.now()}`,
        text: buildHomeworkNotificationText('ASSIGNED', updated, teacher.timezone),
        assignmentId: updated.id,
      });
    }

    return { assignment: serializeHomeworkAssignmentV2(updated) };
  };

  const remindHomeworkAssignmentV2 = async (user: User, assignmentId: number) => {
    const teacher = await ensureTeacher(user);
    const assignment = await (prisma as any).homeworkAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) throw createHttpError('Домашка не найдена', 404);
    if (assignment.teacherId !== teacher.chatId) throw createHttpError('forbidden', 403);

    const result = await sendManualHomeworkReminderForAssignmentV2(teacher, assignment);
    return {
      status: result.status,
      assignment: serializeHomeworkAssignmentV2(assignment),
    };
  };

  const cancelHomeworkAssignmentIssueV2 = async (user: User, assignmentId: number) => {
    const teacher = await ensureTeacher(user);
    const assignment = await (prisma as any).homeworkAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        student: {
          select: { username: true },
        },
        lesson: {
          select: { startAt: true },
        },
        template: {
          select: { title: true },
        },
        group: {
          select: { id: true, title: true },
        },
      },
    });
    if (!assignment) throw createHttpError('Домашка не найдена', 404);
    if (assignment.teacherId !== teacher.chatId) throw createHttpError('forbidden', 403);

    const assignmentStatus = normalizeHomeworkAssignmentStatus(assignment.status);
    if (!canCancelHomeworkAssignmentIssueByStatus(assignmentStatus)) {
      throw createHttpError('Отменить выдачу можно только у выданной или запланированной домашки.', 409);
    }

    const submissions = await (prisma as any).homeworkSubmission.findMany({
      where: { assignmentId },
      select: { id: true, status: true },
    });
    const hasRealSubmissions = submissions.some((submission: { status: unknown }) =>
      hasRealHomeworkSubmissionStatus(normalizeHomeworkSubmissionStatus(submission.status)),
    );
    if (hasRealSubmissions) {
      throw createHttpError('Нельзя отменить выдачу, когда ученик уже отправил ответ.', 409);
    }

    await (prisma as any).$transaction([
      (prisma as any).homeworkSubmission.deleteMany({
        where: { assignmentId, status: 'DRAFT' },
      }),
      (prisma as any).homeworkAssignment.update({
        where: { id: assignmentId },
        data: {
          status: 'DRAFT',
          sentAt: null,
          reminder24hSentAt: null,
          reminderMorningSentAt: null,
          reminder3hSentAt: null,
          overdueReminderCount: 0,
          lastOverdueReminderAt: null,
          updatedAt: new Date(),
        },
      }),
    ]);

    const refreshedAssignment = await (prisma as any).homeworkAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        student: {
          select: { username: true },
        },
        lesson: {
          select: { startAt: true },
        },
        template: {
          select: { title: true },
        },
        group: {
          select: { id: true, title: true },
        },
      },
    });
    if (!refreshedAssignment) throw createHttpError('Домашка не найдена', 404);

    await sendHomeworkNotificationToStudent({
      teacherId: teacher.chatId,
      studentId: refreshedAssignment.studentId,
      type: 'HOMEWORK_UNISSUED',
      dedupeKey: `HOMEWORK_UNISSUED:${refreshedAssignment.id}:${Date.now()}`,
      text: buildHomeworkNotificationText('UNISSUED', refreshedAssignment, teacher.timezone),
      assignmentId: refreshedAssignment.id,
    });

    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId: refreshedAssignment.studentId,
      category: 'HOMEWORK',
      action: 'UPDATE',
      status: 'SUCCESS',
      source: 'USER',
      title: 'Выдача домашки отменена',
      details: `Assignment #${refreshedAssignment.id}`,
      payload: { assignmentId: refreshedAssignment.id, previousStatus: assignmentStatus, nextStatus: 'DRAFT' },
    });

    const [assignmentWithSubmissionMeta] = await attachLatestSubmissionMetaToAssignments([refreshedAssignment]);
    const [assignmentWithDisplayMeta] = await attachAssignmentDisplayMeta(
      teacher.chatId,
      [assignmentWithSubmissionMeta],
      new Date(),
    );

    return {
      assignment: serializeHomeworkAssignmentV2(assignmentWithDisplayMeta),
    };
  };

  const reissueHomeworkAssignmentV2 = async (user: User, assignmentId: number) => {
    const teacher = await ensureTeacher(user);
    const assignment = await (prisma as any).homeworkAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) throw createHttpError('Домашка не найдена', 404);
    if (assignment.teacherId !== teacher.chatId) throw createHttpError('forbidden', 403);

    if (!canReissueHomeworkAssignment(assignment)) {
      throw createHttpError('Переоткрыть можно только уже проверенную домашку.', 409);
    }

    const updated = await (prisma as any).homeworkAssignment.update({
      where: { id: assignmentId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        teacherComment: null,
        reviewedAt: null,
        autoScore: null,
        manualScore: null,
        finalScore: null,
        reminder24hSentAt: null,
        reminderMorningSentAt: null,
        reminder3hSentAt: null,
        overdueReminderCount: 0,
        lastOverdueReminderAt: null,
      },
    });

    if (teacher.homeworkNotifyOnAssign) {
      await sendHomeworkNotificationToStudent({
        teacherId: teacher.chatId,
        studentId: updated.studentId,
        type: 'HOMEWORK_ASSIGNED',
        dedupeKey: `HOMEWORK_ASSIGNED:REISSUE:${updated.id}:${updated.sentAt?.toISOString?.() ?? Date.now()}`,
        text: buildHomeworkNotificationText('ASSIGNED', updated, teacher.timezone),
        assignmentId: updated.id,
      });
    }

    return { assignment: serializeHomeworkAssignmentV2(updated) };
  };

  const deleteHomeworkAssignmentV2 = async (user: User, assignmentId: number) => {
    const teacher = await ensureTeacher(user);
    const existing = await (prisma as any).homeworkAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!existing) throw createHttpError('Домашка не найдена', 404);
    if (existing.teacherId !== teacher.chatId) throw createHttpError('forbidden', 403);
    await (prisma as any).homeworkAssignment.delete({ where: { id: assignmentId } });

    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId: existing.studentId,
      category: 'HOMEWORK',
      action: 'DELETE',
      status: 'SUCCESS',
      source: 'USER',
      title: 'Домашка удалена',
      details: `Assignment #${assignmentId}`,
      payload: { assignmentId },
    });

    return { deletedId: assignmentId };
  };

  const bulkHomeworkAssignmentsV2 = async (user: User, body: Record<string, unknown>) => {
    const teacher = await ensureTeacher(user);
    const ids = Array.isArray(body.ids)
      ? Array.from(
          new Set(
            body.ids
              .map((value) => Number(value))
              .filter((value) => Number.isFinite(value) && value > 0),
          ),
        )
      : [];
    if (!ids.length) throw new Error('ids обязательны');

    const actionRaw = typeof body.action === 'string' ? body.action.toUpperCase() : '';
    const action =
      actionRaw === 'SEND_NOW' || actionRaw === 'REMIND' || actionRaw === 'CANCEL_ISSUE' || actionRaw === 'DELETE'
        ? actionRaw
        : null;
    if (!action) throw new Error('Некорректное действие');

    const assignments = await (prisma as any).homeworkAssignment.findMany({
      where: {
        id: { in: ids },
        teacherId: teacher.chatId,
      },
    });
    const assignmentById = new Map<number, any>(assignments.map((assignment: any) => [assignment.id, assignment]));
    const results: Array<{ id: number; ok: boolean; message?: string }> = [];
    let successCount = 0;

    for (const id of ids) {
      const assignment = assignmentById.get(id);
      if (!assignment) {
        results.push({ id, ok: false, message: 'Домашка не найдена' });
        continue;
      }

      try {
        if (action === 'SEND_NOW') {
          await sendHomeworkAssignmentV2(user, id);
        } else if (action === 'REMIND') {
          await sendManualHomeworkReminderForAssignmentV2(teacher, assignment);
        } else if (action === 'CANCEL_ISSUE') {
          await cancelHomeworkAssignmentIssueV2(user, id);
        } else if (action === 'DELETE') {
          await (prisma as any).homeworkAssignment.delete({ where: { id } });
        }

        successCount += 1;
        results.push({ id, ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown_error';
        results.push({ id, ok: false, message });
      }
    }

    return {
      action,
      total: ids.length,
      successCount,
      errorCount: ids.length - successCount,
      results,
    };
  };

  const listHomeworkSubmissionsV2 = async (user: User, assignmentId: number) => {
    const teacher = await ensureTeacher(user);
    const assignment = await (prisma as any).homeworkAssignment.findFirst({
      where: { id: assignmentId, teacherId: teacher.chatId },
    });
    if (!assignment) throw new Error('Домашка не найдена');
    const items = await (prisma as any).homeworkSubmission.findMany({
      where: { assignmentId },
      orderBy: [{ attemptNo: 'desc' }, { id: 'desc' }],
    });
    return { items: items.map(serializeHomeworkSubmissionV2) };
  };

  const openHomeworkReviewSessionV2 = async (user: User, assignmentId: number) => {
    const teacher = await ensureTeacher(user);

    const loadAssignment = async () =>
      (prisma as any).homeworkAssignment.findFirst({
        where: { id: assignmentId, teacherId: teacher.chatId },
        include: {
          student: {
            select: { username: true },
          },
          lesson: {
            select: { startAt: true },
          },
          template: {
            select: { title: true },
          },
        },
      });

    let assignment = await loadAssignment();
    if (!assignment) throw new Error('Домашка не найдена');

    if (normalizeHomeworkAssignmentStatus(assignment.status) === 'SUBMITTED') {
      await (prisma as any).homeworkAssignment.update({
        where: { id: assignmentId },
        data: {
          status: 'IN_REVIEW',
          updatedAt: new Date(),
        },
      });
      assignment = await loadAssignment();
      if (!assignment) throw new Error('Домашка не найдена');
    }

    const [assignmentWithSubmissionMeta] = await attachLatestSubmissionMetaToAssignments([assignment]);
    const [assignmentWithDisplayMeta] = await attachAssignmentDisplayMeta(
      teacher.chatId,
      [assignmentWithSubmissionMeta],
      new Date(),
    );

    const submissions = await (prisma as any).homeworkSubmission.findMany({
      where: { assignmentId },
      orderBy: [{ attemptNo: 'desc' }, { id: 'desc' }],
    });

    return {
      assignment: serializeHomeworkAssignmentV2(assignmentWithDisplayMeta),
      submissions: submissions.map(serializeHomeworkSubmissionV2),
    };
  };

  const saveHomeworkReviewDraftV2 = async (user: User, assignmentId: number, body: Record<string, unknown>) => {
    const teacher = await ensureTeacher(user);
    const assignment = await (prisma as any).homeworkAssignment.findFirst({
      where: { id: assignmentId, teacherId: teacher.chatId },
      include: {
        student: {
          select: { username: true },
        },
        lesson: {
          select: { startAt: true },
        },
        template: {
          select: { title: true },
        },
      },
    });
    if (!assignment) throw new Error('Домашка не найдена');

    const submissionId = Number(body.submissionId);
    const submission =
      Number.isFinite(submissionId) && submissionId > 0
        ? await (prisma as any).homeworkSubmission.findFirst({
            where: { id: submissionId, assignmentId },
            orderBy: [{ attemptNo: 'desc' }, { id: 'desc' }],
          })
        : await (prisma as any).homeworkSubmission.findFirst({
            where: { assignmentId },
            orderBy: [{ attemptNo: 'desc' }, { id: 'desc' }],
          });
    if (!submission) throw new Error('Попытка не найдена');

    const hasDraftField = Object.prototype.hasOwnProperty.call(body, 'draft');
    const rawDraft = hasDraftField ? body.draft : null;
    if (rawDraft !== null && rawDraft !== undefined && (typeof rawDraft !== 'object' || Array.isArray(rawDraft))) {
      throw new Error('Некорректный формат черновика проверки');
    }

    const normalizedDraft = rawDraft ? normalizeHomeworkReviewDraftV2(rawDraft) : null;
    if (rawDraft && !normalizedDraft) {
      throw new Error('Некорректный формат черновика проверки');
    }
    const draftToStore = normalizedDraft
      ? {
          ...normalizedDraft,
          submissionId: submission.id,
        }
      : null;

    const updatedSubmission = await (prisma as any).homeworkSubmission.update({
      where: { id: submission.id },
      data: {
        reviewDraft: draftToStore ? JSON.stringify(draftToStore) : null,
      },
    });

    const currentStatus = normalizeHomeworkAssignmentStatus(assignment.status);
    const updatedAssignment =
      currentStatus === 'SUBMITTED'
        ? await (prisma as any).homeworkAssignment.update({
            where: { id: assignmentId },
            data: {
              status: 'IN_REVIEW',
              updatedAt: new Date(),
            },
            include: {
              student: {
                select: { username: true },
              },
              lesson: {
                select: { startAt: true },
              },
              template: {
                select: { title: true },
              },
            },
          })
        : assignment;

    const [assignmentWithSubmissionMeta] = await attachLatestSubmissionMetaToAssignments([updatedAssignment]);
    const [assignmentWithDisplayMeta] = await attachAssignmentDisplayMeta(
      teacher.chatId,
      [assignmentWithSubmissionMeta],
      new Date(),
    );

    return {
      assignment: serializeHomeworkAssignmentV2(assignmentWithDisplayMeta),
      submission: serializeHomeworkSubmissionV2(updatedSubmission),
    };
  };

  const createHomeworkSubmissionV2 = async (
    user: User,
    role: RequestRole,
    assignmentId: number,
    body: Record<string, unknown>,
    requestedTeacherId?: number | null,
    requestedStudentId?: number | null,
  ) => {
    let assignment = await (prisma as any).homeworkAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) throw new Error('Домашка не найдена');

    let studentId: number;
    if (role === 'STUDENT') {
      const studentContext = await ensureStudentAccessLink(user, requestedTeacherId, requestedStudentId);
      if (
        assignment.studentId !== studentContext.active.studentId ||
        Number(assignment.teacherId) !== Number(studentContext.active.teacherId)
      ) {
        throw new Error('forbidden');
      }
      studentId = studentContext.active.studentId;
    } else {
      const teacher = await ensureTeacher(user);
      if (assignment.teacherId !== teacher.chatId) throw new Error('forbidden');
      studentId = assignment.studentId;
    }

    let latest = await (prisma as any).homeworkSubmission.findFirst({
      where: { assignmentId },
      orderBy: [{ attemptNo: 'desc' }, { id: 'desc' }],
    });
    const shouldSubmit = Boolean(body.submit);
    const latestStatus = latest ? normalizeHomeworkSubmissionStatus(latest.status) : null;

    if (latest && latestStatus === 'DRAFT') {
      const timedOutResult = await finalizeTimedOutDraftSubmission(assignment, latest, new Date());
      if (timedOutResult) {
        assignment = timedOutResult.assignment;
        latest = timedOutResult.submission;
        return {
          submission: serializeHomeworkSubmissionV2(latest),
          assignment: serializeHomeworkAssignmentV2(assignment),
        };
      }
    }

    const workflow = resolveHomeworkAssignmentWorkflow(assignment);
    if (role === 'STUDENT' && !workflow.isStudentVisible) {
      throw createHttpError('Домашка недоступна', 404);
    }
    if (!workflow.canStudentEdit) {
      throw createHttpError('Домашка сейчас доступна только для просмотра.', 409);
    }

    const attemptsLimit = resolveHomeworkAttemptLimit(assignment.contentSnapshot);
    const isReissueAttempt = assignmentWasExplicitlyReissued(assignment, latest);
    const latestResolvedScore = clampHomeworkScore(latest?.finalScore ?? latest?.manualScore ?? latest?.autoScore);
    const latestAttemptState =
      latest && latestStatus !== 'DRAFT'
        ? resolveHomeworkSubmittedAttemptState({
            assignmentContentSnapshot: assignment.contentSnapshot,
            attemptNo: Number(latest.attemptNo ?? 1),
            autoScore: latestResolvedScore,
            submittedAt: new Date(latest.submittedAt ?? latest.reviewedAt ?? latest.updatedAt ?? Date.now()),
          })
        : null;

    let targetAttempt = latest?.attemptNo ?? 1;
    let mode: 'create' | 'update' = 'create';
    if (latest && normalizeHomeworkSubmissionStatus(latest.status) === 'DRAFT') {
      targetAttempt = latest.attemptNo;
      mode = 'update';
    } else if (latest && normalizeHomeworkSubmissionStatus(latest.status) !== 'DRAFT') {
      const canRetryAutoCheckedAttempt =
        latestAttemptState?.assignmentStatus === 'SENT' &&
        latestAttemptState.submissionStatus === 'REVIEWED' &&
        workflow.persistedStatus !== 'RETURNED';

      if (!canRetryAutoCheckedAttempt && !isReissueAttempt && workflow.persistedStatus !== 'RETURNED') {
        throw new Error('Домашка уже сдана. Новая попытка доступна после возврата на доработку или переоткрытия.');
      }
      targetAttempt = latest.attemptNo + 1;
      mode = 'create';
    }
    if (
      attemptsLimit !== null &&
      targetAttempt > attemptsLimit &&
      workflow.persistedStatus !== 'RETURNED' &&
      !isReissueAttempt
    ) {
      throw createHttpError('Лимит попыток исчерпан.', 409);
    }

    const answerText = typeof body.answerText === 'string' ? body.answerText : null;
    const attachments = normalizeHomeworkAttachments(body.attachments);
    const voice = normalizeHomeworkAttachments(body.voice);
    const testAnswers = parseObjectRecord(body.testAnswers);
    const autoScore = resolveHomeworkAutoScoreForSubmission(assignment.contentSnapshot, testAnswers);
    const submittedAt = new Date();
    const submittedAttemptState = shouldSubmit
      ? resolveHomeworkSubmittedAttemptState({
          assignmentContentSnapshot: assignment.contentSnapshot,
          attemptNo: targetAttempt,
          autoScore,
          submittedAt,
        })
      : null;

    const submissionPayload: Record<string, unknown> = {
      answerText,
      attachments: JSON.stringify(attachments),
      voice: JSON.stringify(voice),
      testAnswers: testAnswers ? JSON.stringify(testAnswers) : null,
      autoScore,
    };

    if (shouldSubmit) {
      submissionPayload.status = submittedAttemptState?.submissionStatus ?? 'SUBMITTED';
      submissionPayload.submittedAt = submittedAt;
      submissionPayload.reviewedAt = submittedAttemptState?.submissionReviewedAt ?? null;
      submissionPayload.finalScore = submittedAttemptState?.finalScore ?? null;
    } else {
      submissionPayload.status = 'DRAFT';
    }

    const submission =
      mode === 'update'
        ? await (prisma as any).homeworkSubmission.update({
            where: { assignmentId_attemptNo: { assignmentId, attemptNo: targetAttempt } },
            data: submissionPayload,
          })
        : await (prisma as any).homeworkSubmission.create({
            data: {
              assignmentId,
              studentId,
              attemptNo: targetAttempt,
              ...submissionPayload,
            },
          });

    const assignmentUpdateData: Record<string, unknown> = {};
    if (shouldSubmit) {
      assignmentUpdateData.status = submittedAttemptState?.assignmentStatus ?? 'SUBMITTED';
      assignmentUpdateData.teacherComment = null;
      assignmentUpdateData.reviewedAt = submittedAttemptState?.assignmentReviewedAt ?? null;
      assignmentUpdateData.autoScore = submittedAttemptState?.autoScore ?? null;
      assignmentUpdateData.manualScore = null;
      assignmentUpdateData.finalScore = submittedAttemptState?.finalScore ?? null;
      assignmentUpdateData.updatedAt = submittedAt;
    }

    const updatedAssignment =
      Object.keys(assignmentUpdateData).length > 0
        ? await (prisma as any).homeworkAssignment.update({
            where: { id: assignmentId },
            data: assignmentUpdateData,
          })
        : assignment;

    return {
      submission: serializeHomeworkSubmissionV2(submission),
      assignment: serializeHomeworkAssignmentV2(updatedAssignment),
    };
  };

  const reviewHomeworkAssignmentV2 = async (user: User, assignmentId: number, body: Record<string, unknown>) => {
    const teacher = await ensureTeacher(user);
    const assignment = await (prisma as any).homeworkAssignment.findFirst({
      where: { id: assignmentId, teacherId: teacher.chatId },
    });
    if (!assignment) throw new Error('Домашка не найдена');
    if (!resolveHomeworkAssignmentWorkflow(assignment).canTeacherReview) {
      throw createHttpError('Домашка сейчас не находится в состоянии проверки.', 409);
    }

    const action = body.action === 'RETURNED' ? 'RETURNED' : body.action === 'REVIEWED' ? 'REVIEWED' : null;
    if (!action) throw new Error('Некорректное действие проверки');

    const submissionId = Number(body.submissionId);
    const submission = Number.isFinite(submissionId)
      ? await (prisma as any).homeworkSubmission.findFirst({ where: { id: submissionId, assignmentId } })
      : await (prisma as any).homeworkSubmission.findFirst({
          where: { assignmentId },
          orderBy: [{ attemptNo: 'desc' }, { id: 'desc' }],
        });
    if (!submission) throw new Error('Попытка не найдена');
    if (normalizeHomeworkSubmissionStatus(submission.status) !== 'SUBMITTED') {
      throw createHttpError('Проверять можно только отправленную попытку.', 409);
    }

    const teacherComment = typeof body.teacherComment === 'string' ? body.teacherComment.trim() : '';

    const autoScore = clampHomeworkScore(body.autoScore ?? submission.autoScore ?? assignment.autoScore);
    const manualScore = clampHomeworkScore(body.manualScore ?? submission.manualScore ?? assignment.manualScore);
    const overrideFinal = clampHomeworkScore(body.finalScore);
    const finalScore = overrideFinal ?? (manualScore ?? autoScore);
    const now = new Date();
    const reviewDraft = normalizeHomeworkReviewDraftV2(submission.reviewDraft);
    const reviewResult = buildHomeworkReviewResultV2({
      assignment,
      submission,
      reviewDraft,
      reviewResult: body.reviewResult,
    });
    const hasReviewItemComment = Object.values(reviewResult.items).some((item) => Boolean(item.comment));
    if (action === 'RETURNED' && !teacherComment && !hasReviewItemComment) {
      throw new Error('Комментарий обязателен при возврате на доработку');
    }

    const updatedSubmission = await (prisma as any).homeworkSubmission.update({
      where: { id: submission.id },
      data: {
        status: 'REVIEWED',
        reviewerTeacherId: teacher.chatId,
        teacherComment: teacherComment || null,
        reviewDraft: null,
        reviewResult: JSON.stringify(reviewResult),
        autoScore,
        manualScore,
        finalScore,
        reviewedAt: now,
      },
    });

    const updatedAssignment = await (prisma as any).homeworkAssignment.update({
      where: { id: assignmentId },
      data: {
        status: action,
        teacherComment: teacherComment || null,
        reviewedAt: now,
        autoScore,
        manualScore,
        finalScore,
      },
    });

    await sendHomeworkNotificationToStudent({
      teacherId: teacher.chatId,
      studentId: updatedAssignment.studentId,
      type: action === 'RETURNED' ? 'HOMEWORK_RETURNED' : 'HOMEWORK_REVIEWED',
      dedupeKey: `${action === 'RETURNED' ? 'HOMEWORK_RETURNED' : 'HOMEWORK_REVIEWED'}:${updatedAssignment.id}:${updatedSubmission.id}`,
      text: buildHomeworkNotificationText(
        action === 'RETURNED' ? 'RETURNED' : 'REVIEWED',
        { ...updatedAssignment, teacherComment: teacherComment || null },
        teacher.timezone,
      ),
      assignmentId: updatedAssignment.id,
    });

    return {
      assignment: serializeHomeworkAssignmentV2(updatedAssignment),
      submission: serializeHomeworkSubmissionV2(updatedSubmission),
    };
  };

  const listStudentHomeworkAssignmentsV2 = async (
    user: User,
    requestedTeacherId: number | null | undefined,
    requestedStudentId: number | null | undefined,
    params: { filter?: string | null; limit?: number; offset?: number },
  ) => {
    const { active } = await ensureStudentAccessLink(user, requestedTeacherId, requestedStudentId);
    const limit = clampNumber(Number(params.limit ?? defaultPageSize), 1, maxPageSize);
    const offset = clampNumber(Number(params.offset ?? 0), 0, 100_000);
    const now = new Date();
    const filter = params.filter ?? 'active';

    const where: Record<string, unknown> = {
      teacherId: active.teacherId,
      studentId: active.studentId,
    };
    const rawItems = await (prisma as any).homeworkAssignment.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const items = await attachLatestSubmissionMetaToAssignments(rawItems);
    const filtered = items.filter((item: any) => {
      const workflow = resolveHomeworkAssignmentWorkflow(item, now);
      if (filter === 'submitted') return workflow.needsTeacherAction;
      if (filter === 'reviewed') return workflow.status === 'REVIEWED';
      if (filter === 'active') return workflow.needsStudentAction || workflow.needsTeacherAction;
      if (filter === 'overdue') return workflow.isOverdue;
      return true;
    });
    const pagedItems = filtered.slice(offset, offset + limit);

    return {
      items: pagedItems.map((item: any) => serializeHomeworkAssignmentV2(item, now)),
      total: filtered.length,
      nextOffset: offset + limit < filtered.length ? offset + limit : null,
    };
  };

  const getStudentHomeworkAssignmentDetailV2 = async (
    user: User,
    requestedTeacherId: number | null | undefined,
    requestedStudentId: number | null | undefined,
    assignmentId: number,
  ) => {
    const { active } = await ensureStudentAccessLink(user, requestedTeacherId, requestedStudentId);
    let assignment = await (prisma as any).homeworkAssignment.findFirst({
      where: {
        id: assignmentId,
        teacherId: active.teacherId,
        studentId: active.studentId,
      },
    });
    if (!assignment) throw new Error('Домашка не найдена');
    if (!isHomeworkAssignmentVisibleToStudent(normalizeHomeworkAssignmentStatus(assignment.status))) {
      throw createHttpError('Домашка не найдена', 404);
    }

    let submissions = await (prisma as any).homeworkSubmission.findMany({
      where: { assignmentId },
      orderBy: [{ attemptNo: 'desc' }, { id: 'desc' }],
    });
    const latestDraftSubmission =
      submissions.find((submission: any) => normalizeHomeworkSubmissionStatus(submission.status) === 'DRAFT') ?? null;
    if (latestDraftSubmission) {
      const timedOutResult = await finalizeTimedOutDraftSubmission(assignment, latestDraftSubmission, new Date());
      if (timedOutResult) {
        assignment = timedOutResult.assignment;
        submissions = [
          timedOutResult.submission,
          ...submissions.filter((submission: any) => submission.id !== timedOutResult.submission.id),
        ];
      }
    }

    return {
      assignment: serializeHomeworkAssignmentV2(assignment, new Date()),
      submissions: submissions.map((item: any) => serializeHomeworkSubmissionV2(item)),
    };
  };

  const getStudentHomeworkSummaryV2 = async (
    user: User,
    requestedTeacherId: number | null | undefined,
    requestedStudentId: number | null | undefined,
  ) => {
    const { active } = await ensureStudentAccessLink(user, requestedTeacherId, requestedStudentId);
    const now = new Date();
    const assignments = await (prisma as any).homeworkAssignment.findMany({
      where: { teacherId: active.teacherId, studentId: active.studentId },
      select: { status: true, deadlineAt: true },
    });

    const todayKey = formatInTimeZone(now, 'yyyy-MM-dd', {
      timeZone: resolveTimeZone(active.student?.timezone ?? active.teacher?.timezone),
    });
    let activeCount = 0;
    let overdueCount = 0;
    let submittedCount = 0;
    let reviewedCount = 0;
    let dueTodayCount = 0;

    assignments.forEach((item: any) => {
      const workflow = resolveHomeworkAssignmentWorkflow(item, now);
      const status = workflow.status;
      if (status === 'REVIEWED') reviewedCount += 1;
      if (workflow.needsTeacherAction) submittedCount += 1;
      if (workflow.isOverdue) overdueCount += 1;
      if (workflow.needsStudentAction || workflow.needsTeacherAction) activeCount += 1;
      if (item.deadlineAt) {
        const deadlineKey = formatInTimeZone(item.deadlineAt, 'yyyy-MM-dd', {
          timeZone: resolveTimeZone(active.student?.timezone ?? active.teacher?.timezone),
        });
        if (deadlineKey === todayKey && workflow.needsStudentAction) {
          dueTodayCount += 1;
        }
      }
    });

    return { activeCount, overdueCount, submittedCount, reviewedCount, dueTodayCount };
  };

  const updateStudentPreferencesV2 = async (
    user: User,
    requestedTeacherId: number | null | undefined,
    requestedStudentId: number | null | undefined,
    body: Record<string, unknown>,
  ) => {
    const { active } = await ensureStudentAccessLink(user, requestedTeacherId, requestedStudentId);
    const data: Record<string, unknown> = {};
    if ('timezone' in body) {
      if (body.timezone === null) data.timezone = null;
      else if (typeof body.timezone === 'string') data.timezone = body.timezone.trim() || null;
    }
    const student = await prisma.student.update({
      where: { id: active.studentId },
      data,
    });
    return { student };
  };

  const dispatchScheduledHomeworkAssignmentsForLesson = async (lessonId: number) => {
    const scheduledAssignments = await (prisma as any).homeworkAssignment.findMany({
      where: { lessonId, status: 'SCHEDULED', sendMode: 'AUTO_AFTER_LESSON_DONE' },
      include: { teacher: true },
    });
    const now = new Date();
    for (const assignment of scheduledAssignments) {
      const updated = await (prisma as any).homeworkAssignment.updateMany({
        where: { id: assignment.id, status: 'SCHEDULED' },
        data: { status: 'SENT', sentAt: now },
      });
      if (!updated.count) continue;
      if (!assignment.teacher?.homeworkNotifyOnAssign) continue;
      await sendHomeworkNotificationToStudent({
        teacherId: assignment.teacherId,
        studentId: assignment.studentId,
        type: 'HOMEWORK_ASSIGNED',
        dedupeKey: `HOMEWORK_ASSIGNED:${assignment.id}`,
        text: buildHomeworkNotificationText('ASSIGNED', assignment, assignment.teacher?.timezone ?? null),
        assignmentId: assignment.id,
      });
    }
  };

  const dispatchTimedHomeworkAssignmentsForTeacher = async (teacher: any, now: Date) => {
    const scheduledAssignments = await (prisma as any).homeworkAssignment.findMany({
      where: {
        teacherId: teacher.chatId,
        status: 'SCHEDULED',
        sendMode: 'SCHEDULED',
        scheduledFor: { lte: now },
      },
    });

    for (const assignment of scheduledAssignments) {
      const updated = await (prisma as any).homeworkAssignment.updateMany({
        where: { id: assignment.id, status: 'SCHEDULED' },
        data: { status: 'SENT', sentAt: now },
      });
      if (!updated.count || !teacher.homeworkNotifyOnAssign) continue;
      await sendHomeworkNotificationToStudent({
        teacherId: assignment.teacherId,
        studentId: assignment.studentId,
        type: 'HOMEWORK_ASSIGNED',
        dedupeKey: `HOMEWORK_ASSIGNED:SCHEDULED:${assignment.id}`,
        text: buildHomeworkNotificationText('ASSIGNED', assignment, teacher.timezone),
        assignmentId: assignment.id,
      });
    }
  };

  const runHomeworkAssignmentAutomationForTeacher = async (teacher: any, now: Date) => {
    await dispatchTimedHomeworkAssignmentsForTeacher(teacher, now);

    const reminderMorningTime = isValidTimeString(teacher.homeworkReminderMorningTime)
      ? teacher.homeworkReminderMorningTime
      : '10:00';
    const overdueReminderTime = isValidTimeString(teacher.homeworkOverdueReminderTime)
      ? teacher.homeworkOverdueReminderTime
      : '10:00';
    const overdueMaxCount = clampNumber(Number(teacher.homeworkOverdueReminderMaxCount ?? 3), 1, 10);

    const assignments = await (prisma as any).homeworkAssignment.findMany({
      where: {
        teacherId: teacher.chatId,
        status: { in: ['SENT', 'RETURNED', 'OVERDUE'] },
      },
      include: { student: true },
    });

    for (const assignment of assignments) {
      const studentTimeZone = resolveTimeZone(assignment.student?.timezone ?? teacher.timezone);
      const nowTimeLabel = formatInTimeZone(now, 'HH:mm', { timeZone: studentTimeZone });
      const deadlineAt = toValidDate(assignment.deadlineAt);
      if (
        deadlineAt &&
        deadlineAt.getTime() < now.getTime() &&
        (assignment.status === 'SENT' || assignment.status === 'RETURNED')
      ) {
        await (prisma as any).homeworkAssignment.update({
          where: { id: assignment.id },
          data: { status: 'OVERDUE' },
        });
        assignment.status = 'OVERDUE';
      }

      if (!deadlineAt) continue;
      const diffMs = deadlineAt.getTime() - now.getTime();
      const deadlineDateKey = formatInTimeZone(deadlineAt, 'yyyy-MM-dd', { timeZone: studentTimeZone });
      const nowDateKey = formatInTimeZone(now, 'yyyy-MM-dd', { timeZone: studentTimeZone });

      if (
        teacher.homeworkReminder24hEnabled &&
        !assignment.reminder24hSentAt &&
        diffMs > 0 &&
        diffMs <= 24 * 60 * 60 * 1000
      ) {
        const result = await sendHomeworkNotificationToStudent({
          teacherId: assignment.teacherId,
          studentId: assignment.studentId,
          type: 'HOMEWORK_REMINDER_24H',
          dedupeKey: `HOMEWORK_REMINDER_24H:${assignment.id}`,
          text: buildHomeworkNotificationText('REMINDER_24H', assignment, studentTimeZone),
          assignmentId: assignment.id,
        });
        if (result.status === 'sent') {
          await (prisma as any).homeworkAssignment.update({
            where: { id: assignment.id },
            data: { reminder24hSentAt: now },
          });
        }
      }

      if (
        teacher.homeworkReminder3hEnabled &&
        !assignment.reminder3hSentAt &&
        diffMs > 0 &&
        diffMs <= 3 * 60 * 60 * 1000
      ) {
        const result = await sendHomeworkNotificationToStudent({
          teacherId: assignment.teacherId,
          studentId: assignment.studentId,
          type: 'HOMEWORK_REMINDER_3H',
          dedupeKey: `HOMEWORK_REMINDER_3H:${assignment.id}`,
          text: buildHomeworkNotificationText('REMINDER_3H', assignment, studentTimeZone),
          assignmentId: assignment.id,
        });
        if (result.status === 'sent') {
          await (prisma as any).homeworkAssignment.update({
            where: { id: assignment.id },
            data: { reminder3hSentAt: now },
          });
        }
      }

      if (
        teacher.homeworkReminderMorningEnabled &&
        !assignment.reminderMorningSentAt &&
        deadlineDateKey === nowDateKey &&
        nowTimeLabel === reminderMorningTime
      ) {
        const result = await sendHomeworkNotificationToStudent({
          teacherId: assignment.teacherId,
          studentId: assignment.studentId,
          type: 'HOMEWORK_REMINDER_MORNING',
          dedupeKey: `HOMEWORK_REMINDER_MORNING:${assignment.id}`,
          text: buildHomeworkNotificationText('REMINDER_MORNING', assignment, studentTimeZone),
          assignmentId: assignment.id,
        });
        if (result.status === 'sent') {
          await (prisma as any).homeworkAssignment.update({
            where: { id: assignment.id },
            data: { reminderMorningSentAt: now },
          });
        }
      }

      if (
        teacher.homeworkOverdueRemindersEnabled &&
        assignment.status === 'OVERDUE' &&
        nowTimeLabel === overdueReminderTime &&
        Number(assignment.overdueReminderCount ?? 0) < overdueMaxCount
      ) {
        const lastOverdueDateKey = assignment.lastOverdueReminderAt
          ? formatInTimeZone(assignment.lastOverdueReminderAt, 'yyyy-MM-dd', { timeZone: studentTimeZone })
          : null;
        if (lastOverdueDateKey !== nowDateKey) {
          const result = await sendHomeworkNotificationToStudent({
            teacherId: assignment.teacherId,
            studentId: assignment.studentId,
            type: 'HOMEWORK_OVERDUE',
            dedupeKey: `HOMEWORK_OVERDUE:${assignment.id}:${nowDateKey}`,
            text: buildHomeworkNotificationText('OVERDUE', assignment, studentTimeZone),
            assignmentId: assignment.id,
          });
          if (result.status === 'sent') {
            await (prisma as any).homeworkAssignment.update({
              where: { id: assignment.id },
              data: {
                overdueReminderCount: Number(assignment.overdueReminderCount ?? 0) + 1,
                lastOverdueReminderAt: now,
              },
            });
          }
        }
      }
    }
  };

  return {
    listHomeworkGroupsV2,
    createHomeworkGroupV2,
    updateHomeworkGroupV2,
    deleteHomeworkGroupV2,
    listHomeworkTemplatesV2,
    createHomeworkTemplateV2,
    updateHomeworkTemplateV2,
    deleteHomeworkTemplateV2,
    listHomeworkAssignmentsV2,
    getHomeworkAssignmentsSummaryV2,
    createHomeworkAssignmentV2,
    getHomeworkAssignmentV2,
    updateHomeworkAssignmentV2,
    sendHomeworkAssignmentV2,
    remindHomeworkAssignmentV2,
    cancelHomeworkAssignmentIssueV2,
    reissueHomeworkAssignmentV2,
    deleteHomeworkAssignmentV2,
    bulkHomeworkAssignmentsV2,
    listHomeworkSubmissionsV2,
    openHomeworkReviewSessionV2,
    saveHomeworkReviewDraftV2,
    createHomeworkSubmissionV2,
    reviewHomeworkAssignmentV2,
    listStudentHomeworkAssignmentsV2,
    getStudentHomeworkAssignmentDetailV2,
    getStudentHomeworkSummaryV2,
    updateStudentPreferencesV2,
    dispatchScheduledHomeworkAssignmentsForLesson,
    dispatchTimedHomeworkAssignmentsForTeacher,
    runHomeworkAssignmentAutomationForTeacher,
  };
};

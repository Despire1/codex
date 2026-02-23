import { endOfWeek, format, startOfWeek } from 'date-fns';
import type { User } from '@prisma/client';
import type { URL } from 'node:url';
import type { HomeworkStatus } from '../../../entities/types';
import { isValidEmail, normalizeEmail } from '../../../shared/lib/email';
import { isStudentUiColor, normalizeStudentUiColor, pickNextStudentUiColor } from '../../../shared/lib/studentUiColors';
import {
  getTimeZoneStartOfDay,
  resolveTimeZone,
  toUtcDateFromTimeZone,
  toUtcEndOfDay,
  toZonedDate,
} from '../../../shared/lib/timezoneDates';
import prisma from '../../prismaClient';
import { clampNumber } from '../lib/runtimeLimits';

type EnsureTeacher = (user: User) => Promise<{ chatId: bigint; timezone?: string | null }>;
type SafeLogActivityEvent = (payload: any) => Promise<void>;

type StudentProfileFields = {
  email: string | null;
  phone: string | null;
  studentLevel: string | null;
  learningGoal: string | null;
  notes: string | null;
};

type CreateStudentsServiceDeps = {
  defaultPageSize: number;
  maxPageSize: number;
  ensureTeacher: EnsureTeacher;
  safeLogActivityEvent: SafeLogActivityEvent;
  normalizeTeacherStatus: (status: any) => string;
  parseDateFilter: (value?: string | null) => Date | null;
};

export const normalizeTelegramUsername = (username?: string | null) => {
  if (!username) return null;
  const trimmed = username.trim();
  if (!trimmed) return null;
  const withoutAt = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  return withoutAt.trim().toLowerCase() || null;
};

const normalizeOptionalStudentTextField = (
  value: unknown,
  options: { label: string; maxLength: number },
): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`${options.label} должен быть строкой`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > options.maxLength) {
    throw new Error(`${options.label} слишком длинный`);
  }
  return trimmed;
};

const parseStudentProfileFields = (
  body: Record<string, unknown> | null | undefined,
  mode: 'create' | 'update',
): Partial<StudentProfileFields> => {
  const source = body ?? {};
  const parsed: Partial<StudentProfileFields> = {};
  const shouldApply = (fieldName: keyof StudentProfileFields) => mode === 'create' || fieldName in source;

  if (shouldApply('email')) {
    const rawEmail = source.email;
    if (rawEmail === undefined || rawEmail === null) {
      parsed.email = null;
    } else {
      if (typeof rawEmail !== 'string') {
        throw new Error('Email должен быть строкой');
      }
      const normalized = normalizeEmail(rawEmail);
      if (!normalized) {
        parsed.email = null;
      } else if (!isValidEmail(normalized)) {
        throw new Error('Email указан некорректно');
      } else {
        parsed.email = normalized;
      }
    }
  }

  if (shouldApply('phone')) {
    parsed.phone = normalizeOptionalStudentTextField(source.phone, { label: 'Телефон', maxLength: 64 });
  }

  if (shouldApply('studentLevel')) {
    parsed.studentLevel = normalizeOptionalStudentTextField(source.studentLevel, {
      label: 'Уровень ученика',
      maxLength: 120,
    });
  }

  if (shouldApply('learningGoal')) {
    parsed.learningGoal = normalizeOptionalStudentTextField(source.learningGoal, {
      label: 'Цель обучения',
      maxLength: 2000,
    });
  }

  if (shouldApply('notes')) {
    parsed.notes = normalizeOptionalStudentTextField(source.notes, { label: 'Заметки', maxLength: 4000 });
  }

  return parsed;
};

const findUserByTelegramUsername = async (normalizedUsername: string) => {
  const candidates = await prisma.user.findMany({
    where: { username: { contains: normalizedUsername } },
  });
  return candidates.find((user) => normalizeTelegramUsername(user.username) === normalizedUsername) ?? null;
};

const resolveNextTeacherStudentUiColor = async (
  teacherId: bigint,
  options?: { excludeStudentId?: number },
) => {
  const links = await prisma.teacherStudent.findMany({
    where: {
      teacherId,
      isArchived: false,
      ...(typeof options?.excludeStudentId === 'number'
        ? { studentId: { not: options.excludeStudentId } }
        : {}),
    },
    select: { uiColor: true },
  });
  return pickNextStudentUiColor(links.map((link) => link.uiColor));
};

export const createStudentsService = ({
  defaultPageSize,
  maxPageSize,
  ensureTeacher,
  safeLogActivityEvent,
  normalizeTeacherStatus,
  parseDateFilter,
}: CreateStudentsServiceDeps) => {
  const resolvePageParams = (url: URL) => {
    const limitRaw = Number(url.searchParams.get('limit') ?? defaultPageSize);
    const offsetRaw = Number(url.searchParams.get('offset') ?? 0);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), maxPageSize) : defaultPageSize;
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.floor(offsetRaw) : 0;
    return { limit, offset };
  };

  const isHomeworkDone = (homework: any) => normalizeTeacherStatus(homework.status) === 'DONE' || homework.isDone;

  const isHomeworkOverdue = (homework: any, todayStart: Date) => {
    if (!homework.deadline) return false;
    if (isHomeworkDone(homework)) return false;
    return new Date(homework.deadline).getTime() < todayStart.getTime();
  };

  const buildHomeworkStats = (homeworks: any[], todayStart: Date) => {
    let pendingHomeworkCount = 0;
    let overdueHomeworkCount = 0;
    let doneHomeworkCount = 0;
    const totalHomeworkCount = homeworks.length;

    homeworks.forEach((homework) => {
      const homeworkDone = isHomeworkDone(homework);
      if (homeworkDone) {
        doneHomeworkCount += 1;
      } else {
        pendingHomeworkCount += 1;
      }
      if (isHomeworkOverdue(homework, todayStart)) {
        overdueHomeworkCount += 1;
      }
    });

    const homeworkCompletionRate =
      totalHomeworkCount > 0 ? Math.round((doneHomeworkCount / totalHomeworkCount) * 100) : 0;
    const averageScore =
      totalHomeworkCount > 0 ? Number(((doneHomeworkCount / totalHomeworkCount) * 10).toFixed(1)) : 0;

    return {
      pendingHomeworkCount,
      overdueHomeworkCount,
      totalHomeworkCount,
      doneHomeworkCount,
      homeworkCompletionRate,
      averageScore,
    };
  };

  const resolveStudentDebtSummary = async (teacherId: bigint, studentId: number) => {
    const link = await prisma.teacherStudent.findUnique({
      where: { teacherId_studentId: { teacherId, studentId } },
    });
    const now = new Date();
    const lessons = await prisma.lesson.findMany({
      where: {
        teacherId,
        status: { not: 'CANCELED' },
        OR: [{ status: 'COMPLETED' }, { startAt: { lt: now } }],
        participants: {
          some: {
            studentId,
            isPaid: false,
          },
        },
      },
      include: {
        participants: true,
      },
      orderBy: { startAt: 'asc' },
    });

    const items = lessons.map((lesson) => {
      const participant = lesson.participants.find((item) => item.studentId === studentId);
      const participantPrice =
        typeof participant?.price === 'number' && participant.price > 0 ? participant.price : null;
      const fallbackPrice =
        typeof link?.pricePerLesson === 'number' && link.pricePerLesson > 0
          ? link.pricePerLesson
          : typeof lesson.price === 'number' && lesson.price > 0
            ? lesson.price
            : null;
      const price = participantPrice ?? fallbackPrice;
      return {
        id: lesson.id,
        startAt: lesson.startAt,
        status: lesson.status,
        price,
        lastPaymentReminderAt: lesson.lastPaymentReminderAt,
      };
    });

    const total = items.reduce((sum, item) => sum + (item.price ?? 0), 0);

    return { items, total };
  };

  const searchStudents = async (user: User, query?: string, filter?: 'all' | 'pendingHomework' | 'noReminder') => {
    const teacher = await ensureTeacher(user);
    const normalizedQuery = query?.trim().toLowerCase();

    const links = await prisma.teacherStudent.findMany({ where: { teacherId: teacher.chatId, isArchived: false } });
    const students = await prisma.student.findMany({
      where: {
        teacherLinks: {
          some: {
            teacherId: teacher.chatId,
            isArchived: false,
          },
        },
      },
    });

    const filteredLinks = links.filter((link) => {
      const student = students.find((s) => s.id === link.studentId);
      if (!student) return false;

      const matchesQuery = !normalizedQuery
        ? true
        : link.customName.toLowerCase().includes(normalizedQuery) ||
          (student.username ?? '').toLowerCase().includes(normalizedQuery);

      if (!matchesQuery) return false;

      if (filter === 'noReminder') return !link.autoRemindHomework;

      if (filter === 'pendingHomework') {
        return true;
      }

      return true;
    });

    const studentIds = filteredLinks.map((link) => link.studentId);

    const homeworks = await prisma.homework.findMany({
      where: {
        teacherId: teacher.chatId,
        studentId: studentIds.length ? { in: studentIds } : { in: [-1] },
      },
    });

    const withPending = filteredLinks.filter((link) => {
      if (filter !== 'pendingHomework') return true;
      return homeworks.some((hw) => hw.studentId === link.studentId && !hw.isDone);
    });

    return {
      students: students
        .filter((student) => withPending.some((link) => link.studentId === student.id))
        .map((student) => student),
      links: withPending,
      homeworks,
    };
  };

  const listStudents = async (
    user: User,
    query?: string,
    filter?: 'all' | 'debt' | 'overdue',
    limit = defaultPageSize,
    offset = 0,
  ) => {
    const teacher = await ensureTeacher(user);
    const resolvedTimeZone = resolveTimeZone(teacher.timezone);
    const normalizedQuery = query?.trim();
    const normalizedQueryLower = normalizedQuery?.toLowerCase();
    const where: any = { teacherId: teacher.chatId, isArchived: false };

    if (normalizedQuery) {
      where.OR = [
        { customName: { contains: normalizedQuery } },
        { student: { username: { contains: normalizedQuery } } },
      ];
    }

    let links = await prisma.teacherStudent.findMany({
      where,
      include: { student: true },
      orderBy: { customName: 'asc' },
    });
    if (normalizedQueryLower) {
      links = links.filter((link) => {
        const customName = link.customName?.toLowerCase() ?? '';
        const username = link.student?.username?.toLowerCase() ?? '';
        return customName.includes(normalizedQueryLower) || username.includes(normalizedQueryLower);
      });
    }

    const studentIds = links.map((link) => link.studentId);
    const studentIdsSet = new Set(studentIds);
    const homeworks = studentIds.length
      ? await prisma.homework.findMany({
          where: { teacherId: teacher.chatId, studentId: { in: studentIds } },
        })
      : [];

    const lessons = studentIds.length
      ? await prisma.lesson.findMany({
          where: {
            teacherId: teacher.chatId,
            participants: {
              some: {
                studentId: { in: studentIds },
              },
            },
          },
          select: {
            startAt: true,
            status: true,
            participants: {
              select: {
                studentId: true,
                attended: true,
              },
            },
          },
        })
      : [];

    const homeworksByStudent = new Map<number, any[]>();
    homeworks.forEach((homework) => {
      const existing = homeworksByStudent.get(homework.studentId) ?? [];
      existing.push(homework);
      homeworksByStudent.set(homework.studentId, existing);
    });

    const now = new Date();
    const todayStart = getTimeZoneStartOfDay(now, teacher.timezone);
    const todayKey = format(toZonedDate(now, resolvedTimeZone), 'yyyy-MM-dd');
    const todayEnd = toUtcEndOfDay(todayKey, resolvedTimeZone);
    const weekStartKey = format(startOfWeek(toZonedDate(now, resolvedTimeZone), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const weekEndKey = format(endOfWeek(toZonedDate(now, resolvedTimeZone), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const weekStart = toUtcDateFromTimeZone(weekStartKey, '00:00', resolvedTimeZone);
    const weekEnd = toUtcEndOfDay(weekEndKey, resolvedTimeZone);

    const createEmptyLessonStats = () => ({
      totalLessons: 0,
      completedLessons: 0,
      attendedLessons: 0,
      attendanceTrackedLessons: 0,
      weeklyLessonsCount: 0,
      todayLessonsCount: 0,
      nextLessonAt: null as Date | null,
      lastLessonAt: null as Date | null,
    });

    const lessonStatsByStudent = new Map<number, ReturnType<typeof createEmptyLessonStats>>();

    lessons.forEach((lesson) => {
      if (lesson.status === 'CANCELED') return;
      const lessonDate = new Date(lesson.startAt);
      const isPastOrCompleted = lesson.status === 'COMPLETED' || lessonDate.getTime() <= now.getTime();
      const isUpcoming = lesson.status === 'SCHEDULED' && lessonDate.getTime() > now.getTime();
      const isInCurrentWeek = lessonDate.getTime() >= weekStart.getTime() && lessonDate.getTime() <= weekEnd.getTime();
      const isToday = lessonDate.getTime() >= todayStart.getTime() && lessonDate.getTime() <= todayEnd.getTime();

      lesson.participants.forEach((participant) => {
        if (!studentIdsSet.has(participant.studentId)) return;
        const stats = lessonStatsByStudent.get(participant.studentId) ?? createEmptyLessonStats();

        stats.totalLessons += 1;
        if (isPastOrCompleted) {
          stats.completedLessons += 1;
        }
        if (isInCurrentWeek) {
          stats.weeklyLessonsCount += 1;
        }
        if (isToday) {
          stats.todayLessonsCount += 1;
        }
        if (isUpcoming && (!stats.nextLessonAt || lessonDate.getTime() < stats.nextLessonAt.getTime())) {
          stats.nextLessonAt = lessonDate;
        }
        if (isPastOrCompleted && (!stats.lastLessonAt || lessonDate.getTime() > stats.lastLessonAt.getTime())) {
          stats.lastLessonAt = lessonDate;
        }

        if (participant.attended === true) {
          stats.attendanceTrackedLessons += 1;
          stats.attendedLessons += 1;
        } else if (participant.attended === false) {
          stats.attendanceTrackedLessons += 1;
        } else if (lesson.status === 'COMPLETED') {
          stats.attendanceTrackedLessons += 1;
          stats.attendedLessons += 1;
        }

        lessonStatsByStudent.set(participant.studentId, stats);
      });
    });

    const resolveLifecycleStatus = (stats: ReturnType<typeof createEmptyLessonStats>) => {
      if (stats.nextLessonAt) return 'ACTIVE' as const;
      if (!stats.lastLessonAt) return 'ACTIVE' as const;
      const daysSinceLastLesson = (now.getTime() - stats.lastLessonAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastLesson <= 30) return 'PAUSED' as const;
      return 'COMPLETED' as const;
    };

    type StudentListStats = ReturnType<typeof buildHomeworkStats> & {
      totalLessons: number;
      completedLessons: number;
      attendanceRate: number | null;
      weeklyLessonsCount: number;
      todayLessonsCount: number;
      nextLessonAt: string | null;
      lastLessonAt: string | null;
      lifecycleStatus: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
    };

    const statsByStudent = new Map<number, StudentListStats>();
    links.forEach((link) => {
      const homeworkStats = buildHomeworkStats(homeworksByStudent.get(link.studentId) ?? [], todayStart);
      const lessonStats = lessonStatsByStudent.get(link.studentId) ?? createEmptyLessonStats();
      const attendanceRate =
        lessonStats.attendanceTrackedLessons > 0
          ? Math.round((lessonStats.attendedLessons / lessonStats.attendanceTrackedLessons) * 100)
          : null;

      statsByStudent.set(link.studentId, {
        ...homeworkStats,
        totalLessons: lessonStats.totalLessons,
        completedLessons: lessonStats.completedLessons,
        attendanceRate,
        weeklyLessonsCount: lessonStats.weeklyLessonsCount,
        todayLessonsCount: lessonStats.todayLessonsCount,
        nextLessonAt: lessonStats.nextLessonAt?.toISOString() ?? null,
        lastLessonAt: lessonStats.lastLessonAt?.toISOString() ?? null,
        lifecycleStatus: resolveLifecycleStatus(lessonStats),
      });
    });

    const emptyStudentStats: StudentListStats = {
      pendingHomeworkCount: 0,
      overdueHomeworkCount: 0,
      totalHomeworkCount: 0,
      doneHomeworkCount: 0,
      homeworkCompletionRate: 0,
      averageScore: 0,
      totalLessons: 0,
      completedLessons: 0,
      attendanceRate: null,
      weeklyLessonsCount: 0,
      todayLessonsCount: 0,
      nextLessonAt: null,
      lastLessonAt: null,
      lifecycleStatus: 'ACTIVE' as const,
    };

    const filteredLinks = links.filter((link) => {
      const stats = statsByStudent.get(link.studentId) ?? emptyStudentStats;
      if (filter === 'debt') return link.balanceLessons < 0;
      if (filter === 'overdue') return stats.overdueHomeworkCount > 0;
      return true;
    });

    const total = filteredLinks.length;
    const pageItems = filteredLinks.slice(offset, offset + limit).map((link) => {
      const { student, ...linkData } = link;
      return {
        student,
        link: linkData,
        stats: statsByStudent.get(link.studentId) ?? emptyStudentStats,
      };
    });

    const debtSummariesByStudent = new Map<number, { total: number; count: number }>();
    const reminderCountsByStudent = new Map<number, number>();
    if (pageItems.length) {
      const debtResults = await Promise.all(
        pageItems.map(async (item) => {
          try {
            const summary = await resolveStudentDebtSummary(teacher.chatId, item.student.id);
            return { studentId: item.student.id, total: summary.total, count: summary.items.length };
          } catch {
            return { studentId: item.student.id, total: 0, count: 0 };
          }
        }),
      );

      debtResults.forEach((result) => {
        if (result.total > 0 || result.count > 0) {
          debtSummariesByStudent.set(result.studentId, { total: result.total, count: result.count });
        }
      });
    }

    if (pageItems.length) {
      const reminderCounts = await prisma.notificationLog.findMany({
        where: {
          teacherId: teacher.chatId,
          lessonId: { not: null },
          type: 'PAYMENT_REMINDER_STUDENT',
          studentId: { in: pageItems.map((item) => item.student.id) },
        },
        select: { studentId: true },
      });

      reminderCounts.forEach((reminder) => {
        if (!reminder.studentId) return;
        reminderCountsByStudent.set(
          reminder.studentId,
          (reminderCountsByStudent.get(reminder.studentId) ?? 0) + 1,
        );
      });
    }

    const items = pageItems.map((item) => {
      const debtSummary = debtSummariesByStudent.get(item.student.id);
      const paymentRemindersCount = reminderCountsByStudent.get(item.student.id) ?? null;
      if (!debtSummary) {
        return {
          ...item,
          paymentRemindersCount,
        };
      }
      return {
        ...item,
        debtRub: debtSummary.total > 0 ? debtSummary.total : null,
        debtLessonCount: debtSummary.count > 0 ? debtSummary.count : null,
        paymentRemindersCount,
      };
    });

    const nextOffset = offset + limit < total ? offset + limit : null;
    const allStatuses = links.map((link) => (statsByStudent.get(link.studentId) ?? emptyStudentStats).lifecycleStatus);
    const summaryStudents = links.length || 1;
    const summaryAttendanceValues = links
      .map((link) => (statsByStudent.get(link.studentId) ?? emptyStudentStats).attendanceRate)
      .filter((value): value is number => typeof value === 'number');
    const averageAttendance =
      summaryAttendanceValues.length > 0
        ? Math.round(summaryAttendanceValues.reduce((sum, value) => sum + value, 0) / summaryAttendanceValues.length)
        : null;
    const averageScore = Number(
      (
        links.reduce((sum, link) => sum + ((statsByStudent.get(link.studentId) ?? emptyStudentStats).averageScore ?? 0), 0) /
        summaryStudents
      ).toFixed(1),
    );
    const lessonsThisWeek = links.reduce(
      (sum, link) => sum + ((statsByStudent.get(link.studentId) ?? emptyStudentStats).weeklyLessonsCount ?? 0),
      0,
    );
    const lessonsToday = links.reduce(
      (sum, link) => sum + ((statsByStudent.get(link.studentId) ?? emptyStudentStats).todayLessonsCount ?? 0),
      0,
    );

    const counts = {
      withDebt: links.filter((link) => link.balanceLessons < 0).length,
      overdue: links.filter((link) => (statsByStudent.get(link.studentId)?.overdueHomeworkCount ?? 0) > 0).length,
      active: allStatuses.filter((status) => status === 'ACTIVE').length,
      paused: allStatuses.filter((status) => status === 'PAUSED').length,
      completed: allStatuses.filter((status) => status === 'COMPLETED').length,
    };

    return {
      items,
      total,
      nextOffset,
      counts,
      summary: {
        active: counts.active,
        paused: counts.paused,
        completed: counts.completed,
        lessonsThisWeek,
        lessonsToday,
        averageAttendance,
        averageScore,
      },
    };
  };

  const listStudentHomeworks = async (
    user: User,
    studentId: number,
    filter: 'all' | HomeworkStatus | 'overdue' = 'all',
    limit = defaultPageSize,
    offset = 0,
  ) => {
    const teacher = await ensureTeacher(user);
    const link = await prisma.teacherStudent.findUnique({
      where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
    });
    if (!link || link.isArchived) throw new Error('Ученик не найден у текущего преподавателя');

    const where: any = { teacherId: teacher.chatId, studentId };
    if (filter === 'overdue') {
      const todayStart = getTimeZoneStartOfDay(new Date(), teacher.timezone);
      where.deadline = { lt: todayStart };
      where.isDone = false;
      where.NOT = { status: 'DONE' };
    } else if (filter && filter !== 'all') {
      where.status = filter;
    }

    const total = await prisma.homework.count({ where });
    const items = await prisma.homework.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    });
    const nextOffset = offset + limit < total ? offset + limit : null;
    return { items, total, nextOffset };
  };

  const listStudentUnpaidLessons = async (user: User, studentId: number) => {
    const teacher = await ensureTeacher(user);
    const link = await prisma.teacherStudent.findUnique({
      where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
    });
    if (!link || link.isArchived) throw new Error('Ученик не найден у текущего преподавателя');

    return resolveStudentDebtSummary(teacher.chatId, studentId);
  };

  const listStudentPaymentReminders = async (
    user: User,
    studentId: number,
    options: { limit?: number; offset?: number } = {},
  ) => {
    const teacher = await ensureTeacher(user);
    const link = await prisma.teacherStudent.findUnique({
      where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
    });
    if (!link || link.isArchived) throw new Error('Ученик не найден у текущего преподавателя');

    const safeLimit = clampNumber(options.limit ?? 10, 1, 50);
    const safeOffset = clampNumber(options.offset ?? 0, 0, 10_000);
    const reminders = await prisma.notificationLog.findMany({
      where: {
        teacherId: teacher.chatId,
        studentId,
        lessonId: { not: null },
        type: 'PAYMENT_REMINDER_STUDENT',
      },
      orderBy: { createdAt: 'desc' },
      take: safeLimit + 1,
      skip: safeOffset,
    });
    const hasMore = reminders.length > safeLimit;
    const slicedReminders = hasMore ? reminders.slice(0, safeLimit) : reminders;

    return {
      reminders: slicedReminders.map((reminder) => ({
        id: reminder.id,
        lessonId: reminder.lessonId!,
        createdAt: reminder.createdAt,
        status: reminder.status,
        source: reminder.source ?? 'AUTO',
      })),
      nextOffset: hasMore ? safeOffset + safeLimit : null,
    };
  };

  const listStudentLessons = async (
    user: User,
    studentId: number,
    filters: {
      payment?: 'all' | 'paid' | 'unpaid';
      status?: 'all' | 'completed' | 'not_completed';
      startFrom?: string;
      startTo?: string;
      sort?: 'asc' | 'desc';
    },
  ) => {
    const teacher = await ensureTeacher(user);
    const link = await prisma.teacherStudent.findUnique({
      where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
    });
    if (!link || link.isArchived) throw new Error('Ученик не найден у текущего преподавателя');

    const participantWhere: Record<string, any> = { studentId };
    if (filters.payment === 'paid') {
      participantWhere.isPaid = true;
    }
    if (filters.payment === 'unpaid') {
      participantWhere.isPaid = false;
    }

    const where: Record<string, any> = {
      teacherId: teacher.chatId,
      participants: {
        some: participantWhere,
      },
    };

    if (filters.status === 'completed') {
      where.status = 'COMPLETED';
    }

    if (filters.status === 'not_completed') {
      where.status = { not: 'COMPLETED' };
    }

    const startFrom = parseDateFilter(filters.startFrom);
    const startTo = parseDateFilter(filters.startTo);
    if (startFrom || startTo) {
      where.startAt = {};
      if (startFrom) where.startAt.gte = startFrom;
      if (startTo) where.startAt.lte = startTo;
    }

    const items = await prisma.lesson.findMany({
      where,
      include: {
        participants: {
          include: {
            student: true,
          },
        },
      },
      orderBy: { startAt: filters.sort === 'asc' ? 'asc' : 'desc' },
    });

    const debt = await resolveStudentDebtSummary(teacher.chatId, studentId);

    return { items, debt };
  };

  const addStudent = async (user: User, body: any) => {
    const { customName, username, pricePerLesson } = body ?? {};
    if (!customName || typeof customName !== 'string' || !customName.trim()) {
      throw new Error('Имя ученика обязательно');
    }
    if (!username || typeof username !== 'string' || !normalizeTelegramUsername(username)) {
      throw new Error('Telegram username обязателен');
    }
    if (!Number.isFinite(Number(pricePerLesson)) || Number(pricePerLesson) < 0) {
      throw new Error('Цена занятия обязательна и должна быть неотрицательной');
    }

    const teacher = await ensureTeacher(user);
    const normalizedUsername = typeof username === 'string' ? normalizeTelegramUsername(username) : null;
    if (!normalizedUsername) throw new Error('Telegram username обязателен');
    const normalizedCustomName = customName.trim();
    const profileFields = parseStudentProfileFields(body as Record<string, unknown>, 'create');
    const existingStudent = normalizedUsername
      ? await prisma.student.findFirst({ where: { username: normalizedUsername } })
      : null;

    const normalizedPrice = Math.round(Number(pricePerLesson));
    let student =
      existingStudent ||
      (await prisma.student.create({
        data: {
          username: normalizedUsername,
          pricePerLesson: normalizedPrice,
        },
      }));

    if (normalizedUsername && (!student.telegramId || !student.isActivated)) {
      const matchedUser = await findUserByTelegramUsername(normalizedUsername);
      if (matchedUser) {
        student = await prisma.student.update({
          where: { id: student.id },
          data: {
            telegramId: matchedUser.telegramUserId,
            isActivated: true,
            activatedAt: new Date(),
          },
        });
      }
    }

    const existingLink = await prisma.teacherStudent.findUnique({
      where: { teacherId_studentId: { teacherId: teacher.chatId, studentId: student.id } },
    });

    if (existingLink) {
      const hasValidStoredColor = isStudentUiColor(existingLink.uiColor);
      if (existingLink.isArchived) {
        const nextUiColor = hasValidStoredColor
          ? normalizeStudentUiColor(existingLink.uiColor)
          : await resolveNextTeacherStudentUiColor(teacher.chatId, { excludeStudentId: student.id });
        const restoredLink = await prisma.teacherStudent.update({
          where: { teacherId_studentId: { teacherId: teacher.chatId, studentId: student.id } },
          data: {
            isArchived: false,
            customName: normalizedCustomName,
            pricePerLesson: normalizedPrice,
            uiColor: nextUiColor,
            ...profileFields,
          },
        });
        await safeLogActivityEvent({
          teacherId: teacher.chatId,
          studentId: student.id,
          category: 'STUDENT',
          action: 'RESTORE',
          status: 'SUCCESS',
          source: 'USER',
          title: `Ученик восстановлен: ${normalizedCustomName}`,
          details: 'Ссылка преподавателя с учеником восстановлена из архива.',
        });
        return { student, link: restoredLink };
      }

      if (!hasValidStoredColor) {
        const nextUiColor = await resolveNextTeacherStudentUiColor(teacher.chatId, { excludeStudentId: student.id });
        const linkWithColor = await prisma.teacherStudent.update({
          where: { teacherId_studentId: { teacherId: teacher.chatId, studentId: student.id } },
          data: { uiColor: nextUiColor },
        });
        return { student, link: linkWithColor };
      }

      return { student, link: existingLink };
    }

    const nextUiColor = await resolveNextTeacherStudentUiColor(teacher.chatId);
    const link = await prisma.teacherStudent.create({
      data: {
        teacherId: teacher.chatId,
        studentId: student.id,
        customName: normalizedCustomName,
        autoRemindHomework: true,
        balanceLessons: 0,
        pricePerLesson: normalizedPrice,
        uiColor: nextUiColor,
        ...profileFields,
      },
    });
    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId: student.id,
      category: 'STUDENT',
      action: 'CREATE',
      status: 'SUCCESS',
      source: 'USER',
      title: `Добавлен ученик: ${normalizedCustomName}`,
      details: normalizedUsername ? `username: @${normalizedUsername}` : null,
    });
    return { student, link };
  };

  const updateStudent = async (user: User, studentId: number, body: any) => {
    const { customName, username, pricePerLesson } = body ?? {};
    if (!customName || typeof customName !== 'string' || !customName.trim()) {
      throw new Error('Имя ученика обязательно');
    }
    if (!username || typeof username !== 'string' || !normalizeTelegramUsername(username)) {
      throw new Error('Telegram username обязателен');
    }
    const numericPrice = Number(pricePerLesson);
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      throw new Error('Цена занятия обязательна и должна быть неотрицательной');
    }

    const teacher = await ensureTeacher(user);
    const normalizedCustomName = customName.trim();
    const profileFields = parseStudentProfileFields(body as Record<string, unknown>, 'update');
    const link = await prisma.teacherStudent.findUnique({
      where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
    });
    if (!link || link.isArchived) throw new Error('Ученик не найден у текущего преподавателя');

    const normalizedUsername = normalizeTelegramUsername(typeof username === 'string' ? username : null);
    if (!normalizedUsername) throw new Error('Telegram username обязателен');
    const matchedUser = await findUserByTelegramUsername(normalizedUsername);

    const [student, updatedLink] = await prisma.$transaction([
      prisma.student.update({
        where: { id: studentId },
        data: {
          username: normalizedUsername,
          ...(matchedUser
            ? {
                telegramId: matchedUser.telegramUserId,
                isActivated: true,
                activatedAt: new Date(),
              }
            : {}),
        },
      }),
      prisma.teacherStudent.update({
        where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
        data: { customName: normalizedCustomName, pricePerLesson: Math.round(numericPrice), ...profileFields },
      }),
    ]);

    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId,
      category: 'STUDENT',
      action: 'UPDATE',
      status: 'SUCCESS',
      source: 'USER',
      title: `Обновлён ученик: ${normalizedCustomName}`,
      details: `username: @${normalizedUsername}; pricePerLesson: ${Math.round(numericPrice)}`,
    });

    return { student, link: updatedLink };
  };

  const archiveStudentLink = async (user: User, studentId: number) => {
    const teacher = await ensureTeacher(user);
    const link = await prisma.teacherStudent.findUnique({
      where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
    });
    if (!link || link.isArchived) throw new Error('Ученик не найден у текущего преподавателя');

    const updatedLink = await prisma.teacherStudent.update({
      where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
      data: { isArchived: true },
    });
    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId,
      category: 'STUDENT',
      action: 'ARCHIVE',
      status: 'SUCCESS',
      source: 'USER',
      title: `Ученик отправлен в архив: ${link.customName}`,
    });
    return updatedLink;
  };

  const toggleAutoReminder = async (user: User, studentId: number, value: boolean) => {
    const teacher = await ensureTeacher(user);
    const link = await prisma.teacherStudent.findUnique({
      where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
    });
    if (!link || link.isArchived) throw new Error('Student link not found');
    const updatedLink = await prisma.teacherStudent.update({
      where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
      data: { autoRemindHomework: value },
    });
    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId,
      category: 'STUDENT',
      action: 'TOGGLE_HOMEWORK_REMINDER',
      status: 'SUCCESS',
      source: 'USER',
      title: `Авто-напоминания по ДЗ ${value ? 'включены' : 'выключены'}`,
      details: `Ученик: ${link.customName}`,
    });
    return updatedLink;
  };

  const updateStudentPaymentReminders = async (user: User, studentId: number, enabled: boolean) => {
    const teacher = await ensureTeacher(user);
    const link = await prisma.teacherStudent.findUnique({
      where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
    });
    if (!link || link.isArchived) throw new Error('Ученик не найден у текущего преподавателя');
    const student = await prisma.student.update({
      where: { id: studentId },
      data: { paymentRemindersEnabled: enabled },
    });
    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId,
      category: 'STUDENT',
      action: 'TOGGLE_PAYMENT_REMINDER',
      status: 'SUCCESS',
      source: 'USER',
      title: `Напоминания об оплате ${enabled ? 'включены' : 'выключены'}`,
      details: `Ученик: ${link.customName}`,
    });
    return { student };
  };

  const updatePricePerLesson = async (user: User, studentId: number, value: number) => {
    if (Number.isNaN(value) || value < 0) {
      throw new Error('Цена должна быть неотрицательным числом');
    }
    const teacher = await ensureTeacher(user);
    const link = await prisma.teacherStudent.findUnique({
      where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
    });
    if (!link || link.isArchived) throw new Error('Ученик не найден у текущего преподавателя');
    const nextPrice = Math.round(value);
    const updatedLink = await prisma.teacherStudent.update({
      where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
      data: { pricePerLesson: nextPrice },
    });
    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId,
      category: 'STUDENT',
      action: 'UPDATE_PRICE',
      status: 'SUCCESS',
      source: 'USER',
      title: `Изменена цена занятия: ${nextPrice} ₽`,
      details: `Ученик: ${link.customName}`,
    });
    return updatedLink;
  };

  const adjustBalance = async (
    user: User,
    studentId: number,
    payload: { delta: number; type?: string; comment?: string; createdAt?: string },
  ) => {
    const teacher = await ensureTeacher(user);
    const link = await prisma.teacherStudent.findUnique({
      where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
      include: { student: true },
    });
    if (!link || link.isArchived) throw new Error('Student link not found');
    const delta = Number(payload.delta ?? 0);
    if (!Number.isFinite(delta)) {
      throw new Error('Некорректное значение баланса');
    }
    const nextBalance = link.balanceLessons + delta;
    const updatedLink = await prisma.teacherStudent.update({
      where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
      data: { balanceLessons: nextBalance },
    });
    if (delta !== 0) {
      const type = payload.type?.toString().trim() || (delta > 0 ? 'TOP_UP' : 'ADJUSTMENT');
      const createdAt = payload.createdAt ? new Date(payload.createdAt) : new Date();
      const resolvedDate = Number.isNaN(createdAt.getTime()) ? new Date() : createdAt;
      const comment = typeof payload.comment === 'string' && payload.comment.trim() ? payload.comment.trim() : null;
      await prisma.paymentEvent.create({
        data: {
          studentId,
          teacherId: teacher.chatId,
          lessonId: null,
          type,
          lessonsDelta: delta,
          priceSnapshot: link.pricePerLesson ?? 0,
          moneyAmount: null,
          createdAt: resolvedDate,
          createdBy: 'TEACHER',
          reason: 'BALANCE_ADJUSTMENT',
          comment,
        },
      });
    }
    return updatedLink;
  };

  const listPaymentEventsForStudent = async (
    user: User,
    studentId: number,
    options?: { filter?: string; date?: string },
  ) => {
    const teacher = await ensureTeacher(user);
    const link = await prisma.teacherStudent.findUnique({
      where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
    });

    if (!link || link.isArchived) throw new Error('Ученик не найден у текущего преподавателя');

    const filter = options?.filter ?? 'all';
    const where: Record<string, any> = {
      studentId,
      OR: [
        { teacherId: teacher.chatId },
        { teacherId: null, lesson: { teacherId: teacher.chatId } },
      ],
    };

    if (filter === 'topup') {
      where.AND = [
        {
          OR: [
            { type: { in: ['TOP_UP', 'SUBSCRIPTION', 'OTHER'] } },
            { type: 'ADJUSTMENT', lessonsDelta: { gt: 0 } },
          ],
        },
      ];
    } else if (filter === 'manual') {
      where.AND = [
        {
          OR: [{ type: 'MANUAL_PAID' }, { reason: 'BALANCE_ADJUSTMENT' }],
        },
      ];
    } else if (filter === 'charges') {
      where.AND = [
        {
          OR: [
            { type: 'AUTO_CHARGE' },
            { type: 'ADJUSTMENT', lessonsDelta: { lt: 0 } },
            { type: 'MANUAL_PAID', lessonsDelta: { lt: 0 } },
          ],
        },
      ];
    }

    if (options?.date) {
      const parsed = new Date(`${options.date}T00:00:00`);
      if (!Number.isNaN(parsed.getTime())) {
        const start = new Date(parsed);
        const end = new Date(parsed);
        end.setDate(end.getDate() + 1);
        where.createdAt = { gte: start, lt: end };
      }
    }

    const events = await prisma.paymentEvent.findMany({
      where,
      include: { lesson: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return events;
  };

  return {
    resolvePageParams,
    searchStudents,
    listStudents,
    listStudentHomeworks,
    listStudentUnpaidLessons,
    listStudentPaymentReminders,
    listStudentLessons,
    addStudent,
    updateStudent,
    archiveStudentLink,
    toggleAutoReminder,
    updateStudentPaymentReminders,
    updatePricePerLesson,
    adjustBalance,
    listPaymentEventsForStudent,
  };
};

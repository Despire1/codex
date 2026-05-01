import { addDays, endOfWeek, format } from 'date-fns';
import type { Student, User } from '@prisma/client';
import type { OnboardingReminderTemplate } from '../../../shared/lib/onboardingReminder';

type OverviewDependencies = {
  prisma: any;
  ensureTeacher: (user: User) => Promise<any>;
  resolveTimeZone: (timeZone?: string | null) => string;
  toZonedDate: (date: Date, timeZone?: string | null) => Date;
  formatInTimeZone: (date: Date, pattern: string, options?: Record<string, unknown>) => string;
  toUtcDateFromTimeZone: (dateKey: string, time: string, timeZone?: string | null) => Date;
  toUtcEndOfDay: (dateKey: string, timeZone?: string | null) => Date;
  resolveTeacherWeekendWeekdays: (teacher: any) => number[];
  filterSuppressedLessons: (tx: any, lessons: any[]) => Promise<any[]>;
  buildOnboardingReminderMessage: (params: {
    template: OnboardingReminderTemplate;
    studentName: string;
    lessonStartAt: Date;
    timeZone?: string | null;
  }) => string;
  sendStudentLessonReminderManual: (payload: {
    studentId: number;
    lessonId: number;
    text: string;
    scheduledFor: Date;
    dedupeKey: string;
  }) => Promise<{ status: 'sent' | 'skipped' | 'failed'; reason?: string; error?: string }>;
  TELEGRAM_BOT_TOKEN: string;
};

const parseDateFilter = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDedupeTimeKey = (date: Date, timeZone?: string | null) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: timeZone && timeZone.trim() ? timeZone : 'UTC',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);

export const createOverviewService = ({
  prisma,
  ensureTeacher,
  resolveTimeZone,
  toZonedDate,
  formatInTimeZone,
  toUtcDateFromTimeZone,
  toUtcEndOfDay,
  resolveTeacherWeekendWeekdays,
  filterSuppressedLessons,
  buildOnboardingReminderMessage,
  sendStudentLessonReminderManual,
  TELEGRAM_BOT_TOKEN,
}: OverviewDependencies) => {
  const bootstrap = async (
    user: User,
    filters?: {
      lessonsStart?: Date | null;
      lessonsEnd?: Date | null;
      includeHomeworks?: boolean;
      includeStudents?: boolean;
      includeLinks?: boolean;
    },
  ) => {
    const teacher = await ensureTeacher(user);
    const includeLinks = filters?.includeLinks !== false;
    const includeStudents = filters?.includeStudents !== false;
    const links = includeLinks
      ? await prisma.teacherStudent.findMany({ where: { teacherId: teacher.chatId, isArchived: false } })
      : [];
    const students = includeStudents
      ? await prisma.student.findMany({
          where: {
            teacherLinks: {
              some: {
                teacherId: teacher.chatId,
                isArchived: false,
              },
            },
          },
        })
      : [];
    const includeHomeworks = filters?.includeHomeworks !== false;
    const homeworks = includeHomeworks ? await prisma.homework.findMany({ where: { teacherId: teacher.chatId } }) : [];
    let lessons: any[] = [];
    if (filters?.lessonsStart || filters?.lessonsEnd) {
      const lessonsWhere: Record<string, any> = { teacherId: teacher.chatId, isSuppressed: false, startAt: {} };
      if (filters.lessonsStart) lessonsWhere.startAt.gte = filters.lessonsStart;
      if (filters.lessonsEnd) lessonsWhere.startAt.lte = filters.lessonsEnd;
      lessons = await prisma.lesson.findMany({
        where: lessonsWhere,
        include: {
          participants: {
            include: {
              student: true,
            },
          },
        },
      });
      lessons = await filterSuppressedLessons(prisma, lessons);
    }

    return {
      teacher: {
        ...teacher,
        weekendWeekdays: resolveTeacherWeekendWeekdays(teacher),
      },
      students,
      links,
      homeworks,
      lessons,
    };
  };

  const listLessonsForRange = async (
    user: User,
    filters: {
      start?: string | null;
      end?: string | null;
    },
  ) => {
    const teacher = await ensureTeacher(user);
    const where: Record<string, any> = { teacherId: teacher.chatId, isSuppressed: false };
    const startFrom = parseDateFilter(filters.start ?? undefined);
    const startTo = parseDateFilter(filters.end ?? undefined);
    if (startFrom || startTo) {
      where.startAt = {};
      if (startFrom) where.startAt.gte = startFrom;
      if (startTo) where.startAt.lte = startTo;
    }

    let lessons = await prisma.lesson.findMany({
      where,
      include: {
        participants: {
          include: {
            student: true,
          },
        },
      },
    });

    lessons = await filterSuppressedLessons(prisma, lessons);
    return { lessons };
  };

  const getDashboardSummary = async (user: User) => {
    const teacher = await ensureTeacher(user);
    const resolvedTimeZone = resolveTimeZone(teacher.timezone);
    const now = new Date();
    const todayZoned = toZonedDate(now, resolvedTimeZone);
    const todayKey = format(todayZoned, 'yyyy-MM-dd');
    const previousWindowStartKey = format(addDays(todayZoned, -7), 'yyyy-MM-dd');
    const previousWindowStartUtc = toUtcDateFromTimeZone(previousWindowStartKey, '00:00', resolvedTimeZone);
    const weekEndKey = format(endOfWeek(todayZoned, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const weekEndUtc = toUtcEndOfDay(weekEndKey, resolvedTimeZone);

    const resolveLessonAmountRub = (lesson: { price: number; participants: Array<{ price: number }> }) => {
      if (lesson.participants.length > 0) {
        return lesson.participants.reduce((sum, participant) => sum + Math.max(0, Number(participant.price) || 0), 0);
      }
      return Math.max(0, Number(lesson.price) || 0);
    };

    const [studentsCount, lessonsCount] = await Promise.all([
      prisma.teacherStudent.count({ where: { teacherId: teacher.chatId, isArchived: false } }),
      prisma.lesson.count({ where: { teacherId: teacher.chatId, isSuppressed: false } }),
    ]);

    let plannedLessons = await prisma.lesson.findMany({
      where: {
        teacherId: teacher.chatId,
        isSuppressed: false,
        status: { not: 'CANCELED' },
        startAt: {
          gte: previousWindowStartUtc,
          lte: weekEndUtc,
        },
      },
      include: {
        participants: {
          select: {
            studentId: true,
            price: true,
            isPaid: true,
          },
        },
      },
    });
    plannedLessons = await filterSuppressedLessons(prisma, plannedLessons);

    const plannedByDay = new Map<string, number>();
    plannedLessons.forEach((lesson) => {
      const dayKey = formatInTimeZone(lesson.startAt, 'yyyy-MM-dd', { timeZone: resolvedTimeZone });
      const amount = resolveLessonAmountRub(lesson);
      plannedByDay.set(dayKey, (plannedByDay.get(dayKey) ?? 0) + amount);
    });

    const todayPlanRub = plannedByDay.get(todayKey) ?? 0;
    const previousSevenDaysTotal = Array.from({ length: 7 }).reduce<number>((sum, _unused, index) => {
      const key = format(addDays(todayZoned, -(index + 1)), 'yyyy-MM-dd');
      return sum + (plannedByDay.get(key) ?? 0);
    }, 0);
    const previousSevenDaysAverage = previousSevenDaysTotal / 7;
    const todayPlanDeltaPercent =
      previousSevenDaysAverage > 0
        ? Math.round(((todayPlanRub - previousSevenDaysAverage) / previousSevenDaysAverage) * 100)
        : todayPlanRub > 0
          ? 100
          : 0;

    const weekScheduledRub = plannedLessons.reduce((sum, lesson) => {
      if (lesson.status !== 'SCHEDULED') return sum;
      const startMs = lesson.startAt.getTime();
      if (startMs < now.getTime() || startMs > weekEndUtc.getTime()) return sum;
      return sum + resolveLessonAmountRub(lesson);
    }, 0);

    let unpaidLessons = await prisma.lesson.findMany({
      where: {
        teacherId: teacher.chatId,
        isSuppressed: false,
        status: 'COMPLETED',
        OR: [{ isPaid: false }, { participants: { some: { isPaid: false } } }],
      },
      include: {
        participants: {
          select: {
            studentId: true,
            price: true,
            isPaid: true,
          },
        },
      },
    });
    unpaidLessons = await filterSuppressedLessons(prisma, unpaidLessons);

    let unpaidRub = 0;
    const unpaidStudentIds = new Set<number>();
    unpaidLessons.forEach((lesson) => {
      if (lesson.participants.length > 0) {
        lesson.participants.forEach((participant) => {
          if (participant.isPaid) return;
          unpaidRub += Math.max(0, Number(participant.price) || 0);
          unpaidStudentIds.add(participant.studentId);
        });
        return;
      }
      if (lesson.isPaid) return;
      unpaidRub += Math.max(0, Number(lesson.price) || 0);
      unpaidStudentIds.add(lesson.studentId);
    });

    return {
      studentsCount,
      lessonsCount,
      todayPlanRub,
      todayPlanDeltaPercent,
      unpaidRub,
      unpaidStudentsCount: unpaidStudentIds.size,
      receivableWeekRub: unpaidRub + weekScheduledRub,
      telegramConnected: Boolean(TELEGRAM_BOT_TOKEN) && teacher.studentNotificationsEnabled,
      timezone: teacher.timezone ?? null,
      teacherId: Number(teacher.chatId),
    };
  };

  const buildDailySummaryData = async (teacher: any, targetDate: Date, includeUnpaid: boolean) => {
    const resolvedTimeZone = resolveTimeZone(teacher.timezone);
    const dateKey = formatInTimeZone(targetDate, 'yyyy-MM-dd', { timeZone: resolvedTimeZone });
    const dayStart = toUtcDateFromTimeZone(dateKey, '00:00', resolvedTimeZone);
    const dayEnd = toUtcEndOfDay(dateKey, resolvedTimeZone);
    const summaryDate = toUtcDateFromTimeZone(dateKey, '12:00', resolvedTimeZone);

    let lessons = await prisma.lesson.findMany({
      where: {
        teacherId: teacher.chatId,
        isSuppressed: false,
        status: 'SCHEDULED',
        startAt: { gte: dayStart, lte: dayEnd },
      },
      include: { student: true, participants: { include: { student: true } } },
      orderBy: { startAt: 'asc' },
    });
    lessons = await filterSuppressedLessons(prisma, lessons);

    let unpaidLessons = includeUnpaid
      ? await prisma.lesson.findMany({
          where: {
            teacherId: teacher.chatId,
            isSuppressed: false,
            status: 'COMPLETED',
            isPaid: false,
            startAt: { lt: dayStart },
          },
          include: { student: true },
          orderBy: { startAt: 'asc' },
        })
      : [];
    unpaidLessons = await filterSuppressedLessons(prisma, unpaidLessons);

    const studentIds = new Set<number>();
    lessons.forEach((lesson) => {
      studentIds.add(lesson.studentId);
      lesson.participants.forEach((participant) => studentIds.add(participant.studentId));
    });
    unpaidLessons.forEach((lesson) => studentIds.add(lesson.studentId));

    const links = studentIds.size
      ? await prisma.teacherStudent.findMany({
          where: { teacherId: teacher.chatId, studentId: { in: Array.from(studentIds) } },
        })
      : [];
    const linksByStudentId = new Map<number, any>(links.map((link: any) => [link.studentId, link]));

    const resolveStudentName = (studentId: number, fallback?: string | null) => {
      const link = linksByStudentId.get(studentId);
      const customName = typeof link?.customName === 'string' ? link.customName.trim() : '';
      if (customName) return customName;
      const fallbackName = typeof fallback === 'string' ? fallback.trim() : '';
      return fallbackName || 'ученик';
    };

    const summaryLessons = lessons.map((lesson) => {
      const names = new Set<string>();
      names.add(resolveStudentName(lesson.studentId, lesson.student?.username));
      lesson.participants.forEach((participant) => {
        names.add(resolveStudentName(participant.studentId, participant.student?.username));
      });
      return {
        startAt: lesson.startAt,
        durationMinutes: lesson.durationMinutes,
        studentNames: Array.from(names),
      };
    });

    const summaryUnpaid = unpaidLessons.map((lesson) => ({
      startAt: lesson.startAt,
      studentName: resolveStudentName(lesson.studentId, lesson.student?.username),
      price: lesson.price ?? null,
    }));

    return {
      dateKey,
      summaryDate: Number.isNaN(summaryDate.getTime()) ? targetDate : summaryDate,
      lessons: summaryLessons,
      unpaidLessons: summaryUnpaid,
    };
  };

  const sendLessonReminder = async (
    user: User,
    payload: {
      lessonId: number;
      template: OnboardingReminderTemplate;
    },
  ) => {
    const teacher = await ensureTeacher(user);
    const lesson = await prisma.lesson.findUnique({
      where: { id: payload.lessonId },
      include: { student: true },
    });
    if (!lesson || lesson.teacherId !== teacher.chatId) {
      throw new Error('Урок не найден');
    }

    const link = await prisma.teacherStudent.findUnique({
      where: { teacherId_studentId: { teacherId: teacher.chatId, studentId: lesson.studentId } },
    });
    const studentName = link?.customName?.trim() || lesson.student?.username?.trim() || 'ученик';
    const text = buildOnboardingReminderMessage({
      template: payload.template,
      studentName,
      lessonStartAt: lesson.startAt,
      timeZone: teacher.timezone,
    });
    const dedupeKey = `manual_lesson_reminder_${lesson.id}_${formatDedupeTimeKey(new Date(), teacher.timezone)}`;
    const result = await sendStudentLessonReminderManual({
      studentId: lesson.studentId,
      lessonId: lesson.id,
      text,
      scheduledFor: new Date(),
      dedupeKey,
    });

    if (result.status === 'sent') return { status: 'sent' as const };
    if (result.status === 'skipped') {
      if (result.reason === 'student_not_activated') {
        throw new Error('student_not_activated');
      }
      throw new Error('reminder_skipped');
    }
    throw new Error(result.error ?? 'reminder_failed');
  };

  const listUnpaidLessons = async (user: User) => {
    const teacher = await ensureTeacher(user);
    const now = new Date();
    let lessons = await prisma.lesson.findMany({
      where: {
        teacherId: teacher.chatId,
        isSuppressed: false,
        status: { not: 'CANCELED' },
        OR: [{ status: 'COMPLETED' }, { startAt: { lt: now } }],
        AND: [{ OR: [{ isPaid: false }, { participants: { some: { isPaid: false } } }] }],
      },
      include: {
        student: true,
        participants: {
          include: {
            student: true,
          },
        },
      },
      orderBy: { startAt: 'asc' },
    });
    lessons = await filterSuppressedLessons(prisma, lessons);

    const links = await prisma.teacherStudent.findMany({ where: { teacherId: teacher.chatId } });
    const linkMap = new Map<number, any>(links.map((link: any) => [link.studentId, link]));

    const entries = lessons.flatMap((lesson) => {
      const buildEntry = (studentId: number, price: number, student?: Student | null) => {
        const link = linkMap.get(studentId);
        return {
          lessonId: lesson.id,
          startAt: lesson.startAt,
          completedAt: lesson.completedAt ?? null,
          lastPaymentReminderAt: lesson.lastPaymentReminderAt ?? null,
          paymentReminderCount: lesson.paymentReminderCount ?? 0,
          studentId,
          studentName: link?.customName ?? student?.username ?? 'Ученик',
          price,
          isActivated: student?.isActivated ?? false,
          paymentRemindersEnabled: student?.paymentRemindersEnabled ?? true,
        };
      };

      if (lesson.participants && lesson.participants.length > 0) {
        return lesson.participants
          .filter((participant) => !participant.isPaid)
          .map((participant) => buildEntry(participant.studentId, participant.price, participant.student));
      }
      if (lesson.isPaid) return [];
      return [buildEntry(lesson.studentId, lesson.price ?? 0, lesson.student)];
    });

    return { entries };
  };

  return {
    bootstrap,
    listLessonsForRange,
    getDashboardSummary,
    buildDailySummaryData,
    sendLessonReminder,
    listUnpaidLessons,
    parseDateFilter,
  };
};

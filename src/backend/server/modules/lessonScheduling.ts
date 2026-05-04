import crypto from 'node:crypto';
import { addDays, addYears, format } from 'date-fns';
import type { User } from '@prisma/client';

type LessonSchedulingDependencies = {
  prisma: any;
  ensureTeacher: (user: User) => Promise<any>;
  safeLogActivityEvent: (payload: Record<string, unknown>) => Promise<void>;
  normalizeLessonColor: (value: unknown) => string;
  resolveMeetingLinkValue: (value: unknown) => string | null | undefined;
  ensureLessonDateIsWorkingDay: (date: Date, teacher: any) => void;
  ensureRecurringWeekdaysAreWorking: (weekdays: number[], teacher: any) => void;
  resolveLessonParticipantNames: (studentIds: number[], links: any[]) => string[];
  resolveWeekdayLabels: (weekdays: number[]) => string[];
  parseWeekdays: (value: unknown) => number[];
  resolveTimeZone: (value: string | null | undefined) => string;
  toZonedDate: (value: Date | string, timeZone?: string | null) => Date;
  toUtcDateFromTimeZone: (dateLabel: string, timeLabel: string, timeZone?: string | null) => Date;
  resolveProfileLessonPrice: (link: any) => number;
  createPaymentEvent: (tx: any, payload: any) => Promise<any>;
};

export const createLessonSchedulingService = ({
  prisma,
  ensureTeacher,
  safeLogActivityEvent,
  normalizeLessonColor,
  resolveMeetingLinkValue,
  ensureLessonDateIsWorkingDay,
  ensureRecurringWeekdaysAreWorking,
  resolveLessonParticipantNames,
  resolveWeekdayLabels,
  parseWeekdays,
  resolveTimeZone,
  toZonedDate,
  toUtcDateFromTimeZone,
  resolveProfileLessonPrice,
  createPaymentEvent,
}: LessonSchedulingDependencies) => {
  const syncLessonParticipants = async (tx: any, lessonId: number, studentIds: number[]) => {
    const existingParticipants = await tx.lessonParticipant.findMany({
      where: { lessonId },
    });
    const nextIds = new Set(studentIds);
    const existingIds = new Set(existingParticipants.map((participant: any) => Number(participant.studentId)));

    const idsToDelete = existingParticipants
      .filter((participant: any) => !nextIds.has(Number(participant.studentId)))
      .map((participant: any) => Number(participant.studentId));
    const idsToCreate = studentIds.filter((studentId) => !existingIds.has(studentId));

    if (idsToDelete.length > 0) {
      await tx.lessonParticipant.deleteMany({
        where: {
          lessonId,
          studentId: { in: idsToDelete },
        },
      });
    }

    if (idsToCreate.length === 0) return;

    await tx.lessonParticipant.createMany({
      data: idsToCreate.map((studentId) => ({
        lessonId,
        studentId,
        price: 0,
        isPaid: false,
      })),
      skipDuplicates: true,
    });
  };

  const syncSeriesParticipants = async (tx: any, seriesId: number, studentIds: number[]) => {
    await tx.lessonSeriesParticipant.deleteMany({
      where: { seriesId },
    });
    if (studentIds.length === 0) return;
    await tx.lessonSeriesParticipant.createMany({
      data: studentIds.map((studentId) => ({
        seriesId,
        studentId,
        price: 0,
      })),
      skipDuplicates: true,
    });
  };

  const upsertLessonSeriesException = async (
    tx: any,
    params: {
      seriesId: number;
      lessonId?: number | null;
      originalStartAt: Date;
      kind: string;
      status?: string | null;
      overrideStartAt?: Date | null;
      overrideDurationMinutes?: number | null;
      color?: string | null;
      meetingLink?: string | null;
      participantStudentIds?: number[] | null;
    },
  ) =>
    tx.lessonSeriesException.upsert({
      where: {
        seriesId_originalStartAt: {
          seriesId: params.seriesId,
          originalStartAt: params.originalStartAt,
        },
      },
      update: {
        lessonId: params.lessonId ?? null,
        kind: params.kind,
        status: params.status ?? null,
        overrideStartAt: params.overrideStartAt ?? null,
        overrideDurationMinutes: params.overrideDurationMinutes ?? null,
        color: params.color ?? null,
        meetingLink: params.meetingLink ?? null,
        participantStudentIds: params.participantStudentIds ? JSON.stringify(params.participantStudentIds) : null,
      },
      create: {
        seriesId: params.seriesId,
        lessonId: params.lessonId ?? null,
        originalStartAt: params.originalStartAt,
        kind: params.kind,
        status: params.status ?? null,
        overrideStartAt: params.overrideStartAt ?? null,
        overrideDurationMinutes: params.overrideDurationMinutes ?? null,
        color: params.color ?? null,
        meetingLink: params.meetingLink ?? null,
        participantStudentIds: params.participantStudentIds ? JSON.stringify(params.participantStudentIds) : null,
      },
    });

  const buildRecurringOccurrences = (params: {
    rangeStartAt: Date;
    anchorStartAt: Date;
    repeatWeekdays: number[];
    repeatUntil?: Date | null;
    timeZone?: string | null;
  }) => {
    const resolvedTimeZone = resolveTimeZone(params.timeZone);
    const anchorZoned = toZonedDate(params.anchorStartAt, resolvedTimeZone);
    const rangeStartZoned = toZonedDate(params.rangeStartAt, resolvedTimeZone);
    const startCursor =
      rangeStartZoned.getTime() > anchorZoned.getTime()
        ? new Date(rangeStartZoned.getFullYear(), rangeStartZoned.getMonth(), rangeStartZoned.getDate(), 0, 0, 0, 0)
        : new Date(anchorZoned.getFullYear(), anchorZoned.getMonth(), anchorZoned.getDate(), 0, 0, 0, 0);
    const endZonedBase = params.repeatUntil
      ? toZonedDate(params.repeatUntil, resolvedTimeZone)
      : addYears(anchorZoned, 1);
    const endCursor = new Date(endZonedBase.getFullYear(), endZonedBase.getMonth(), endZonedBase.getDate(), 0, 0, 0, 0);
    const timeLabel = format(anchorZoned, 'HH:mm');
    const occurrences: Date[] = [];

    for (let cursor = startCursor; cursor <= endCursor; cursor = addDays(cursor, 1)) {
      if (!params.repeatWeekdays.includes(cursor.getDay())) continue;
      const dateLabel = format(cursor, 'yyyy-MM-dd');
      const occurrence = toUtcDateFromTimeZone(dateLabel, timeLabel, resolvedTimeZone);
      if (Number.isNaN(occurrence.getTime())) continue;
      if (occurrence.getTime() < params.rangeStartAt.getTime()) continue;
      occurrences.push(occurrence);
      if (occurrences.length >= 500) break;
    }

    return occurrences;
  };

  const markLessonPaidAtCreation = async (
    tx: any,
    params: {
      teacherId: bigint;
      lesson: {
        id: number;
        studentId: number;
      };
      studentIds: number[];
      links: any[];
    },
  ) => {
    const linksByStudentId = new Map<number, any>(params.links.map((link: any) => [Number(link.studentId), link]));

    for (const studentId of params.studentIds) {
      const link = linksByStudentId.get(studentId);
      if (!link) continue;
      const amount = resolveProfileLessonPrice(link);

      await tx.lessonParticipant.update({
        where: {
          lessonId_studentId: {
            lessonId: params.lesson.id,
            studentId,
          },
        },
        data: {
          isPaid: true,
          price: amount,
        },
      });

      await tx.payment.create({
        data: {
          lessonId: params.lesson.id,
          teacherStudentId: link.id,
          amount,
          paidAt: new Date(),
          comment: null,
        },
      });

      await createPaymentEvent(tx, {
        studentId,
        teacherId: params.teacherId,
        lessonId: params.lesson.id,
        type: 'MANUAL_PAID',
        lessonsDelta: 0,
        priceSnapshot: amount,
        moneyAmount: amount,
        createdBy: 'TEACHER',
        reason: null,
      });
    }

    const participants = await tx.lessonParticipant.findMany({
      where: { lessonId: params.lesson.id },
      include: { student: true },
    });
    const primaryParticipant = participants.find(
      (participant: any) => participant.studentId === params.lesson.studentId,
    );
    const primaryPaid = Boolean(primaryParticipant?.isPaid);

    return tx.lesson.update({
      where: { id: params.lesson.id },
      data: {
        isPaid: participants.length > 0 ? participants.every((participant: any) => participant.isPaid) : false,
        price: primaryParticipant?.price ?? 0,
        paidAt: new Date(),
        paymentStatus: primaryPaid ? 'PAID' : 'UNPAID',
        paidSource: primaryPaid ? 'MANUAL' : 'NONE',
      },
      include: {
        participants: {
          include: { student: true },
        },
      },
    });
  };

  const createLessonSeriesRecord = async (
    tx: any,
    params: {
      teacherId: bigint;
      timeZone?: string | null;
      groupKey?: string;
      anchorStartAt: Date;
      durationMinutes: number;
      recurrenceWeekdays: number[];
      recurrenceUntil?: Date | null;
      color?: string | null;
      meetingLink?: string | null;
      studentIds: number[];
    },
  ) => {
    const groupKey = params.groupKey ?? crypto.randomUUID();
    const series = await tx.lessonSeries.create({
      data: {
        teacherId: params.teacherId,
        groupKey,
        timeZone: resolveTimeZone(params.timeZone),
        anchorStartAt: params.anchorStartAt,
        durationMinutes: params.durationMinutes,
        recurrenceWeekdays: JSON.stringify(params.recurrenceWeekdays),
        recurrenceUntil: params.recurrenceUntil ?? null,
        color: params.color ?? 'blue',
        meetingLink: params.meetingLink ?? null,
        status: 'ACTIVE',
      },
    });
    await syncSeriesParticipants(tx, series.id, params.studentIds);
    return series;
  };

  const createSeriesLesson = async (
    tx: any,
    params: {
      teacherId: bigint;
      series: any;
      startAt: Date;
      durationMinutes: number;
      studentIds: number[];
      color?: string | null;
      meetingLink?: string | null;
      status?: string;
    },
  ) => {
    const lesson = await tx.lesson.create({
      data: {
        teacherId: params.teacherId,
        studentId: params.studentIds[0],
        seriesId: params.series.id,
        seriesOriginalStartAt: params.startAt,
        price: 0,
        color: params.color ?? params.series.color ?? 'blue',
        meetingLink: params.meetingLink ?? params.series.meetingLink ?? null,
        startAt: params.startAt,
        durationMinutes: params.durationMinutes,
        status: params.status ?? 'SCHEDULED',
        isPaid: false,
        isRecurring: true,
        recurrenceUntil: params.series.recurrenceUntil ?? null,
        recurrenceGroupId: params.series.groupKey,
        recurrenceWeekdays: params.series.recurrenceWeekdays,
      },
      include: {
        participants: {
          include: {
            student: true,
          },
        },
      },
    });
    await syncLessonParticipants(tx, lesson.id, params.studentIds);
    return tx.lesson.findUnique({
      where: { id: lesson.id },
      include: {
        participants: {
          include: {
            student: true,
          },
        },
      },
    });
  };

  const updateLessonWithParticipants = async (
    tx: any,
    params: {
      lessonId: number;
      seriesId?: number | null;
      seriesOriginalStartAt?: Date | null;
      studentIds: number[];
      startAt: Date;
      durationMinutes: number;
      color?: string | null;
      meetingLink?: string | null;
      isRecurring?: boolean;
      recurrenceUntil?: Date | null;
      recurrenceGroupId?: string | null;
      recurrenceWeekdays?: string | null;
    },
  ) => {
    await syncLessonParticipants(tx, params.lessonId, params.studentIds);
    return tx.lesson.update({
      where: { id: params.lessonId },
      data: {
        studentId: params.studentIds[0],
        seriesId: params.seriesId ?? null,
        seriesOriginalStartAt: params.seriesOriginalStartAt ?? null,
        color: params.color ?? 'blue',
        meetingLink: params.meetingLink ?? null,
        startAt: params.startAt,
        durationMinutes: params.durationMinutes,
        isRecurring: Boolean(params.isRecurring),
        recurrenceUntil: params.recurrenceUntil ?? null,
        recurrenceGroupId: params.recurrenceGroupId ?? null,
        recurrenceWeekdays: params.recurrenceWeekdays ?? null,
      },
      include: {
        participants: {
          include: {
            student: true,
          },
        },
      },
    });
  };

  const validateLessonPayload = async (user: User, body: any) => {
    const { studentId, studentIds, durationMinutes } = body ?? {};
    const ids =
      studentIds && Array.isArray(studentIds) && studentIds.length > 0
        ? studentIds.map((id: any) => Number(id))
        : studentId
          ? [Number(studentId)]
          : [];

    if (ids.length === 0) throw new Error('Выберите хотя бы одного ученика');
    if (!durationMinutes) throw new Error('Заполните длительность');
    const durationValue = Number(durationMinutes);
    if (!Number.isFinite(durationValue) || durationValue <= 0) {
      throw new Error('Длительность должна быть больше нуля');
    }

    const teacher = await ensureTeacher(user);
    const links = await prisma.teacherStudent.findMany({
      where: {
        teacherId: teacher.chatId,
        studentId: { in: ids },
        isArchived: false,
      },
    });

    if (links.length !== ids.length) {
      throw new Error('Некоторые ученики не найдены у текущего преподавателя');
    }

    return { teacher, durationValue, studentIds: ids };
  };

  const createLesson = async (user: User, body: any) => {
    const { startAt } = body ?? {};
    if (!startAt) throw new Error('Заполните дату и время урока');
    const { teacher, durationValue, studentIds } = await validateLessonPayload(user, body);
    const lessonColor = normalizeLessonColor(body?.color);
    const meetingLink = resolveMeetingLinkValue(body?.meetingLink);
    const startDate = new Date(startAt);
    if (Number.isNaN(startDate.getTime())) throw new Error('Некорректная дата урока');
    if (!body?.allowWeekend) ensureLessonDateIsWorkingDay(startDate, teacher);

    const links = await prisma.teacherStudent.findMany({
      where: { teacherId: teacher.chatId, studentId: { in: studentIds }, isArchived: false },
      include: { student: true },
    });
    const markPaid = Boolean(body?.isPaid || body?.markPaid);
    const participantNames = resolveLessonParticipantNames(studentIds, links);

    const lesson = await prisma.$transaction(async (tx: any) => {
      const createdLesson = await tx.lesson.create({
        data: {
          teacherId: teacher.chatId,
          studentId: studentIds[0],
          price: 0,
          color: lessonColor,
          meetingLink: meetingLink ?? null,
          startAt: startDate,
          durationMinutes: durationValue,
          status: 'SCHEDULED',
          isPaid: false,
          participants: {
            create: studentIds.map((id) => ({
              studentId: id,
              price: 0,
              isPaid: false,
            })),
          },
        },
        include: {
          participants: {
            include: {
              student: true,
            },
          },
        },
      });

      if (!markPaid) {
        return createdLesson;
      }

      return markLessonPaidAtCreation(tx, {
        teacherId: teacher.chatId,
        lesson: createdLesson,
        studentIds,
        links,
      });
    });

    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId: lesson.studentId,
      lessonId: lesson.id,
      category: 'LESSON',
      action: 'CREATE',
      status: 'SUCCESS',
      source: 'USER',
      title: 'Создано занятие',
      payload: {
        lessonStartAt: lesson.startAt.toISOString(),
        durationMinutes: lesson.durationMinutes,
        studentIds,
        studentNames: participantNames,
        isPaidAtCreation: markPaid,
      },
    });

    return lesson;
  };

  const createRecurringLessons = async (user: User, body: any) => {
    const { startAt, repeatWeekdays, repeatUntil } = body ?? {};
    if (!startAt) throw new Error('Заполните дату и время урока');
    const weekdays: number[] = parseWeekdays(repeatWeekdays);
    if (weekdays.length === 0) throw new Error('Выберите дни недели для повтора');

    const startDate = new Date(startAt);
    if (Number.isNaN(startDate.getTime())) throw new Error('Некорректная дата начала');
    const seriesStart = startDate;

    const { teacher, durationValue, studentIds } = await validateLessonPayload(user, body);
    ensureLessonDateIsWorkingDay(seriesStart, teacher);
    ensureRecurringWeekdaysAreWorking(weekdays, teacher);
    const lessonColor = normalizeLessonColor(body?.color);
    const meetingLink = resolveMeetingLinkValue(body?.meetingLink);

    const links = await prisma.teacherStudent.findMany({
      where: { teacherId: teacher.chatId, studentId: { in: studentIds }, isArchived: false },
      include: { student: true },
    });
    const markPaid = Boolean(body?.isPaid || body?.markPaid);
    const participantNames = resolveLessonParticipantNames(studentIds, links);

    const maxEndDate = addYears(seriesStart, 1);
    const requestedEndDate = repeatUntil ? new Date(repeatUntil) : null;
    const endDate =
      requestedEndDate && !Number.isNaN(requestedEndDate.getTime())
        ? requestedEndDate > maxEndDate
          ? maxEndDate
          : requestedEndDate
        : maxEndDate;

    if (endDate < seriesStart) {
      throw new Error('Дата окончания повтора должна быть не раньше даты начала');
    }
    const occurrences = buildRecurringOccurrences({
      rangeStartAt: seriesStart,
      anchorStartAt: startDate,
      repeatWeekdays: weekdays,
      repeatUntil: endDate,
      timeZone: teacher.timezone,
    });

    if (occurrences.length === 0) throw new Error('Не найдено подходящих дат для создания повторов');

    const existingLessons = await prisma.lesson.findMany({
      where: {
        teacherId: teacher.chatId,
        isSuppressed: false,
        startAt: {
          gte: seriesStart,
          lte: endDate,
        },
      },
    });

    const existingStartAt = new Set(existingLessons.map((lesson: any) => lesson.startAt.toISOString()));
    const slotsToCreate = occurrences.filter((date) => !existingStartAt.has(date.toISOString()));

    if (slotsToCreate.length === 0) {
      throw new Error('Все выбранные даты уже заняты или запланированы');
    }

    const created = await prisma.$transaction(async (tx: any) => {
      const series = await createLessonSeriesRecord(tx, {
        teacherId: teacher.chatId,
        timeZone: teacher.timezone,
        anchorStartAt: startDate,
        durationMinutes: durationValue,
        recurrenceWeekdays: weekdays,
        recurrenceUntil: endDate,
        color: lessonColor,
        meetingLink,
        studentIds,
      });
      const createdLessons: any[] = [];

      for (const date of slotsToCreate) {
        const lesson = await createSeriesLesson(tx, {
          teacherId: teacher.chatId,
          series,
          startAt: date,
          durationMinutes: durationValue,
          studentIds,
          color: lessonColor,
          meetingLink,
        });

        if (!lesson) continue;

        if (markPaid) {
          const updatedLesson = await markLessonPaidAtCreation(tx, {
            teacherId: teacher.chatId,
            lesson,
            studentIds,
            links,
          });
          createdLessons.push(updatedLesson);
        } else {
          createdLessons.push(lesson);
        }
      }

      return { lessons: createdLessons, series };
    });

    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId: studentIds[0] ?? null,
      category: 'LESSON',
      action: 'CREATE_RECURRING',
      status: 'SUCCESS',
      source: 'USER',
      title: 'Создана серия занятий',
      payload: {
        recurrenceGroupId: created.series.groupKey,
        lessonSeriesId: created.series.id,
        lessonStartAt: seriesStart.toISOString(),
        createdCount: created.lessons.length,
        repeatWeekdays: weekdays,
        repeatWeekdayLabels: resolveWeekdayLabels(weekdays),
        repeatUntil: endDate.toISOString(),
        studentIds,
        studentNames: participantNames,
        isPaidAtCreation: markPaid,
      },
    });

    return created.lessons;
  };

  return {
    buildRecurringOccurrences,
    syncLessonParticipants,
    syncSeriesParticipants,
    upsertLessonSeriesException,
    markLessonPaidAtCreation,
    createLessonSeriesRecord,
    createSeriesLesson,
    updateLessonWithParticipants,
    createLesson,
    createRecurringLessons,
  };
};

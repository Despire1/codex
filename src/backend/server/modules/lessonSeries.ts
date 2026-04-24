import { addYears } from 'date-fns';
import type { LessonMutationAction, LessonSeriesScope } from '../../../entities/types';

type LessonSeriesDependencies = {
  prisma: any;
  resolveTimeZone: (value: string | null | undefined) => string;
  parseWeekdays: (value: unknown) => number[];
  filterSuppressedLessons: (tx: any, lessons: any[]) => Promise<any[]>;
  syncSeriesParticipants: (tx: any, seriesId: number, studentIds: number[]) => Promise<void>;
  upsertLessonSeriesException: (tx: any, params: Record<string, unknown>) => Promise<any>;
  createLessonSeriesRecord: (tx: any, params: Record<string, unknown>) => Promise<any>;
  createSeriesLesson: (tx: any, params: Record<string, unknown>) => Promise<any>;
  updateLessonWithParticipants: (tx: any, params: Record<string, unknown>) => Promise<any>;
  buildRecurringOccurrences: (params: {
    rangeStartAt: Date;
    anchorStartAt: Date;
    repeatWeekdays: number[];
    repeatUntil?: Date | null;
    timeZone?: string | null;
  }) => Date[];
  applyLessonCancelStatus: (
    tx: any,
    teacher: { chatId: bigint },
    lessonId: number,
    refundMode?: 'RETURN_TO_BALANCE' | 'KEEP_AS_PAID',
  ) => Promise<any>;
  toZonedDate: (value: Date | string, timeZone?: string | null) => Date;
  lessonSeriesHistoryLockMessage: string;
  lessonSeriesNoEditableTailMessage: string;
  lessonSeriesProtectedInsideTailMessage: string;
};

export const createLessonSeriesService = ({
  resolveTimeZone,
  parseWeekdays,
  filterSuppressedLessons,
  syncSeriesParticipants,
  upsertLessonSeriesException,
  createLessonSeriesRecord,
  createSeriesLesson,
  updateLessonWithParticipants,
  buildRecurringOccurrences,
  applyLessonCancelStatus,
  toZonedDate,
  lessonSeriesHistoryLockMessage,
  lessonSeriesNoEditableTailMessage,
  lessonSeriesProtectedInsideTailMessage,
}: LessonSeriesDependencies) => {
  const getLessonOriginalStartAt = (lesson: {
    startAt: Date | string;
    seriesOriginalStartAt?: Date | string | null;
  }) => new Date(lesson.seriesOriginalStartAt ?? lesson.startAt);

  const isLessonFullyPaid = (lesson: {
    isPaid?: boolean;
    participants?: Array<{ isPaid?: boolean | null }>;
  }) => {
    if (lesson.participants && lesson.participants.length > 0) {
      return lesson.participants.every((participant) => Boolean(participant?.isPaid));
    }
    return Boolean(lesson.isPaid);
  };

  const hasLessonPaidParticipant = (lesson: {
    isPaid?: boolean;
    participants?: Array<{ isPaid?: boolean | null }>;
  }) => {
    if (lesson.participants && lesson.participants.length > 0) {
      return lesson.participants.some((participant) => Boolean(participant?.isPaid));
    }
    return Boolean(lesson.isPaid);
  };

  const isImmutableLessonForRecurringMutation = (
    lesson: {
      id?: number;
      status?: string;
      isPaid?: boolean;
      participants?: Array<{ isPaid?: boolean | null }>;
    },
    protectedLessonIds?: Set<number>,
  ) =>
    lesson.status === 'COMPLETED' ||
    isLessonFullyPaid(lesson) ||
    (typeof lesson.id === 'number' && protectedLessonIds?.has(lesson.id));

  const findLessonIdsWithProtectedDependents = async (tx: any, lessonIds: number[]) => {
    if (lessonIds.length === 0) return new Set<number>();
    const [payments, paymentEvents, homeworkAssignments, notifications] = await Promise.all([
      tx.payment.findMany({
        where: { lessonId: { in: lessonIds } },
        select: { lessonId: true },
      }),
      tx.paymentEvent.findMany({
        where: { lessonId: { in: lessonIds } },
        select: { lessonId: true },
      }),
      tx.homeworkAssignment.findMany({
        where: { lessonId: { in: lessonIds } },
        select: { lessonId: true },
      }),
      tx.notificationLog.findMany({
        where: { lessonId: { in: lessonIds } },
        select: { lessonId: true },
      }),
    ]);

    return new Set<number>(
      [...payments, ...paymentEvents, ...homeworkAssignments, ...notifications]
        .map((item: { lessonId: number | null }) => item.lessonId)
        .filter((lessonId): lessonId is number => typeof lessonId === 'number'),
    );
  };

  const findLessonIdsWithHardDependents = async (tx: any, lessonIds: number[]) => {
    if (lessonIds.length === 0) return new Set<number>();
    const [homeworkAssignments, notifications] = await Promise.all([
      tx.homeworkAssignment.findMany({
        where: { lessonId: { in: lessonIds } },
        select: { lessonId: true },
      }),
      tx.notificationLog.findMany({
        where: { lessonId: { in: lessonIds } },
        select: { lessonId: true },
      }),
    ]);

    return new Set<number>(
      [...homeworkAssignments, ...notifications]
        .map((item: { lessonId: number | null }) => item.lessonId)
        .filter((lessonId): lessonId is number => typeof lessonId === 'number'),
    );
  };

  const resolveHistoryBoundLessonIds = async (
    tx: any,
    lessons: Array<{
      id: number;
      status?: string;
      isPaid?: boolean;
      participants?: Array<{ isPaid?: boolean | null }>;
    }>,
  ) => {
    const protectedLessonIds = await findLessonIdsWithProtectedDependents(
      tx,
      lessons.map((lesson) => lesson.id),
    );
    return new Set<number>(
      lessons
        .filter((lesson) => isImmutableLessonForRecurringMutation(lesson, protectedLessonIds))
        .map((lesson) => lesson.id),
    );
  };

  const isHistoryBoundLesson = async (
    tx: any,
    lesson: {
      id: number;
      status?: string;
      isPaid?: boolean;
      participants?: Array<{ isPaid?: boolean | null }>;
    },
  ) => {
    if (lesson.status === 'COMPLETED' || isLessonFullyPaid(lesson)) {
      return true;
    }
    return (await findLessonIdsWithProtectedDependents(tx, [lesson.id])).has(lesson.id);
  };

  const shiftWeekdays = (weekdays: number[], deltaDays: number) =>
    Array.from(new Set(weekdays.map((day) => ((day + deltaDays) % 7 + 7) % 7))).sort(
      (left, right) => left - right,
    );

  const buildLessonMutationPreview = (
    action: LessonMutationAction,
    scope: LessonSeriesScope,
    lessons: Array<{
      startAt: Date;
      status: string;
      isPaid?: boolean;
      participants?: Array<{ isPaid?: boolean | null }>;
    }>,
    options?: {
      historyUntouched?: boolean;
      isBlocked?: boolean;
      blockReason?: string | null;
      resolution?: 'warning' | 'requiresPaymentReset' | null;
      resolutionReason?: string | null;
      skippedProtectedCount?: number;
      effectiveDateFrom?: Date | null;
    },
  ) => {
    const sortedLessons = [...lessons].sort((left, right) => left.startAt.getTime() - right.startAt.getTime());
    return {
      preview: {
        action,
        scope,
        affectedCount: sortedLessons.length,
        scheduledCount: sortedLessons.filter((lesson) => lesson.status === 'SCHEDULED').length,
        canceledCount: sortedLessons.filter((lesson) => lesson.status === 'CANCELED').length,
        completedCount: sortedLessons.filter((lesson) => lesson.status === 'COMPLETED').length,
        paidCount: sortedLessons.filter((lesson) => hasLessonPaidParticipant(lesson)).length,
        historyUntouched: options?.historyUntouched ?? true,
        isBlocked: options?.isBlocked ?? false,
        blockReason: options?.blockReason ?? null,
        resolution: options?.resolution ?? null,
        resolutionReason: options?.resolutionReason ?? null,
        skippedProtectedCount: options?.skippedProtectedCount ?? 0,
        effectiveDateFrom: options?.effectiveDateFrom?.toISOString() ?? null,
        dateFrom: sortedLessons[0]?.startAt?.toISOString() ?? null,
        dateTo: sortedLessons[sortedLessons.length - 1]?.startAt?.toISOString() ?? null,
      },
    };
  };

  const resolveRecurringEditableLessons = async (
    tx: any,
    lessons: Array<{
      id: number;
      startAt: Date;
      status?: string;
      isPaid?: boolean;
      participants?: Array<{ isPaid?: boolean | null }>;
    }>,
  ) => {
    const historyBoundLessonIds = await resolveHistoryBoundLessonIds(tx, lessons as any);
    if (historyBoundLessonIds.size === 0) {
      return {
        lessons,
        historyBoundLessonIds,
        skippedProtectedCount: 0,
        effectiveDateFrom: lessons[0]?.startAt ?? null,
        isBlocked: false,
        blockReason: null,
      };
    }

    const firstEditableIndex = lessons.findIndex((lesson) => !historyBoundLessonIds.has(lesson.id));
    if (firstEditableIndex === -1) {
      return {
        lessons: [] as typeof lessons,
        historyBoundLessonIds,
        skippedProtectedCount: lessons.length,
        effectiveDateFrom: null,
        isBlocked: true,
        blockReason: lessonSeriesNoEditableTailMessage,
      };
    }

    const editableLessons = lessons.slice(firstEditableIndex);
    const hasProtectedInsideEditable = editableLessons.some((lesson) => historyBoundLessonIds.has(lesson.id));
    if (hasProtectedInsideEditable) {
      return {
        lessons: [] as typeof lessons,
        historyBoundLessonIds,
        skippedProtectedCount: firstEditableIndex,
        effectiveDateFrom: null,
        isBlocked: true,
        blockReason: lessonSeriesProtectedInsideTailMessage,
      };
    }

    return {
      lessons: editableLessons,
      historyBoundLessonIds,
      skippedProtectedCount: firstEditableIndex,
      effectiveDateFrom: editableLessons[0]?.startAt ?? null,
      isBlocked: false,
      blockReason: null,
    };
  };

  const lessonHasProtectedDependents = async (tx: any, lessonId: number) =>
    (await findLessonIdsWithProtectedDependents(tx, [lessonId])).has(lessonId);

  const suppressLessonInstance = async (
    tx: any,
    lesson: {
      id: number;
      seriesId?: number | null;
      startAt: Date;
      seriesOriginalStartAt?: Date | null;
    },
  ) => {
    const originalStartAt = getLessonOriginalStartAt(lesson);
    if (lesson.seriesId) {
      await upsertLessonSeriesException(tx, {
        seriesId: lesson.seriesId,
        lessonId: lesson.id,
        originalStartAt,
        kind: 'DELETE',
      });
    }
    if (await isHistoryBoundLesson(tx, lesson)) {
      await tx.lesson.update({
        where: { id: lesson.id },
        data: { status: 'CANCELED', isSuppressed: true },
      });
      return { deleted: false };
    }
    await tx.lesson.delete({
      where: { id: lesson.id },
    });
    return { deleted: true };
  };

  const deleteLessonInstance = async (
    tx: any,
    teacher: { chatId: bigint },
    lesson: {
      id: number;
      seriesId?: number | null;
      startAt: Date;
      status?: string;
      isPaid?: boolean;
      seriesOriginalStartAt?: Date | null;
      participants?: Array<{ isPaid?: boolean | null }>;
    },
    refundMode: 'RETURN_TO_BALANCE' | 'KEEP_AS_PAID' = 'RETURN_TO_BALANCE',
  ) => {
    const originalStartAt = getLessonOriginalStartAt(lesson);
    if (lesson.seriesId) {
      await upsertLessonSeriesException(tx, {
        seriesId: lesson.seriesId,
        lessonId: lesson.id,
        originalStartAt,
        kind: 'DELETE',
      });
    }

    const shouldSuppress = hasLessonPaidParticipant(lesson) || (await isHistoryBoundLesson(tx, lesson));
    if (shouldSuppress) {
      const result = await applyLessonCancelStatus(tx, teacher, lesson.id, refundMode);
      await tx.lesson.update({
        where: { id: lesson.id },
        data: { isSuppressed: true },
      });
      return { deleted: false, links: result.links };
    }

    await tx.lesson.delete({
      where: { id: lesson.id },
    });
    return { deleted: true, links: [] as any[] };
  };

  const ensureLessonSeriesMetadata = async (
    tx: any,
    teacher: { chatId: bigint; timezone?: string | null },
    lesson: any,
  ) => {
    if (!lesson?.isRecurring || !lesson?.recurrenceGroupId) return null;

    let series = lesson.seriesId
      ? await tx.lessonSeries.findUnique({
          where: { id: lesson.seriesId },
        })
      : null;

    if (!series) {
      series = await tx.lessonSeries.findUnique({
        where: { groupKey: lesson.recurrenceGroupId },
      });
    }

    const recurringLessons = await tx.lesson.findMany({
      where: {
        teacherId: teacher.chatId,
        recurrenceGroupId: lesson.recurrenceGroupId,
      },
      include: {
        participants: true,
      },
      orderBy: {
        startAt: 'asc',
      },
    });

    const anchorLesson = recurringLessons[0] ?? lesson;
    const participantIds =
      anchorLesson.participants?.map((participant: any) => Number(participant.studentId)) ?? [lesson.studentId];

    if (!series) {
      try {
        series = await tx.lessonSeries.create({
          data: {
            teacherId: teacher.chatId,
            groupKey: lesson.recurrenceGroupId,
            timeZone: resolveTimeZone(teacher.timezone),
            anchorStartAt: anchorLesson.startAt,
            durationMinutes: anchorLesson.durationMinutes,
            recurrenceWeekdays:
              typeof anchorLesson.recurrenceWeekdays === 'string'
                ? anchorLesson.recurrenceWeekdays
                : JSON.stringify(parseWeekdays(anchorLesson.recurrenceWeekdays)),
            recurrenceUntil: anchorLesson.recurrenceUntil ?? null,
            color: anchorLesson.color ?? 'blue',
            meetingLink: anchorLesson.meetingLink ?? null,
            status: 'ACTIVE',
          },
        });
        await syncSeriesParticipants(tx, series.id, participantIds);
      } catch (error) {
        const prismaError = error as { code?: string; message?: string; meta?: { target?: unknown } } | null;
        const uniqueTarget = prismaError?.meta?.target;
        const isGroupKeyConflict =
          prismaError?.code === 'P2002' &&
          (Array.isArray(uniqueTarget)
            ? uniqueTarget.includes('groupKey')
            : typeof prismaError?.message === 'string' && prismaError.message.includes('groupKey'));

        if (!isGroupKeyConflict) {
          throw error;
        }

        series = await tx.lessonSeries.findUnique({
          where: { groupKey: lesson.recurrenceGroupId },
        });

        if (!series) {
          throw error;
        }
      }
    } else {
      const existingParticipants = await tx.lessonSeriesParticipant.findMany({
        where: { seriesId: series.id },
      });
      if (existingParticipants.length === 0) {
        await syncSeriesParticipants(tx, series.id, participantIds);
      }
    }

    for (const recurringLesson of recurringLessons) {
      const nextOriginalStartAt = getLessonOriginalStartAt(recurringLesson);
      if (recurringLesson.seriesId === series.id && recurringLesson.seriesOriginalStartAt) continue;
      await tx.lesson.update({
        where: { id: recurringLesson.id },
        data: {
          seriesId: series.id,
          seriesOriginalStartAt: nextOriginalStartAt,
        },
      });
    }

    return series;
  };

  const loadScopedLessonTargets = async (
    tx: any,
    teacher: { chatId: bigint; timezone?: string | null },
    lessonId: number,
    scope: LessonSeriesScope,
  ) => {
    const lesson = await tx.lesson.findUnique({
      where: { id: lessonId },
      include: {
        participants: {
          include: {
            student: true,
          },
        },
      },
    });
    if (!lesson || lesson.teacherId !== teacher.chatId) {
      throw new Error('Урок не найден');
    }

    const series = await ensureLessonSeriesMetadata(tx, teacher, lesson);
    if (!series) {
      return { lesson, series: null, lessons: [lesson] };
    }

    const thresholdTime = getLessonOriginalStartAt(lesson).getTime();
    const lessons = await tx.lesson.findMany({
      where: {
        teacherId: teacher.chatId,
        OR: [{ seriesId: series.id }, { recurrenceGroupId: series.groupKey }],
      },
      include: {
        participants: {
          include: {
            student: true,
          },
        },
      },
      orderBy: {
        startAt: 'asc',
      },
    });
    const visibleLessons = await filterSuppressedLessons(tx, lessons);

    const filtered =
      scope === 'SINGLE'
        ? visibleLessons.filter((item: any) => item.id === lesson.id)
        : visibleLessons.filter((item: any) => getLessonOriginalStartAt(item).getTime() >= thresholdTime);

    return { lesson, series, lessons: filtered };
  };

  const mutateRecurringLessons = async (
    tx: any,
    params: {
      teacher: { chatId: bigint; timezone?: string | null };
      lessonId: number;
      scope: LessonSeriesScope;
      studentIds: number[];
      startAt: Date;
      durationMinutes: number;
      color: string;
      meetingLink: string | null;
      repeatWeekdays?: number[] | null;
      repeatUntil?: Date | null;
    },
  ) => {
    const scoped = await loadScopedLessonTargets(tx, params.teacher, params.lessonId, params.scope);
    const { lesson: selectedLesson, series, lessons: scopedLessons } = scoped;
    if (!series) {
      throw new Error('Серия занятий не найдена');
    }

    const editableTail =
      params.scope === 'SINGLE'
        ? {
            lessons: [selectedLesson] as typeof scopedLessons,
            skippedProtectedCount: 0,
            effectiveDateFrom: selectedLesson.startAt,
            isBlocked: false,
            blockReason: null,
          }
        : await resolveRecurringEditableLessons(tx, scopedLessons as any);

    if (editableTail.isBlocked) {
      throw new Error(editableTail.blockReason ?? lessonSeriesHistoryLockMessage);
    }

    const targetLessons = params.scope === 'SINGLE' ? scopedLessons : editableTail.lessons;
    if (targetLessons.length === 0) {
      throw new Error(lessonSeriesNoEditableTailMessage);
    }

    const oldWeekdays = parseWeekdays(series.recurrenceWeekdays);
    const selectedOldStartZoned = toZonedDate(selectedLesson.startAt, series.timeZone);
    const selectedNewStartZoned = toZonedDate(params.startAt, series.timeZone);
    const weekdayDelta = selectedNewStartZoned.getDay() - selectedOldStartZoned.getDay();
    const repeatChanged = Array.isArray(params.repeatWeekdays) || params.repeatUntil !== undefined;
    const resolvedWeekdays =
      Array.isArray(params.repeatWeekdays) && params.repeatWeekdays.length > 0
        ? params.repeatWeekdays
        : shiftWeekdays(oldWeekdays.length > 0 ? oldWeekdays : [selectedOldStartZoned.getDay()], weekdayDelta);
    const recurrenceWeekdaysValue = JSON.stringify(resolvedWeekdays);
    const selectedDeltaMs = params.startAt.getTime() - selectedLesson.startAt.getTime();
    const splitAnchorLesson = params.scope === 'SINGLE' ? selectedLesson : targetLessons[0];
    const scopeAnchorStartAt =
      params.scope === 'SINGLE'
        ? params.startAt
        : new Date(splitAnchorLesson.startAt.getTime() + selectedDeltaMs);
    const resolvedUntil =
      params.repeatUntil === undefined
        ? series.recurrenceUntil ?? addYears(scopeAnchorStartAt, 1)
        : params.repeatUntil ?? null;

    if (params.scope === 'SINGLE') {
      if (repeatChanged) {
        const updated = await updateLessonWithParticipants(tx, {
          lessonId: selectedLesson.id,
          studentIds: params.studentIds,
          startAt: params.startAt,
          durationMinutes: params.durationMinutes,
          color: params.color,
          meetingLink: params.meetingLink,
          isRecurring: false,
          recurrenceUntil: null,
          recurrenceGroupId: null,
          recurrenceWeekdays: null,
        });
        await upsertLessonSeriesException(tx, {
          seriesId: series.id,
          lessonId: selectedLesson.id,
          originalStartAt: getLessonOriginalStartAt(selectedLesson),
          kind: 'DETACH',
          overrideStartAt: params.startAt,
          overrideDurationMinutes: params.durationMinutes,
          color: params.color,
          meetingLink: params.meetingLink,
          participantStudentIds: params.studentIds,
        });
        return updated;
      }

      const updated = await updateLessonWithParticipants(tx, {
        lessonId: selectedLesson.id,
        seriesId: series.id,
        seriesOriginalStartAt: getLessonOriginalStartAt(selectedLesson),
        studentIds: params.studentIds,
        startAt: params.startAt,
        durationMinutes: params.durationMinutes,
        color: params.color,
        meetingLink: params.meetingLink,
        isRecurring: true,
        recurrenceUntil: series.recurrenceUntil ?? null,
        recurrenceGroupId: series.groupKey,
        recurrenceWeekdays: series.recurrenceWeekdays,
      });
      await upsertLessonSeriesException(tx, {
        seriesId: series.id,
        lessonId: selectedLesson.id,
        originalStartAt: getLessonOriginalStartAt(selectedLesson),
        kind: 'EDIT',
        status: updated.status,
        overrideStartAt: params.startAt,
        overrideDurationMinutes: params.durationMinutes,
        color: params.color,
        meetingLink: params.meetingLink,
        participantStudentIds: params.studentIds,
      });
      return updated;
    }

    const targetSeries = await createLessonSeriesRecord(tx, {
      teacherId: params.teacher.chatId,
      timeZone: series.timeZone,
      anchorStartAt: scopeAnchorStartAt,
      durationMinutes: params.durationMinutes,
      recurrenceWeekdays: resolvedWeekdays,
      recurrenceUntil: resolvedUntil,
      color: params.color,
      meetingLink: params.meetingLink,
      studentIds: params.studentIds,
    });

    await tx.lessonSeries.update({
      where: { id: series.id },
      data: {
        recurrenceUntil: new Date(getLessonOriginalStartAt(splitAnchorLesson).getTime() - 1),
      },
    });

    await syncSeriesParticipants(tx, targetSeries.id, params.studentIds);

    if (!repeatChanged) {
      const updatedLessons: any[] = [];
      for (const targetLesson of targetLessons) {
        const nextStartAt = new Date(targetLesson.startAt.getTime() + selectedDeltaMs);
        const updated = await updateLessonWithParticipants(tx, {
          lessonId: targetLesson.id,
          seriesId: targetSeries.id,
          seriesOriginalStartAt: nextStartAt,
          studentIds: params.studentIds,
          startAt: nextStartAt,
          durationMinutes: params.durationMinutes,
          color: params.color,
          meetingLink: params.meetingLink,
          isRecurring: true,
          recurrenceUntil: resolvedUntil,
          recurrenceGroupId: targetSeries.groupKey,
          recurrenceWeekdays: recurrenceWeekdaysValue,
        });
        updatedLessons.push(updated);
      }
      return { lessons: updatedLessons };
    }

    const desiredOccurrences = buildRecurringOccurrences({
      rangeStartAt: scopeAnchorStartAt,
      anchorStartAt: scopeAnchorStartAt,
      repeatWeekdays: resolvedWeekdays,
      repeatUntil: resolvedUntil,
      timeZone: targetSeries.timeZone,
    });

    if (desiredOccurrences.length === 0) {
      throw new Error('Не найдено дат для обновления серии');
    }

    const updatedLessons: any[] = [];
    const commonCount = Math.min(targetLessons.length, desiredOccurrences.length);

    for (let index = 0; index < commonCount; index += 1) {
      const targetLesson = targetLessons[index];
      const occurrence = desiredOccurrences[index];
      const updated = await updateLessonWithParticipants(tx, {
        lessonId: targetLesson.id,
        seriesId: targetSeries.id,
        seriesOriginalStartAt: occurrence,
        studentIds: params.studentIds,
        startAt: occurrence,
        durationMinutes: params.durationMinutes,
        color: params.color,
        meetingLink: params.meetingLink,
        isRecurring: true,
        recurrenceUntil: resolvedUntil,
        recurrenceGroupId: targetSeries.groupKey,
        recurrenceWeekdays: recurrenceWeekdaysValue,
      });
      updatedLessons.push(updated);
    }

    for (let index = commonCount; index < targetLessons.length; index += 1) {
      await suppressLessonInstance(tx, targetLessons[index]);
    }

    for (let index = commonCount; index < desiredOccurrences.length; index += 1) {
      const created = await createSeriesLesson(tx, {
        teacherId: params.teacher.chatId,
        series: targetSeries,
        startAt: desiredOccurrences[index],
        durationMinutes: params.durationMinutes,
        studentIds: params.studentIds,
        color: params.color,
        meetingLink: params.meetingLink,
      });
      if (created) {
        updatedLessons.push(created);
      }
    }

    return { lessons: updatedLessons.sort((left, right) => left.startAt.getTime() - right.startAt.getTime()) };
  };

  return {
    getLessonOriginalStartAt,
    hasLessonPaidParticipant,
    findLessonIdsWithProtectedDependents,
    findLessonIdsWithHardDependents,
    buildLessonMutationPreview,
    resolveRecurringEditableLessons,
    lessonHasProtectedDependents,
    deleteLessonInstance,
    loadScopedLessonTargets,
    mutateRecurringLessons,
  };
};

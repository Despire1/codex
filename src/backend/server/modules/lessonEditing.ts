import { addYears } from 'date-fns';
import type { User } from '@prisma/client';
import type { LessonMutationAction, LessonSeriesScope } from '../../../entities/types';

type LessonEditingDependencies = {
  prisma: any;
  ensureTeacher: (user: User) => Promise<any>;
  safeLogActivityEvent: (payload: Record<string, unknown>) => Promise<void>;
  normalizeLessonPaymentHandling: (value: unknown) => 'KEEP' | 'RETURN_TO_BALANCE';
  normalizeLessonScope: (value: unknown) => LessonSeriesScope;
  ensureLessonDateIsWorkingDay: (date: Date, teacher: any) => void;
  ensureRecurringWeekdaysAreWorking: (weekdays: number[], teacher: any) => void;
  normalizeLessonColor: (value: unknown) => string;
  parseWeekdays: (value: unknown) => number[];
  resolveMeetingLinkValue: (value: unknown) => string | null | undefined;
  resolveLessonParticipantNames: (studentIds: number[], links: any[]) => string[];
  resolveWeekdayLabels: (weekdays: number[]) => string[];
  buildLessonMutationPreview: (
    action: LessonMutationAction,
    scope: LessonSeriesScope,
    lessons: any[],
    options?: Record<string, unknown>,
  ) => { preview: Record<string, unknown> };
  loadScopedLessonTargets: (tx: any, teacher: any, lessonId: number, scope: LessonSeriesScope) => Promise<any>;
  resolveRecurringEditableLessons: (tx: any, lessons: any[]) => Promise<any>;
  findLessonIdsWithHardDependents: (tx: any, lessonIds: number[]) => Promise<Set<number>>;
  hasLessonPaidParticipant: (lesson: any) => boolean;
  createPaymentEvent: (tx: any, payload: any) => Promise<any>;
  mutateRecurringLessons: (tx: any, params: Record<string, unknown>) => Promise<any>;
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
  lessonHistoryLockMessage: string;
  lessonEditWarningMessage: string;
  lessonEditPaymentResetMessage: string;
  lessonSeriesSplitWarningMessage: string;
  lessonEditHardLockMessage: string;
};

export const createLessonEditingService = ({
  prisma,
  ensureTeacher,
  safeLogActivityEvent,
  normalizeLessonPaymentHandling,
  normalizeLessonScope,
  ensureLessonDateIsWorkingDay,
  ensureRecurringWeekdaysAreWorking,
  normalizeLessonColor,
  parseWeekdays,
  resolveMeetingLinkValue,
  resolveLessonParticipantNames,
  resolveWeekdayLabels,
  buildLessonMutationPreview,
  loadScopedLessonTargets,
  resolveRecurringEditableLessons,
  findLessonIdsWithHardDependents,
  hasLessonPaidParticipant,
  createPaymentEvent,
  mutateRecurringLessons,
  createLessonSeriesRecord,
  createSeriesLesson,
  updateLessonWithParticipants,
  buildRecurringOccurrences,
  lessonHistoryLockMessage,
  lessonEditWarningMessage,
  lessonEditPaymentResetMessage,
  lessonSeriesSplitWarningMessage,
  lessonEditHardLockMessage,
}: LessonEditingDependencies) => {
  const buildLessonUpdateDraft = async (
    tx: any,
    teacher: { chatId: bigint; timezone?: string | null; weekendWeekdays?: unknown },
    lessonId: number,
    body: any,
  ) => {
    const {
      studentId,
      studentIds,
      startAt,
      durationMinutes,
      applyToSeries,
      scope: requestedScope,
      repeatWeekdays,
      repeatUntil,
    } = body ?? {};

    const existing = await tx.lesson.findUnique({
      where: { id: lessonId },
      include: { participants: true },
    });
    if (!existing || existing.teacherId !== teacher.chatId) throw new Error('Урок не найден');

    const previousParticipantIds = existing.participants.map((participant: any) => participant.studentId);
    const ids =
      studentIds && Array.isArray(studentIds) && studentIds.length > 0
        ? studentIds.map((id: any) => Number(id))
        : studentId
          ? [Number(studentId)]
          : previousParticipantIds;

    if (ids.length === 0) throw new Error('Выберите хотя бы одного ученика');

    const nextDuration =
      durationMinutes !== undefined && durationMinutes !== null ? Number(durationMinutes) : existing.durationMinutes;
    if (!Number.isFinite(nextDuration) || nextDuration <= 0) throw new Error('Длительность должна быть больше нуля');

    const activeLinks = await tx.teacherStudent.findMany({
      where: {
        teacherId: teacher.chatId,
        studentId: { in: ids },
        isArchived: false,
      },
    });
    if (activeLinks.length !== ids.length) {
      throw new Error('Некоторые ученики не найдены у текущего преподавателя');
    }

    const allParticipantIds = Array.from(new Set([...ids, ...previousParticipantIds]));
    const allLinks = await tx.teacherStudent.findMany({
      where: {
        teacherId: teacher.chatId,
        studentId: { in: allParticipantIds },
      },
      include: { student: true },
    });

    const targetStart = startAt ? new Date(startAt) : existing.startAt;
    if (Number.isNaN(targetStart.getTime())) throw new Error('Некорректная дата урока');
    if (!body?.allowWeekend) ensureLessonDateIsWorkingDay(targetStart, teacher);

    const existingLesson = existing as any;
    const normalizedColor = normalizeLessonColor(body?.color ?? existingLesson.color);
    const weekdays = repeatWeekdays !== undefined ? parseWeekdays(repeatWeekdays) : undefined;
    if (weekdays !== undefined) {
      ensureRecurringWeekdaysAreWorking(weekdays, teacher);
    }
    const recurrenceEndRaw = repeatUntil !== undefined ? repeatUntil : undefined;
    const requestedMeetingLink = resolveMeetingLinkValue(body?.meetingLink);
    const resolvedSeriesMeetingLink =
      requestedMeetingLink === undefined ? (existingLesson.meetingLink ?? null) : requestedMeetingLink;
    const scope = normalizeLessonScope(requestedScope ?? (applyToSeries ? 'SERIES' : 'SINGLE'));
    const recurrenceEnd =
      recurrenceEndRaw === undefined ? undefined : recurrenceEndRaw ? new Date(recurrenceEndRaw) : null;

    const previousStudentIdsSorted = [...previousParticipantIds].sort((left, right) => left - right);
    const nextStudentIdsSorted = [...ids].sort((left, right) => left - right);
    const participantsChanged =
      previousStudentIdsSorted.length !== nextStudentIdsSorted.length ||
      previousStudentIdsSorted.some((studentId, index) => studentId !== nextStudentIdsSorted[index]);
    const timingChanged =
      existingLesson.startAt.getTime() !== targetStart.getTime() || existingLesson.durationMinutes !== nextDuration;
    const existingWeekdays = parseWeekdays(existingLesson.recurrenceWeekdays);
    const recurrenceWeekdaysChanged =
      weekdays !== undefined &&
      (weekdays.length !== existingWeekdays.length || weekdays.some((day, index) => day !== existingWeekdays[index]));
    const existingRecurrenceUntilTs = existingLesson.recurrenceUntil
      ? new Date(existingLesson.recurrenceUntil).getTime()
      : null;
    const nextRecurrenceUntilTs =
      recurrenceEnd === undefined ? existingRecurrenceUntilTs : recurrenceEnd ? recurrenceEnd.getTime() : null;
    const recurrenceUntilChanged = recurrenceEnd !== undefined && existingRecurrenceUntilTs !== nextRecurrenceUntilTs;
    const structuralChange =
      participantsChanged || recurrenceWeekdaysChanged || recurrenceUntilChanged || scope !== 'SINGLE';

    return {
      existing,
      existingLesson,
      ids,
      previousParticipantIds,
      allLinks,
      nextParticipantNames: resolveLessonParticipantNames(ids, allLinks as any),
      previousParticipantNames: resolveLessonParticipantNames(previousParticipantIds, allLinks as any),
      targetStart,
      nextDuration,
      normalizedColor,
      weekdays,
      recurrenceEnd,
      resolvedSeriesMeetingLink,
      scope,
      participantsChanged,
      timingChanged,
      recurrenceWeekdaysChanged,
      recurrenceUntilChanged,
      structuralChange,
    };
  };

  const buildSingleLessonEditPreview = async (
    tx: any,
    action: LessonMutationAction,
    draft: Awaited<ReturnType<typeof buildLessonUpdateDraft>>,
  ) => {
    const hardDependentIds = draft.structuralChange
      ? await findLessonIdsWithHardDependents(tx, [draft.existing.id])
      : new Set<number>();
    const hasHardDependents = hardDependentIds.has(draft.existing.id);
    const hasPaidParticipants = hasLessonPaidParticipant(draft.existing);
    const isRiskyLesson = draft.existing.status === 'COMPLETED' || hasPaidParticipants;

    if (draft.structuralChange && hasHardDependents) {
      return buildLessonMutationPreview(action, 'SINGLE', [draft.existing as any], {
        historyUntouched: false,
        isBlocked: true,
        blockReason: lessonEditHardLockMessage,
      });
    }

    if (draft.structuralChange && hasPaidParticipants) {
      return buildLessonMutationPreview(action, 'SINGLE', [draft.existing as any], {
        historyUntouched: true,
        resolution: 'requiresPaymentReset',
        resolutionReason: lessonEditPaymentResetMessage,
      });
    }

    if (isRiskyLesson) {
      return buildLessonMutationPreview(action, 'SINGLE', [draft.existing as any], {
        historyUntouched: !draft.structuralChange,
        resolution: 'warning',
        resolutionReason: lessonEditWarningMessage,
      });
    }

    return buildLessonMutationPreview(action, 'SINGLE', [draft.existing as any], {
      historyUntouched: !draft.structuralChange,
    });
  };

  const previewLessonEditMutation = async (
    tx: any,
    teacher: { chatId: bigint; timezone?: string | null; weekendWeekdays?: unknown },
    lessonId: number,
    body: any,
    action: LessonMutationAction = 'EDIT',
  ) => {
    const draft = await buildLessonUpdateDraft(tx, teacher, lessonId, body);
    const existingLesson = draft.existing as any;
    const isRecurringSeriesLesson = Boolean(
      (existingLesson.isRecurring && existingLesson.recurrenceGroupId) || existingLesson.seriesId,
    );

    if (!isRecurringSeriesLesson || draft.scope === 'SINGLE') {
      return { draft, ...(await buildSingleLessonEditPreview(tx, action, draft)) };
    }

    const scoped = await loadScopedLessonTargets(tx, teacher, lessonId, draft.scope);
    const editableTail = await resolveRecurringEditableLessons(tx, scoped.lessons as any);
    if (editableTail.isBlocked) {
      return {
        draft,
        scoped,
        ...buildLessonMutationPreview(action, draft.scope, editableTail.lessons as any, {
          historyUntouched: true,
          isBlocked: true,
          blockReason: editableTail.blockReason,
          skippedProtectedCount: editableTail.skippedProtectedCount,
          effectiveDateFrom: editableTail.effectiveDateFrom,
        }),
      };
    }

    return {
      draft,
      scoped,
      ...buildLessonMutationPreview(action, draft.scope, editableTail.lessons as any, {
        historyUntouched: true,
        resolution: editableTail.skippedProtectedCount > 0 ? 'warning' : null,
        resolutionReason: editableTail.skippedProtectedCount > 0 ? lessonSeriesSplitWarningMessage : null,
        skippedProtectedCount: editableTail.skippedProtectedCount,
        effectiveDateFrom: editableTail.effectiveDateFrom,
      }),
    };
  };

  const resetLessonPaymentsToBalance = async (
    tx: any,
    teacher: { chatId: bigint },
    lessonId: number,
    reason = 'LESSON_EDIT_RESET',
  ) => {
    const lesson = await tx.lesson.findUnique({
      where: { id: lessonId },
      include: { participants: { include: { student: true } } },
    });
    if (!lesson || lesson.teacherId !== teacher.chatId) throw new Error('Урок не найден');

    const paidParticipants = lesson.participants.filter((participant: any) => Boolean(participant.isPaid));
    const updatedLinks: any[] = [];
    if (paidParticipants.length === 0) {
      await tx.lesson.update({
        where: { id: lessonId },
        data: {
          isPaid: false,
          paidAt: null,
          paymentStatus: 'UNPAID',
          paidSource: 'NONE',
        },
        include: { participants: { include: { student: true } } },
      });
      return { links: updatedLinks };
    }

    const links = await tx.teacherStudent.findMany({
      where: {
        teacherId: teacher.chatId,
        studentId: { in: paidParticipants.map((participant: any) => participant.studentId) },
      },
      include: { student: true },
    });
    const linksByStudentId = new Map<number, any>(links.map((link: any) => [link.studentId, link]));

    await tx.payment.deleteMany({
      where: { lessonId },
    });

    for (const participant of paidParticipants) {
      const link = linksByStudentId.get(participant.studentId);
      if (link) {
        const updatedLink = await tx.teacherStudent.update({
          where: { id: link.id },
          data: { balanceLessons: link.balanceLessons + 1 },
        });
        updatedLinks.push(updatedLink);
      }

      await createPaymentEvent(tx, {
        studentId: participant.studentId,
        teacherId: teacher.chatId,
        lessonId,
        type: 'ADJUSTMENT',
        lessonsDelta: 1,
        priceSnapshot: participant.price ?? lesson.price ?? 0,
        moneyAmount: null,
        createdBy: 'TEACHER',
        reason,
      });
    }

    await tx.lessonParticipant.updateMany({
      where: { lessonId, isPaid: true },
      data: { isPaid: false },
    });

    await tx.lesson.update({
      where: { id: lessonId },
      data: {
        isPaid: false,
        paidAt: null,
        paymentStatus: 'UNPAID',
        paidSource: 'NONE',
      },
      include: { participants: { include: { student: true } } },
    });
    return { links: updatedLinks };
  };

  const updateLesson = async (user: User, lessonId: number, body: any) => {
    const teacher = await ensureTeacher(user);
    const previewData = await previewLessonEditMutation(prisma, teacher, lessonId, body, 'EDIT');
    const { draft, preview } = previewData;
    const acknowledgeRisk = Boolean(body?.acknowledgeRisk);
    const paymentHandling = normalizeLessonPaymentHandling(body?.paymentHandling);
    const shouldResetPayment = preview.resolution === 'requiresPaymentReset' && paymentHandling === 'RETURN_TO_BALANCE';
    const existingLesson = draft.existingLesson;

    if (preview.isBlocked) {
      throw new Error((preview.blockReason as string | null) ?? lessonHistoryLockMessage);
    }
    if (preview.resolution === 'warning' && !acknowledgeRisk) {
      throw new Error((preview.resolutionReason as string | null) ?? lessonEditWarningMessage);
    }
    if (preview.resolution === 'requiresPaymentReset' && !shouldResetPayment) {
      throw new Error((preview.resolutionReason as string | null) ?? lessonEditPaymentResetMessage);
    }

    if ((existingLesson.isRecurring && existingLesson.recurrenceGroupId) || existingLesson.seriesId) {
      const result = await prisma.$transaction(async (tx: any) => {
        let paymentLinks: any[] = [];
        if (shouldResetPayment) {
          const paymentResult = await resetLessonPaymentsToBalance(tx, teacher, lessonId);
          paymentLinks = paymentResult.links;
        }
        const updateResult = await mutateRecurringLessons(tx, {
          teacher,
          lessonId,
          scope: draft.scope,
          studentIds: draft.ids,
          startAt: draft.targetStart,
          durationMinutes: draft.nextDuration,
          color: draft.normalizedColor,
          meetingLink: draft.resolvedSeriesMeetingLink,
          repeatWeekdays: draft.weekdays,
          repeatUntil: draft.recurrenceEnd,
        });
        return { ...updateResult, links: paymentLinks };
      });

      await safeLogActivityEvent({
        teacherId: teacher.chatId,
        studentId: draft.ids[0] ?? null,
        lessonId,
        category: 'LESSON',
        action: draft.scope === 'SINGLE' ? 'UPDATE' : 'UPDATE_FOLLOWING',
        status: 'SUCCESS',
        source: 'USER',
        title: draft.scope === 'SINGLE' ? 'Занятие обновлено' : 'Обновлены выбранный и следующие уроки',
        payload: {
          lessonStartAt: draft.targetStart.toISOString(),
          effectiveDateFrom: (preview.effectiveDateFrom as string | null) ?? draft.targetStart.toISOString(),
          durationMinutes: draft.nextDuration,
          studentIds: draft.ids,
          studentNames: draft.nextParticipantNames,
          previousStudentNames: draft.previousParticipantNames,
          scope: draft.scope,
          skippedProtectedCount: (preview.skippedProtectedCount as number | undefined) ?? 0,
          paymentReset: shouldResetPayment,
        },
      });

      return result;
    }

    if (draft.weekdays && draft.weekdays.length > 0) {
      const maxEnd = addYears(draft.targetStart, 1);
      const normalizedRecurrenceEnd =
        draft.recurrenceEnd && !Number.isNaN(draft.recurrenceEnd.getTime())
          ? draft.recurrenceEnd > maxEnd
            ? maxEnd
            : draft.recurrenceEnd
          : maxEnd;

      if (normalizedRecurrenceEnd < draft.targetStart) {
        throw new Error('Дата окончания повтора должна быть не раньше даты начала');
      }

      const result = await prisma.$transaction(async (tx: any) => {
        let paymentLinks: any[] = [];
        if (shouldResetPayment) {
          const paymentResult = await resetLessonPaymentsToBalance(tx, teacher, lessonId);
          paymentLinks = paymentResult.links;
        }
        const series = await createLessonSeriesRecord(tx, {
          teacherId: teacher.chatId,
          timeZone: teacher.timezone,
          anchorStartAt: draft.targetStart,
          durationMinutes: draft.nextDuration,
          recurrenceWeekdays: draft.weekdays,
          recurrenceUntil: normalizedRecurrenceEnd,
          color: draft.normalizedColor,
          meetingLink: draft.resolvedSeriesMeetingLink,
          studentIds: draft.ids,
        });
        const updatedCurrent = await updateLessonWithParticipants(tx, {
          lessonId,
          seriesId: series.id,
          seriesOriginalStartAt: draft.targetStart,
          studentIds: draft.ids,
          startAt: draft.targetStart,
          durationMinutes: draft.nextDuration,
          color: draft.normalizedColor,
          meetingLink: draft.resolvedSeriesMeetingLink,
          isRecurring: true,
          recurrenceUntil: normalizedRecurrenceEnd,
          recurrenceGroupId: series.groupKey,
          recurrenceWeekdays: JSON.stringify(draft.weekdays),
        });
        const occurrences = buildRecurringOccurrences({
          rangeStartAt: draft.targetStart,
          anchorStartAt: draft.targetStart,
          repeatWeekdays: draft.weekdays,
          repeatUntil: normalizedRecurrenceEnd,
          timeZone: teacher.timezone,
        }).filter((date) => date.getTime() !== draft.targetStart.getTime());

        const createdLessons: any[] = [];
        for (const occurrence of occurrences) {
          const created = await createSeriesLesson(tx, {
            teacherId: teacher.chatId,
            series,
            startAt: occurrence,
            durationMinutes: draft.nextDuration,
            studentIds: draft.ids,
            color: draft.normalizedColor,
            meetingLink: draft.resolvedSeriesMeetingLink,
          });
          if (created) createdLessons.push(created);
        }

        return { lesson: updatedCurrent, lessons: [updatedCurrent, ...createdLessons], links: paymentLinks };
      });

      await safeLogActivityEvent({
        teacherId: teacher.chatId,
        studentId: draft.ids[0] ?? null,
        lessonId,
        category: 'LESSON',
        action: 'CONVERT_TO_SERIES',
        status: 'SUCCESS',
        source: 'USER',
        title: 'Одиночное занятие преобразовано в серию',
        payload: {
          convertedFromLessonId: lessonId,
          lessonStartAt: draft.targetStart.toISOString(),
          createdCount: result.lessons.length,
          repeatWeekdays: draft.weekdays,
          repeatWeekdayLabels: resolveWeekdayLabels(draft.weekdays),
          repeatUntil: normalizedRecurrenceEnd.toISOString(),
          studentIds: draft.ids,
          studentNames: draft.nextParticipantNames,
          paymentReset: shouldResetPayment,
        },
      });

      return { lessons: result.lessons, links: result.links };
    }

    const singleUpdateResult = shouldResetPayment
      ? await prisma.$transaction(async (tx: any) => {
          const paymentResult = await resetLessonPaymentsToBalance(tx, teacher, lessonId);
          const updatedLesson = await updateLessonWithParticipants(tx, {
            lessonId,
            studentIds: draft.ids,
            startAt: draft.targetStart,
            durationMinutes: draft.nextDuration,
            color: draft.normalizedColor,
            meetingLink: draft.resolvedSeriesMeetingLink,
            isRecurring: false,
            recurrenceUntil: null,
            recurrenceGroupId: null,
            recurrenceWeekdays: null,
          });
          return { lesson: updatedLesson, links: paymentResult.links };
        })
      : {
          lesson: await updateLessonWithParticipants(prisma, {
            lessonId,
            studentIds: draft.ids,
            startAt: draft.targetStart,
            durationMinutes: draft.nextDuration,
            color: draft.normalizedColor,
            meetingLink: draft.resolvedSeriesMeetingLink,
            isRecurring: false,
            recurrenceUntil: null,
            recurrenceGroupId: null,
            recurrenceWeekdays: null,
          }),
          links: [] as any[],
        };
    const updatedLesson = singleUpdateResult.lesson;

    const nextStudentIds = updatedLesson.participants.map((participant: any) => participant.studentId);
    const nextStudentNames = resolveLessonParticipantNames(nextStudentIds, draft.allLinks as any);

    const changedFields: string[] = [];
    if (existingLesson.startAt.getTime() !== updatedLesson.startAt.getTime()) changedFields.push('date_time');
    if (existingLesson.durationMinutes !== updatedLesson.durationMinutes) changedFields.push('duration');
    if (draft.participantsChanged) changedFields.push('participants');
    if ((existingLesson.meetingLink ?? null) !== (updatedLesson.meetingLink ?? null))
      changedFields.push('meeting_link');
    if (existingLesson.color !== updatedLesson.color) changedFields.push('color');
    if (shouldResetPayment) changedFields.push('payment_reset');

    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId: updatedLesson.studentId,
      lessonId: updatedLesson.id,
      category: 'LESSON',
      action: 'UPDATE',
      status: 'SUCCESS',
      source: 'USER',
      title: 'Занятие обновлено',
      payload: {
        lessonStartAt: updatedLesson.startAt.toISOString(),
        previousLessonStartAt: existingLesson.startAt.toISOString(),
        durationMinutes: updatedLesson.durationMinutes,
        previousDurationMinutes: existingLesson.durationMinutes,
        studentIds: nextStudentIds,
        studentNames: nextStudentNames,
        previousStudentNames: draft.previousParticipantNames,
        changedFields,
      },
    });

    return { lesson: updatedLesson, links: singleUpdateResult.links };
  };

  return {
    previewLessonEditMutation,
    resetLessonPaymentsToBalance,
    updateLesson,
  };
};

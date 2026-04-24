import type { User } from '@prisma/client';
import type { PaymentCancelBehavior } from '../../../entities/types';

type LessonOperationsDependencies = {
  prisma: any;
  ensureTeacher: (user: User) => Promise<any>;
  safeLogActivityEvent: (payload: Record<string, unknown>) => Promise<void>;
  normalizeCancelBehavior: (value: unknown) => PaymentCancelBehavior;
  normalizeLessonScope: (value: unknown) => any;
  normalizeLessonMutationAction: (value: unknown) => any;
  resolveLessonParticipantNames: (studentIds: number[], links: any[]) => string[];
  resolveLessonParticipantNamesFromParticipants: (participants: any[], links?: any[]) => string[];
  loadScopedLessonTargets: (tx: any, teacher: any, lessonId: number, scope: any) => Promise<any>;
  buildLessonMutationPreview: (action: any, scope: any, lessons: any[], options?: Record<string, unknown>) => any;
  previewLessonEditMutation: (tx: any, teacher: any, lessonId: number, body: any, action?: any) => Promise<any>;
  deleteLessonInstance: (tx: any, teacher: any, lesson: any, refundMode?: 'RETURN_TO_BALANCE' | 'KEEP_AS_PAID') => Promise<any>;
  parseWeekdays: (value: unknown) => number[];
  resolveWeekdayLabels: (weekdays: number[]) => string[];
  resolveStudentTelegramId: (student: any) => Promise<bigint | null>;
  isWebPushConfigured: () => boolean;
  hasWebPushSubscriptionsForStudent: (studentId: number) => Promise<boolean>;
  sendStudentPaymentReminder: (payload: {
    studentId: number;
    lessonId: number;
    source: 'AUTO' | 'MANUAL';
  }) => Promise<{ status: 'sent' | 'skipped' | 'failed'; reason?: string; error?: string }>;
  sendTeacherPaymentReminderNotice: (payload: {
    teacherId: bigint;
    studentId: number;
    lessonId: number;
    source: 'AUTO' | 'MANUAL';
  }) => Promise<unknown>;
  dispatchScheduledHomeworkAssignmentsForLesson: (lessonId: number) => Promise<void>;
};

const normalizeLessonStatus = (status: any): 'SCHEDULED' | 'COMPLETED' | 'CANCELED' => {
  if (status === 'COMPLETED') return 'COMPLETED';
  if (status === 'CANCELED') return 'CANCELED';
  return 'SCHEDULED';
};

const normalizeLessonPriceValue = (value: any): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.round(numeric);
};

const resolveProfileLessonPrice = (link: any) => normalizeLessonPriceValue(link?.pricePerLesson);

const createPaymentEvent = async (tx: any, payload: any) => tx.paymentEvent.create({ data: payload });

export const createLessonOperationsService = ({
  prisma,
  ensureTeacher,
  safeLogActivityEvent,
  normalizeCancelBehavior,
  normalizeLessonScope,
  normalizeLessonMutationAction,
  resolveLessonParticipantNames,
  resolveLessonParticipantNamesFromParticipants,
  loadScopedLessonTargets,
  buildLessonMutationPreview,
  previewLessonEditMutation,
  deleteLessonInstance,
  parseWeekdays,
  resolveWeekdayLabels,
  resolveStudentTelegramId,
  isWebPushConfigured,
  hasWebPushSubscriptionsForStudent,
  sendStudentPaymentReminder,
  sendTeacherPaymentReminderNotice,
  dispatchScheduledHomeworkAssignmentsForLesson,
}: LessonOperationsDependencies) => {
  const settleLessonPayments = async (lessonId: number, teacherId: bigint) => {
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { participants: { include: { student: true } } },
    });

    if (!lesson || lesson.teacherId !== teacherId) throw new Error('Урок не найден');
    if (lesson.status === 'CANCELED') return { lesson, links: [] as any[] };

    const participantIds = (lesson.participants ?? []).map((participant: any) => participant.studentId);
    const links = participantIds.length
      ? await prisma.teacherStudent.findMany({
          where: { teacherId, studentId: { in: participantIds }, isArchived: false },
          include: { student: true },
        })
      : [];

    const linksByStudentId = new Map<number, any>(links.map((link: any) => [link.studentId, link]));

    return prisma.$transaction(async (tx: any) => {
      const nextLinksByStudentId = new Map<number, any>(links.map((link: any) => [link.studentId, link]));
      const participantPriceMap = new Map<number, number>();
      const existingPayments = await tx.payment.findMany({ where: { lessonId: lesson.id } });
      const paymentTeacherStudentIds = new Set(existingPayments.map((payment: any) => payment.teacherStudentId));
      const existingEvents = await tx.paymentEvent.findMany({ where: { lessonId: lesson.id, type: 'AUTO_CHARGE' } });
      const eventStudentIds = new Set(existingEvents.map((event: any) => event.studentId));
      let primaryCharged = false;

      for (const participant of lesson.participants ?? []) {
        const link = linksByStudentId.get(participant.studentId);
        if (!link) continue;

        const profilePrice = resolveProfileLessonPrice(link);
        participantPriceMap.set(participant.studentId, profilePrice);

        if (participant.price !== profilePrice) {
          await tx.lessonParticipant.update({
            where: { lessonId_studentId: { lessonId: lesson.id, studentId: participant.studentId } },
            data: { price: profilePrice },
          });
        }

        if (participant.studentId === lesson.studentId && lesson.price !== profilePrice) {
          await tx.lesson.update({
            where: { id: lesson.id },
            data: { price: profilePrice },
          });
        }
      }

      for (const participant of lesson.participants ?? []) {
        const link = linksByStudentId.get(participant.studentId);
        if (!link || participant.isPaid || link.balanceLessons <= 0) continue;

        const nextBalance = link.balanceLessons - 1;
        const priceSnapshot = participantPriceMap.get(participant.studentId) ?? resolveProfileLessonPrice(link);

        const savedLink = await tx.teacherStudent.update({
          where: { id: link.id },
          data: { balanceLessons: nextBalance },
        });
        nextLinksByStudentId.set(savedLink.studentId, savedLink);

        if (!paymentTeacherStudentIds.has(link.id)) {
          await tx.payment.create({
            data: {
              lessonId: lesson.id,
              teacherStudentId: link.id,
              amount: priceSnapshot,
              paidAt: new Date(),
              comment: null,
            },
          });
          paymentTeacherStudentIds.add(link.id);
        }
        if (!eventStudentIds.has(participant.studentId)) {
          await createPaymentEvent(tx, {
            studentId: participant.studentId,
            teacherId,
            lessonId: lesson.id,
            type: 'AUTO_CHARGE',
            lessonsDelta: -1,
            priceSnapshot,
            moneyAmount: null,
            createdBy: 'SYSTEM',
            reason: null,
          });
          eventStudentIds.add(participant.studentId);
        }

        await tx.lessonParticipant.update({
          where: { lessonId_studentId: { lessonId: lesson.id, studentId: participant.studentId } },
          data: { isPaid: true },
        });
        if (participant.studentId === lesson.studentId) {
          primaryCharged = true;
        }
      }

      const participants = await tx.lessonParticipant.findMany({ where: { lessonId: lesson.id } });
      const allPaid = participants.length ? participants.every((item: any) => item.isPaid) : false;
      const primaryParticipant = participants.find((item: any) => item.studentId === lesson.studentId);
      const primaryPaid = Boolean(primaryParticipant?.isPaid);
      const nextPaymentStatus = primaryPaid ? 'PAID' : 'UNPAID';
      const nextPaidSource = primaryPaid
        ? lesson.paidSource && lesson.paidSource !== 'NONE'
          ? lesson.paidSource
          : primaryCharged
            ? 'BALANCE'
            : 'MANUAL'
        : 'NONE';

      const updatedLesson = await tx.lesson.update({
        where: { id: lesson.id },
        data: {
          isPaid: allPaid,
          status: 'COMPLETED',
          completedAt: lesson.completedAt ?? new Date(),
          paidAt: allPaid ? lesson.paidAt ?? new Date() : null,
          paymentStatus: nextPaymentStatus,
          paidSource: nextPaidSource,
        },
        include: { participants: { include: { student: true } } },
      });

      return { lesson: updatedLesson, links: Array.from(nextLinksByStudentId.values()) };
    });
  };

  const applyLessonCancelStatus = async (
    tx: any,
    teacher: { chatId: bigint },
    lessonId: number,
    refundMode: 'RETURN_TO_BALANCE' | 'KEEP_AS_PAID' = 'RETURN_TO_BALANCE',
  ) => {
    const lesson = await tx.lesson.findUnique({
      where: { id: lessonId },
      include: { participants: { include: { student: true } } },
    });
    if (!lesson || lesson.teacherId !== teacher.chatId) throw new Error('Урок не найден');

    const lessonParticipantIds = lesson.participants.map((participant: any) => participant.studentId);
    const links = lessonParticipantIds.length
      ? await tx.teacherStudent.findMany({
          where: { teacherId: teacher.chatId, studentId: { in: lessonParticipantIds }, isArchived: false },
          include: { student: true },
        })
      : [];

    if (refundMode === 'RETURN_TO_BALANCE') {
      const existingAdjustments = await tx.paymentEvent.findMany({
        where: { lessonId, type: 'ADJUSTMENT', reason: 'LESSON_CANCELED' },
      });
      const adjustedStudentIds = new Set(existingAdjustments.map((event: any) => event.studentId));
      const linksByStudentId = new Map<number, any>(links.map((link: any) => [link.studentId, link]));
      const paidParticipants = lesson.participants.filter((participant: any) => Boolean(participant.isPaid));

      const paymentTeacherStudentIdsToDelete = paidParticipants
        .map((participant: any) => linksByStudentId.get(participant.studentId)?.id ?? null)
        .filter((linkId: number | null): linkId is number => typeof linkId === 'number');

      if (paymentTeacherStudentIdsToDelete.length > 0) {
        await tx.payment.deleteMany({
          where: {
            lessonId,
            teacherStudentId: {
              in: paymentTeacherStudentIdsToDelete,
            },
          },
        });
      }

      for (const participant of paidParticipants) {
        if (adjustedStudentIds.has(participant.studentId)) continue;
        const link = linksByStudentId.get(participant.studentId);
        if (!link) continue;

        await tx.teacherStudent.update({
          where: { id: link.id },
          data: { balanceLessons: link.balanceLessons + 1 },
        });
        await createPaymentEvent(tx, {
          studentId: participant.studentId,
          teacherId: teacher.chatId,
          lessonId,
          type: 'ADJUSTMENT',
          lessonsDelta: 1,
          priceSnapshot: participant.price ?? lesson.price ?? 0,
          moneyAmount: null,
          createdBy: 'SYSTEM',
          reason: 'LESSON_CANCELED',
        });
      }

      await tx.lessonParticipant.updateMany({
        where: { lessonId, isPaid: true },
        data: { isPaid: false, price: 0 },
      });
    }

    const updatedLesson = await tx.lesson.update({
      where: { id: lessonId },
      data: {
        status: 'CANCELED',
        isSuppressed: false,
        isPaid: refundMode === 'KEEP_AS_PAID' ? lesson.isPaid : false,
        paidAt: refundMode === 'KEEP_AS_PAID' ? lesson.paidAt : null,
        paymentStatus: refundMode === 'KEEP_AS_PAID' ? lesson.paymentStatus : 'UNPAID',
        paidSource: refundMode === 'KEEP_AS_PAID' ? lesson.paidSource : 'NONE',
      },
      include: { participants: { include: { student: true } } },
    });

    const refreshedLinks = lessonParticipantIds.length
      ? await tx.teacherStudent.findMany({
          where: { teacherId: teacher.chatId, studentId: { in: lessonParticipantIds }, isArchived: false },
          include: { student: true },
        })
      : [];

    return { lesson: updatedLesson, links: refreshedLinks };
  };

  const applyLessonRestoreStatus = async (tx: any, teacher: { chatId: bigint }, lessonId: number) => {
    const lesson = await tx.lesson.findUnique({
      where: { id: lessonId },
      include: { participants: { include: { student: true } } },
    });
    if (!lesson || lesson.teacherId !== teacher.chatId) throw new Error('Урок не найден');

    const updatedLesson = await tx.lesson.update({
      where: { id: lessonId },
      data: { status: 'SCHEDULED', isSuppressed: false },
      include: { participants: { include: { student: true } } },
    });

    return { lesson: updatedLesson, links: [] as any[] };
  };

  const previewLessonMutation = async (user: User, lessonId: number, body: any) => {
    const teacher = await ensureTeacher(user);
    const action = normalizeLessonMutationAction(body?.action);
    if (action === 'EDIT' || action === 'RESCHEDULE') {
      const result = await previewLessonEditMutation(prisma, teacher, lessonId, body, action);
      return { preview: result.preview };
    }

    const scope = normalizeLessonScope(body?.scope);
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { participants: true },
    });
    if (!lesson || lesson.teacherId !== teacher.chatId) throw new Error('Урок не найден');

    if (!(lesson.seriesId || (lesson.isRecurring && lesson.recurrenceGroupId))) {
      return buildLessonMutationPreview(action, 'SINGLE', [lesson]);
    }

    const scoped = await prisma.$transaction((tx: any) => loadScopedLessonTargets(tx, teacher, lessonId, scope));
    return buildLessonMutationPreview(action, scope, scoped.lessons, {
      historyUntouched: false,
    });
  };

  const deleteLesson = async (user: User, lessonId: number, body: any) => {
    const teacher = await ensureTeacher(user);
    const refundMode = body?.refundMode === 'KEEP_AS_PAID' ? 'KEEP_AS_PAID' : 'RETURN_TO_BALANCE';
    const lesson = (await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { participants: { include: { student: true } } },
    })) as any;
    if (!lesson || lesson.teacherId !== teacher.chatId) throw new Error('Урок не найден');

    const lessonStudentIds: number[] = Array.from(
      new Set<number>(
        lesson.participants && lesson.participants.length > 0
          ? lesson.participants.map((participant: any) => Number(participant.studentId))
          : [Number(lesson.studentId)],
      ),
    ).filter((studentId) => Number.isFinite(studentId));
    const lessonLinks = await prisma.teacherStudent.findMany({
      where: {
        teacherId: teacher.chatId,
        studentId: { in: lessonStudentIds },
      },
      include: { student: true },
    });
    const lessonStudentNames = resolveLessonParticipantNames(lessonStudentIds, lessonLinks as any);
    const scope = normalizeLessonScope(body?.scope ?? (body?.applyToSeries ? 'SERIES' : 'SINGLE'));

    if ((lesson.seriesId || lesson.recurrenceGroupId) && lesson.isRecurring) {
      const result = await prisma.$transaction(async (tx: any) => {
        const scoped = await loadScopedLessonTargets(tx, teacher, lessonId, scope);
        const deletedIds: number[] = [];
        const linksMap = new Map<string, any>();
        for (const targetLesson of scoped.lessons) {
          const targetResult = await deleteLessonInstance(tx, teacher, targetLesson, refundMode);
          if (targetResult.deleted) {
            deletedIds.push(targetLesson.id);
          }
          targetResult.links.forEach((link: any) => {
            linksMap.set(`${link.teacherId}_${link.studentId}`, link);
          });
        }
        if (scoped.series && scope !== 'SINGLE') {
          await tx.lessonSeries.update({
            where: { id: scoped.series.id },
            data: {
              recurrenceUntil: new Date(new Date(scoped.lesson.seriesOriginalStartAt ?? scoped.lesson.startAt).getTime() - 1),
            },
          });
        }
        return { deletedIds, deletedCount: scoped.lessons.length, links: Array.from(linksMap.values()) };
      });

      await safeLogActivityEvent({
        teacherId: teacher.chatId,
        studentId: lesson.studentId,
        lessonId: null,
        category: 'LESSON',
        action: scope === 'SINGLE' ? 'DELETE' : 'DELETE_FOLLOWING',
        status: 'SUCCESS',
        source: 'USER',
        title:
          scope === 'SINGLE'
            ? 'Удалён один урок серии'
            : 'Удалены выбранный и следующие уроки серии',
        payload: {
          recurrenceGroupId: lesson.recurrenceGroupId,
          deletedFromLessonId: lessonId,
          deletedCount: result.deletedCount,
          lessonStartAt: new Date(lesson.startAt).toISOString(),
          studentIds: lessonStudentIds,
          studentNames: lessonStudentNames,
          refundMode,
          repeatWeekdays: parseWeekdays(lesson.recurrenceWeekdays),
          repeatWeekdayLabels: resolveWeekdayLabels(parseWeekdays(lesson.recurrenceWeekdays)),
          scope,
        },
      });
      return result;
    }

    const singleDeleteResult = await prisma.$transaction(async (tx: any) => {
      const targetLesson = await tx.lesson.findUnique({
        where: { id: lessonId },
        include: { participants: true },
      });
      if (!targetLesson || targetLesson.teacherId !== teacher.chatId) throw new Error('Урок не найден');
      return deleteLessonInstance(tx, teacher, targetLesson, refundMode);
    });
    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId: lesson.studentId,
      lessonId: null,
      category: 'LESSON',
      action: 'DELETE',
      status: 'SUCCESS',
      source: 'USER',
      title: 'Занятие удалено',
      payload: {
        deletedLessonId: lessonId,
        lessonStartAt: new Date(lesson.startAt).toISOString(),
        studentIds: lessonStudentIds,
        studentNames: lessonStudentNames,
        refundMode,
      },
    });
    return {
      deletedIds: singleDeleteResult.deleted ? [lessonId] : [],
      deletedCount: 1,
      links: singleDeleteResult.links,
    };
  };

  const markLessonCompleted = async (user: User, lessonId: number) => {
    const teacher = await ensureTeacher(user);
    const lessonSnapshot = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, teacherId: true, startAt: true },
    });
    if (!lessonSnapshot || lessonSnapshot.teacherId !== teacher.chatId) throw new Error('Урок не найден');
    if (lessonSnapshot.startAt.getTime() > Date.now()) {
      throw new Error('Нельзя отметить будущий урок проведённым');
    }
    const { lesson, links } = await settleLessonPayments(lessonId, teacher.chatId);
    await dispatchScheduledHomeworkAssignmentsForLesson(lesson.id);
    const primaryLink = links.find((link: any) => link.studentId === lesson.studentId) ?? null;
    const participantIds = lesson.participants.map((participant: any) => participant.studentId);
    const participantNames = resolveLessonParticipantNamesFromParticipants(lesson.participants as any, links as any);
    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId: lesson.studentId,
      lessonId: lesson.id,
      category: 'LESSON',
      action: 'MARK_COMPLETED',
      status: 'SUCCESS',
      source: 'USER',
      title: 'Занятие отмечено проведённым',
      payload: {
        lessonStartAt: lesson.startAt.toISOString(),
        isPaid: lesson.isPaid,
        studentIds: participantIds,
        studentNames: participantNames,
      },
    });
    return { lesson, link: primaryLink };
  };

  const cancelLesson = async (user: User, lessonId: number, body: any) => {
    const teacher = await ensureTeacher(user);
    const scope = normalizeLessonScope(body?.scope);
    const refundMode = body?.refundMode === 'KEEP_AS_PAID' ? 'KEEP_AS_PAID' : 'RETURN_TO_BALANCE';
    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson || lesson.teacherId !== teacher.chatId) throw new Error('Урок не найден');

    if (!(lesson.seriesId || (lesson.isRecurring && lesson.recurrenceGroupId)) || scope === 'SINGLE') {
      return prisma.$transaction((tx: any) => applyLessonCancelStatus(tx, teacher, lessonId, refundMode));
    }

    return prisma.$transaction(async (tx: any) => {
      const scoped = await loadScopedLessonTargets(tx, teacher, lessonId, scope);
      const updatedLessons: any[] = [];
      const linksMap = new Map<string, any>();

      for (const targetLesson of scoped.lessons) {
        const result = await applyLessonCancelStatus(tx, teacher, targetLesson.id, refundMode);
        updatedLessons.push(result.lesson);
        result.links.forEach((link: any) => {
          linksMap.set(`${link.teacherId}_${link.studentId}`, link);
        });
      }

      return { lessons: updatedLessons, links: Array.from(linksMap.values()) };
    });
  };

  const restoreLesson = async (user: User, lessonId: number, body: any) => {
    const teacher = await ensureTeacher(user);
    const scope = normalizeLessonScope(body?.scope);
    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson || lesson.teacherId !== teacher.chatId) throw new Error('Урок не найден');

    if (!(lesson.seriesId || (lesson.isRecurring && lesson.recurrenceGroupId)) || scope === 'SINGLE') {
      return prisma.$transaction((tx: any) => applyLessonRestoreStatus(tx, teacher, lessonId));
    }

    return prisma.$transaction(async (tx: any) => {
      const scoped = await loadScopedLessonTargets(tx, teacher, lessonId, scope);
      const updatedLessons: any[] = [];

      for (const targetLesson of scoped.lessons) {
        const result = await applyLessonRestoreStatus(tx, teacher, targetLesson.id);
        updatedLessons.push(result.lesson);
      }

      return { lessons: updatedLessons, links: [] as any[] };
    });
  };

  const togglePaymentForStudent = async (
    user: User,
    lessonId: number,
    studentId: number,
    options?: { cancelBehavior?: PaymentCancelBehavior; writeOffBalance?: boolean },
  ) => {
    const teacher = await ensureTeacher(user);

    return prisma.$transaction(async (tx: any) => {
      const lesson = await tx.lesson.findUnique({
        where: { id: lessonId },
        include: { participants: true },
      });

      if (!lesson || lesson.teacherId !== teacher.chatId) throw new Error('Урок не найден');

      const link = await tx.teacherStudent.findUnique({
        where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
        include: { student: true },
      });

      if (!link || link.isArchived) throw new Error('Ученик не найден у текущего преподавателя');

      const participant = lesson.participants.find((entry: any) => entry.studentId === studentId);
      if (!participant) throw new Error('Участник урока не найден');

      const existingPayment = await tx.payment.findUnique({
        where: { teacherStudentId_lessonId: { teacherStudentId: link.id, lessonId } },
      });

      let updatedLink = link;
      let nextPaidSource = lesson.paidSource ?? 'NONE';

      if (participant.isPaid || lesson.isPaid) {
        const cancelBehavior = normalizeCancelBehavior(options?.cancelBehavior);
        const shouldRefund = cancelBehavior === 'refund';
        const deltaChange = shouldRefund ? 1 : 0;
        const priceSnapshot =
          [link.pricePerLesson, participant.price, lesson.price].find(
            (value) => typeof value === 'number' && value > 0,
          ) ?? 0;
        if (existingPayment) {
          await tx.payment.delete({ where: { id: existingPayment.id } });
        }
        if (shouldRefund) {
          updatedLink = await tx.teacherStudent.update({
            where: { id: link.id },
            data: { balanceLessons: link.balanceLessons + 1 },
          });
        }
        await tx.paymentEvent.create({
          data: {
            studentId,
            teacherId: teacher.chatId,
            lessonId,
            type: 'ADJUSTMENT',
            lessonsDelta: deltaChange,
            priceSnapshot,
            moneyAmount: null,
            createdBy: 'TEACHER',
            reason: shouldRefund ? 'PAYMENT_REVERT_REFUND' : 'PAYMENT_REVERT_WRITE_OFF',
          },
        });

        await tx.lessonParticipant.update({
          where: { lessonId_studentId: { lessonId, studentId } },
          data: { isPaid: false },
        });
        if (studentId === lesson.studentId) {
          nextPaidSource = 'NONE';
        }
      } else {
        const amount =
          [link.pricePerLesson, participant.price, lesson.price].find(
            (value) => typeof value === 'number' && value > 0,
          ) ?? 0;
        const shouldWriteOffBalance = Boolean(options?.writeOffBalance && link.balanceLessons > 0);
        const balanceDelta = shouldWriteOffBalance ? -1 : 0;
        const paymentReason = shouldWriteOffBalance ? 'BALANCE_PAYMENT' : null;
        if (shouldWriteOffBalance) {
          updatedLink = await tx.teacherStudent.update({
            where: { id: link.id },
            data: { balanceLessons: link.balanceLessons - 1 },
          });
        }
        await tx.payment.create({
          data: {
            lessonId,
            teacherStudentId: link.id,
            amount,
            paidAt: new Date(),
            comment: null,
          },
        });
        await tx.paymentEvent.create({
          data: {
            studentId,
            teacherId: teacher.chatId,
            lessonId,
            type: 'MANUAL_PAID',
            lessonsDelta: balanceDelta,
            priceSnapshot: amount,
            moneyAmount: shouldWriteOffBalance ? null : amount,
            createdBy: 'TEACHER',
            reason: paymentReason,
          },
        });

        if (link.balanceLessons < 0) {
          updatedLink = await tx.teacherStudent.update({
            where: { id: link.id },
            data: { balanceLessons: Math.min(link.balanceLessons + 1, 0) },
          });
        }

        await tx.lessonParticipant.update({
          where: { lessonId_studentId: { lessonId, studentId } },
          data: { isPaid: true, price: amount },
        });

        if (studentId === lesson.studentId) {
          await tx.lesson.update({ where: { id: lessonId }, data: { price: amount } });
          nextPaidSource = shouldWriteOffBalance ? 'BALANCE' : 'MANUAL';
        }
      }

      const participants = await tx.lessonParticipant.findMany({
        where: { lessonId },
        include: { student: true },
      });

      const participantsPaid = participants.length ? participants.every((item: any) => item.isPaid) : false;
      const primaryParticipant = participants.find((item: any) => item.studentId === lesson.studentId);
      const primaryPaid = Boolean(primaryParticipant?.isPaid);
      const nextPaymentStatus = primaryPaid ? 'PAID' : 'UNPAID';
      if (!primaryPaid) {
        nextPaidSource = 'NONE';
      } else if (nextPaidSource === 'NONE') {
        nextPaidSource = 'MANUAL';
      }

      const paidAt = participantsPaid ? lesson.paidAt ?? new Date() : null;

      const normalizedLesson = await tx.lesson.update({
        where: { id: lessonId },
        data: {
          isPaid: participantsPaid,
          status: lesson.status,
          completedAt: lesson.status === 'COMPLETED' ? lesson.completedAt ?? new Date() : null,
          paidAt,
          paymentStatus: nextPaymentStatus,
          paidSource: nextPaidSource,
        },
        include: {
          participants: {
            include: { student: true },
          },
        },
      });

      const updatedParticipant = normalizedLesson.participants.find((item: any) => item.studentId === studentId);
      return { lesson: normalizedLesson, participant: updatedParticipant, link: updatedLink };
    });
  };

  const toggleLessonPaid = async (
    user: User,
    lessonId: number,
    cancelBehavior?: PaymentCancelBehavior,
    writeOffBalance?: boolean,
  ) => {
    const baseLesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!baseLesson) throw new Error('Урок не найден');

    const { lesson, link } = await togglePaymentForStudent(user, lessonId, baseLesson.studentId, {
      cancelBehavior,
      writeOffBalance,
    });
    return { lesson, link };
  };

  const toggleParticipantPaid = async (
    user: User,
    lessonId: number,
    studentId: number,
    cancelBehavior?: PaymentCancelBehavior,
    writeOffBalance?: boolean,
  ) => togglePaymentForStudent(user, lessonId, studentId, { cancelBehavior, writeOffBalance });

  const updateLessonStatus = async (user: User, lessonId: number, status: any) => {
    const teacher = await ensureTeacher(user);
    const normalizedStatus = normalizeLessonStatus(status);

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { participants: { include: { student: true } } },
    });

    if (!lesson || lesson.teacherId !== teacher.chatId) throw new Error('Урок не найден');

    if (normalizedStatus === 'COMPLETED') {
      if (lesson.startAt.getTime() > Date.now()) {
        throw new Error('Нельзя отметить будущий урок проведённым');
      }
      const result = await settleLessonPayments(lessonId, teacher.chatId);
      await dispatchScheduledHomeworkAssignmentsForLesson(result.lesson.id);
      const participantIds = result.lesson.participants.map((participant: any) => participant.studentId);
      const participantNames = resolveLessonParticipantNamesFromParticipants(
        result.lesson.participants as any,
        result.links as any,
      );
      await safeLogActivityEvent({
        teacherId: teacher.chatId,
        studentId: result.lesson.studentId,
        lessonId: result.lesson.id,
        category: 'LESSON',
        action: 'STATUS_COMPLETED',
        status: 'SUCCESS',
        source: 'USER',
        title: 'Статус занятия: проведён',
        payload: {
          lessonStartAt: result.lesson.startAt.toISOString(),
          studentIds: participantIds,
          studentNames: participantNames,
        },
      });
      return result;
    }
    if (normalizedStatus === 'CANCELED') {
      const result = await prisma.$transaction((tx: any) =>
        applyLessonCancelStatus(tx, teacher, lessonId, 'RETURN_TO_BALANCE'),
      );

      await safeLogActivityEvent({
        teacherId: teacher.chatId,
        studentId: result.lesson.studentId,
        lessonId: result.lesson.id,
        category: 'LESSON',
        action: 'STATUS_CANCELED',
        status: 'SUCCESS',
        source: 'USER',
        title: 'Статус занятия: отменён',
        payload: {
          lessonStartAt: result.lesson.startAt.toISOString(),
          studentIds: result.lesson.participants.map((participant: any) => participant.studentId),
          studentNames: resolveLessonParticipantNamesFromParticipants(
            result.lesson.participants as any,
            result.links as any,
          ),
        },
      });
      return result;
    }

    const result = await prisma.$transaction((tx: any) => applyLessonRestoreStatus(tx, teacher, lessonId));
    const updatedLesson = result.lesson;
    const updatedLessonParticipantIds = updatedLesson.participants.map((participant: any) => participant.studentId);
    const updatedLessonLinks = updatedLessonParticipantIds.length
      ? await prisma.teacherStudent.findMany({
          where: { teacherId: teacher.chatId, studentId: { in: updatedLessonParticipantIds }, isArchived: false },
          include: { student: true },
        })
      : [];

    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId: updatedLesson.studentId,
      lessonId: updatedLesson.id,
      category: 'LESSON',
      action: 'STATUS_SCHEDULED',
      status: 'SUCCESS',
      source: 'USER',
      title: 'Статус занятия: запланирован',
      payload: {
        lessonStartAt: updatedLesson.startAt.toISOString(),
        studentIds: updatedLessonParticipantIds,
        studentNames: resolveLessonParticipantNames(updatedLessonParticipantIds, updatedLessonLinks as any),
      },
    });

    return result;
  };

  const remindLessonPayment = async (
    user: User,
    lessonId: number,
    studentId?: number | null,
    options?: { force?: boolean },
  ) => {
    const teacher = await ensureTeacher(user);
    let lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { student: true, participants: true },
    });
    if (!lesson || lesson.teacherId !== teacher.chatId) throw new Error('Урок не найден');
    if (lesson.status !== 'COMPLETED') {
      const now = new Date();
      if (lesson.status === 'SCHEDULED' && lesson.startAt.getTime() < now.getTime()) {
        const settled = await settleLessonPayments(lessonId, teacher.chatId);
        await dispatchScheduledHomeworkAssignmentsForLesson(settled.lesson.id);
        lesson = await prisma.lesson.findUnique({
          where: { id: lessonId },
          include: { student: true, participants: true },
        });
      } else {
        throw new Error('Напоминание доступно только для завершённых занятий');
      }
    }
    if (!lesson || lesson.status !== 'COMPLETED') {
      throw new Error('Напоминание доступно только для завершённых занятий');
    }
    if (lesson.paymentStatus === 'PAID' || lesson.isPaid) {
      throw new Error('Урок уже оплачен');
    }
    const resolvedStudentId = studentId ?? lesson.studentId;
    const participant = lesson.participants.find((item: any) => item.studentId === resolvedStudentId);
    if (!participant) throw new Error('Ученик не найден');

    const student = await prisma.student.findUnique({ where: { id: resolvedStudentId } });
    if (!student) throw new Error('Ученик не найден');
    const telegramId = await resolveStudentTelegramId(student);
    const hasPwaPush = isWebPushConfigured() && (await hasWebPushSubscriptionsForStudent(resolvedStudentId));
    if (!telegramId && !hasPwaPush) {
      throw new Error('student_not_activated');
    }

    if (lesson.lastPaymentReminderAt && !options?.force) {
      const cooldownMs = 2 * 60 * 60 * 1000;
      if (Date.now() - lesson.lastPaymentReminderAt.getTime() < cooldownMs) {
        throw new Error('recently_sent');
      }
    }

    const result = await sendStudentPaymentReminder({
      studentId: resolvedStudentId,
      lessonId,
      source: 'MANUAL',
    });
    if (result.status !== 'sent') {
      throw new Error('Не удалось отправить напоминание');
    }

    const now = new Date();
    await prisma.lesson.update({
      where: { id: lessonId },
      data: {
        paymentReminderCount: lesson.paymentReminderCount + 1,
        lastPaymentReminderAt: now,
        lastPaymentReminderSource: 'MANUAL',
      },
    });

    if (teacher.notifyTeacherOnManualPaymentReminder) {
      await sendTeacherPaymentReminderNotice({
        teacherId: teacher.chatId,
        studentId: resolvedStudentId,
        lessonId,
        source: 'MANUAL',
      });
    }

    return { status: 'sent' };
  };

  return {
    settleLessonPayments,
    applyLessonCancelStatus,
    applyLessonRestoreStatus,
    previewLessonMutation,
    deleteLesson,
    markLessonCompleted,
    cancelLesson,
    restoreLesson,
    toggleLessonPaid,
    toggleParticipantPaid,
    updateLessonStatus,
    remindLessonPayment,
  };
};

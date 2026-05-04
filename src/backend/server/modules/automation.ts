import { addDays } from 'date-fns';

type AutomationDependencies = {
  prisma: any;
  homeworkV2Service: {
    dispatchScheduledHomeworkAssignmentsForLesson: (lessonId: number) => Promise<void>;
    runHomeworkAssignmentAutomationForTeacher: (teacher: any, now: Date) => Promise<void>;
  };
  filterSuppressedLessons: (tx: any, lessons: any[]) => Promise<any[]>;
  safeLogActivityEvent: (payload: Record<string, unknown>) => Promise<void>;
  resolveLessonParticipantNames: (studentIds: number[], links: any[]) => string[];
  settleLessonPayments: (lessonId: number, teacherId: bigint) => Promise<{ lesson: any; links: any[] }>;
  sendStudentPaymentReminder: (payload: {
    studentId: number;
    lessonId: number;
    source: 'AUTO';
  }) => Promise<{ status: 'sent' | 'skipped' | 'failed'; reason?: string; error?: string }>;
  sendTeacherPaymentReminderNotice: (payload: {
    teacherId: bigint;
    studentId: number;
    lessonId: number;
    source: 'AUTO';
  }) => Promise<unknown>;
  sendTeacherDailySummary: (payload: Record<string, unknown>) => Promise<unknown>;
  sendTeacherLessonReminder: (payload: Record<string, unknown>) => Promise<unknown>;
  sendStudentLessonReminder: (payload: Record<string, unknown>) => Promise<unknown>;
  sendTeacherOnboardingNudge: (payload: { teacherId: bigint; scheduledFor: Date }) => Promise<unknown>;
  sendTeacherPostLessonPrompt: (payload: {
    teacherId: bigint;
    lessonId: number;
    scheduledFor?: Date;
    dedupeKey?: string;
  }) => Promise<unknown>;
  sendTeacherPaymentPrompt: (payload: {
    teacherId: bigint;
    lessonId: number;
    scheduledFor?: Date;
    dedupeKey?: string;
  }) => Promise<unknown>;
  sendTeacherTrialDigest: (payload: { teacherId: bigint; trialStart: Date; trialEnd: Date }) => Promise<unknown>;
  resolveTimeZone: (timeZone?: string | null) => string;
  toZonedDate: (date: Date, timeZone?: string | null) => Date;
  toUtcDateFromTimeZone: (dateKey: string, time: string, timeZone?: string | null) => Date;
  toUtcEndOfDay: (dateKey: string, timeZone?: string | null) => Date;
  formatInTimeZone: (date: Date, pattern: string, options?: Record<string, unknown>) => string;
  buildDailySummaryData: (
    teacher: any,
    targetDate: Date,
    includeUnpaid: boolean,
  ) => Promise<{ dateKey: string; summaryDate: Date; lessons: any[]; unpaidLessons: any[] }>;
  NOTIFICATION_TICK_MS: number;
  ONBOARDING_NUDGE_DELAY_MS: number;
  ONBOARDING_NUDGE_COOLDOWN_MS: number;
  NOTIFICATION_LOG_RETENTION_DAYS: number;
  MIN_NOTIFICATION_LOG_RETENTION_DAYS: number;
  MAX_NOTIFICATION_LOG_RETENTION_DAYS: number;
};

const AUTO_CONFIRM_GRACE_MINUTES = 5;
const QUIET_HOURS_START = 22;
const QUIET_HOURS_END = 9;
const QUIET_HOURS_RESUME_TIME = '09:30';

export const createAutomationService = ({
  prisma,
  homeworkV2Service,
  filterSuppressedLessons,
  safeLogActivityEvent,
  resolveLessonParticipantNames,
  settleLessonPayments,
  sendStudentPaymentReminder,
  sendTeacherPaymentReminderNotice,
  sendTeacherDailySummary,
  sendTeacherLessonReminder,
  sendStudentLessonReminder,
  sendTeacherOnboardingNudge,
  sendTeacherPostLessonPrompt,
  sendTeacherPaymentPrompt,
  sendTeacherTrialDigest,
  toZonedDate,
  toUtcDateFromTimeZone,
  formatInTimeZone,
  buildDailySummaryData,
  NOTIFICATION_TICK_MS,
  ONBOARDING_NUDGE_DELAY_MS,
  ONBOARDING_NUDGE_COOLDOWN_MS,
  NOTIFICATION_LOG_RETENTION_DAYS,
  MIN_NOTIFICATION_LOG_RETENTION_DAYS,
  MAX_NOTIFICATION_LOG_RETENTION_DAYS,
}: AutomationDependencies) => {
  let isLessonAutomationRunning = false;

  const resolveLessonEndTime = (lesson: { startAt: Date; durationMinutes: number }) =>
    new Date(lesson.startAt).getTime() + lesson.durationMinutes * 60_000;

  const formatDedupeTimeKey = (date: Date, timeZone?: string | null) =>
    new Intl.DateTimeFormat('sv-SE', {
      timeZone: timeZone && timeZone.trim() ? timeZone : 'UTC',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date);

  const shouldSendLessonReminder = (scheduledFor: Date, now: Date) => {
    const nowMs = now.getTime();
    const scheduledMs = scheduledFor.getTime();
    return scheduledMs <= nowMs && nowMs < scheduledMs + NOTIFICATION_TICK_MS;
  };

  const resolveQuietHoursResume = (now: Date, timeZone?: string | null) => {
    const zoned = toZonedDate(now, timeZone);
    const hours = zoned.getHours();
    const minutes = zoned.getMinutes();
    const inQuietHours =
      hours >= QUIET_HOURS_START || hours < QUIET_HOURS_END || (hours === QUIET_HOURS_END && minutes < 30);

    if (!inQuietHours) {
      return { inQuietHours: false, nextSendAt: now };
    }

    const targetDate =
      hours >= QUIET_HOURS_START
        ? formatInTimeZone(addDays(zoned, 1), 'yyyy-MM-dd', { timeZone })
        : formatInTimeZone(zoned, 'yyyy-MM-dd', { timeZone });
    const nextSendAt = toUtcDateFromTimeZone(targetDate, QUIET_HOURS_RESUME_TIME, timeZone);
    return { inQuietHours: true, nextSendAt };
  };

  const POST_LESSON_PROMPT_FRESH_HOURS = 24;

  const runLessonAutomationTick = async () => {
    if (isLessonAutomationRunning) return;
    isLessonAutomationRunning = true;
    try {
      const now = new Date();
      const teachers = await prisma.teacher.findMany();

      for (const teacher of teachers) {
        if (!teacher.autoConfirmLessons) {
          let scheduledLessons = await prisma.lesson.findMany({
            where: { teacherId: teacher.chatId, isSuppressed: false, status: 'SCHEDULED', startAt: { lt: now } },
          });
          scheduledLessons = await filterSuppressedLessons(prisma, scheduledLessons);
          for (const lesson of scheduledLessons) {
            const lessonEnd = resolveLessonEndTime(lesson);
            if (lessonEnd + AUTO_CONFIRM_GRACE_MINUTES * 60_000 > now.getTime()) continue;
            if (lessonEnd + POST_LESSON_PROMPT_FRESH_HOURS * 60 * 60_000 < now.getTime()) continue;
            try {
              await sendTeacherPostLessonPrompt({
                teacherId: teacher.chatId,
                lessonId: lesson.id,
                scheduledFor: now,
                dedupeKey: `TEACHER_POST_LESSON_PROMPT:${lesson.id}`,
              });
            } catch (error) {
              console.error('Не удалось отправить post-lesson prompt', error);
            }
          }
        }

        if (teacher.autoConfirmLessons) {
          let scheduledLessons = await prisma.lesson.findMany({
            where: { teacherId: teacher.chatId, isSuppressed: false, status: 'SCHEDULED', startAt: { lt: now } },
            include: { participants: { include: { student: true } } },
          });
          scheduledLessons = await filterSuppressedLessons(prisma, scheduledLessons);

          const dueLessons = scheduledLessons.filter((lesson) => {
            const lessonEnd = resolveLessonEndTime(lesson);
            return lessonEnd + AUTO_CONFIRM_GRACE_MINUTES * 60_000 <= now.getTime();
          });

          for (const lesson of dueLessons) {
            try {
              const updatedLesson = await prisma.lesson.update({
                where: { id: lesson.id },
                data: { status: 'COMPLETED', completedAt: lesson.completedAt ?? now },
                include: { participants: { include: { student: true } } },
              });
              await homeworkV2Service.dispatchScheduledHomeworkAssignmentsForLesson(updatedLesson.id);
              const participantIds = updatedLesson.participants.map((participant: any) => participant.studentId);
              const participantLinks = participantIds.length
                ? await prisma.teacherStudent.findMany({
                    where: { teacherId: teacher.chatId, studentId: { in: participantIds }, isArchived: false },
                    include: { student: true },
                  })
                : [];
              await safeLogActivityEvent({
                teacherId: teacher.chatId,
                studentId: updatedLesson.studentId,
                lessonId: updatedLesson.id,
                category: 'LESSON',
                action: 'AUTO_COMPLETE',
                status: 'SUCCESS',
                source: 'AUTO',
                title: 'Занятие автоматически отмечено проведённым',
                payload: {
                  lessonStartAt: updatedLesson.startAt.toISOString(),
                  studentIds: participantIds,
                  studentNames: resolveLessonParticipantNames(participantIds, participantLinks as any),
                },
              });
            } catch (error) {
              console.error('Не удалось авто-подтвердить урок', error);
            }
          }
        }

        let unpaidCompleted = await prisma.lesson.findMany({
          where: {
            teacherId: teacher.chatId,
            isSuppressed: false,
            status: 'COMPLETED',
            paymentStatus: 'UNPAID',
            paidSource: 'NONE',
          },
          include: { participants: { include: { student: true } } },
        });
        unpaidCompleted = await filterSuppressedLessons(prisma, unpaidCompleted);

        for (const lesson of unpaidCompleted) {
          try {
            await settleLessonPayments(lesson.id, teacher.chatId);
          } catch (error) {
            console.error('Не удалось списать баланс по уроку', error);
          }
        }

        const paymentPromptFreshAfter = new Date(now.getTime() - POST_LESSON_PROMPT_FRESH_HOURS * 60 * 60_000);
        let paymentPromptCandidates = await prisma.lesson.findMany({
          where: {
            teacherId: teacher.chatId,
            isSuppressed: false,
            status: 'COMPLETED',
            paymentStatus: 'UNPAID',
            paidSource: 'NONE',
            completedAt: { gte: paymentPromptFreshAfter },
          },
        });
        paymentPromptCandidates = await filterSuppressedLessons(prisma, paymentPromptCandidates);
        for (const lesson of paymentPromptCandidates) {
          try {
            await sendTeacherPaymentPrompt({
              teacherId: teacher.chatId,
              lessonId: lesson.id,
              scheduledFor: now,
              dedupeKey: `TEACHER_PAYMENT_PROMPT:${lesson.id}`,
            });
          } catch (error) {
            console.error('Не удалось отправить payment prompt', error);
          }
        }

        if (teacher.globalPaymentRemindersEnabled && teacher.studentNotificationsEnabled) {
          const maxCount = Math.max(0, teacher.paymentReminderMaxCount ?? 0);
          if (maxCount > 0) {
            const delayMs = Math.max(0, Number(teacher.paymentReminderDelayHours ?? 0)) * 60 * 60 * 1000;
            const repeatMs = Math.max(0, Number(teacher.paymentReminderRepeatHours ?? 0)) * 60 * 60 * 1000;
            const completedBefore = new Date(now.getTime() - delayMs);
            const repeatBefore = new Date(now.getTime() - repeatMs);

            let reminderCandidates = await prisma.lesson.findMany({
              where: {
                teacherId: teacher.chatId,
                isSuppressed: false,
                status: 'COMPLETED',
                paymentStatus: 'UNPAID',
                completedAt: { lte: completedBefore },
                paymentReminderCount: { lt: maxCount },
                OR: [{ lastPaymentReminderAt: null }, { lastPaymentReminderAt: { lte: repeatBefore } }],
              },
              include: { student: true },
            });
            reminderCandidates = await filterSuppressedLessons(prisma, reminderCandidates);

            const quietHours = resolveQuietHoursResume(now, teacher.timezone);
            if (!(quietHours.inQuietHours && now.getTime() < quietHours.nextSendAt.getTime())) {
              for (const lesson of reminderCandidates) {
                if (!lesson.student || !lesson.student.paymentRemindersEnabled) continue;

                try {
                  const result = await sendStudentPaymentReminder({
                    studentId: lesson.studentId,
                    lessonId: lesson.id,
                    source: 'AUTO',
                  });

                  if (result.status === 'sent') {
                    const currentCount = lesson.paymentReminderCount ?? 0;
                    await prisma.lesson.update({
                      where: { id: lesson.id },
                      data: {
                        paymentReminderCount: currentCount + 1,
                        lastPaymentReminderAt: now,
                        lastPaymentReminderSource: 'AUTO',
                      },
                    });

                    if (teacher.notifyTeacherOnAutoPaymentReminder) {
                      await sendTeacherPaymentReminderNotice({
                        teacherId: teacher.chatId,
                        studentId: lesson.studentId,
                        lessonId: lesson.id,
                        source: 'AUTO',
                      });
                    }
                  }
                } catch (error) {
                  console.error('Не удалось отправить авто-напоминание об оплате', error);
                }
              }
            }
          }
        }

        await homeworkV2Service.runHomeworkAssignmentAutomationForTeacher(teacher, now);
      }
    } finally {
      isLessonAutomationRunning = false;
    }
  };

  const shouldSendDailySummary = (teacher: any, now: Date, scope: 'today' | 'tomorrow') => {
    if (scope === 'today' && !teacher.dailySummaryEnabled) return false;
    if (scope === 'tomorrow' && !teacher.tomorrowSummaryEnabled) return false;
    const timeLabel = formatInTimeZone(now, 'HH:mm', { timeZone: teacher.timezone });
    const targetTime = scope === 'today' ? teacher.dailySummaryTime : teacher.tomorrowSummaryTime;
    return timeLabel === targetTime;
  };

  const runNotificationTick = async () => {
    const now = new Date();
    const teachers = await prisma.teacher.findMany();

    for (const teacher of teachers) {
      if (teacher.lessonReminderEnabled) {
        const reminderMinutes = Number(teacher.lessonReminderMinutes ?? 0);
        const windowStart = new Date(now.getTime() + reminderMinutes * 60_000 - NOTIFICATION_TICK_MS);
        const windowEnd = new Date(now.getTime() + reminderMinutes * 60_000);
        let lessons = await prisma.lesson.findMany({
          where: {
            teacherId: teacher.chatId,
            isSuppressed: false,
            status: 'SCHEDULED',
            startAt: { gte: windowStart, lt: windowEnd },
          },
        });
        lessons = await filterSuppressedLessons(prisma, lessons);

        for (const lesson of lessons) {
          const scheduledFor = new Date(lesson.startAt.getTime() - reminderMinutes * 60_000);
          if (!shouldSendLessonReminder(scheduledFor, now)) continue;
          const dedupeSuffix = formatDedupeTimeKey(scheduledFor, teacher.timezone);
          await sendTeacherLessonReminder({
            teacherId: teacher.chatId,
            lessonId: lesson.id,
            scheduledFor,
            dedupeKey: `TEACHER_LESSON_REMINDER:${lesson.id}:${dedupeSuffix}`,
            minutesBefore: reminderMinutes,
          });
          await sendStudentLessonReminder({
            studentId: lesson.studentId,
            lessonId: lesson.id,
            scheduledFor,
            dedupeKey: `STUDENT_LESSON_REMINDER:${lesson.id}:${dedupeSuffix}`,
            minutesBefore: reminderMinutes,
          });
        }
      }

      if (shouldSendDailySummary(teacher, now, 'today')) {
        const summary = await buildDailySummaryData(teacher, now, true);
        await sendTeacherDailySummary({
          teacherId: teacher.chatId,
          type: 'TEACHER_DAILY_SUMMARY',
          summaryDate: summary.summaryDate,
          lessons: summary.lessons,
          unpaidLessons: summary.unpaidLessons,
          scheduledFor: now,
          dedupeKey: `TEACHER_DAILY_SUMMARY:${teacher.chatId}:${summary.dateKey}`,
        });
      }

      if (shouldSendDailySummary(teacher, now, 'tomorrow')) {
        const summary = await buildDailySummaryData(teacher, addDays(now, 1), false);
        await sendTeacherDailySummary({
          teacherId: teacher.chatId,
          type: 'TEACHER_TOMORROW_SUMMARY',
          summaryDate: summary.summaryDate,
          lessons: summary.lessons,
          scheduledFor: now,
          dedupeKey: `TEACHER_TOMORROW_SUMMARY:${teacher.chatId}:${summary.dateKey}`,
        });
      }
    }
  };

  const TRIAL_DIGEST_BEFORE_END_HOURS = 3 * 24;
  const TRIAL_DIGEST_TICK_HOURS = 1;
  const TRIAL_MAX_DURATION_DAYS = 15;

  const runTrialDigestTick = async () => {
    const now = new Date();
    const cutoffStart = new Date(now.getTime() - TRIAL_DIGEST_TICK_HOURS * 60 * 60_000);
    const targetWindowStart = new Date(cutoffStart.getTime() + TRIAL_DIGEST_BEFORE_END_HOURS * 60 * 60_000);
    const targetWindowEnd = new Date(now.getTime() + TRIAL_DIGEST_BEFORE_END_HOURS * 60 * 60_000);

    const candidates = await prisma.user.findMany({
      where: {
        role: 'TEACHER',
        subscriptionTrialUsed: true,
        subscriptionStartAt: { not: null },
        subscriptionEndAt: { gte: targetWindowStart, lt: targetWindowEnd },
      },
      select: {
        telegramUserId: true,
        subscriptionStartAt: true,
        subscriptionEndAt: true,
      },
    });

    for (const candidate of candidates) {
      const start = candidate.subscriptionStartAt;
      const end = candidate.subscriptionEndAt;
      if (!start || !end) continue;
      const durationMs = end.getTime() - start.getTime();
      if (durationMs > TRIAL_MAX_DURATION_DAYS * 24 * 60 * 60_000) continue;
      try {
        await sendTeacherTrialDigest({
          teacherId: candidate.telegramUserId,
          trialStart: start,
          trialEnd: end,
        });
      } catch (error) {
        console.error('Не удалось отправить trial-дайджест', {
          teacherId: candidate.telegramUserId.toString(),
          error,
        });
      }
    }
  };

  const runOnboardingNudgeTick = async () => {
    const now = new Date();
    const startedBefore = new Date(now.getTime() - ONBOARDING_NUDGE_DELAY_MS);
    const cooldownBefore = new Date(now.getTime() - ONBOARDING_NUDGE_COOLDOWN_MS);

    const candidates = await prisma.user.findMany({
      where: {
        role: 'TEACHER',
        onboardingTeacherStartedAt: { not: null, lte: startedBefore },
        OR: [{ lastOnboardingNudgeAt: null }, { lastOnboardingNudgeAt: { lte: cooldownBefore } }],
      },
      select: { telegramUserId: true },
    });

    for (const candidate of candidates) {
      try {
        const hasStudent = await prisma.teacherStudent.findFirst({
          where: { teacherId: candidate.telegramUserId, isArchived: false },
          select: { id: true },
        });
        if (hasStudent) continue;

        await sendTeacherOnboardingNudge({ teacherId: candidate.telegramUserId, scheduledFor: now });
        await prisma.user.update({
          where: { telegramUserId: candidate.telegramUserId },
          data: { lastOnboardingNudgeAt: now },
        });
      } catch (error) {
        console.error('Не удалось обработать onboarding-напоминание для учителя', {
          teacherId: candidate.telegramUserId.toString(),
          error,
        });
      }
    }
  };

  const cleanupSessions = async () => {
    const now = new Date();
    await prisma.session.deleteMany({
      where: {
        OR: [{ expiresAt: { lte: now } }, { revokedAt: { not: null } }],
      },
    });
  };

  const resolveNotificationLogRetentionDays = () => {
    if (!Number.isFinite(NOTIFICATION_LOG_RETENTION_DAYS) || NOTIFICATION_LOG_RETENTION_DAYS <= 0) {
      return null;
    }
    return Math.min(
      Math.max(NOTIFICATION_LOG_RETENTION_DAYS, MIN_NOTIFICATION_LOG_RETENTION_DAYS),
      MAX_NOTIFICATION_LOG_RETENTION_DAYS,
    );
  };

  const cleanupNotificationLogs = async () => {
    const retentionDays = resolveNotificationLogRetentionDays();
    if (!retentionDays) return;
    const cutoff = addDays(new Date(), -retentionDays);
    await prisma.notificationLog.deleteMany({
      where: {
        createdAt: { lt: cutoff },
      },
    });
  };

  const scheduleDailySessionCleanup = () => {
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setHours(3, 0, 0, 0);
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
    const delayMs = nextRun.getTime() - now.getTime();

    setTimeout(() => {
      cleanupSessions().catch((error) => {
        console.error('Не удалось очистить сессии', error);
      });
      cleanupNotificationLogs().catch((error) => {
        console.error('Не удалось очистить логи уведомлений', error);
      });

      setInterval(
        () => {
          cleanupSessions().catch((error) => {
            console.error('Не удалось очистить сессии', error);
          });
          cleanupNotificationLogs().catch((error) => {
            console.error('Не удалось очистить логи уведомлений', error);
          });
        },
        24 * 60 * 60 * 1000,
      );
    }, delayMs);
  };

  return {
    runLessonAutomationTick,
    runNotificationTick,
    runOnboardingNudgeTick,
    runTrialDigestTick,
    cleanupSessions,
    cleanupNotificationLogs,
    scheduleDailySessionCleanup,
  };
};

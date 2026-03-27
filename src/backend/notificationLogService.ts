import prisma from './prismaClient';

export type NotificationLogChannel = 'TELEGRAM' | 'PWA_PUSH';

export type NotificationChannelDeliveryResult =
  | {
      channel: NotificationLogChannel;
      status: 'sent' | 'skipped';
    }
  | {
      channel: NotificationLogChannel;
      status: 'failed';
      error: string;
    };

export const resolveNotificationChannelDedupeKey = (
  dedupeKey: string | null | undefined,
  channel: NotificationLogChannel,
) => {
  const normalized =
    typeof dedupeKey === 'string' && dedupeKey.trim().length > 0 ? dedupeKey.trim() : null;

  if (!normalized) return null;
  if (channel === 'TELEGRAM') return normalized;
  if (normalized.endsWith(`:${channel}`)) return normalized;
  return `${normalized}:${channel}`;
};

export const createNotificationLogEntry = async (payload: {
  teacherId: bigint;
  studentId?: number | null;
  lessonId?: number | null;
  type: string;
  source?: 'AUTO' | 'MANUAL' | null;
  channel?: NotificationLogChannel | null;
  scheduledFor?: Date | null;
  dedupeKey?: string | null;
}) => {
  const normalizedDedupeKey =
    typeof payload.dedupeKey === 'string' && payload.dedupeKey.trim().length > 0
      ? payload.dedupeKey.trim()
      : null;

  try {
    const teacherExists = await prisma.teacher.findUnique({
      where: { chatId: payload.teacherId },
      select: { chatId: true },
    });
    if (!teacherExists) return null;

    if (normalizedDedupeKey) {
      const existing = await prisma.notificationLog.findUnique({
        where: { dedupeKey: normalizedDedupeKey },
      });
      if (existing) return null;
    }

    return await prisma.notificationLog.create({
      data: {
        teacherId: payload.teacherId,
        studentId: payload.studentId ?? null,
        lessonId: payload.lessonId ?? null,
        type: payload.type,
        source: payload.source ?? null,
        channel: payload.channel ?? 'TELEGRAM',
        scheduledFor: payload.scheduledFor ?? null,
        status: 'PENDING',
        dedupeKey: normalizedDedupeKey,
      },
    });
  } catch (error) {
    const prismaError = error as { code?: string; message?: string; meta?: { target?: unknown } } | null;
    const uniqueTarget = prismaError?.meta?.target;
    const isDedupeConflict =
      prismaError?.code === 'P2002' &&
      (Array.isArray(uniqueTarget)
        ? uniqueTarget.includes('dedupeKey')
        : typeof prismaError?.message === 'string' && prismaError.message.includes('dedupeKey'));
    const isForeignKeyConflict = prismaError?.code === 'P2003';
    if (isDedupeConflict || isForeignKeyConflict) {
      return null;
    }
    throw error;
  }
};

export const finalizeNotificationLogEntry = async (
  logId: number,
  payload: { status: 'SENT' | 'FAILED'; errorText?: string },
) =>
  prisma.notificationLog.update({
    where: { id: logId },
    data: {
      status: payload.status,
      sentAt: payload.status === 'SENT' ? new Date() : null,
      errorText: payload.errorText ?? null,
    },
  });

export const summarizeNotificationChannelDelivery = (
  results: NotificationChannelDeliveryResult[],
) => {
  if (results.some((result) => result.status === 'sent')) {
    return { status: 'sent' as const };
  }

  const failed = results.filter(
    (result): result is Extract<NotificationChannelDeliveryResult, { status: 'failed' }> =>
      result.status === 'failed',
  );
  if (failed.length > 0) {
    return {
      status: 'failed' as const,
      error: failed.map((result) => `${result.channel}: ${result.error}`).join('; '),
    };
  }

  return { status: 'skipped' as const };
};

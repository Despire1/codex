import type { User } from '@prisma/client';
import type { ActivityCategory } from '../../../entities/types';
import { listActivityFeedForTeacher } from '../../activityFeedService';
import prisma from '../../prismaClient';

type EnsureTeacher = (user: User) => Promise<{
  chatId: bigint;
  activityFeedSeenAt: Date | null;
}>;

type ActivityFeedFilters = {
  limit?: number;
  cursor?: string | null;
  categories?: ActivityCategory[];
  studentId?: number | null;
  from?: Date;
  to?: Date;
};

const toValidDate = (value: unknown): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

export const parseActivityCategories = (value?: string | null) => {
  if (!value) return undefined;
  const categories = value
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
    .filter(
      (item): item is ActivityCategory =>
        item === 'LESSON' ||
        item === 'STUDENT' ||
        item === 'HOMEWORK' ||
        item === 'SETTINGS' ||
        item === 'PAYMENT' ||
        item === 'NOTIFICATION',
    );
  return categories.length > 0 ? categories : undefined;
};

export const parseQueryDate = (value?: string | null) => {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

export const createActivityFeedService = ({ ensureTeacher }: { ensureTeacher: EnsureTeacher }) => {
  const listActivityFeed = async (user: User, filters: ActivityFeedFilters) => {
    const teacher = await ensureTeacher(user);
    return listActivityFeedForTeacher(teacher.chatId, filters);
  };

  const resolveLatestActivityFeedOccurredAt = async (teacherId: bigint) => {
    const [activityEvent, paymentEvent, notificationLog] = await Promise.all([
      prisma.activityEvent.findFirst({
        where: { teacherId },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        select: { occurredAt: true },
      }),
      prisma.paymentEvent.findFirst({
        where: {
          OR: [{ teacherId }, { teacherId: null, lesson: { teacherId } }],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { createdAt: true },
      }),
      prisma.notificationLog.findFirst({
        where: { teacherId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { createdAt: true },
      }),
    ]);

    const timestamps = [activityEvent?.occurredAt, paymentEvent?.createdAt, notificationLog?.createdAt].filter(
      (value): value is Date => Boolean(value),
    );
    if (timestamps.length === 0) return null;

    return timestamps.reduce((latest, item) => (item.getTime() > latest.getTime() ? item : latest), timestamps[0]);
  };

  const buildActivityFeedUnreadStatus = (latestOccurredAt: Date | null, seenAt: Date | null) => ({
    hasUnread: Boolean(latestOccurredAt && (!seenAt || latestOccurredAt.getTime() > seenAt.getTime())),
    latestOccurredAt,
    seenAt,
  });

  const getActivityFeedUnreadStatus = async (user: User) => {
    const teacher = await ensureTeacher(user);
    const latestOccurredAt = await resolveLatestActivityFeedOccurredAt(teacher.chatId);

    return buildActivityFeedUnreadStatus(latestOccurredAt, teacher.activityFeedSeenAt ?? null);
  };

  const markActivityFeedSeen = async (user: User, body: Record<string, unknown>) => {
    const teacher = await ensureTeacher(user);
    const latestOccurredAt = await resolveLatestActivityFeedOccurredAt(teacher.chatId);
    const rawSeenThrough = body.seenThrough;
    let seenThrough: Date | null = null;

    if (rawSeenThrough !== undefined) {
      if (typeof rawSeenThrough !== 'string') throw new Error('invalid_seen_through');
      seenThrough = toValidDate(rawSeenThrough);
      if (!seenThrough) throw new Error('invalid_seen_through');
    }

    let nextSeenAt = teacher.activityFeedSeenAt ?? null;
    const boundedSeenThrough =
      seenThrough && latestOccurredAt && seenThrough.getTime() > latestOccurredAt.getTime()
        ? latestOccurredAt
        : seenThrough;
    const targetSeenAt = boundedSeenThrough ?? latestOccurredAt;

    if (targetSeenAt && (!nextSeenAt || targetSeenAt.getTime() > nextSeenAt.getTime())) {
      const updatedTeacher = await prisma.teacher.update({
        where: { chatId: teacher.chatId },
        data: {
          activityFeedSeenAt: targetSeenAt,
        },
        select: {
          activityFeedSeenAt: true,
        },
      });
      nextSeenAt = updatedTeacher.activityFeedSeenAt;
    }

    return buildActivityFeedUnreadStatus(latestOccurredAt, nextSeenAt);
  };

  return {
    listActivityFeed,
    getActivityFeedUnreadStatus,
    markActivityFeedSeen,
  };
};

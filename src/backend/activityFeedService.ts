import prisma from './prismaClient';
import type {
  ActivityCategory,
  ActivityFeedItem,
  ActivityRecordSource,
  ActivitySource,
  ActivityStatus,
} from '../entities/types';

type ActivityFeedFilters = {
  limit?: number;
  cursor?: string | null;
  categories?: ActivityCategory[];
  studentId?: number | null;
  from?: Date | null;
  to?: Date | null;
};

type ActivityEventLogPayload = {
  teacherId: bigint;
  studentId?: number | null;
  lessonId?: number | null;
  homeworkId?: number | null;
  category: Exclude<ActivityCategory, 'PAYMENT' | 'NOTIFICATION'>;
  action: string;
  status?: ActivityStatus;
  source?: ActivitySource;
  title: string;
  details?: string | null;
  payload?: Record<string, unknown> | null;
  occurredAt?: Date;
  dedupeKey?: string | null;
};

type FeedItemInternal = ActivityFeedItem & {
  _sourceId: number;
  _occurredAtMs: number;
};

type FeedItemContext = {
  studentName?: string | null;
  lessonStartAt?: Date | null;
};

type FeedCursor = {
  occurredAt: string;
  sourceRecord: ActivityRecordSource;
  sourceId: number;
};

const MIN_LIMIT = 1;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

const parseCategory = (value: string): ActivityCategory | null => {
  if (
    value === 'LESSON' ||
    value === 'STUDENT' ||
    value === 'HOMEWORK' ||
    value === 'SETTINGS' ||
    value === 'PAYMENT' ||
    value === 'NOTIFICATION'
  ) {
    return value;
  }
  return null;
};

const parseStatus = (value: string): ActivityStatus => (value === 'FAILED' ? 'FAILED' : 'SUCCESS');

const parseSource = (value: string): ActivitySource => {
  if (value === 'USER' || value === 'SYSTEM' || value === 'AUTO') return value;
  return 'LEGACY';
};

const normalizeLimit = (value?: number) => {
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.round(value as number), MIN_LIMIT), MAX_LIMIT);
};

const toCursor = (item: FeedItemInternal): string => {
  const payload: FeedCursor = {
    occurredAt: item.occurredAt,
    sourceRecord: item.sourceRecord,
    sourceId: item._sourceId,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
};

const parseCursor = (value?: string | null): FeedCursor | null => {
  if (!value) return null;
  try {
    const raw = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as FeedCursor;
    if (!raw || typeof raw !== 'object') return null;
    if (typeof raw.occurredAt !== 'string') return null;
    if (raw.sourceRecord !== 'ACTIVITY_EVENT' && raw.sourceRecord !== 'PAYMENT_EVENT' && raw.sourceRecord !== 'NOTIFICATION_LOG') {
      return null;
    }
    if (!Number.isFinite(raw.sourceId)) return null;
    return raw;
  } catch {
    return null;
  }
};

const sourcePriority: Record<ActivityRecordSource, number> = {
  ACTIVITY_EVENT: 3,
  PAYMENT_EVENT: 2,
  NOTIFICATION_LOG: 1,
};

const MANUAL_REMINDER_DEDUPE_WINDOW_MS = 10 * 60 * 1000;

const compareFeedItemsDesc = (a: FeedItemInternal, b: FeedItemInternal) => {
  if (a._occurredAtMs !== b._occurredAtMs) return b._occurredAtMs - a._occurredAtMs;
  if (a.sourceRecord !== b.sourceRecord) {
    return sourcePriority[b.sourceRecord] - sourcePriority[a.sourceRecord];
  }
  return b._sourceId - a._sourceId;
};

const isOlderThanCursor = (item: FeedItemInternal, cursor: FeedCursor) => {
  const cursorMs = new Date(cursor.occurredAt).getTime();
  if (!Number.isFinite(cursorMs)) return true;
  if (item._occurredAtMs !== cursorMs) return item._occurredAtMs < cursorMs;
  if (item.sourceRecord !== cursor.sourceRecord) {
    return sourcePriority[item.sourceRecord] < sourcePriority[cursor.sourceRecord];
  }
  return item._sourceId < cursor.sourceId;
};

const resolvePaymentTitle = (event: {
  type: string;
  lessonsDelta: number;
  reason: string | null;
}) => {
  switch (event.type) {
    case 'TOP_UP':
      return `Пополнение баланса: +${event.lessonsDelta} ур.`;
    case 'SUBSCRIPTION':
      return `Абонемент: +${event.lessonsDelta} ур.`;
    case 'AUTO_CHARGE':
      return 'Автосписание за урок';
    case 'MANUAL_PAID':
      if (event.reason === 'BALANCE_PAYMENT') return 'Урок оплачен с баланса';
      return 'Урок оплачен вручную';
    case 'ADJUSTMENT':
      if (event.reason === 'LESSON_CANCELED') return 'Возврат урока после отмены';
      if (event.reason === 'PAYMENT_REVERT_REFUND' || event.reason === 'PAYMENT_REVERT') {
        return 'Отмена оплаты с возвратом';
      }
      if (event.reason === 'PAYMENT_REVERT_WRITE_OFF') {
        return 'Отмена оплаты без возврата';
      }
      return event.lessonsDelta >= 0 ? 'Корректировка баланса (плюс)' : 'Корректировка баланса (минус)';
    default:
      return 'Изменение оплаты';
  }
};

const resolveNotificationTitle = (event: { type: string; status: string }) => {
  const suffix = event.status === 'FAILED' ? 'не отправлено' : 'отправлено';
  switch (event.type) {
    case 'PAYMENT_REMINDER_STUDENT':
      return `Напоминание об оплате ${suffix}`;
    case 'PAYMENT_REMINDER_TEACHER':
      return `Уведомление преподавателю ${suffix}`;
    case 'STUDENT_LESSON_REMINDER':
      return `Напоминание ученику о занятии ${suffix}`;
    case 'TEACHER_LESSON_REMINDER':
      return `Напоминание преподавателю о занятии ${suffix}`;
    case 'TEACHER_DAILY_SUMMARY':
      return `Сводка на сегодня ${suffix}`;
    case 'TEACHER_TOMORROW_SUMMARY':
      return `Сводка на завтра ${suffix}`;
    default:
      return `Уведомление ${suffix}`;
  }
};

const parsePayload = (value: string | null): Record<string, unknown> | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const withLessonStartAt = (
  payload: Record<string, unknown> | null,
  lessonStartAt?: Date | null,
): Record<string, unknown> | null => {
  if (!lessonStartAt) return payload;
  const lessonStartIso = lessonStartAt.toISOString();
  if (!payload) return { lessonStartAt: lessonStartIso };
  if (typeof payload.lessonStartAt === 'string' && payload.lessonStartAt.trim()) return payload;
  return { ...payload, lessonStartAt: lessonStartIso };
};

export const mapPaymentEventToFeedItem = (
  event: {
    id: number;
    type: string;
    lessonsDelta: number;
    priceSnapshot: number;
    moneyAmount: number | null;
    createdBy: string;
    reason: string | null;
    comment: string | null;
    createdAt: Date;
    studentId: number;
    lessonId: number | null;
  },
  context: FeedItemContext = {},
): FeedItemInternal => ({
  id: `payment_${event.id}`,
  sourceRecord: 'PAYMENT_EVENT',
  category: 'PAYMENT',
  action: event.type,
  status: 'SUCCESS',
  source: event.createdBy === 'TEACHER' ? 'USER' : 'SYSTEM',
  title: resolvePaymentTitle(event),
  details: event.comment,
  occurredAt: event.createdAt.toISOString(),
  studentId: event.studentId,
  studentName: context.studentName ?? null,
  lessonId: event.lessonId,
  homeworkId: null,
  payload: withLessonStartAt(
    {
      reason: event.reason,
      lessonsDelta: event.lessonsDelta,
      priceSnapshot: event.priceSnapshot,
      moneyAmount: event.moneyAmount,
    },
    context.lessonStartAt,
  ),
  _sourceId: event.id,
  _occurredAtMs: event.createdAt.getTime(),
});

export const mapNotificationLogToFeedItem = (
  event: {
    id: number;
    type: string;
    source: string | null;
    status: string;
    errorText: string | null;
    createdAt: Date;
    sentAt: Date | null;
    studentId: number | null;
    lessonId: number | null;
  },
  context: FeedItemContext = {},
): FeedItemInternal => {
  const occurredAt = (event.sentAt ?? event.createdAt).toISOString();
  const source: ActivitySource = event.source === 'MANUAL' ? 'USER' : 'AUTO';
  return {
    id: `notification_${event.id}`,
    sourceRecord: 'NOTIFICATION_LOG',
    category: 'NOTIFICATION',
    action: event.type,
    status: parseStatus(event.status),
    source,
    title: resolveNotificationTitle(event),
    details: event.status === 'FAILED' ? event.errorText : null,
    occurredAt,
    studentId: event.studentId,
    studentName: context.studentName ?? null,
    lessonId: event.lessonId,
    homeworkId: null,
    payload: withLessonStartAt(
      {
        notificationType: event.type,
        notificationSource: event.source,
      },
      context.lessonStartAt,
    ),
    _sourceId: event.id,
    _occurredAtMs: new Date(occurredAt).getTime(),
  };
};

const mapActivityEventToFeedItem = (
  event: {
    id: number;
    category: string;
    action: string;
    status: string;
    source: string;
    title: string;
    details: string | null;
    payload: string | null;
    occurredAt: Date;
    studentId: number | null;
    lessonId: number | null;
    homeworkId: number | null;
  },
  context: FeedItemContext = {},
): FeedItemInternal => {
  const parsedCategory = parseCategory(event.category) ?? 'SETTINGS';
  const payload = withLessonStartAt(parsePayload(event.payload), context.lessonStartAt);
  return {
    id: `activity_${event.id}`,
    sourceRecord: 'ACTIVITY_EVENT',
    category: parsedCategory,
    action: event.action,
    status: parseStatus(event.status),
    source: parseSource(event.source),
    title: event.title,
    details: event.details,
    occurredAt: event.occurredAt.toISOString(),
    studentId: event.studentId,
    studentName: context.studentName ?? null,
    lessonId: event.lessonId,
    homeworkId: event.homeworkId,
    payload,
    _sourceId: event.id,
    _occurredAtMs: event.occurredAt.getTime(),
  };
};

export const mergeAndPaginateFeed = (
  items: FeedItemInternal[],
  limit: number,
  cursor: FeedCursor | null,
): { items: ActivityFeedItem[]; nextCursor: string | null } => {
  const sorted = [...items].sort(compareFeedItemsDesc);
  const filtered = cursor ? sorted.filter((item) => isOlderThanCursor(item, cursor)) : sorted;
  const page = filtered.slice(0, limit);
  const nextCursor = filtered.length > limit && page.length > 0 ? toCursor(page[page.length - 1]) : null;

  return {
    items: page.map(({ _sourceId: _ignoredSourceId, _occurredAtMs: _ignoredOccurredAtMs, ...rest }) => rest),
    nextCursor,
  };
};

const isManualPaymentReminderNotification = (item: FeedItemInternal) =>
  item.sourceRecord === 'NOTIFICATION_LOG' &&
  item.category === 'NOTIFICATION' &&
  item.action === 'PAYMENT_REMINDER_STUDENT' &&
  item.source === 'USER';

const isManualPaymentReminderActivityEvent = (item: FeedItemInternal) =>
  item.sourceRecord === 'ACTIVITY_EVENT' &&
  item.category === 'LESSON' &&
  item.action === 'REMIND_PAYMENT' &&
  item.source === 'USER';

const dedupeManualPaymentReminderItems = (items: FeedItemInternal[]) => {
  const notificationsByTarget = new Map<string, FeedItemInternal[]>();

  items.forEach((item) => {
    if (!isManualPaymentReminderNotification(item)) return;
    const key = `${item.studentId ?? 'na'}:${item.lessonId ?? 'na'}`;
    const existing = notificationsByTarget.get(key);
    if (existing) {
      existing.push(item);
      return;
    }
    notificationsByTarget.set(key, [item]);
  });

  return items.filter((item) => {
    if (!isManualPaymentReminderActivityEvent(item)) return true;
    const key = `${item.studentId ?? 'na'}:${item.lessonId ?? 'na'}`;
    const notifications = notificationsByTarget.get(key);
    if (!notifications || notifications.length === 0) return true;
    return !notifications.some(
      (notification) => Math.abs(notification._occurredAtMs - item._occurredAtMs) <= MANUAL_REMINDER_DEDUPE_WINDOW_MS,
    );
  });
};

const resolveDateRange = (from?: Date | null, to?: Date | null) => {
  if (!from && !to) return undefined;
  const range: { gte?: Date; lte?: Date } = {};
  if (from) range.gte = from;
  if (to) range.lte = to;
  return range;
};

export const listActivityFeedForTeacher = async (
  teacherId: bigint,
  filters: ActivityFeedFilters,
): Promise<{ items: ActivityFeedItem[]; nextCursor: string | null }> => {
  const limit = normalizeLimit(filters.limit);
  const cursor = parseCursor(filters.cursor);
  const categories = (filters.categories ?? []).filter((item): item is ActivityCategory => Boolean(parseCategory(item)));
  const categorySet = new Set(categories);
  const hasCategoryFilter = categorySet.size > 0;

  const loadPayments = !hasCategoryFilter || categorySet.has('PAYMENT');
  const loadNotifications = !hasCategoryFilter || categorySet.has('NOTIFICATION');
  const activityCategories = hasCategoryFilter
    ? categories.filter((item) => item !== 'PAYMENT' && item !== 'NOTIFICATION')
    : [];
  const loadActivityEvents = !hasCategoryFilter || activityCategories.length > 0;

  const fetchSize = Math.min(limit * 6, 300);
  const range = resolveDateRange(filters.from, filters.to);
  const cursorDate = cursor ? new Date(cursor.occurredAt) : null;

  const activityWhere: Record<string, unknown> = {
    teacherId,
  };
  if (typeof filters.studentId === 'number') {
    activityWhere.studentId = filters.studentId;
  }
  if (range) {
    activityWhere.occurredAt = range;
  }
  if (cursorDate && !Number.isNaN(cursorDate.getTime())) {
    activityWhere.occurredAt = {
      ...(typeof activityWhere.occurredAt === 'object' ? (activityWhere.occurredAt as Record<string, Date>) : {}),
      lte: cursorDate,
    };
  }
  if (activityCategories.length > 0) {
    activityWhere.category = { in: activityCategories };
  }

  const paymentWhere: Record<string, unknown> = {
    OR: [{ teacherId }, { teacherId: null, lesson: { teacherId } }],
  };
  if (typeof filters.studentId === 'number') {
    paymentWhere.studentId = filters.studentId;
  }
  if (range) {
    paymentWhere.createdAt = range;
  }
  if (cursorDate && !Number.isNaN(cursorDate.getTime())) {
    paymentWhere.createdAt = {
      ...(typeof paymentWhere.createdAt === 'object' ? (paymentWhere.createdAt as Record<string, Date>) : {}),
      lte: cursorDate,
    };
  }

  const notificationWhere: Record<string, unknown> = {
    teacherId,
  };
  if (typeof filters.studentId === 'number') {
    notificationWhere.studentId = filters.studentId;
  }
  if (range) {
    notificationWhere.createdAt = range;
  }
  if (cursorDate && !Number.isNaN(cursorDate.getTime())) {
    notificationWhere.createdAt = {
      ...(typeof notificationWhere.createdAt === 'object'
        ? (notificationWhere.createdAt as Record<string, Date>)
        : {}),
      lte: cursorDate,
    };
  }

  const [activityEvents, paymentEvents, notificationLogs] = await Promise.all([
    loadActivityEvents
      ? prisma.activityEvent.findMany({
          where: activityWhere,
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          take: fetchSize,
        })
      : Promise.resolve([]),
    loadPayments
      ? prisma.paymentEvent.findMany({
          where: paymentWhere,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: fetchSize,
        })
      : Promise.resolve([]),
    loadNotifications
      ? prisma.notificationLog.findMany({
          where: notificationWhere,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: fetchSize,
        })
      : Promise.resolve([]),
  ]);

  const studentIds = new Set<number>();
  activityEvents.forEach((item) => {
    if (item.studentId) studentIds.add(item.studentId);
  });
  paymentEvents.forEach((item) => studentIds.add(item.studentId));
  notificationLogs.forEach((item) => {
    if (item.studentId) studentIds.add(item.studentId);
  });
  const lessonIds = new Set<number>();
  activityEvents.forEach((item) => {
    if (item.lessonId) lessonIds.add(item.lessonId);
  });
  paymentEvents.forEach((item) => {
    if (item.lessonId) lessonIds.add(item.lessonId);
  });
  notificationLogs.forEach((item) => {
    if (item.lessonId) lessonIds.add(item.lessonId);
  });

  const [links, lessons] = await Promise.all([
    studentIds.size
      ? prisma.teacherStudent.findMany({
          where: {
            teacherId,
            studentId: { in: Array.from(studentIds) },
          },
          include: { student: true },
        })
      : Promise.resolve([]),
    lessonIds.size
      ? prisma.lesson.findMany({
          where: {
            id: { in: Array.from(lessonIds) },
            teacherId,
          },
          select: {
            id: true,
            startAt: true,
          },
        })
      : Promise.resolve([]),
  ]);
  const namesByStudentId = new Map<number, string>();
  links.forEach((link: any) => {
    const customName = typeof link.customName === 'string' ? link.customName.trim() : '';
    namesByStudentId.set(link.studentId, customName || 'ученик');
  });
  const lessonStartsById = new Map<number, Date>();
  lessons.forEach((lesson: any) => {
    lessonStartsById.set(lesson.id, lesson.startAt);
  });

  const internalItems: FeedItemInternal[] = [
    ...activityEvents.map((item) =>
      mapActivityEventToFeedItem(item as any, {
        studentName: item.studentId ? namesByStudentId.get(item.studentId) : null,
        lessonStartAt: item.lessonId ? lessonStartsById.get(item.lessonId) : null,
      }),
    ),
    ...paymentEvents.map((item) =>
      mapPaymentEventToFeedItem(item as any, {
        studentName: namesByStudentId.get(item.studentId),
        lessonStartAt: item.lessonId ? lessonStartsById.get(item.lessonId) : null,
      }),
    ),
    ...notificationLogs.map((item) =>
      mapNotificationLogToFeedItem(item as any, {
        studentName: item.studentId ? namesByStudentId.get(item.studentId) : null,
        lessonStartAt: item.lessonId ? lessonStartsById.get(item.lessonId) : null,
      }),
    ),
  ];

  return mergeAndPaginateFeed(dedupeManualPaymentReminderItems(internalItems), limit, cursor);
};

export const logActivityEvent = async (payload: ActivityEventLogPayload) => {
  const occurredAt = payload.occurredAt ?? new Date();
  const serializedPayload = payload.payload ? JSON.stringify(payload.payload) : null;
  try {
    return await prisma.activityEvent.create({
      data: {
        teacherId: payload.teacherId,
        studentId: payload.studentId ?? null,
        lessonId: payload.lessonId ?? null,
        homeworkId: payload.homeworkId ?? null,
        category: payload.category,
        action: payload.action,
        status: payload.status ?? 'SUCCESS',
        source: payload.source ?? 'USER',
        title: payload.title,
        details: payload.details ?? null,
        payload: serializedPayload,
        occurredAt,
        dedupeKey: payload.dedupeKey ?? null,
      },
    });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return null;
    }
    throw error;
  }
};

export type { ActivityFeedFilters, ActivityEventLogPayload };

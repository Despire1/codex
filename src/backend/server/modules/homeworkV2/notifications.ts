import prisma from '../../../prismaClient';
import { sendTelegramMessage as sendNotificationTelegramMessage } from '../../../notificationService';
import {
  createNotificationLogEntry,
  finalizeNotificationLogEntry,
  resolveNotificationChannelDedupeKey,
  summarizeNotificationChannelDelivery,
  type NotificationChannelDeliveryResult,
} from '../../../notificationLogService';
import { resolveStudentTelegramId } from '../../../studentContacts';
import {
  buildWebPushTextNotificationPayload,
  hasWebPushSubscriptionsForStudent,
  isWebPushConfigured,
  sendWebPushToStudent,
} from '../../../webPushService';
import { formatInTimeZone, resolveTimeZone } from '../../../../shared/lib/timezoneDates';
import { escapeHtml } from '../../../../shared/lib/htmlEscape';
import { buildHomeworkAssignmentDeepLink } from '../../lib/deepLinks';

export type HomeworkV2NotificationKind =
  | 'ASSIGNED'
  | 'UNISSUED'
  | 'REVIEWED'
  | 'RETURNED'
  | 'REMINDER_24H'
  | 'REMINDER_MORNING'
  | 'REMINDER_3H'
  | 'MANUAL_REMINDER'
  | 'OVERDUE';

const formatHomeworkDeadlineLabel = (deadlineAt: Date | null, timeZone?: string | null) => {
  if (!deadlineAt) return 'без дедлайна';
  const tz = resolveTimeZone(timeZone);
  const formatted = formatInTimeZone(deadlineAt, 'dd.MM HH:mm', { timeZone: tz });
  const tzLabel = formatInTimeZone(deadlineAt, 'zzz', { timeZone: tz });
  return tzLabel && tzLabel !== tz ? `${formatted} (${tzLabel})` : formatted;
};

export const buildHomeworkNotificationText = (
  kind: HomeworkV2NotificationKind,
  assignment: { title: string; deadlineAt?: Date | null; teacherComment?: string | null },
  timeZone?: string | null,
) => {
  const deadlineLabel = formatHomeworkDeadlineLabel(assignment.deadlineAt ?? null, timeZone);
  const safeTitle = escapeHtml(assignment.title);
  if (kind === 'ASSIGNED') {
    return `📝 <b>Новая домашка</b>\n\n${safeTitle}\nДедлайн: ${deadlineLabel}`;
  }
  if (kind === 'UNISSUED') {
    return `📝 <b>Домашка отозвана</b>\n\n${safeTitle}`;
  }
  if (kind === 'REVIEWED') {
    return `📝 <b>Домашка проверена</b>\n\n${safeTitle}\nИтог — в приложении.`;
  }
  if (kind === 'RETURNED') {
    const rawComment = assignment.teacherComment?.trim() ?? '';
    // TEA-381: telegram message limit = 4096; обрезаем длинные комментарии.
    const TRUNCATE_AT = 3500;
    const truncated = rawComment.length > TRUNCATE_AT ? `${rawComment.slice(0, TRUNCATE_AT)}…` : rawComment;
    const comment = truncated ? escapeHtml(truncated) : '—';
    return `📝 <b>Возвращена на доработку</b>\n\n${safeTitle}\n\nКомментарий: ${comment}`;
  }
  if (kind === 'REMINDER_24H') {
    return `📝 <b>Дедлайн через 24 часа</b>\n\n${safeTitle}\nДо: ${deadlineLabel}`;
  }
  if (kind === 'REMINDER_MORNING') {
    return `📝 <b>Сегодня дедлайн</b>\n\n${safeTitle}\nДо: ${deadlineLabel}`;
  }
  if (kind === 'REMINDER_3H') {
    return `📝 <b>Дедлайн через 3 часа</b>\n\n${safeTitle}\nДо: ${deadlineLabel}`;
  }
  if (kind === 'MANUAL_REMINDER') {
    return `📝 <b>Напоминание по домашке</b>\n\n${safeTitle}\nДедлайн: ${deadlineLabel}`;
  }
  return `📝 <b>Домашка просрочена</b>\n\n${safeTitle}\nДедлайн был: ${deadlineLabel}`;
};

const HOMEWORK_TELEGRAM_DAILY_CAP_PER_STUDENT = 6;

const isHomeworkTelegramCapReached = async (studentId: number) => {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const count = await prisma.notificationLog.count({
    where: {
      channel: 'TELEGRAM',
      status: 'SENT',
      studentId,
      createdAt: { gte: since },
    },
  });
  return count >= HOMEWORK_TELEGRAM_DAILY_CAP_PER_STUDENT;
};

const deliverHomeworkNotificationChannel = async (payload: {
  channel: 'TELEGRAM' | 'PWA_PUSH';
  enabled: boolean;
  teacherId: bigint;
  studentId: number;
  type: string;
  dedupeKey?: string | null;
  respectDailyCap?: boolean;
  send: () => Promise<void>;
}): Promise<NotificationChannelDeliveryResult> => {
  if (!payload.enabled) {
    return { channel: payload.channel, status: 'skipped' };
  }

  if (payload.respectDailyCap && payload.channel === 'TELEGRAM') {
    if (await isHomeworkTelegramCapReached(payload.studentId)) {
      return { channel: payload.channel, status: 'skipped' };
    }
  }

  const log = await createNotificationLogEntry({
    teacherId: payload.teacherId,
    studentId: payload.studentId,
    lessonId: null,
    type: payload.type,
    source: null,
    channel: payload.channel,
    scheduledFor: null,
    dedupeKey: resolveNotificationChannelDedupeKey(payload.dedupeKey, payload.channel),
  });
  if (!log) {
    return { channel: payload.channel, status: 'skipped' };
  }

  try {
    await payload.send();
    await finalizeNotificationLogEntry(log.id, { status: 'SENT' });
    return { channel: payload.channel, status: 'sent' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizeNotificationLogEntry(log.id, { status: 'FAILED', errorText: message });
    return { channel: payload.channel, status: 'failed', error: message };
  }
};

export const sendHomeworkSubmissionNotificationToTeacher = async (payload: {
  teacherId: bigint;
  studentId: number;
  assignmentId: number;
  submissionId: number;
  studentName: string;
  assignmentTitle: string;
  attemptNo: number;
  dedupeKey?: string;
}) => {
  const teacher = await prisma.teacher.findUnique({ where: { chatId: payload.teacherId } });
  if (!teacher) return { status: 'skipped' as const };
  const telegramEnabled = Boolean((process.env.TELEGRAM_BOT_TOKEN ?? '') && teacher.chatId);
  if (!telegramEnabled) return { status: 'skipped' as const };

  const text =
    `📥 <b>${escapeHtml(payload.studentName)}</b> сдал(а) ДЗ` +
    (payload.assignmentTitle ? `\n«${escapeHtml(payload.assignmentTitle)}»` : '') +
    (payload.attemptNo > 1 ? ` (попытка №${payload.attemptNo})` : '') +
    `\n\nОткройте задание, чтобы проверить.`;
  const reviewLink = buildHomeworkAssignmentDeepLink(payload.assignmentId);

  const log = await createNotificationLogEntry({
    teacherId: payload.teacherId,
    studentId: payload.studentId,
    lessonId: null,
    type: 'SUBMITTED',
    source: null,
    channel: 'TELEGRAM',
    scheduledFor: null,
    dedupeKey: resolveNotificationChannelDedupeKey(payload.dedupeKey ?? null, 'TELEGRAM'),
  });
  if (!log) return { status: 'skipped' as const };

  try {
    await sendNotificationTelegramMessage(teacher.chatId as bigint, text, {
      parseMode: 'HTML',
      webAppButton: reviewLink ? { label: 'Открыть проверку', url: reviewLink.fullUrl } : null,
    });
    await finalizeNotificationLogEntry(log.id, { status: 'SENT' });
    return { status: 'sent' as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizeNotificationLogEntry(log.id, { status: 'FAILED', errorText: message });
    return { status: 'failed' as const, error: message };
  }
};

export const sendHomeworkNotificationToStudent = async (payload: {
  teacherId: bigint;
  studentId: number;
  type: string;
  dedupeKey?: string;
  text: string;
  assignmentId?: number;
}) => {
  const student = await prisma.student.findUnique({ where: { id: payload.studentId } });
  if (!student) return { status: 'skipped' as const };
  const telegramId = await resolveStudentTelegramId(student);
  const pwaEnabled = isWebPushConfigured() && (await hasWebPushSubscriptionsForStudent(payload.studentId));
  const telegramEnabled = Boolean((process.env.TELEGRAM_BOT_TOKEN ?? '') && telegramId);
  if (!telegramEnabled && !pwaEnabled) return { status: 'skipped' as const };

  const assignmentLink = payload.assignmentId ? buildHomeworkAssignmentDeepLink(payload.assignmentId) : null;
  const pwaPayload = buildWebPushTextNotificationPayload({
    text: payload.text,
    defaultTitle: 'TeacherBot',
    path: assignmentLink?.path ?? '/homeworks',
    tag: `homework-${payload.type.toLowerCase()}-${payload.studentId}`,
  });

  const results = await Promise.all([
    deliverHomeworkNotificationChannel({
      channel: 'TELEGRAM',
      enabled: telegramEnabled,
      teacherId: payload.teacherId,
      studentId: payload.studentId,
      type: payload.type,
      dedupeKey: payload.dedupeKey ?? null,
      respectDailyCap: payload.type !== 'MANUAL_REMINDER',
      send: () =>
        sendNotificationTelegramMessage(telegramId as bigint, payload.text, {
          parseMode: 'HTML',
          webAppButton: assignmentLink ? { label: assignmentLink.label, url: assignmentLink.fullUrl } : null,
        }),
    }),
    deliverHomeworkNotificationChannel({
      channel: 'PWA_PUSH',
      enabled: pwaEnabled,
      teacherId: payload.teacherId,
      studentId: payload.studentId,
      type: payload.type,
      dedupeKey: payload.dedupeKey ?? null,
      send: async () => {
        const result = await sendWebPushToStudent(payload.studentId, pwaPayload);
        if (result.status !== 'sent') {
          throw new Error(result.error ?? result.reason ?? 'pwa_push_failed');
        }
      },
    }),
  ]);

  return summarizeNotificationChannelDelivery(results);
};

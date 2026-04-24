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
  return formatInTimeZone(deadlineAt, 'dd.MM HH:mm', { timeZone: resolveTimeZone(timeZone) });
};

export const buildHomeworkNotificationText = (
  kind: HomeworkV2NotificationKind,
  assignment: { title: string; deadlineAt?: Date | null; teacherComment?: string | null },
  timeZone?: string | null,
) => {
  const deadlineLabel = formatHomeworkDeadlineLabel(assignment.deadlineAt ?? null, timeZone);
  if (kind === 'ASSIGNED') return `📚 Новая домашка: ${assignment.title}\nДедлайн: ${deadlineLabel}`;
  if (kind === 'UNISSUED') return `↩️ Домашка отозвана: ${assignment.title}\nДомашнее задание отозвано.`;
  if (kind === 'REVIEWED') return `✅ Домашка проверена: ${assignment.title}\nИтог доступен в приложении.`;
  if (kind === 'RETURNED')
    return `🛠 Домашка возвращена на доработку: ${assignment.title}\nКомментарий: ${assignment.teacherComment ?? '—'}`;
  if (kind === 'REMINDER_24H') return `⏰ Напоминание: дедлайн через 24 часа\n${assignment.title}\nДо: ${deadlineLabel}`;
  if (kind === 'REMINDER_MORNING') return `🌤 Сегодня дедлайн по домашке\n${assignment.title}\nДо: ${deadlineLabel}`;
  if (kind === 'REMINDER_3H') return `⌛ Дедлайн скоро (через 3 часа)\n${assignment.title}\nДо: ${deadlineLabel}`;
  if (kind === 'MANUAL_REMINDER') return `🔔 Напоминание по домашке\n${assignment.title}\nДедлайн: ${deadlineLabel}`;
  return `⚠️ Просрочена домашка: ${assignment.title}\nДедлайн был: ${deadlineLabel}`;
};

const deliverHomeworkNotificationChannel = async (payload: {
  channel: 'TELEGRAM' | 'PWA_PUSH';
  enabled: boolean;
  teacherId: bigint;
  studentId: number;
  type: string;
  dedupeKey?: string | null;
  send: () => Promise<void>;
}): Promise<NotificationChannelDeliveryResult> => {
  if (!payload.enabled) {
    return { channel: payload.channel, status: 'skipped' };
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
      send: () =>
        sendNotificationTelegramMessage(telegramId as bigint, payload.text, {
          webAppButton: assignmentLink
            ? { label: assignmentLink.label, url: assignmentLink.fullUrl }
            : null,
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

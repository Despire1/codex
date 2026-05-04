import { addDays, addMinutes, isSameDay } from 'date-fns';
import ru from 'date-fns/locale/ru';
import prisma from './prismaClient';
import {
  createNotificationLogEntry,
  finalizeNotificationLogEntry,
  resolveNotificationChannelDedupeKey,
  summarizeNotificationChannelDelivery,
  type NotificationChannelDeliveryResult,
  type NotificationLogChannel,
} from './notificationLogService';
import { resolveStudentTelegramId } from './studentContacts';
import { buildDashboardDeepLink, buildLessonDeepLink, buildStudentProfileDeepLink } from './server/lib/deepLinks';
import {
  buildWebPushTextNotificationPayload,
  hasWebPushSubscriptionsForStudent,
  hasWebPushSubscriptionsForTeacher,
  isWebPushConfigured,
  sendWebPushToStudent,
  sendWebPushToTeacher,
} from './webPushService';
import { inflectFirstName } from '../shared/lib/inflectName';
import { formatInTimeZone, resolveTimeZone, toZonedDate } from '../shared/lib/timezoneDates';
import { escapeHtml } from '../shared/lib/htmlEscape';
import { pluralizeRu } from '../shared/lib/pluralizeRu';
import {
  DEFAULT_STUDENT_PAYMENT_DUE_TEMPLATE,
  DEFAULT_STUDENT_UPCOMING_LESSON_TEMPLATE,
  STUDENT_LESSON_TEMPLATE_VARIABLES,
  STUDENT_PAYMENT_TEMPLATE_VARIABLES,
} from '../shared/lib/notificationTemplates';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const TELEGRAM_WEBAPP_URL = process.env.TELEGRAM_WEBAPP_URL ?? '';
const TELEGRAM_API_BASE = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

type NotificationType =
  | 'TEACHER_LESSON_REMINDER'
  | 'TEACHER_DAILY_SUMMARY'
  | 'TEACHER_TOMORROW_SUMMARY'
  | 'TEACHER_ONBOARDING_NUDGE'
  | 'TEACHER_POST_LESSON_PROMPT'
  | 'TEACHER_PAYMENT_PROMPT'
  | 'TEACHER_TRIAL_DIGEST'
  | 'STUDENT_LESSON_REMINDER'
  | 'STUDENT_PAYMENT_REMINDER'
  | 'MANUAL_STUDENT_PAYMENT_REMINDER'
  | 'PAYMENT_REMINDER_STUDENT'
  | 'PAYMENT_REMINDER_TEACHER';

type DailySummaryLesson = {
  startAt: Date;
  durationMinutes: number;
  studentNames: string[];
};

type DailySummaryUnpaidLesson = {
  startAt: Date;
  studentName: string;
  price: number | null;
};

const callTelegram = async <T>(method: string, payload?: Record<string, unknown>): Promise<T> => {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is required');
  }
  const response = await fetch(`${TELEGRAM_API_BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = (await response.json()) as { ok: boolean; result: T; description?: string };
  if (!data.ok) {
    throw new Error(data.description ?? `Telegram API error: ${method}`);
  }
  return data.result;
};

type TelegramWebAppButton = { label: string; url: string };
type TelegramInlineButton = { text: string; callback_data: string } | { text: string; url: string };

type SendTelegramMessageOptions = {
  webAppButton?: TelegramWebAppButton | null;
  inlineKeyboard?: TelegramInlineButton[][] | null;
  parseMode?: 'HTML' | 'MarkdownV2' | null;
};

export const sendTelegramMessage = async (
  chatId: bigint | number,
  text: string,
  options?: SendTelegramMessageOptions,
) => {
  const payload: Record<string, unknown> = {
    chat_id: typeof chatId === 'bigint' ? Number(chatId) : chatId,
    text,
  };
  if (options?.parseMode) {
    payload.parse_mode = options.parseMode;
  }
  const button = options?.webAppButton;
  if (button?.url) {
    payload.reply_markup = {
      inline_keyboard: [[{ text: button.label, web_app: { url: button.url } }]],
    };
  } else if (options?.inlineKeyboard?.length) {
    payload.reply_markup = { inline_keyboard: options.inlineKeyboard };
  }
  await callTelegram('sendMessage', payload);
};

const sendTelegramWebAppMessage = async (chatId: bigint | number, text: string) => {
  if (!TELEGRAM_WEBAPP_URL) {
    throw new Error('TELEGRAM_WEBAPP_URL is required');
  }
  await sendTelegramMessage(chatId, text, {
    parseMode: 'HTML',
    webAppButton: { label: 'Открыть приложение', url: TELEGRAM_WEBAPP_URL },
  });
};

const formatLessonDayLabel = (startAt: Date, timeZone?: string | null) => {
  const resolvedTimeZone = resolveTimeZone(timeZone);
  const zonedStart = toZonedDate(startAt, resolvedTimeZone);
  const todayZoned = toZonedDate(new Date(), resolvedTimeZone);
  if (isSameDay(zonedStart, todayZoned)) return 'сегодня';
  if (isSameDay(zonedStart, addDays(todayZoned, 1))) return 'завтра';
  return formatInTimeZone(startAt, 'd MMM', { locale: ru, timeZone: resolvedTimeZone });
};

const formatLeadTimeLabel = (minutesBefore?: number) => {
  if (minutesBefore === undefined || Number.isNaN(minutesBefore)) return null;
  if (minutesBefore <= 0) return 'сейчас';
  return `${minutesBefore} мин`;
};

const buildLessonReminderMessage = ({
  startAt,
  durationMinutes,
  studentName,
  timeZone,
  target,
  minutesBefore,
}: {
  startAt: Date;
  durationMinutes: number;
  studentName?: string | null;
  meetingLink?: string | null;
  timeZone?: string | null;
  target: 'teacher' | 'student';
  minutesBefore?: number;
}) => {
  const dayLabel = formatLessonDayLabel(startAt, timeZone);
  const timeLabel = formatInTimeZone(startAt, 'HH:mm', { timeZone: resolveTimeZone(timeZone) });
  const leadTimeLabel = formatLeadTimeLabel(minutesBefore);

  if (target === 'teacher') {
    const safeName = studentName?.trim() ? escapeHtml(studentName.trim()) : 'учеником';
    const heading = leadTimeLabel
      ? `⏰ <b>Через ${leadTimeLabel} — урок с ${safeName}</b>`
      : `⏰ <b>Скоро урок с ${safeName}</b>`;
    return `${heading}\n\n${dayLabel} · ${timeLabel} · ${durationMinutes} мин`;
  }

  const heading = leadTimeLabel ? `⏰ <b>Через ${leadTimeLabel} — занятие</b>` : '⏰ <b>Скоро занятие</b>';
  return `${heading}\n\n${dayLabel} · ${timeLabel} · ${durationMinutes} мин`;
};

const formatLessonDateLabel = (startAt: Date, timeZone?: string | null) =>
  formatInTimeZone(startAt, 'd MMMM', { locale: ru, timeZone: resolveTimeZone(timeZone) });

const formatLessonTimeLabel = (startAt: Date, timeZone?: string | null) =>
  formatInTimeZone(startAt, 'HH:mm', { timeZone: resolveTimeZone(timeZone) });

const buildLessonDateTimeLabel = (startAt: Date, timeZone?: string | null) => {
  const dateLabel = formatLessonDateLabel(startAt, timeZone);
  const timeLabel = formatLessonTimeLabel(startAt, timeZone);
  return `${dateLabel} ${timeLabel}`;
};

const fillTemplateVariables = (
  template: string,
  values: Record<string, string>,
  allowedVariables: readonly string[],
) => {
  const allowedSet = new Set(allowedVariables);
  return template.replace(/{{\s*([^}]+)\s*}}/g, (match, rawVariable) => {
    const key = typeof rawVariable === 'string' ? rawVariable.trim() : '';
    if (!allowedSet.has(key)) return '';
    return values[key] ?? '';
  });
};

const resolveStudentTemplate = (value: string | null, fallback: string) => (value?.trim() ? value : fallback);

const normalizeNotificationText = (value: string) => value.replace(/\n{3,}/g, '\n\n').trim();

const buildTeacherPaymentReminderMessage = ({
  studentName,
  startAt,
  timeZone,
  source,
}: {
  studentName: string;
  startAt: Date;
  timeZone?: string | null;
  source: 'AUTO' | 'MANUAL';
}) => {
  const dateLabel = formatLessonDateLabel(startAt, timeZone);
  const studentDative = escapeHtml(inflectFirstName(studentName, 'dative'));
  const heading = source === 'MANUAL' ? '✅ <b>Напоминание отправлено</b>' : '<b>Авто-напоминание отправлено</b>';
  return `${heading}\n\n${studentDative} · ${dateLabel}`;
};

const formatTimeRange = (startAt: Date, durationMinutes: number, timeZone?: string | null) => {
  const resolvedTimeZone = resolveTimeZone(timeZone);
  const startLabel = formatInTimeZone(startAt, 'HH:mm', { timeZone: resolvedTimeZone });
  const endLabel = formatInTimeZone(addMinutes(startAt, durationMinutes), 'HH:mm', { timeZone: resolvedTimeZone });
  return `${startLabel}–${endLabel}`;
};

const buildTeacherDailySummaryMessage = ({
  scope,
  lessons,
  unpaidLessons,
  timeZone,
}: {
  scope: 'today' | 'tomorrow';
  summaryDate: Date;
  lessons: DailySummaryLesson[];
  unpaidLessons?: DailySummaryUnpaidLesson[];
  timeZone?: string | null;
}) => {
  const resolvedTimeZone = resolveTimeZone(timeZone);
  const dayWord = scope === 'today' ? 'Сегодня' : 'Завтра';
  const lessonCount = lessons.length;

  const sections: string[] = [];

  if (lessonCount === 0) {
    sections.push(`📅 <b>${dayWord} занятий нет</b>`);
  } else {
    const lessonsLabel = pluralizeRu(lessonCount, { one: 'урок', few: 'урока', many: 'уроков' });
    sections.push(`📅 <b>${dayWord} — ${lessonsLabel}</b>`);
    for (const lesson of lessons) {
      const timeRange = formatTimeRange(lesson.startAt, lesson.durationMinutes, resolvedTimeZone);
      const safeNames = lesson.studentNames.length
        ? lesson.studentNames.map((name) => escapeHtml(name)).join(', ')
        : 'ученик';
      sections.push(`${timeRange} · ${safeNames}`);
    }
  }

  if (scope === 'today' && unpaidLessons && unpaidLessons.length > 0) {
    const unpaidLabel = pluralizeRu(unpaidLessons.length, {
      one: 'урок',
      few: 'урока',
      many: 'уроков',
    });
    sections.push('', `💰 <b>Не оплачено: ${unpaidLabel}</b>`);
    for (const lesson of unpaidLessons) {
      const dateTime = formatInTimeZone(lesson.startAt, 'd MMM, HH:mm', {
        locale: ru,
        timeZone: resolvedTimeZone,
      });
      const priceLabel =
        lesson.price !== null && Number.isFinite(lesson.price) && lesson.price > 0 ? ` · ${lesson.price} ₽` : '';
      sections.push(`${dateTime} · ${escapeHtml(lesson.studentName)}${priceLabel}`);
    }
  }

  return sections.join('\n');
};

const isTelegramUnreachableError = (message: string) => {
  const normalized = message.toLowerCase();
  return normalized.includes('chat not found') || normalized.includes('blocked by the user');
};

const TELEGRAM_DAILY_CAP_PER_RECIPIENT = 6;

const TEACHER_NOTIFICATION_TYPES: NotificationType[] = [
  'TEACHER_LESSON_REMINDER',
  'TEACHER_DAILY_SUMMARY',
  'TEACHER_TOMORROW_SUMMARY',
  'TEACHER_ONBOARDING_NUDGE',
  'TEACHER_POST_LESSON_PROMPT',
  'TEACHER_PAYMENT_PROMPT',
  'TEACHER_TRIAL_DIGEST',
  'PAYMENT_REMINDER_TEACHER',
];

const STUDENT_NOTIFICATION_TYPES: NotificationType[] = [
  'STUDENT_LESSON_REMINDER',
  'STUDENT_PAYMENT_REMINDER',
  'MANUAL_STUDENT_PAYMENT_REMINDER',
  'PAYMENT_REMINDER_STUDENT',
];

const isStudentNotificationType = (type: NotificationType) => STUDENT_NOTIFICATION_TYPES.includes(type);

const startOfDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const isTelegramDailyCapReached = async (params: {
  type: NotificationType;
  teacherId: bigint;
  studentId?: number | null;
}) => {
  const since = startOfDay(new Date());
  const where: Record<string, unknown> = {
    channel: 'TELEGRAM',
    status: 'SENT',
    createdAt: { gte: since },
  };
  if (isStudentNotificationType(params.type)) {
    if (!params.studentId) return false;
    where.studentId = params.studentId;
  } else {
    where.teacherId = params.teacherId;
    where.NOT = { type: { in: STUDENT_NOTIFICATION_TYPES } };
  }
  const count = await prisma.notificationLog.count({ where });
  return count >= TELEGRAM_DAILY_CAP_PER_RECIPIENT;
};

const deliverNotificationChannel = async (payload: {
  channel: NotificationLogChannel;
  enabled: boolean;
  teacherId: bigint;
  studentId?: number | null;
  lessonId?: number | null;
  type: NotificationType;
  source?: 'AUTO' | 'MANUAL' | null;
  scheduledFor?: Date | null;
  dedupeKey?: string | null;
  respectDailyCap?: boolean;
  send: () => Promise<void>;
  onFailure?: (message: string) => Promise<void> | void;
}): Promise<NotificationChannelDeliveryResult> => {
  if (!payload.enabled) {
    return { channel: payload.channel, status: 'skipped' };
  }

  if (payload.respectDailyCap && payload.channel === 'TELEGRAM') {
    const capped = await isTelegramDailyCapReached({
      type: payload.type,
      teacherId: payload.teacherId,
      studentId: payload.studentId ?? null,
    });
    if (capped) {
      return { channel: payload.channel, status: 'skipped' };
    }
  }

  const log = await createNotificationLogEntry({
    teacherId: payload.teacherId,
    studentId: payload.studentId ?? null,
    lessonId: payload.lessonId ?? null,
    type: payload.type,
    source: payload.source ?? null,
    channel: payload.channel,
    scheduledFor: payload.scheduledFor ?? null,
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
    await payload.onFailure?.(message);
    return { channel: payload.channel, status: 'failed', error: message };
  }
};

export const sendTeacherLessonReminder = async ({
  teacherId,
  lessonId,
  scheduledFor,
  dedupeKey,
  minutesBefore,
}: {
  teacherId: bigint;
  lessonId: number;
  scheduledFor?: Date;
  dedupeKey?: string;
  minutesBefore?: number;
}) => {
  const teacher = await prisma.teacher.findUnique({ where: { chatId: teacherId } });
  if (!teacher?.lessonReminderEnabled) return { status: 'skipped' as const };
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, include: { student: true } });
  if (!lesson || lesson.teacherId !== teacherId) return { status: 'skipped' as const };

  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId, studentId: lesson.studentId } },
  });
  const studentName = link?.customName ?? lesson.student?.username ?? null;
  const text = buildLessonReminderMessage({
    startAt: lesson.startAt,
    durationMinutes: lesson.durationMinutes,
    studentName,
    meetingLink: lesson.meetingLink,
    timeZone: teacher.timezone,
    target: 'teacher',
    minutesBefore,
  });
  const lessonLink = buildLessonDeepLink(lessonId);
  const pwaPayload = buildWebPushTextNotificationPayload({
    text,
    defaultTitle: 'Напоминание о занятии',
    path: lessonLink?.path ?? '/schedule',
    tag: `teacher-lesson-reminder-${lessonId}`,
  });
  const pwaEnabled = isWebPushConfigured() && (await hasWebPushSubscriptionsForTeacher(teacherId));

  const results = await Promise.all([
    deliverNotificationChannel({
      channel: 'TELEGRAM',
      enabled: Boolean(TELEGRAM_BOT_TOKEN),
      teacherId,
      studentId: lesson.studentId,
      lessonId,
      type: 'TEACHER_LESSON_REMINDER',
      scheduledFor,
      dedupeKey,
      respectDailyCap: true,
      send: () =>
        sendTelegramMessage(teacher.chatId, text, {
          parseMode: 'HTML',
          webAppButton: lessonLink ? { label: lessonLink.label, url: lessonLink.fullUrl } : null,
        }),
    }),
    deliverNotificationChannel({
      channel: 'PWA_PUSH',
      enabled: pwaEnabled,
      teacherId,
      studentId: lesson.studentId,
      lessonId,
      type: 'TEACHER_LESSON_REMINDER',
      scheduledFor,
      dedupeKey,
      send: async () => {
        const result = await sendWebPushToTeacher(teacherId, pwaPayload);
        if (result.status !== 'sent') {
          throw new Error(result.error ?? result.reason ?? 'pwa_push_failed');
        }
      },
    }),
  ]);

  return summarizeNotificationChannelDelivery(results);
};

export const sendStudentLessonReminder = async ({
  studentId,
  lessonId,
  scheduledFor,
  dedupeKey,
}: {
  studentId: number;
  lessonId: number;
  scheduledFor?: Date;
  dedupeKey?: string;
  minutesBefore?: number;
}) => {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson || lesson.studentId !== studentId) return { status: 'skipped' as const };
  const teacher = await prisma.teacher.findUnique({ where: { chatId: lesson.teacherId } });
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!teacher?.studentNotificationsEnabled) return { status: 'skipped' as const };
  if (!student) return { status: 'skipped' as const };
  const telegramId = await resolveStudentTelegramId(student);

  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: lesson.teacherId, studentId } },
  });
  const studentName = link?.customName?.trim() || student.username?.trim() || 'ученик';
  const dateLabel = formatLessonDateLabel(lesson.startAt, teacher.timezone);
  const timeLabel = formatLessonTimeLabel(lesson.startAt, teacher.timezone);
  const dateTimeLabel = buildLessonDateTimeLabel(lesson.startAt, teacher.timezone);
  const template = resolveStudentTemplate(
    teacher.studentUpcomingLessonTemplate,
    DEFAULT_STUDENT_UPCOMING_LESSON_TEMPLATE,
  );
  const text = fillTemplateVariables(
    template,
    {
      student_name: studentName,
      lesson_date: dateLabel,
      lesson_time: timeLabel,
      lesson_datetime: dateTimeLabel,
      lesson_link: lesson.meetingLink ?? '',
    },
    STUDENT_LESSON_TEMPLATE_VARIABLES,
  );
  const normalizedText = normalizeNotificationText(text);
  const lessonLink = buildLessonDeepLink(lessonId);
  const pwaPayload = buildWebPushTextNotificationPayload({
    text: normalizedText,
    defaultTitle: 'Скоро занятие',
    path: lessonLink?.path ?? '/schedule',
    tag: `student-lesson-reminder-${lessonId}`,
  });
  const pwaEnabled = isWebPushConfigured() && (await hasWebPushSubscriptionsForStudent(studentId));
  const telegramEnabled = Boolean(TELEGRAM_BOT_TOKEN && telegramId);
  if (!telegramEnabled && !pwaEnabled) return { status: 'skipped' as const };

  const results = await Promise.all([
    deliverNotificationChannel({
      channel: 'TELEGRAM',
      enabled: telegramEnabled,
      teacherId: lesson.teacherId,
      studentId,
      lessonId,
      type: 'STUDENT_LESSON_REMINDER',
      scheduledFor,
      dedupeKey,
      respectDailyCap: true,
      send: () =>
        sendTelegramMessage(telegramId as bigint, normalizedText, {
          webAppButton: lessonLink ? { label: lessonLink.label, url: lessonLink.fullUrl } : null,
        }),
      onFailure: async (message) => {
        if (isTelegramUnreachableError(message)) {
          await prisma.student.update({ where: { id: studentId }, data: { isActivated: false } });
        }
      },
    }),
    deliverNotificationChannel({
      channel: 'PWA_PUSH',
      enabled: pwaEnabled,
      teacherId: lesson.teacherId,
      studentId,
      lessonId,
      type: 'STUDENT_LESSON_REMINDER',
      scheduledFor,
      dedupeKey,
      send: async () => {
        const result = await sendWebPushToStudent(studentId, pwaPayload);
        if (result.status !== 'sent') {
          throw new Error(result.error ?? result.reason ?? 'pwa_push_failed');
        }
      },
    }),
  ]);

  return summarizeNotificationChannelDelivery(results);
};

export const sendStudentLessonReminderManual = async ({
  studentId,
  lessonId,
  text,
  scheduledFor,
  dedupeKey,
}: {
  studentId: number;
  lessonId: number;
  text: string;
  scheduledFor?: Date;
  dedupeKey?: string;
}) => {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson || lesson.studentId !== studentId) {
    return { status: 'skipped' as const, reason: 'lesson_not_found' as const };
  }
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) {
    return { status: 'skipped' as const, reason: 'student_not_found' as const };
  }
  const telegramId = await resolveStudentTelegramId(student);

  const normalizedText = normalizeNotificationText(text);
  if (!normalizedText) {
    return { status: 'skipped' as const, reason: 'empty_text' as const };
  }

  const manualLessonLink = buildLessonDeepLink(lessonId);
  const pwaPayload = buildWebPushTextNotificationPayload({
    text: normalizedText,
    defaultTitle: 'Напоминание о занятии',
    path: manualLessonLink?.path ?? '/schedule',
    tag: `student-lesson-manual-${lessonId}`,
  });
  const pwaEnabled = isWebPushConfigured() && (await hasWebPushSubscriptionsForStudent(studentId));
  const telegramEnabled = Boolean(TELEGRAM_BOT_TOKEN && telegramId);
  if (!telegramEnabled && !pwaEnabled) {
    return { status: 'skipped' as const, reason: 'student_not_activated' as const };
  }
  const results = await Promise.all([
    deliverNotificationChannel({
      channel: 'TELEGRAM',
      enabled: telegramEnabled,
      teacherId: lesson.teacherId,
      studentId,
      lessonId,
      type: 'STUDENT_LESSON_REMINDER',
      source: 'MANUAL',
      scheduledFor,
      dedupeKey,
      send: () =>
        sendTelegramMessage(telegramId as bigint, normalizedText, {
          webAppButton: manualLessonLink ? { label: manualLessonLink.label, url: manualLessonLink.fullUrl } : null,
        }),
      onFailure: async (message) => {
        if (isTelegramUnreachableError(message)) {
          await prisma.student.update({ where: { id: studentId }, data: { isActivated: false } });
        }
      },
    }),
    deliverNotificationChannel({
      channel: 'PWA_PUSH',
      enabled: pwaEnabled,
      teacherId: lesson.teacherId,
      studentId,
      lessonId,
      type: 'STUDENT_LESSON_REMINDER',
      source: 'MANUAL',
      scheduledFor,
      dedupeKey,
      send: async () => {
        const result = await sendWebPushToStudent(studentId, pwaPayload);
        if (result.status !== 'sent') {
          throw new Error(result.error ?? result.reason ?? 'pwa_push_failed');
        }
      },
    }),
  ]);
  const summary = summarizeNotificationChannelDelivery(results);
  if (summary.status === 'skipped') {
    return { status: 'skipped' as const, reason: 'deduped' as const };
  }
  return summary;
};

export const sendTeacherOnboardingNudge = async ({
  teacherId,
  scheduledFor,
}: {
  teacherId: bigint;
  scheduledFor?: Date;
}) => {
  const text = '<b>Добавьте первого ученика</b>\n\nДальше всё будет логично.';
  const pwaPayload = buildWebPushTextNotificationPayload({
    text: 'Добавьте первого ученика — дальше всё будет логично.',
    defaultTitle: 'TeacherBot',
    path: '/dashboard',
    tag: 'teacher-onboarding-nudge',
  });
  const pwaEnabled = isWebPushConfigured() && (await hasWebPushSubscriptionsForTeacher(teacherId));
  const results = await Promise.all([
    deliverNotificationChannel({
      channel: 'TELEGRAM',
      enabled: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_WEBAPP_URL),
      teacherId,
      type: 'TEACHER_ONBOARDING_NUDGE',
      scheduledFor: scheduledFor ?? null,
      respectDailyCap: true,
      send: () => sendTelegramWebAppMessage(teacherId, text),
    }),
    deliverNotificationChannel({
      channel: 'PWA_PUSH',
      enabled: pwaEnabled,
      teacherId,
      type: 'TEACHER_ONBOARDING_NUDGE',
      scheduledFor: scheduledFor ?? null,
      send: async () => {
        const result = await sendWebPushToTeacher(teacherId, pwaPayload);
        if (result.status !== 'sent') {
          throw new Error(result.error ?? result.reason ?? 'pwa_push_failed');
        }
      },
    }),
  ]);
  return summarizeNotificationChannelDelivery(results);
};

export const sendTeacherDailySummary = async ({
  teacherId,
  type,
  summaryDate,
  lessons,
  unpaidLessons,
  scheduledFor,
  dedupeKey,
}: {
  teacherId: bigint;
  type: 'TEACHER_DAILY_SUMMARY' | 'TEACHER_TOMORROW_SUMMARY';
  summaryDate: Date;
  lessons: DailySummaryLesson[];
  unpaidLessons?: DailySummaryUnpaidLesson[];
  scheduledFor?: Date;
  dedupeKey?: string;
}) => {
  const teacher = await prisma.teacher.findUnique({ where: { chatId: teacherId } });
  if (!teacher) return { status: 'skipped' as const };
  if (type === 'TEACHER_DAILY_SUMMARY' && !teacher.dailySummaryEnabled) return { status: 'skipped' as const };
  if (type === 'TEACHER_TOMORROW_SUMMARY' && !teacher.tomorrowSummaryEnabled) return { status: 'skipped' as const };

  const text = buildTeacherDailySummaryMessage({
    scope: type === 'TEACHER_DAILY_SUMMARY' ? 'today' : 'tomorrow',
    summaryDate,
    lessons,
    unpaidLessons,
    timeZone: teacher.timezone,
  });
  const summaryLink = buildDashboardDeepLink();
  const pwaPayload = buildWebPushTextNotificationPayload({
    text,
    defaultTitle: type === 'TEACHER_DAILY_SUMMARY' ? 'Сводка на сегодня' : 'Сводка на завтра',
    path: summaryLink?.path ?? '/dashboard',
    tag: `${type.toLowerCase()}-${formatInTimeZone(summaryDate, 'yyyy-MM-dd', {
      timeZone: resolveTimeZone(teacher.timezone),
    })}`,
  });
  const pwaEnabled = isWebPushConfigured() && (await hasWebPushSubscriptionsForTeacher(teacherId));
  const results = await Promise.all([
    deliverNotificationChannel({
      channel: 'TELEGRAM',
      enabled: Boolean(TELEGRAM_BOT_TOKEN),
      teacherId,
      type,
      scheduledFor,
      dedupeKey,
      respectDailyCap: true,
      send: () =>
        sendTelegramMessage(teacher.chatId, text, {
          parseMode: 'HTML',
          webAppButton: summaryLink ? { label: summaryLink.label, url: summaryLink.fullUrl } : null,
        }),
    }),
    deliverNotificationChannel({
      channel: 'PWA_PUSH',
      enabled: pwaEnabled,
      teacherId,
      type,
      scheduledFor,
      dedupeKey,
      send: async () => {
        const result = await sendWebPushToTeacher(teacherId, pwaPayload);
        if (result.status !== 'sent') {
          throw new Error(result.error ?? result.reason ?? 'pwa_push_failed');
        }
      },
    }),
  ]);
  return summarizeNotificationChannelDelivery(results);
};

export const sendStudentPaymentReminder = async ({
  studentId,
  lessonId,
  source,
}: {
  studentId: number;
  lessonId: number;
  source: 'AUTO' | 'MANUAL';
}) => {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { participants: true },
  });
  if (!lesson) return { status: 'skipped' as const };
  const participant = lesson.participants.find((item) => item.studentId === studentId);
  if (!participant) return { status: 'skipped' as const };
  const teacher = await prisma.teacher.findUnique({ where: { chatId: lesson.teacherId } });
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!teacher || !student) return { status: 'skipped' as const };
  const telegramId = await resolveStudentTelegramId(student);

  const priceSnapshot =
    typeof participant.price === 'number' && participant.price > 0
      ? participant.price
      : typeof lesson.price === 'number' && lesson.price > 0
        ? lesson.price
        : null;
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: lesson.teacherId, studentId } },
  });
  const studentName = link?.customName?.trim() || student.username?.trim() || 'ученик';
  const dateLabel = formatLessonDateLabel(lesson.startAt, teacher.timezone);
  const timeLabel = formatLessonTimeLabel(lesson.startAt, teacher.timezone);
  const dateTimeLabel = buildLessonDateTimeLabel(lesson.startAt, teacher.timezone);
  const template = resolveStudentTemplate(teacher.studentPaymentDueTemplate, DEFAULT_STUDENT_PAYMENT_DUE_TEMPLATE);
  const text = fillTemplateVariables(
    template,
    {
      student_name: studentName,
      lesson_date: dateLabel,
      lesson_time: timeLabel,
      lesson_datetime: dateTimeLabel,
      lesson_price: String(priceSnapshot ?? 0),
      lesson_link: lesson.meetingLink ?? '',
    },
    STUDENT_PAYMENT_TEMPLATE_VARIABLES,
  );
  const normalizedText = normalizeNotificationText(text);
  const paymentStudentLink = buildLessonDeepLink(lessonId);
  const pwaPayload = buildWebPushTextNotificationPayload({
    text: normalizedText,
    defaultTitle: 'Напоминание об оплате',
    path: paymentStudentLink?.path ?? '/schedule',
    tag: `payment-reminder-${lessonId}-${studentId}`,
  });
  const pwaEnabled = isWebPushConfigured() && (await hasWebPushSubscriptionsForStudent(studentId));
  const telegramEnabled = Boolean(TELEGRAM_BOT_TOKEN && telegramId);
  if (!telegramEnabled && !pwaEnabled) return { status: 'skipped' as const };
  const results = await Promise.all([
    deliverNotificationChannel({
      channel: 'TELEGRAM',
      enabled: telegramEnabled,
      teacherId: lesson.teacherId,
      studentId,
      lessonId,
      type: 'PAYMENT_REMINDER_STUDENT',
      source,
      respectDailyCap: source === 'AUTO',
      send: () =>
        sendTelegramMessage(telegramId as bigint, normalizedText, {
          webAppButton: paymentStudentLink ? { label: 'Открыть занятие', url: paymentStudentLink.fullUrl } : null,
        }),
      onFailure: async (message) => {
        if (isTelegramUnreachableError(message)) {
          await prisma.student.update({ where: { id: studentId }, data: { isActivated: false } });
        }
      },
    }),
    deliverNotificationChannel({
      channel: 'PWA_PUSH',
      enabled: pwaEnabled,
      teacherId: lesson.teacherId,
      studentId,
      lessonId,
      type: 'PAYMENT_REMINDER_STUDENT',
      source,
      send: async () => {
        const result = await sendWebPushToStudent(studentId, pwaPayload);
        if (result.status !== 'sent') {
          throw new Error(result.error ?? result.reason ?? 'pwa_push_failed');
        }
      },
    }),
  ]);
  return summarizeNotificationChannelDelivery(results);
};

export const sendTeacherPaymentReminderNotice = async ({
  teacherId,
  lessonId,
  studentId,
  source,
}: {
  teacherId: bigint;
  lessonId: number;
  studentId: number;
  source: 'AUTO' | 'MANUAL';
}) => {
  const teacher = await prisma.teacher.findUnique({ where: { chatId: teacherId } });
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!teacher || !student || !lesson) return { status: 'skipped' as const };

  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId, studentId } },
  });
  const studentName = link?.customName?.trim() || student.username?.trim() || 'ученик';

  const text = buildTeacherPaymentReminderMessage({
    studentName,
    startAt: lesson.startAt,
    timeZone: teacher.timezone,
    source,
  });
  const paymentTeacherLink = buildStudentProfileDeepLink(studentId);
  const pwaPayload = buildWebPushTextNotificationPayload({
    text,
    defaultTitle: 'Напоминание отправлено',
    path: paymentTeacherLink?.path ?? '/schedule',
    tag: `teacher-payment-reminder-${lessonId}-${studentId}`,
  });
  const pwaEnabled = isWebPushConfigured() && (await hasWebPushSubscriptionsForTeacher(teacherId));
  const results = await Promise.all([
    deliverNotificationChannel({
      channel: 'TELEGRAM',
      enabled: Boolean(TELEGRAM_BOT_TOKEN),
      teacherId,
      studentId,
      lessonId,
      type: 'PAYMENT_REMINDER_TEACHER',
      source,
      respectDailyCap: source === 'AUTO',
      send: () =>
        sendTelegramMessage(teacher.chatId, text, {
          parseMode: 'HTML',
          webAppButton: paymentTeacherLink
            ? { label: paymentTeacherLink.label, url: paymentTeacherLink.fullUrl }
            : null,
        }),
    }),
    deliverNotificationChannel({
      channel: 'PWA_PUSH',
      enabled: pwaEnabled,
      teacherId,
      studentId,
      lessonId,
      type: 'PAYMENT_REMINDER_TEACHER',
      source,
      send: async () => {
        const result = await sendWebPushToTeacher(teacherId, pwaPayload);
        if (result.status !== 'sent') {
          throw new Error(result.error ?? result.reason ?? 'pwa_push_failed');
        }
      },
    }),
  ]);
  return summarizeNotificationChannelDelivery(results);
};

const resolveLessonStudentName = async (teacherId: bigint, studentId: number) => {
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId, studentId } },
    include: { student: true },
  });
  return link?.customName?.trim() || link?.student?.username?.trim() || 'учеником';
};

export const sendTeacherPostLessonPrompt = async ({
  teacherId,
  lessonId,
  scheduledFor,
  dedupeKey,
}: {
  teacherId: bigint;
  lessonId: number;
  scheduledFor?: Date;
  dedupeKey?: string;
}) => {
  const teacher = await prisma.teacher.findUnique({ where: { chatId: teacherId } });
  if (!teacher) return { status: 'skipped' as const };
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson || lesson.teacherId !== teacherId) return { status: 'skipped' as const };

  const safeName = escapeHtml(await resolveLessonStudentName(teacherId, lesson.studentId));
  const dateLabel = formatLessonDateLabel(lesson.startAt, teacher.timezone);
  const timeLabel = formatLessonTimeLabel(lesson.startAt, teacher.timezone);
  const text = `<b>Урок с ${safeName} прошёл?</b>\n\n${dateLabel} · ${timeLabel}`;
  const inlineKeyboard: TelegramInlineButton[][] = [
    [
      { text: 'Да, прошёл', callback_data: `lpost:done:${lessonId}` },
      { text: 'Перенести', callback_data: `lpost:pone:${lessonId}` },
    ],
    [{ text: 'Отмена', callback_data: `lpost:canc:${lessonId}` }],
  ];

  return deliverNotificationChannel({
    channel: 'TELEGRAM',
    enabled: Boolean(TELEGRAM_BOT_TOKEN),
    teacherId,
    studentId: lesson.studentId,
    lessonId,
    type: 'TEACHER_POST_LESSON_PROMPT',
    scheduledFor,
    dedupeKey,
    respectDailyCap: true,
    send: () =>
      sendTelegramMessage(teacher.chatId, text, {
        parseMode: 'HTML',
        inlineKeyboard,
      }),
  });
};

export const sendTeacherTrialDigest = async (params: { teacherId: bigint; trialStart: Date; trialEnd: Date }) => {
  const teacher = await prisma.teacher.findUnique({ where: { chatId: params.teacherId } });
  if (!teacher) return { status: 'skipped' as const };

  const since = params.trialStart;

  const [completedLessons, paymentReminders, sentHomework] = await Promise.all([
    prisma.lesson.count({
      where: {
        teacherId: params.teacherId,
        status: 'COMPLETED',
        completedAt: { gte: since },
      },
    }),
    prisma.notificationLog.count({
      where: {
        teacherId: params.teacherId,
        type: 'PAYMENT_REMINDER_STUDENT',
        status: 'SENT',
        createdAt: { gte: since },
      },
    }),
    prisma.homeworkAssignment.count({
      where: {
        teacherId: params.teacherId,
        sentAt: { gte: since },
      },
    }),
  ]);

  const lines: string[] = ['<b>Бот рядом уже 11 дней</b>', ''];
  if (completedLessons > 0) {
    const word = pluralizeRu(completedLessons, { one: 'урок', few: 'урока', many: 'уроков' });
    lines.push(`📅 ${word} прошло`);
  }
  if (paymentReminders > 0) {
    const word = pluralizeRu(paymentReminders, {
      one: 'напоминание',
      few: 'напоминания',
      many: 'напоминаний',
    });
    lines.push(`💰 ${word} об оплате`);
  }
  if (sentHomework > 0) {
    const word = pluralizeRu(sentHomework, { one: 'домашка', few: 'домашки', many: 'домашек' });
    lines.push(`📝 ${word} ушло ученикам`);
  }
  if (lines.length === 2) {
    lines.push('Бот следит за расписанием и оплатами.');
  }
  lines.push('', 'Trial — ещё 3 дня. Дальше — 790 ₽/мес.');

  const text = lines.join('\n');
  const dedupeKey = `TEACHER_TRIAL_DIGEST:${params.teacherId.toString()}`;

  return deliverNotificationChannel({
    channel: 'TELEGRAM',
    enabled: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_WEBAPP_URL),
    teacherId: params.teacherId,
    type: 'TEACHER_TRIAL_DIGEST',
    scheduledFor: new Date(),
    dedupeKey,
    send: () => sendTelegramWebAppMessage(params.teacherId, text),
  });
};

export const sendTeacherFirstStudentMilestone = async (teacherId: bigint) => {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_WEBAPP_URL) return;
  const text = '✅ <b>Ученик добавлен</b>\n\nТеперь добавьте первый урок — и я начну напоминать о нём Вам и ученику.';
  try {
    await sendTelegramMessage(teacherId, text, {
      parseMode: 'HTML',
      webAppButton: { label: 'Открыть приложение', url: TELEGRAM_WEBAPP_URL },
    });
  } catch (error) {
    console.error('Failed to send first-student milestone', error);
  }
};

export const markTeacherPaymentPromptDelivered = async (payload: {
  teacherId: bigint;
  studentId: number;
  lessonId: number;
}) => {
  const dedupeKey = `TEACHER_PAYMENT_PROMPT:${payload.lessonId}`;
  const log = await createNotificationLogEntry({
    teacherId: payload.teacherId,
    studentId: payload.studentId,
    lessonId: payload.lessonId,
    type: 'TEACHER_PAYMENT_PROMPT',
    source: null,
    channel: 'TELEGRAM',
    scheduledFor: null,
    dedupeKey: resolveNotificationChannelDedupeKey(dedupeKey, 'TELEGRAM'),
  });
  if (!log) return;
  await finalizeNotificationLogEntry(log.id, { status: 'SENT' });
};

export const sendTeacherPaymentPrompt = async ({
  teacherId,
  lessonId,
  scheduledFor,
  dedupeKey,
}: {
  teacherId: bigint;
  lessonId: number;
  scheduledFor?: Date;
  dedupeKey?: string;
}) => {
  const teacher = await prisma.teacher.findUnique({ where: { chatId: teacherId } });
  if (!teacher) return { status: 'skipped' as const };
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson || lesson.teacherId !== teacherId) return { status: 'skipped' as const };

  const safeName = escapeHtml(await resolveLessonStudentName(teacherId, lesson.studentId));
  const dateLabel = formatLessonDateLabel(lesson.startAt, teacher.timezone);
  const priceLine = typeof lesson.price === 'number' && lesson.price > 0 ? ` · ${lesson.price} ₽` : '';
  const text = `💰 <b>Урок не оплачен</b>\n\n${safeName} · ${dateLabel}${priceLine}`;
  const inlineKeyboard: TelegramInlineButton[][] = [
    [
      { text: 'Оплачен', callback_data: `lpay:paid:${lessonId}` },
      { text: 'Напомнить', callback_data: `lpay:rem:${lessonId}` },
    ],
    [{ text: 'Позже', callback_data: `lpay:later:${lessonId}` }],
  ];

  return deliverNotificationChannel({
    channel: 'TELEGRAM',
    enabled: Boolean(TELEGRAM_BOT_TOKEN),
    teacherId,
    studentId: lesson.studentId,
    lessonId,
    type: 'TEACHER_PAYMENT_PROMPT',
    scheduledFor,
    dedupeKey,
    respectDailyCap: true,
    send: () =>
      sendTelegramMessage(teacher.chatId, text, {
        parseMode: 'HTML',
        inlineKeyboard,
      }),
  });
};

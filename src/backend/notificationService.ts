import ru, { addDays, addMinutes, isSameDay } from 'date-fns';
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
  meetingLink,
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
  const leadTimeLine = leadTimeLabel ? `⏱️ До начала: ${leadTimeLabel}` : null;

  if (target === 'teacher') {
    const name = studentName?.trim() || 'учеником';
    const trimmedLink = meetingLink?.trim();
    return [
      '⏰ Напоминание о занятии',
      `📅 День: ${dayLabel}`,
      `🕒 Время: ${timeLabel}`,
      leadTimeLine,
      `👤 Ученик: ${name}`,
      `⏳ Длительность: ${durationMinutes} мин`,
      trimmedLink ? `🔗 Ссылка: ${trimmedLink}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    '⏰ Скоро занятие',
    `📅 День: ${dayLabel}`,
    `🕒 Время: ${timeLabel}`,
    leadTimeLine,
    `⏳ Длительность: ${durationMinutes} мин`,
  ]
    .filter(Boolean)
    .join('\n');
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
  const studentDative = inflectFirstName(studentName, 'dative');
  if (source === 'MANUAL') {
    return `Готово ✅ Напоминание отправлено ученику ${studentDative} по занятию ${dateLabel}.`;
  }
  return `Авто-напоминание отправлено ученику ${studentDative} по занятию ${dateLabel}.`;
};

const formatTimeRange = (startAt: Date, durationMinutes: number, timeZone?: string | null) => {
  const resolvedTimeZone = resolveTimeZone(timeZone);
  const startLabel = formatInTimeZone(startAt, 'HH:mm', { timeZone: resolvedTimeZone });
  const endLabel = formatInTimeZone(addMinutes(startAt, durationMinutes), 'HH:mm', { timeZone: resolvedTimeZone });
  return `${startLabel}–${endLabel}`;
};

const buildTeacherDailySummaryMessage = ({
  scope,
  summaryDate,
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
  const dayLabel = scope === 'today' ? 'сегодня' : 'завтра';
  const title = scope === 'today' ? '🌅 Сводка на сегодня' : '🌙 Сводка на завтра';
  const dateLabel = formatInTimeZone(summaryDate, 'd MMMM', { locale: ru, timeZone: resolvedTimeZone });

  const lessonLines =
    lessons.length > 0
      ? lessons.map((lesson) => {
          const timeRange = formatTimeRange(lesson.startAt, lesson.durationMinutes, resolvedTimeZone);
          const nameLabel = lesson.studentNames.length ? lesson.studentNames.join(', ') : 'ученик';
          return `• ${timeRange} · ${nameLabel}`;
        })
      : [`${dayLabel[0].toUpperCase()}${dayLabel.slice(1)} занятий нет — можно выдохнуть.`];

  const sections = [
    title,
    `📅 ${dayLabel[0].toUpperCase()}${dayLabel.slice(1)}, ${dateLabel}`,
    '',
    '📚 Занятия',
    ...lessonLines,
  ];

  if (scope === 'today') {
    const unpaidLines =
      unpaidLessons && unpaidLessons.length > 0
        ? unpaidLessons.map((lesson) => {
            const dateTime = formatInTimeZone(lesson.startAt, 'd MMM, HH:mm', {
              locale: ru,
              timeZone: resolvedTimeZone,
            });
            const priceLabel =
              lesson.price !== null && Number.isFinite(lesson.price) && lesson.price > 0 ? `${lesson.price} ₽` : '—';
            return `• ${dateTime} · ${lesson.studentName} · ${priceLabel}`;
          })
        : ['✅ Все занятия оплачены.'];

    sections.push('', '💳 Неоплаченные занятия', ...unpaidLines);
  }

  return sections.join('\n');
};

const isTelegramUnreachableError = (message: string) => {
  const normalized = message.toLowerCase();
  return normalized.includes('chat not found') || normalized.includes('blocked by the user');
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
  send: () => Promise<void>;
  onFailure?: (message: string) => Promise<void> | void;
}): Promise<NotificationChannelDeliveryResult> => {
  if (!payload.enabled) {
    return { channel: payload.channel, status: 'skipped' };
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
      send: () =>
        sendTelegramMessage(teacher.chatId, text, {
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
  const text =
    'Привет! Быстрый совет: добавь одного ученика — и дальше будет гораздо проще вести занятия и оплаты. Это займёт пару минут.';
  const pwaPayload = buildWebPushTextNotificationPayload({
    text,
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
      send: () =>
        sendTelegramMessage(teacher.chatId, text, {
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
      send: () =>
        sendTelegramMessage(teacher.chatId, text, {
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

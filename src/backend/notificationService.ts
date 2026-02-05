import { addDays, addMinutes, isSameDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Prisma } from '@prisma/client';
import prisma from './prismaClient';
import { resolveStudentTelegramId } from './studentContacts';
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

const sendTelegramMessage = async (chatId: bigint | number, text: string) => {
  await callTelegram('sendMessage', {
    chat_id: typeof chatId === 'bigint' ? Number(chatId) : chatId,
    text,
  });
};

const sendTelegramWebAppMessage = async (chatId: bigint | number, text: string) => {
  if (!TELEGRAM_WEBAPP_URL) {
    throw new Error('TELEGRAM_WEBAPP_URL is required');
  }
  await callTelegram('sendMessage', {
    chat_id: typeof chatId === 'bigint' ? Number(chatId) : chatId,
    text,
    reply_markup: {
      inline_keyboard: [[{ text: 'Открыть приложение', web_app: { url: TELEGRAM_WEBAPP_URL } }]],
    },
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
  if (source === 'MANUAL') {
    return `Готово ✅ Напоминание отправлено ученику ${studentName} по занятию ${dateLabel}.`;
  }
  return `Авто-напоминание отправлено ученику ${studentName} по занятию ${dateLabel}.`;
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

const createNotificationLog = async (payload: {
  teacherId: bigint;
  studentId?: number | null;
  lessonId?: number | null;
  type: NotificationType;
  source?: 'AUTO' | 'MANUAL' | null;
  channel?: 'TELEGRAM' | null;
  scheduledFor?: Date | null;
  dedupeKey?: string | null;
}) => {
  try {
    const teacherExists = await prisma.teacher.findUnique({
      where: { chatId: payload.teacherId },
      select: { chatId: true },
    });
    if (!teacherExists) return null;

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
        dedupeKey: payload.dedupeKey ?? null,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ((error.code === 'P2002' &&
        Array.isArray(error.meta?.target) &&
        error.meta?.target.includes('dedupeKey')) ||
        error.code === 'P2003')
    ) {
      return null;
    }
    throw error;
  }
};

const finalizeNotificationLog = async (logId: number, payload: { status: 'SENT' | 'FAILED'; errorText?: string }) => {
  return prisma.notificationLog.update({
    where: { id: logId },
    data: {
      status: payload.status,
      sentAt: payload.status === 'SENT' ? new Date() : null,
      errorText: payload.errorText ?? null,
    },
  });
};

const isTelegramUnreachableError = (message: string) => {
  const normalized = message.toLowerCase();
  return normalized.includes('chat not found') || normalized.includes('blocked by the user');
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

  const log = await createNotificationLog({
    teacherId,
    studentId: lesson.studentId,
    lessonId,
    type: 'TEACHER_LESSON_REMINDER',
    scheduledFor,
    dedupeKey,
  });
  if (!log) return { status: 'skipped' as const };

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

  try {
    await sendTelegramMessage(teacher.chatId, text);
    await finalizeNotificationLog(log.id, { status: 'SENT' });
    return { status: 'sent' as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizeNotificationLog(log.id, { status: 'FAILED', errorText: message });
    return { status: 'failed' as const, error: message };
  }
};

export const sendStudentLessonReminder = async ({
  studentId,
  lessonId,
  scheduledFor,
  dedupeKey,
  minutesBefore,
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
  if (!telegramId) return { status: 'skipped' as const };

  const log = await createNotificationLog({
    teacherId: lesson.teacherId,
    studentId,
    lessonId,
    type: 'STUDENT_LESSON_REMINDER',
    scheduledFor,
    dedupeKey,
  });
  if (!log) return { status: 'skipped' as const };

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

  try {
    await sendTelegramMessage(telegramId, normalizedText);
    await finalizeNotificationLog(log.id, { status: 'SENT' });
    return { status: 'sent' as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizeNotificationLog(log.id, { status: 'FAILED', errorText: message });
    if (isTelegramUnreachableError(message)) {
      await prisma.student.update({ where: { id: studentId }, data: { isActivated: false } });
    }
    return { status: 'failed' as const, error: message };
  }
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
  const teacher = await prisma.teacher.findUnique({ where: { chatId: lesson.teacherId } });
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!teacher?.studentNotificationsEnabled) {
    return { status: 'skipped' as const, reason: 'notifications_disabled' as const };
  }
  if (!student) {
    return { status: 'skipped' as const, reason: 'student_not_found' as const };
  }
  const telegramId = await resolveStudentTelegramId(student);
  if (!telegramId) {
    return { status: 'skipped' as const, reason: 'student_not_activated' as const };
  }

  const normalizedText = normalizeNotificationText(text);
  if (!normalizedText) {
    return { status: 'skipped' as const, reason: 'empty_text' as const };
  }

  const log = await createNotificationLog({
    teacherId: lesson.teacherId,
    studentId,
    lessonId,
    type: 'STUDENT_LESSON_REMINDER',
    source: 'MANUAL',
    scheduledFor,
    dedupeKey,
  });
  if (!log) return { status: 'skipped' as const, reason: 'deduped' as const };

  try {
    await sendTelegramMessage(telegramId, normalizedText);
    await finalizeNotificationLog(log.id, { status: 'SENT' });
    return { status: 'sent' as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizeNotificationLog(log.id, { status: 'FAILED', errorText: message });
    if (isTelegramUnreachableError(message)) {
      await prisma.student.update({ where: { id: studentId }, data: { isActivated: false } });
    }
    return { status: 'failed' as const, error: message };
  }
};

export const sendTeacherOnboardingNudge = async ({
  teacherId,
  scheduledFor,
}: {
  teacherId: bigint;
  scheduledFor?: Date;
}) => {
  const log = await createNotificationLog({
    teacherId,
    type: 'TEACHER_ONBOARDING_NUDGE',
    scheduledFor: scheduledFor ?? null,
  });
  if (!log) return { status: 'skipped' as const };

  const text =
    'Привет! Быстрый совет: добавь одного ученика — и дальше будет гораздо проще вести занятия и оплаты. Это займёт пару минут.';

  try {
    await sendTelegramWebAppMessage(teacherId, text);
    await finalizeNotificationLog(log.id, { status: 'SENT' });
    return { status: 'sent' as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizeNotificationLog(log.id, { status: 'FAILED', errorText: message });
    return { status: 'failed' as const, error: message };
  }
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

  const log = await createNotificationLog({
    teacherId,
    type,
    scheduledFor,
    dedupeKey,
  });
  if (!log) return { status: 'skipped' as const };

  const text = buildTeacherDailySummaryMessage({
    scope: type === 'TEACHER_DAILY_SUMMARY' ? 'today' : 'tomorrow',
    summaryDate,
    lessons,
    unpaidLessons,
    timeZone: teacher.timezone,
  });

  try {
    await sendTelegramMessage(teacher.chatId, text);
    await finalizeNotificationLog(log.id, { status: 'SENT' });
    return { status: 'sent' as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizeNotificationLog(log.id, { status: 'FAILED', errorText: message });
    return { status: 'failed' as const, error: message };
  }
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
  if (!telegramId) return { status: 'skipped' as const };

  const log = await createNotificationLog({
    teacherId: lesson.teacherId,
    studentId,
    lessonId,
    type: 'PAYMENT_REMINDER_STUDENT',
    source,
    channel: 'TELEGRAM',
  });
  if (!log) return { status: 'skipped' as const };

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
  const template = resolveStudentTemplate(
    teacher.studentPaymentDueTemplate,
    DEFAULT_STUDENT_PAYMENT_DUE_TEMPLATE,
  );
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

  try {
    await sendTelegramMessage(telegramId, normalizedText);
    await finalizeNotificationLog(log.id, { status: 'SENT' });
    return { status: 'sent' as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizeNotificationLog(log.id, { status: 'FAILED', errorText: message });
    if (isTelegramUnreachableError(message)) {
      await prisma.student.update({ where: { id: studentId }, data: { isActivated: false } });
    }
    return { status: 'failed' as const, error: message };
  }
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

  const log = await createNotificationLog({
    teacherId,
    studentId,
    lessonId,
    type: 'PAYMENT_REMINDER_TEACHER',
    source,
    channel: 'TELEGRAM',
  });
  if (!log) return { status: 'skipped' as const };

  const text = buildTeacherPaymentReminderMessage({
    studentName,
    startAt: lesson.startAt,
    timeZone: teacher.timezone,
    source,
  });

  try {
    await sendTelegramMessage(teacher.chatId, text);
    await finalizeNotificationLog(log.id, { status: 'SENT' });
    return { status: 'sent' as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizeNotificationLog(log.id, { status: 'FAILED', errorText: message });
    return { status: 'failed' as const, error: message };
  }
};

import { addDays, isSameDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Prisma } from '@prisma/client';
import prisma from './prismaClient';
import { resolveStudentTelegramId } from './studentContacts';
import { formatInTimeZone, resolveTimeZone, toZonedDate } from '../shared/lib/timezoneDates';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const TELEGRAM_API_BASE = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

type NotificationType =
  | 'TEACHER_LESSON_REMINDER'
  | 'TEACHER_UNPAID_DIGEST'
  | 'STUDENT_LESSON_REMINDER'
  | 'STUDENT_PAYMENT_REMINDER'
  | 'MANUAL_STUDENT_PAYMENT_REMINDER';

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

const formatLessonDayLabel = (startAt: Date, timeZone?: string | null) => {
  const resolvedTimeZone = resolveTimeZone(timeZone);
  const zonedStart = toZonedDate(startAt, resolvedTimeZone);
  const todayZoned = toZonedDate(new Date(), resolvedTimeZone);
  if (isSameDay(zonedStart, todayZoned)) return 'сегодня';
  if (isSameDay(zonedStart, addDays(todayZoned, 1))) return 'завтра';
  return formatInTimeZone(startAt, 'd MMM', { locale: ru, timeZone: resolvedTimeZone });
};

const buildLessonReminderMessage = ({
  startAt,
  durationMinutes,
  studentName,
  timeZone,
  target,
}: {
  startAt: Date;
  durationMinutes: number;
  studentName?: string | null;
  timeZone?: string | null;
  target: 'teacher' | 'student';
}) => {
  const dayLabel = formatLessonDayLabel(startAt, timeZone);
  const timeLabel = formatInTimeZone(startAt, 'HH:mm', { timeZone: resolveTimeZone(timeZone) });
  if (target === 'teacher') {
    const name = studentName?.trim() || 'учеником';
    return `Напоминание: ${dayLabel} в ${timeLabel} урок с ${name} (${durationMinutes} мин).`;
  }
  return `Напоминание: ${dayLabel} в ${timeLabel} урок. Длительность ${durationMinutes} мин.`;
};

const buildPaymentReminderMessage = (startAt: Date, price: number, timeZone?: string | null) => {
  const dateLabel = formatInTimeZone(startAt, 'd MMM, HH:mm', { locale: ru, timeZone: resolveTimeZone(timeZone) });
  const priceLabel = Number.isFinite(price) && price > 0 ? `${price} ₽` : '—';
  return `Пожалуйста, оплатите занятие от ${dateLabel}. Сумма: ${priceLabel}.`;
};

const buildUnpaidDigestMessage = (summary: { studentCount: number; lessonCount: number; totalAmount: number }) =>
  `Есть неоплаченные занятия: ${summary.studentCount} ученика, ${summary.lessonCount} занятия, ${summary.totalAmount} ₽. Откройте приложение, чтобы отметить оплаты.`;

const createNotificationLog = async (payload: {
  teacherId: bigint;
  studentId?: number | null;
  lessonId?: number | null;
  type: NotificationType;
  scheduledFor?: Date | null;
  dedupeKey?: string | null;
}) => {
  try {
    return await prisma.notificationLog.create({
      data: {
        teacherId: payload.teacherId,
        studentId: payload.studentId ?? null,
        lessonId: payload.lessonId ?? null,
        type: payload.type,
        scheduledFor: payload.scheduledFor ?? null,
        status: 'PENDING',
        dedupeKey: payload.dedupeKey ?? null,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      Array.isArray(error.meta?.target) &&
      error.meta?.target.includes('dedupeKey')
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
}: {
  teacherId: bigint;
  lessonId: number;
  scheduledFor?: Date;
  dedupeKey?: string;
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
    timeZone: teacher.timezone,
    target: 'teacher',
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
}: {
  studentId: number;
  lessonId: number;
  scheduledFor?: Date;
  dedupeKey?: string;
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

  const text = buildLessonReminderMessage({
    startAt: lesson.startAt,
    durationMinutes: lesson.durationMinutes,
    timeZone: teacher.timezone,
    target: 'student',
  });

  try {
    await sendTelegramMessage(telegramId, text);
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

export const sendTeacherUnpaidDigest = async ({
  teacherId,
  summary,
  scheduledFor,
  dedupeKey,
}: {
  teacherId: bigint;
  summary: { studentCount: number; lessonCount: number; totalAmount: number };
  scheduledFor?: Date;
  dedupeKey?: string;
}) => {
  const teacher = await prisma.teacher.findUnique({ where: { chatId: teacherId } });
  if (!teacher?.unpaidReminderEnabled) return { status: 'skipped' as const };
  if (summary.lessonCount <= 0) return { status: 'skipped' as const };

  const log = await createNotificationLog({
    teacherId,
    type: 'TEACHER_UNPAID_DIGEST',
    scheduledFor,
    dedupeKey,
  });
  if (!log) return { status: 'skipped' as const };

  const text = buildUnpaidDigestMessage(summary);

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
  manual,
}: {
  studentId: number;
  lessonId: number;
  manual?: boolean;
}) => {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson || lesson.studentId !== studentId) return { status: 'skipped' as const };
  const teacher = await prisma.teacher.findUnique({ where: { chatId: lesson.teacherId } });
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!teacher?.studentNotificationsEnabled || !teacher.studentPaymentRemindersEnabled) {
    return { status: 'skipped' as const };
  }
  if (!student) return { status: 'skipped' as const };
  const telegramId = await resolveStudentTelegramId(student);
  if (!telegramId) return { status: 'skipped' as const };

  const log = await createNotificationLog({
    teacherId: lesson.teacherId,
    studentId,
    lessonId,
    type: manual ? 'MANUAL_STUDENT_PAYMENT_REMINDER' : 'STUDENT_PAYMENT_REMINDER',
  });
  if (!log) return { status: 'skipped' as const };

  const text = buildPaymentReminderMessage(lesson.startAt, lesson.price ?? 0, teacher.timezone);

  try {
    await sendTelegramMessage(telegramId, text);
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

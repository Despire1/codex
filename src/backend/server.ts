import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http, { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { URL } from 'node:url';
import { addDays, addYears, endOfWeek, format, startOfWeek } from 'date-fns';
import { ru } from 'date-fns/locale';
import prisma from './prismaClient';
import type { Student, User } from '@prisma/client';
import type { HomeworkBlock, HomeworkStatus, PaymentCancelBehavior } from '../entities/types';
import { resolveHomeworkAttemptTimerConfig } from '../entities/homework-template/model/lib/quizSettings';
import { normalizeLessonColor } from '../shared/lib/lessonColors';
import {
  isValidMeetingLink,
  MEETING_LINK_MAX_LENGTH,
  normalizeMeetingLinkInput,
} from '../shared/lib/meetingLink';
import { isValidEmail, normalizeEmail } from '../shared/lib/email';
import {
  formatInTimeZone,
  getTimeZoneStartOfDay,
  resolveTimeZone,
  toUtcDateFromTimeZone,
  toUtcEndOfDay,
  toZonedDate,
} from '../shared/lib/timezoneDates';
import {
  STUDENT_LESSON_TEMPLATE_VARIABLES,
  STUDENT_PAYMENT_TEMPLATE_VARIABLES,
  STUDENT_LESSON_TEMPLATE_EXAMPLES,
  STUDENT_PAYMENT_TEMPLATE_EXAMPLES,
} from '../shared/lib/notificationTemplates';
import { renderNotificationTemplate } from '../shared/lib/notificationTemplateRender';
import {
  sendStudentLessonReminder,
  sendStudentLessonReminderManual,
  sendStudentPaymentReminder,
  sendTelegramMessage as sendNotificationTelegramMessage,
  sendTeacherLessonReminder,
  sendTeacherDailySummary,
  sendTeacherOnboardingNudge,
  sendTeacherPaymentReminderNotice,
} from './notificationService';
import { resolveStudentTelegramId } from './studentContacts';
import { buildOnboardingReminderMessage, type OnboardingReminderTemplate } from '../shared/lib/onboardingReminder';
import { logActivityEvent } from './activityFeedService';
import {
  badRequest,
  notFound,
  readBody,
  sendJson,
} from './server/lib/http';
import { createAuthService } from './server/modules/auth';
import { createSessionService } from './server/modules/sessions';
import {
  createActivityFeedService,
  parseActivityCategories,
  parseQueryDate,
} from './server/modules/activityFeed';
import { createStudentsService, normalizeTelegramUsername } from './server/modules/students';
import { clampNumber, isValidTimeString } from './server/lib/runtimeLimits';
import { createAuthTransferHandlers } from './server/routes/authTransfer';
import { createAuthSessionHandlers } from './server/routes/authSession';
import { tryHandleAuthRoutes } from './server/routes/authRoutes';
import { tryHandleStudentV2Routes } from './server/routes/studentRoutesV2';
import { tryHandleHomeworkRoutesV2 } from './server/routes/homeworkRoutesV2';
import { tryHandleNotificationRoutes } from './server/routes/notificationRoutes';
import { tryHandleSessionRoutes } from './server/routes/sessionRoutes';
import { tryHandleActivityFeedRoutes } from './server/routes/activityFeedRoutes';
import { tryHandleStudentRoutes } from './server/routes/studentRoutes';
import { tryHandleHomeworkRoutes } from './server/routes/homeworkRoutes';
import { tryHandleLessonRoutes } from './server/routes/lessonRoutes';
import { RequestValidationError } from './server/lib/requestValidationError';
import { validateHomeworkTemplatePayload } from './server/modules/homeworkTemplateValidation';

const PORT = Number(process.env.API_PORT ?? 4000);
const DEFAULT_PAGE_SIZE = 15;
const MAX_PAGE_SIZE = 50;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const TELEGRAM_INITDATA_TTL_SEC = Number(process.env.TELEGRAM_INITDATA_TTL_SEC ?? 300);
const TELEGRAM_REPLAY_SKEW_SEC = Number(process.env.TELEGRAM_REPLAY_SKEW_SEC ?? 60);
const TELEGRAM_API_BASE = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const SUBSCRIPTION_MONTH_DAYS = 30;
const YOOKASSA_EVENT_TTL_MS = 24 * 60 * 60 * 1000;
const processedYookassaPayments = new Map<string, number>();
const LOCAL_AUTH_BYPASS = process.env.LOCAL_AUTH_BYPASS === 'true' && process.env.NODE_ENV !== 'production';
const LOCAL_DEV_TELEGRAM_ID = (() => {
  const raw = process.env.LOCAL_DEV_TELEGRAM_ID;
  if (!raw) return 999_999_999n;
  try {
    return BigInt(raw);
  } catch (error) {
    return 999_999_999n;
  }
})();
const LOCAL_DEV_USERNAME = process.env.LOCAL_DEV_USERNAME ?? 'local_teacher';
const LOCAL_DEV_FIRST_NAME = process.env.LOCAL_DEV_FIRST_NAME ?? 'Local';
const LOCAL_DEV_LAST_NAME = process.env.LOCAL_DEV_LAST_NAME ?? 'Teacher';
const SESSION_TTL_MINUTES = Number(process.env.SESSION_TTL_MINUTES ?? 1440);
const TRANSFER_TOKEN_TTL_SEC = Number(process.env.TRANSFER_TOKEN_TTL_SEC ?? 120);
const TRANSFER_TOKEN_MIN_TTL_SEC = 30;
const TRANSFER_TOKEN_MAX_TTL_SEC = 300;
const TRANSFER_REDIRECT_URL = process.env.TRANSFER_REDIRECT_URL ?? '/dashboard';
const SESSION_COOKIE_NAME = 'session_id';
const RATE_LIMIT_WEBAPP_PER_MIN = Number(process.env.RATE_LIMIT_WEBAPP_PER_MIN ?? 30);
const RATE_LIMIT_TRANSFER_CREATE_PER_MIN = Number(process.env.RATE_LIMIT_TRANSFER_CREATE_PER_MIN ?? 3);
const RATE_LIMIT_TRANSFER_CREATE_IP_PER_MIN = Number(process.env.RATE_LIMIT_TRANSFER_CREATE_IP_PER_MIN ?? 10);
const RATE_LIMIT_TRANSFER_CONSUME_IP_PER_MIN = Number(process.env.RATE_LIMIT_TRANSFER_CONSUME_IP_PER_MIN ?? 10);
const RATE_LIMIT_TRANSFER_CONSUME_TOKEN_PER_MIN = Number(process.env.RATE_LIMIT_TRANSFER_CONSUME_TOKEN_PER_MIN ?? 5);
const NOTIFICATION_TICK_MS = 60_000;
const ONBOARDING_NUDGE_TICK_MS = 15 * 60_000;
const ONBOARDING_NUDGE_DELAY_MS = 24 * 60 * 60 * 1000;
const ONBOARDING_NUDGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const NOTIFICATION_LOG_RETENTION_DAYS = Number(process.env.NOTIFICATION_LOG_RETENTION_DAYS ?? 0);
const MIN_NOTIFICATION_LOG_RETENTION_DAYS = 7;
const MAX_NOTIFICATION_LOG_RETENTION_DAYS = 30;
const authService = createAuthService({
  sessionCookieName: SESSION_COOKIE_NAME,
  sessionTtlMinutes: SESSION_TTL_MINUTES,
  localAuthBypass: LOCAL_AUTH_BYPASS,
  localDevUser: {
    telegramUserId: LOCAL_DEV_TELEGRAM_ID,
    username: LOCAL_DEV_USERNAME,
    firstName: LOCAL_DEV_FIRST_NAME,
    lastName: LOCAL_DEV_LAST_NAME,
  },
});
const { createSession, getSessionTokenHash, getSessionUser, resolveSessionUser } = authService;
const sessionService = createSessionService({ getSessionTokenHash });
const { listSessions, revokeSession, revokeOtherSessions } = sessionService;
const authTransferHandlers = createAuthTransferHandlers({
  createSession,
  getSessionUser,
  port: PORT,
  transferRedirectUrl: TRANSFER_REDIRECT_URL,
  transferTokenTtlSec: TRANSFER_TOKEN_TTL_SEC,
  transferTokenMinTtlSec: TRANSFER_TOKEN_MIN_TTL_SEC,
  transferTokenMaxTtlSec: TRANSFER_TOKEN_MAX_TTL_SEC,
  rateLimitTransferCreatePerMin: RATE_LIMIT_TRANSFER_CREATE_PER_MIN,
  rateLimitTransferCreateIpPerMin: RATE_LIMIT_TRANSFER_CREATE_IP_PER_MIN,
  rateLimitTransferConsumeIpPerMin: RATE_LIMIT_TRANSFER_CONSUME_IP_PER_MIN,
  rateLimitTransferConsumeTokenPerMin: RATE_LIMIT_TRANSFER_CONSUME_TOKEN_PER_MIN,
});
const authSessionHandlers = createAuthSessionHandlers({
  createSession,
  sessionCookieName: SESSION_COOKIE_NAME,
  telegramBotToken: TELEGRAM_BOT_TOKEN,
  telegramInitDataTtlSec: TELEGRAM_INITDATA_TTL_SEC,
  telegramReplaySkewSec: TELEGRAM_REPLAY_SKEW_SEC,
  rateLimitWebappPerMin: RATE_LIMIT_WEBAPP_PER_MIN,
});
let isLessonAutomationRunning = false;
const shouldSendLessonReminder = (scheduledFor: Date, now: Date) => {
  const nowMs = now.getTime();
  const scheduledMs = scheduledFor.getTime();
  return scheduledMs <= nowMs && nowMs < scheduledMs + NOTIFICATION_TICK_MS;
};

const TEMPLATE_MAX_LENGTH = 1000;

const validateStudentTemplate = (value: string, allowedVariables: readonly string[]) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Текст уведомления не может быть пустым');
  }
  if (value.length > TEMPLATE_MAX_LENGTH) {
    throw new Error(`Текст уведомления не должен превышать ${TEMPLATE_MAX_LENGTH} символов`);
  }

  const allowedSet = new Set(allowedVariables);
  const variableRegex = /{{\\s*([^}]+)\\s*}}/g;
  for (const match of value.matchAll(variableRegex)) {
    const rawVariable = match[1]?.trim() ?? '';
    if (!allowedSet.has(rawVariable)) {
      throw new Error(`Неизвестная переменная: {{${rawVariable}}}`);
    }
  }

  return value;
};

type NotificationTestTemplateType = 'LESSON_REMINDER' | 'PAYMENT_REMINDER';
type NotificationTestRecipientMode = 'SELF' | 'STUDENTS';
type NotificationTestDataSource = 'PREVIEW_EXAMPLE_A' | 'PREVIEW_EXAMPLE_B';
type TeacherStudentLink = {
  studentId: number;
  customName: string;
  student: Student | null;
};

const isNotificationTestType = (value: unknown): value is NotificationTestTemplateType =>
  value === 'LESSON_REMINDER' || value === 'PAYMENT_REMINDER';

const isNotificationTestRecipientMode = (value: unknown): value is NotificationTestRecipientMode =>
  value === 'SELF' || value === 'STUDENTS';

const isNotificationTestDataSource = (value: unknown): value is NotificationTestDataSource =>
  value === 'PREVIEW_EXAMPLE_A' || value === 'PREVIEW_EXAMPLE_B';

const resolveNotificationTestVariables = (type: NotificationTestTemplateType) =>
  type === 'LESSON_REMINDER' ? STUDENT_LESSON_TEMPLATE_VARIABLES : STUDENT_PAYMENT_TEMPLATE_VARIABLES;

const resolveNotificationTestExamples = (type: NotificationTestTemplateType, source: NotificationTestDataSource) => {
  const key = source === 'PREVIEW_EXAMPLE_A' ? 'A' : 'B';
  return type === 'LESSON_REMINDER' ? STUDENT_LESSON_TEMPLATE_EXAMPLES[key] : STUDENT_PAYMENT_TEMPLATE_EXAMPLES[key];
};

const resolveStudentDisplayName = (
  link: { customName?: string | null },
  student?: Student | null,
  options?: { preferCustomOnly?: boolean },
) => {
  const customName = link.customName?.trim() ?? '';
  if (customName) return customName;
  if (options?.preferCustomOnly) return 'ученик';
  return student?.username?.trim() || 'ученик';
};

const LESSON_WEEKDAY_LABELS_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const;

const uniqueStrings = (values: string[]) => Array.from(new Set(values.filter((value) => value.trim().length > 0)));

const resolveWeekdayLabels = (weekdays: number[]) =>
  uniqueStrings(
    weekdays
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      .map((day) => LESSON_WEEKDAY_LABELS_RU[day] ?? ''),
  );

const resolveLessonParticipantNames = (
  studentIds: number[],
  links: Array<{ studentId: number; customName?: string | null; student?: Student | null }>,
) => {
  const linkByStudentId = new Map<number, { studentId: number; customName?: string | null; student?: Student | null }>(
    links.map((link) => [link.studentId, link]),
  );
  return uniqueStrings(
    studentIds.map((studentId) => {
      const link = linkByStudentId.get(studentId);
      if (!link) return '';
      return resolveStudentDisplayName(link, link.student ?? null, { preferCustomOnly: true });
    }),
  );
};

const resolveLessonParticipantNamesFromParticipants = (
  participants: Array<{ studentId: number; student?: Student | null }>,
  links?: Array<{ studentId: number; customName?: string | null; student?: Student | null }>,
) => {
  const linksByStudentId = new Map<number, { studentId: number; customName?: string | null; student?: Student | null }>(
    (links ?? []).map((link) => [link.studentId, link]),
  );
  return uniqueStrings(
    participants.map((participant) => {
      const link = linksByStudentId.get(participant.studentId);
      if (link) {
        return resolveStudentDisplayName(link, link.student ?? participant.student ?? null, {
          preferCustomOnly: true,
        });
      }
      return '';
    }),
  );
};

const resolveMeetingLinkValue = (value: any) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new Error('Некорректная ссылка');
  }
  const normalized = normalizeMeetingLinkInput(value);
  if (!normalized) return null;
  if (normalized.length > MEETING_LINK_MAX_LENGTH) {
    throw new Error('Ссылка слишком длинная');
  }
  if (!isValidMeetingLink(normalized)) {
    throw new Error('Некорректная ссылка');
  }
  return normalized;
};

const safeLogActivityEvent = async (payload: Parameters<typeof logActivityEvent>[0]) => {
  try {
    await logActivityEvent(payload);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to log activity event', error);
  }
};

const formatTeacherName = (user: User) => {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return fullName || user.username || 'Teacher';
};

const hasActiveSubscription = (user: User | null) => {
  if (!user?.subscriptionStartAt) return false;
  if (!user.subscriptionEndAt) return true;
  return user.subscriptionEndAt.getTime() > Date.now();
};

const formatSubscriptionDate = (date: Date) =>
  date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

const cleanupProcessedYookassaPayments = () => {
  const cutoff = Date.now() - YOOKASSA_EVENT_TTL_MS;
  for (const [paymentId, timestamp] of processedYookassaPayments.entries()) {
    if (timestamp < cutoff) {
      processedYookassaPayments.delete(paymentId);
    }
  }
};

const markYookassaPaymentProcessed = (paymentId: string) => {
  processedYookassaPayments.set(paymentId, Date.now());
  cleanupProcessedYookassaPayments();
};

const wasYookassaPaymentProcessed = (paymentId: string) => processedYookassaPayments.has(paymentId);

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

const sendTelegramMessage = async (chatId: bigint, text: string) => {
  await callTelegram('sendMessage', {
    chat_id: Number(chatId),
    text,
  });
};

const deleteTelegramMessage = async (chatId: bigint, messageId: number) => {
  await callTelegram('deleteMessage', {
    chat_id: Number(chatId),
    message_id: messageId,
  });
};

const formatDedupeTimeKey = (date: Date, timeZone?: string | null) =>
  formatInTimeZone(date, "yyyy-MM-dd'T'HH:mm", { timeZone: resolveTimeZone(timeZone) });

const ensureTeacher = async (user: User) =>
  prisma.teacher.upsert({
    where: { chatId: user.telegramUserId },
    update: {
      username: user.username ?? null,
      name: formatTeacherName(user),
    },
    create: {
      chatId: user.telegramUserId,
      name: formatTeacherName(user),
      username: user.username ?? null,
    },
  });
const activityFeedService = createActivityFeedService({ ensureTeacher });
const { listActivityFeed, getActivityFeedUnreadStatus, markActivityFeedSeen } = activityFeedService;

const pickTeacherSettings = (teacher: any) => ({
  timezone: teacher.timezone ?? null,
  defaultLessonDuration: teacher.defaultLessonDuration,
  lessonReminderEnabled: teacher.lessonReminderEnabled,
  lessonReminderMinutes: teacher.lessonReminderMinutes,
  dailySummaryEnabled: teacher.dailySummaryEnabled,
  dailySummaryTime: teacher.dailySummaryTime,
  tomorrowSummaryEnabled: teacher.tomorrowSummaryEnabled,
  tomorrowSummaryTime: teacher.tomorrowSummaryTime,
  studentNotificationsEnabled: teacher.studentNotificationsEnabled,
  studentUpcomingLessonTemplate: teacher.studentUpcomingLessonTemplate,
  studentPaymentDueTemplate: teacher.studentPaymentDueTemplate,
  autoConfirmLessons: teacher.autoConfirmLessons,
  globalPaymentRemindersEnabled: teacher.globalPaymentRemindersEnabled,
  paymentReminderDelayHours: teacher.paymentReminderDelayHours,
  paymentReminderRepeatHours: teacher.paymentReminderRepeatHours,
  paymentReminderMaxCount: teacher.paymentReminderMaxCount,
  notifyTeacherOnAutoPaymentReminder: teacher.notifyTeacherOnAutoPaymentReminder,
  notifyTeacherOnManualPaymentReminder: teacher.notifyTeacherOnManualPaymentReminder,
  homeworkNotifyOnAssign: teacher.homeworkNotifyOnAssign,
  homeworkReminder24hEnabled: teacher.homeworkReminder24hEnabled,
  homeworkReminderMorningEnabled: teacher.homeworkReminderMorningEnabled,
  homeworkReminderMorningTime: teacher.homeworkReminderMorningTime,
  homeworkReminder3hEnabled: teacher.homeworkReminder3hEnabled,
  homeworkOverdueRemindersEnabled: teacher.homeworkOverdueRemindersEnabled,
  homeworkOverdueReminderTime: teacher.homeworkOverdueReminderTime,
  homeworkOverdueReminderMaxCount: teacher.homeworkOverdueReminderMaxCount,
});

const getSettings = async (user: User) => {
  const teacher = await ensureTeacher(user);
  return { settings: { ...pickTeacherSettings(teacher), receiptEmail: user.receiptEmail ?? null } };
};

const updateSettings = async (user: User, body: any) => {
  const teacher = await ensureTeacher(user);
  const data: Record<string, any> = {};
  const userData: Record<string, any> = {};

  if (typeof body.timezone === 'string') {
    const trimmed = body.timezone.trim();
    data.timezone = trimmed ? trimmed : null;
  } else if (body.timezone === null) {
    data.timezone = null;
  }

  if (body.defaultLessonDuration !== undefined) {
    const numeric = Number(body.defaultLessonDuration);
    if (Number.isFinite(numeric)) {
      data.defaultLessonDuration = clampNumber(Math.round(numeric), 15, 240);
    }
  }

  if (typeof body.lessonReminderEnabled === 'boolean') {
    data.lessonReminderEnabled = body.lessonReminderEnabled;
  }

  if (body.lessonReminderMinutes !== undefined) {
    const numeric = Number(body.lessonReminderMinutes);
    if (Number.isFinite(numeric)) {
      data.lessonReminderMinutes = clampNumber(Math.round(numeric), 5, 120);
    }
  }

  if (typeof body.dailySummaryEnabled === 'boolean') {
    data.dailySummaryEnabled = body.dailySummaryEnabled;
  }

  if (typeof body.dailySummaryTime === 'string' && isValidTimeString(body.dailySummaryTime)) {
    data.dailySummaryTime = body.dailySummaryTime;
  }

  if (typeof body.tomorrowSummaryEnabled === 'boolean') {
    data.tomorrowSummaryEnabled = body.tomorrowSummaryEnabled;
  }

  if (typeof body.tomorrowSummaryTime === 'string' && isValidTimeString(body.tomorrowSummaryTime)) {
    data.tomorrowSummaryTime = body.tomorrowSummaryTime;
  }

  if (typeof body.studentNotificationsEnabled === 'boolean') {
    data.studentNotificationsEnabled = body.studentNotificationsEnabled;
  }

  if (typeof body.studentUpcomingLessonTemplate === 'string') {
    data.studentUpcomingLessonTemplate = validateStudentTemplate(
      body.studentUpcomingLessonTemplate,
      STUDENT_LESSON_TEMPLATE_VARIABLES,
    );
  } else if (body.studentUpcomingLessonTemplate === null) {
    data.studentUpcomingLessonTemplate = null;
  }

  if (typeof body.studentPaymentDueTemplate === 'string') {
    data.studentPaymentDueTemplate = validateStudentTemplate(
      body.studentPaymentDueTemplate,
      STUDENT_PAYMENT_TEMPLATE_VARIABLES,
    );
  } else if (body.studentPaymentDueTemplate === null) {
    data.studentPaymentDueTemplate = null;
  }

  if (typeof body.autoConfirmLessons === 'boolean') {
    data.autoConfirmLessons = body.autoConfirmLessons;
  }

  if (typeof body.globalPaymentRemindersEnabled === 'boolean') {
    data.globalPaymentRemindersEnabled = body.globalPaymentRemindersEnabled;
  }

  if (body.paymentReminderDelayHours !== undefined) {
    const numeric = Number(body.paymentReminderDelayHours);
    if (Number.isFinite(numeric)) {
      data.paymentReminderDelayHours = clampNumber(Math.round(numeric), 1, 168);
    }
  }

  if (body.paymentReminderRepeatHours !== undefined) {
    const numeric = Number(body.paymentReminderRepeatHours);
    if (Number.isFinite(numeric)) {
      data.paymentReminderRepeatHours = clampNumber(Math.round(numeric), 1, 168);
    }
  }

  if (body.paymentReminderMaxCount !== undefined) {
    const numeric = Number(body.paymentReminderMaxCount);
    if (Number.isFinite(numeric)) {
      data.paymentReminderMaxCount = clampNumber(Math.round(numeric), 1, 10);
    }
  }

  if (typeof body.notifyTeacherOnAutoPaymentReminder === 'boolean') {
    data.notifyTeacherOnAutoPaymentReminder = body.notifyTeacherOnAutoPaymentReminder;
  }

  if (typeof body.notifyTeacherOnManualPaymentReminder === 'boolean') {
    data.notifyTeacherOnManualPaymentReminder = body.notifyTeacherOnManualPaymentReminder;
  }

  if (typeof body.homeworkNotifyOnAssign === 'boolean') {
    data.homeworkNotifyOnAssign = body.homeworkNotifyOnAssign;
  }

  if (typeof body.homeworkReminder24hEnabled === 'boolean') {
    data.homeworkReminder24hEnabled = body.homeworkReminder24hEnabled;
  }

  if (typeof body.homeworkReminderMorningEnabled === 'boolean') {
    data.homeworkReminderMorningEnabled = body.homeworkReminderMorningEnabled;
  }

  if (typeof body.homeworkReminderMorningTime === 'string' && isValidTimeString(body.homeworkReminderMorningTime)) {
    data.homeworkReminderMorningTime = body.homeworkReminderMorningTime;
  }

  if (typeof body.homeworkReminder3hEnabled === 'boolean') {
    data.homeworkReminder3hEnabled = body.homeworkReminder3hEnabled;
  }

  if (typeof body.homeworkOverdueRemindersEnabled === 'boolean') {
    data.homeworkOverdueRemindersEnabled = body.homeworkOverdueRemindersEnabled;
  }

  if (typeof body.homeworkOverdueReminderTime === 'string' && isValidTimeString(body.homeworkOverdueReminderTime)) {
    data.homeworkOverdueReminderTime = body.homeworkOverdueReminderTime;
  }

  if (body.homeworkOverdueReminderMaxCount !== undefined) {
    const numeric = Number(body.homeworkOverdueReminderMaxCount);
    if (Number.isFinite(numeric)) {
      data.homeworkOverdueReminderMaxCount = clampNumber(Math.round(numeric), 1, 10);
    }
  }

  if (typeof body.receiptEmail === 'string') {
    const normalized = normalizeEmail(body.receiptEmail);
    if (!normalized) {
      userData.receiptEmail = null;
    } else if (!isValidEmail(normalized)) {
      throw new Error('Некорректный e-mail');
    } else {
      userData.receiptEmail = normalized;
    }
  } else if (body.receiptEmail === null) {
    userData.receiptEmail = null;
  }

  const shouldUpdateTeacher = Object.keys(data).length > 0;
  const shouldUpdateUser = Object.keys(userData).length > 0;

  const updatedTeacher = shouldUpdateTeacher
    ? await prisma.teacher.update({
        where: { chatId: teacher.chatId },
        data,
      })
    : teacher;

  const updatedUser = shouldUpdateUser
    ? await prisma.user.update({
        where: { id: user.id },
        data: userData,
      })
    : user;

  const changedTeacherKeys = Object.keys(data).filter((key) => (teacher as any)[key] !== (updatedTeacher as any)[key]);
  const changedUserKeys = Object.keys(userData).filter((key) => (user as any)[key] !== (updatedUser as any)[key]);
  if (changedTeacherKeys.length > 0 || changedUserKeys.length > 0) {
    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      category: 'SETTINGS',
      action: 'UPDATE_SETTINGS',
      status: 'SUCCESS',
      source: 'USER',
      title: 'Обновлены настройки',
      details: [
        changedTeacherKeys.length > 0 ? `Teacher: ${changedTeacherKeys.join(', ')}` : null,
        changedUserKeys.length > 0 ? `Profile: ${changedUserKeys.join(', ')}` : null,
      ]
        .filter(Boolean)
        .join('; '),
      payload: {
        changedTeacherKeys,
        changedUserKeys,
      },
    });
  }

  return {
    settings: { ...pickTeacherSettings(updatedTeacher), receiptEmail: updatedUser.receiptEmail ?? null },
  };
};

const getNotificationChannelStatus = () => ({
  channel: 'telegram',
  configured: Boolean(TELEGRAM_BOT_TOKEN),
  reason: TELEGRAM_BOT_TOKEN ? undefined : 'missing_token',
});

const listNotificationTestRecipients = async (user: User, _type: NotificationTestTemplateType) => {
  const teacher = await ensureTeacher(user);
  const links = (await prisma.teacherStudent.findMany({
    where: {
      teacherId: teacher.chatId,
      isArchived: false,
      student: {
        is: {
          isActivated: true,
          telegramId: { not: null },
        },
      },
    },
    include: { student: true },
    orderBy: { customName: 'asc' },
  })) as TeacherStudentLink[];

  return {
    students: links.map((link) => ({
      id: link.studentId,
      name: resolveStudentDisplayName(link, link.student),
    })),
  };
};

const sendNotificationTest = async (user: User, body: any) => {
  const teacher = await ensureTeacher(user);
  if (!TELEGRAM_BOT_TOKEN) throw new Error('no_channel');
  const type = body?.type;
  const recipientMode = body?.recipient_mode;
  const dataSource = body?.data_source;
  const templateText = typeof body?.template_text === 'string' ? body.template_text : '';

  if (!isNotificationTestType(type)) throw new Error('invalid_type');
  if (!isNotificationTestRecipientMode(recipientMode)) throw new Error('invalid_recipient');
  if (!isNotificationTestDataSource(dataSource)) throw new Error('invalid_data_source');
  if (!templateText.trim()) throw new Error('empty_text');
  if (templateText.length > TEMPLATE_MAX_LENGTH) throw new Error('template_too_long');

  const allowedVariables = resolveNotificationTestVariables(type);
  const exampleValues = resolveNotificationTestExamples(type, dataSource);

  const baseRender = renderNotificationTemplate({
    template: templateText,
    values: exampleValues,
    allowedVariables,
  });

  if (baseRender.unknownPlaceholders.length > 0) {
    throw new Error('invalid_template');
  }

  if (recipientMode === 'SELF') {
    const result = renderNotificationTemplate({
      template: templateText,
      values: exampleValues,
      allowedVariables,
    });

    try {
      await sendNotificationTelegramMessage(teacher.chatId, result.renderedText);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      const isChatNotFound = message.includes('chat not found');
      if (isChatNotFound && (LOCAL_AUTH_BYPASS || process.env.NODE_ENV !== 'production')) {
        return {
          status: 'ok' as const,
          rendered_text: result.renderedText,
          missing_data: result.missingData,
          channel: 'telegram',
        };
      }
      throw error;
    }

    return {
      status: 'ok' as const,
      rendered_text: result.renderedText,
      missing_data: result.missingData,
      channel: 'telegram',
    };
  }

  const rawIds = Array.isArray(body?.student_ids) ? (body.student_ids as Array<number | string>) : [];
  const studentIds: number[] = Array.from(
    new Set(rawIds.map((value) => Number(value)).filter((value) => Number.isFinite(value))),
  );
  if (studentIds.length === 0) throw new Error('student_required');
  if (studentIds.length > 5) throw new Error('too_many_students');

  const links = (await prisma.teacherStudent.findMany({
    where: {
      teacherId: teacher.chatId,
      studentId: { in: studentIds },
      isArchived: false,
    },
    include: { student: true },
  })) as TeacherStudentLink[];
  const linkMap = new Map<number, TeacherStudentLink>(links.map((link) => [link.studentId, link]));
  const results: Array<{ student_id: number; status: 'ok' | 'error'; error_code?: string }> = [];
  let renderedText = baseRender.renderedText;
  let missingData = baseRender.missingData;

  for (const studentId of studentIds) {
    const link = linkMap.get(studentId);
    const student = link?.student;
    if (!link || !student || !student.isActivated || !student.telegramId) {
      results.push({ student_id: studentId, status: 'error', error_code: 'STUDENT_NOT_ELIGIBLE' });
      continue;
    }

    const studentName = resolveStudentDisplayName(link, student);
    const render = renderNotificationTemplate({
      template: templateText,
      values: { ...exampleValues, student_name: studentName },
      allowedVariables,
    });
    renderedText = render.renderedText;
    missingData = render.missingData;

    try {
      await sendNotificationTelegramMessage(student.telegramId, render.renderedText);
      results.push({ student_id: studentId, status: 'ok' });
    } catch (error) {
      results.push({ student_id: studentId, status: 'error', error_code: 'SEND_FAILED' });
    }
  }

  const okCount = results.filter((item) => item.status === 'ok').length;
  const status = okCount === 0 ? 'error' : okCount === results.length ? 'ok' : 'partial';

  return {
    status,
    rendered_text: renderedText,
    missing_data: missingData,
    results: results.length > 1 ? results : undefined,
    channel: 'telegram',
  };
};

const searchStudents = async (user: User, query?: string, filter?: 'all' | 'pendingHomework' | 'noReminder') =>
  studentsService.searchStudents(user, query, filter);

const resolvePageParams = (url: URL) => studentsService.resolvePageParams(url);

const isOnboardingReminderTemplate = (value: unknown): value is OnboardingReminderTemplate =>
  value === 'TODAY' || value === 'IN_1_HOUR' || value === 'TOMORROW_MORNING';

const listStudents = async (
  user: User,
  query?: string,
  filter?: 'all' | 'debt' | 'overdue',
  limit = DEFAULT_PAGE_SIZE,
  offset = 0,
) => studentsService.listStudents(user, query, filter, limit, offset);

const listStudentHomeworks = async (
  user: User,
  studentId: number,
  filter: 'all' | HomeworkStatus | 'overdue' = 'all',
  limit = DEFAULT_PAGE_SIZE,
  offset = 0,
) => studentsService.listStudentHomeworks(user, studentId, filter, limit, offset);

const parseDateFilter = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const listStudentUnpaidLessons = async (user: User, studentId: number) =>
  studentsService.listStudentUnpaidLessons(user, studentId);

const listStudentPaymentReminders = async (
  user: User,
  studentId: number,
  options: { limit?: number; offset?: number } = {},
) => studentsService.listStudentPaymentReminders(user, studentId, options);

const listStudentLessons = async (
  user: User,
  studentId: number,
  filters: {
    payment?: 'all' | 'paid' | 'unpaid';
    status?: 'all' | 'completed' | 'not_completed';
    startFrom?: string;
    startTo?: string;
    sort?: 'asc' | 'desc';
  },
) => studentsService.listStudentLessons(user, studentId, filters);

const bootstrap = async (
  user: User,
  filters?: {
    lessonsStart?: Date | null;
    lessonsEnd?: Date | null;
    includeHomeworks?: boolean;
    includeStudents?: boolean;
    includeLinks?: boolean;
  },
) => {
  const teacher = await ensureTeacher(user);
  const includeLinks = filters?.includeLinks !== false;
  const includeStudents = filters?.includeStudents !== false;
  const links = includeLinks
    ? await prisma.teacherStudent.findMany({ where: { teacherId: teacher.chatId, isArchived: false } })
    : [];
  const students = includeStudents
    ? await prisma.student.findMany({
        where: {
          teacherLinks: {
            some: {
              teacherId: teacher.chatId,
              isArchived: false,
            },
          },
        },
      })
    : [];
  const includeHomeworks = filters?.includeHomeworks !== false;
  const homeworks = includeHomeworks ? await prisma.homework.findMany({ where: { teacherId: teacher.chatId } }) : [];
  let lessons: any[] = [];
  if (filters?.lessonsStart || filters?.lessonsEnd) {
    const lessonsWhere: Record<string, any> = { teacherId: teacher.chatId, startAt: {} };
    if (filters.lessonsStart) lessonsWhere.startAt.gte = filters.lessonsStart;
    if (filters.lessonsEnd) lessonsWhere.startAt.lte = filters.lessonsEnd;
    lessons = await prisma.lesson.findMany({
      where: lessonsWhere,
      include: {
        participants: {
          include: {
            student: true,
          },
        },
      },
    });
  }

  return { teacher, students, links, homeworks, lessons };
};

const listLessonsForRange = async (
  user: User,
  filters: {
    start?: string | null;
    end?: string | null;
  },
) => {
  const teacher = await ensureTeacher(user);
  const where: Record<string, any> = { teacherId: teacher.chatId };
  const startFrom = parseDateFilter(filters.start ?? undefined);
  const startTo = parseDateFilter(filters.end ?? undefined);
  if (startFrom || startTo) {
    where.startAt = {};
    if (startFrom) where.startAt.gte = startFrom;
    if (startTo) where.startAt.lte = startTo;
  }

  const lessons = await prisma.lesson.findMany({
    where,
    include: {
      participants: {
        include: {
          student: true,
        },
      },
    },
  });

  return { lessons };
};

const getDashboardSummary = async (user: User) => {
  const teacher = await ensureTeacher(user);
  const resolvedTimeZone = resolveTimeZone(teacher.timezone);
  const now = new Date();
  const todayZoned = toZonedDate(now, resolvedTimeZone);
  const todayKey = format(todayZoned, 'yyyy-MM-dd');
  const previousWindowStartKey = format(addDays(todayZoned, -7), 'yyyy-MM-dd');
  const previousWindowStartUtc = toUtcDateFromTimeZone(previousWindowStartKey, '00:00', resolvedTimeZone);
  const weekEndKey = format(endOfWeek(todayZoned, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const weekEndUtc = toUtcEndOfDay(weekEndKey, resolvedTimeZone);

  const resolveLessonAmountRub = (lesson: {
    price: number;
    participants: Array<{ price: number }>;
  }) => {
    if (lesson.participants.length > 0) {
      return lesson.participants.reduce((sum, participant) => sum + Math.max(0, Number(participant.price) || 0), 0);
    }
    return Math.max(0, Number(lesson.price) || 0);
  };

  const [studentsCount, lessonsCount] = await Promise.all([
    prisma.teacherStudent.count({
      where: { teacherId: teacher.chatId, isArchived: false },
    }),
    prisma.lesson.count({
      where: { teacherId: teacher.chatId },
    }),
  ]);

  const plannedLessons = await prisma.lesson.findMany({
    where: {
      teacherId: teacher.chatId,
      status: { not: 'CANCELED' },
      startAt: {
        gte: previousWindowStartUtc,
        lte: weekEndUtc,
      },
    },
    include: {
      participants: {
        select: {
          studentId: true,
          price: true,
          isPaid: true,
        },
      },
    },
  });

  const plannedByDay = new Map<string, number>();
  plannedLessons.forEach((lesson) => {
    const dayKey = formatInTimeZone(lesson.startAt, 'yyyy-MM-dd', { timeZone: resolvedTimeZone });
    const amount = resolveLessonAmountRub(lesson);
    plannedByDay.set(dayKey, (plannedByDay.get(dayKey) ?? 0) + amount);
  });

  const todayPlanRub = plannedByDay.get(todayKey) ?? 0;
  const previousSevenDaysTotal = Array.from({ length: 7 }).reduce<number>((sum, _unused, index) => {
    const key = format(addDays(todayZoned, -(index + 1)), 'yyyy-MM-dd');
    return sum + (plannedByDay.get(key) ?? 0);
  }, 0);
  const previousSevenDaysAverage = previousSevenDaysTotal / 7;
  const todayPlanDeltaPercent =
    previousSevenDaysAverage > 0
      ? Math.round(((todayPlanRub - previousSevenDaysAverage) / previousSevenDaysAverage) * 100)
      : todayPlanRub > 0
        ? 100
        : 0;

  const weekScheduledRub = plannedLessons.reduce((sum, lesson) => {
    if (lesson.status !== 'SCHEDULED') return sum;
    const startMs = lesson.startAt.getTime();
    if (startMs < now.getTime() || startMs > weekEndUtc.getTime()) return sum;
    return sum + resolveLessonAmountRub(lesson);
  }, 0);

  const unpaidLessons = await prisma.lesson.findMany({
    where: {
      teacherId: teacher.chatId,
      status: { not: 'CANCELED' },
      OR: [{ status: 'COMPLETED' }, { startAt: { lt: now } }],
      AND: [
        {
          OR: [{ isPaid: false }, { participants: { some: { isPaid: false } } }],
        },
      ],
    },
    include: {
      participants: {
        select: {
          studentId: true,
          price: true,
          isPaid: true,
        },
      },
    },
  });

  let unpaidRub = 0;
  const unpaidStudentIds = new Set<number>();
  unpaidLessons.forEach((lesson) => {
    if (lesson.participants.length > 0) {
      lesson.participants.forEach((participant) => {
        if (participant.isPaid) return;
        unpaidRub += Math.max(0, Number(participant.price) || 0);
        unpaidStudentIds.add(participant.studentId);
      });
      return;
    }

    if (lesson.isPaid) return;
    unpaidRub += Math.max(0, Number(lesson.price) || 0);
    unpaidStudentIds.add(lesson.studentId);
  });

  const unpaidStudentsCount = unpaidStudentIds.size;
  const receivableWeekRub = unpaidRub + weekScheduledRub;

  return {
    studentsCount,
    lessonsCount,
    todayPlanRub,
    todayPlanDeltaPercent,
    unpaidRub,
    unpaidStudentsCount,
    receivableWeekRub,
    telegramConnected: Boolean(TELEGRAM_BOT_TOKEN) && teacher.studentNotificationsEnabled,
    timezone: teacher.timezone ?? null,
    teacherId: Number(teacher.chatId),
  };
};

const sendLessonReminder = async (
  user: User,
  payload: {
    lessonId: number;
    template: OnboardingReminderTemplate;
  },
) => {
  const teacher = await ensureTeacher(user);
  const lesson = await prisma.lesson.findUnique({
    where: { id: payload.lessonId },
    include: { student: true },
  });
  if (!lesson || lesson.teacherId !== teacher.chatId) {
    throw new Error('Урок не найден');
  }

  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId: lesson.studentId } },
  });
  const studentName = link?.customName?.trim() || lesson.student?.username?.trim() || 'ученик';
  const text = buildOnboardingReminderMessage({
    template: payload.template,
    studentName,
    lessonStartAt: lesson.startAt,
    timeZone: teacher.timezone,
  });
  const dedupeKey = `manual_lesson_reminder_${lesson.id}_${formatDedupeTimeKey(new Date(), teacher.timezone)}`;
  const result = await sendStudentLessonReminderManual({
    studentId: lesson.studentId,
    lessonId: lesson.id,
    text,
    scheduledFor: new Date(),
    dedupeKey,
  });

  if (result.status === 'sent') {
    return { status: 'sent' as const };
  }

  if (result.status === 'skipped') {
    if (result.reason === 'student_not_activated') {
      throw new Error('student_not_activated');
    }
    throw new Error('reminder_skipped');
  }

  throw new Error(result.error ?? 'reminder_failed');
};

const listUnpaidLessons = async (user: User) => {
  const teacher = await ensureTeacher(user);
  const now = new Date();
  const lessons = await prisma.lesson.findMany({
    where: {
      teacherId: teacher.chatId,
      status: { not: 'CANCELED' },
      OR: [{ status: 'COMPLETED' }, { startAt: { lt: now } }],
      AND: [
        {
          OR: [{ isPaid: false }, { participants: { some: { isPaid: false } } }],
        },
      ],
    },
    include: {
      student: true,
      participants: {
        include: {
          student: true,
        },
      },
    },
    orderBy: { startAt: 'asc' },
  });

  const links = await prisma.teacherStudent.findMany({ where: { teacherId: teacher.chatId } });
  const linkMap = new Map<number, any>(links.map((link: any) => [link.studentId, link]));

  const entries = lessons.flatMap((lesson) => {
    const buildEntry = (studentId: number, price: number, student?: Student | null) => {
      const link = linkMap.get(studentId);
      return {
        lessonId: lesson.id,
        startAt: lesson.startAt,
        completedAt: lesson.completedAt ?? null,
        lastPaymentReminderAt: lesson.lastPaymentReminderAt ?? null,
        paymentReminderCount: lesson.paymentReminderCount ?? 0,
        studentId,
        studentName: link?.customName ?? student?.username ?? 'Ученик',
        price,
        isActivated: student?.isActivated ?? false,
        paymentRemindersEnabled: student?.paymentRemindersEnabled ?? true,
      };
    };

    if (lesson.participants && lesson.participants.length > 0) {
      return lesson.participants
        .filter((participant) => !participant.isPaid)
        .map((participant) => buildEntry(participant.studentId, participant.price, participant.student));
    }
    if (lesson.isPaid) return [];

    return [buildEntry(lesson.studentId, lesson.price ?? 0, lesson.student)];
  });

  return { entries };
};

const addStudent = async (user: User, body: any) => studentsService.addStudent(user, body);

const updateStudent = async (user: User, studentId: number, body: any) =>
  studentsService.updateStudent(user, studentId, body);

const archiveStudentLink = async (user: User, studentId: number) =>
  studentsService.archiveStudentLink(user, studentId);

const toggleAutoReminder = async (user: User, studentId: number, value: boolean) =>
  studentsService.toggleAutoReminder(user, studentId, value);

const updateStudentPaymentReminders = async (user: User, studentId: number, enabled: boolean) =>
  studentsService.updateStudentPaymentReminders(user, studentId, enabled);

const updatePricePerLesson = async (user: User, studentId: number, value: number) =>
  studentsService.updatePricePerLesson(user, studentId, value);

const adjustBalance = async (
  user: User,
  studentId: number,
  payload: { delta: number; type?: string; comment?: string; createdAt?: string },
) => studentsService.adjustBalance(user, studentId, payload);

const listPaymentEventsForStudent = async (
  user: User,
  studentId: number,
  options?: { filter?: string; date?: string },
) => studentsService.listPaymentEventsForStudent(user, studentId, options);

type RequestRole = 'TEACHER' | 'STUDENT';

const getRequestRole = (req: IncomingMessage): RequestRole => {
  const roleHeader = (req.headers['x-user-role'] as string | undefined) ?? '';
  return roleHeader.toUpperCase() === 'STUDENT' ? 'STUDENT' : 'TEACHER';
};

const VISIBLE_STUDENT_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'DONE'];

const getRequestedStudentId = (req: IncomingMessage): number | null => {
  const studentIdHeader = req.headers['x-student-id'];
  const requesterStudentId = typeof studentIdHeader === 'string' ? Number(studentIdHeader) : NaN;
  return Number.isFinite(requesterStudentId) ? requesterStudentId : null;
};

const getRequestedTeacherId = (req: IncomingMessage): number | null => {
  const teacherIdHeader = req.headers['x-teacher-id'];
  const requesterTeacherId = typeof teacherIdHeader === 'string' ? Number(teacherIdHeader) : NaN;
  return Number.isFinite(requesterTeacherId) ? requesterTeacherId : null;
};

const parseOptionalNumberQueryParam = (value: string | null): number | null => {
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseOptionalBooleanQueryParam = (value: string | null): boolean | null => {
  if (value === null) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true') return true;
  if (normalized === '0' || normalized === 'false') return false;
  return null;
};

const filterHomeworksForRole = (homeworks: any[], role: RequestRole, studentId?: number | null) => {
  if (role !== 'STUDENT') return homeworks;

  return homeworks.filter((hw) => {
    const normalizedStatus = normalizeStatus(hw.status);
    const matchesStudent = studentId ? hw.studentId === studentId : true;
    return matchesStudent && VISIBLE_STUDENT_STATUSES.includes(normalizedStatus as any);
  });
};

const normalizeStatus = (status: any) => {
  if (typeof status !== 'string') return 'ASSIGNED';
  const upper = status.toUpperCase();
  if (upper === 'ACTIVE' || upper === 'SENT') return 'ASSIGNED';
  if (upper === 'NEW') return 'DRAFT';
  return ['DRAFT', 'ASSIGNED', 'IN_PROGRESS', 'DONE'].includes(upper) ? upper : 'ASSIGNED';
};

const normalizeTeacherStatus = (status: any) => normalizeStatus(status);

const studentsService = createStudentsService({
  defaultPageSize: DEFAULT_PAGE_SIZE,
  maxPageSize: MAX_PAGE_SIZE,
  ensureTeacher,
  safeLogActivityEvent,
  normalizeTeacherStatus,
  parseDateFilter,
});

const normalizeLessonStatus = (status: any): 'SCHEDULED' | 'COMPLETED' | 'CANCELED' => {
  if (status === 'COMPLETED') return 'COMPLETED';
  if (status === 'CANCELED') return 'CANCELED';
  return 'SCHEDULED';
};

const normalizeCancelBehavior = (value: any): PaymentCancelBehavior =>
  value === 'writeoff' ? 'writeoff' : 'refund';

const normalizeLessonPriceValue = (value: any): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.round(numeric);
};

const calcLessonPaymentAmount = (participant: any, lesson: any, link: any) =>
  [participant.price, lesson.price, link.pricePerLesson].find(
    (value) => typeof value === 'number' && value > 0,
  ) ?? 0;

const resolveProfileLessonPrice = (link: any) => normalizeLessonPriceValue(link?.pricePerLesson);

const createPaymentEvent = async (tx: any, payload: any) => {
  return tx.paymentEvent.create({ data: payload });
};

type HomeworkV2NotificationKind =
  | 'ASSIGNED'
  | 'REVIEWED'
  | 'RETURNED'
  | 'REMINDER_24H'
  | 'REMINDER_MORNING'
  | 'REMINDER_3H'
  | 'MANUAL_REMINDER'
  | 'OVERDUE';

type HttpError = Error & { statusCode?: number };

const createHttpError = (message: string, statusCode: number): HttpError => {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  return error;
};

type StudentAccessLink = {
  teacherId: bigint;
  studentId: number;
  customName: string;
  teacher?: { chatId: bigint; name?: string | null; username?: string | null; timezone?: string | null } | null;
  student?: Student | null;
};

const parseJsonValue = <T>(value: unknown, fallback: T): T => {
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    return value as T;
  }
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const parseStringArray = (value: unknown): string[] => {
  const parsed = parseJsonValue<unknown[]>(value, []);
  return parsed.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
};

const parseObjectArray = (value: unknown): Record<string, unknown>[] => {
  const parsed = parseJsonValue<unknown[]>(value, []);
  return parsed.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
};

const parseObjectRecord = (value: unknown): Record<string, unknown> | null => {
  const parsed = parseJsonValue<unknown>(value, null);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
};

const toValidDate = (value: unknown): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

const clampHomeworkScore = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return clampNumber(Math.round(numeric), 0, 100);
};

const normalizeHomeworkTemplateTags = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return parseStringArray(value);
};

const normalizeHomeworkBlocks = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'object' && item !== null) as Record<string, unknown>[];
  }
  return parseObjectArray(value);
};

const normalizeHomeworkAttachmentUrl = (value: unknown) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/api/v2/files/object/')) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.pathname.startsWith('/api/v2/files/object/')) {
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
      return trimmed;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
};

const normalizeHomeworkAttachments = (value: unknown) => {
  if (Array.isArray(value)) {
    const normalized = value
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({
        id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
        url: normalizeHomeworkAttachmentUrl(item.url),
        fileName: typeof item.fileName === 'string' ? item.fileName : '',
        size: Number.isFinite(Number(item.size)) ? Math.max(0, Number(item.size)) : 0,
      }))
      .filter((item) => item.url);
    return Array.from(
      new Map(
        normalized.map((item) => [`${item.fileName.trim().toLowerCase()}_${item.size}`, item] as const),
      ).values(),
    );
  }
  return parseObjectArray(value);
};

const normalizeHomeworkAssignmentStatus = (
  value: unknown,
):
  | 'DRAFT'
  | 'SCHEDULED'
  | 'SENT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'RETURNED'
  | 'REVIEWED'
  | 'OVERDUE' => {
  const normalized = typeof value === 'string' ? value.toUpperCase() : '';
  if (
    normalized === 'DRAFT' ||
    normalized === 'SCHEDULED' ||
    normalized === 'SENT' ||
    normalized === 'SUBMITTED' ||
    normalized === 'IN_REVIEW' ||
    normalized === 'RETURNED' ||
    normalized === 'REVIEWED' ||
    normalized === 'OVERDUE'
  ) {
    return normalized;
  }
  return 'DRAFT';
};

const normalizeHomeworkSendMode = (value: unknown): 'AUTO_AFTER_LESSON_DONE' | 'MANUAL' =>
  value === 'AUTO_AFTER_LESSON_DONE' ? 'AUTO_AFTER_LESSON_DONE' : 'MANUAL';

const normalizeHomeworkSubmissionStatus = (value: unknown): 'DRAFT' | 'SUBMITTED' | 'REVIEWED' => {
  const normalized = typeof value === 'string' ? value.toUpperCase() : '';
  if (normalized === 'DRAFT' || normalized === 'SUBMITTED' || normalized === 'REVIEWED') return normalized;
  return 'DRAFT';
};

const resolveAssignmentViewStatus = (assignment: { status: string; deadlineAt?: Date | null }, now = new Date()) => {
  const status = normalizeHomeworkAssignmentStatus(assignment.status);
  const deadline = assignment.deadlineAt ? new Date(assignment.deadlineAt) : null;
  const isOverdueCandidate = status === 'SENT' || status === 'RETURNED';
  if (isOverdueCandidate && deadline && deadline.getTime() < now.getTime()) return 'OVERDUE' as const;
  return status;
};

type HomeworkAssignmentBucketV2 = 'all' | 'draft' | 'sent' | 'review' | 'reviewed' | 'overdue';
type HomeworkAssignmentsTabV2 =
  | 'all'
  | 'inbox'
  | 'draft'
  | 'scheduled'
  | 'in_progress'
  | 'review'
  | 'closed'
  | 'overdue';
type HomeworkAssignmentsSortV2 = 'urgency' | 'deadline' | 'student' | 'updated' | 'created';
type HomeworkAssignmentProblemFilterV2 = 'overdue' | 'returned' | 'config_error';

const DEFAULT_HOMEWORK_GROUP_ICON_KEY = 'layer-group';
const DEFAULT_HOMEWORK_GROUP_BG_COLOR = '#F3F4F6';
const HOMEWORK_GROUP_BG_COLOR_REGEX = /^#(?:[0-9a-f]{6}|[0-9a-f]{3})$/i;

const normalizeHomeworkGroupTitle = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const normalizeHomeworkGroupDescription = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeHomeworkGroupIconKey = (value: unknown) => {
  if (typeof value !== 'string') return DEFAULT_HOMEWORK_GROUP_ICON_KEY;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : DEFAULT_HOMEWORK_GROUP_ICON_KEY;
};

const normalizeHomeworkGroupBgColor = (value: unknown) => {
  if (typeof value !== 'string') return DEFAULT_HOMEWORK_GROUP_BG_COLOR;
  const normalized = value.trim();
  if (!HOMEWORK_GROUP_BG_COLOR_REGEX.test(normalized)) return DEFAULT_HOMEWORK_GROUP_BG_COLOR;
  if (normalized.length === 4) {
    const expanded = normalized
      .slice(1)
      .split('')
      .map((char) => `${char}${char}`)
      .join('');
    return `#${expanded}`.toUpperCase();
  }
  return normalized.toUpperCase();
};

const normalizeHomeworkGroupSortOrder = (value: unknown, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(-1_000_000, Math.min(1_000_000, Math.trunc(numeric)));
};

const normalizeHomeworkAssignmentBucketV2 = (value: unknown): HomeworkAssignmentBucketV2 => {
  const normalized = typeof value === 'string' ? value.toLowerCase() : '';
  if (
    normalized === 'all' ||
    normalized === 'draft' ||
    normalized === 'sent' ||
    normalized === 'review' ||
    normalized === 'reviewed' ||
    normalized === 'overdue'
  ) {
    return normalized;
  }
  return 'all';
};

const normalizeHomeworkAssignmentsTabV2 = (value: unknown): HomeworkAssignmentsTabV2 => {
  const normalized = typeof value === 'string' ? value.toLowerCase() : '';
  if (
    normalized === 'all' ||
    normalized === 'inbox' ||
    normalized === 'draft' ||
    normalized === 'scheduled' ||
    normalized === 'in_progress' ||
    normalized === 'review' ||
    normalized === 'closed' ||
    normalized === 'overdue'
  ) {
    return normalized;
  }
  return 'all';
};

const normalizeHomeworkAssignmentsSortV2 = (value: unknown): HomeworkAssignmentsSortV2 => {
  const normalized = typeof value === 'string' ? value.toLowerCase() : '';
  if (
    normalized === 'urgency' ||
    normalized === 'deadline' ||
    normalized === 'student' ||
    normalized === 'updated' ||
    normalized === 'created'
  ) {
    return normalized;
  }
  return 'urgency';
};

const normalizeHomeworkAssignmentProblemFiltersV2 = (value: unknown): HomeworkAssignmentProblemFilterV2[] => {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

  const normalized = rawItems
    .map((item) => String(item).toLowerCase())
    .filter(
      (item): item is HomeworkAssignmentProblemFilterV2 =>
        item === 'overdue' || item === 'returned' || item === 'config_error',
    );
  return Array.from(new Set(normalized));
};

const resolveAssignmentBucketWhereV2 = (bucket: HomeworkAssignmentBucketV2, now: Date): Record<string, unknown> => {
  if (bucket === 'draft') return { status: { in: ['DRAFT', 'SCHEDULED'] } };
  if (bucket === 'sent') return { status: { in: ['SENT', 'RETURNED'] } };
  if (bucket === 'review') return { status: { in: ['SUBMITTED', 'IN_REVIEW'] } };
  if (bucket === 'reviewed') return { status: 'REVIEWED' };
  if (bucket === 'overdue') {
    return {
      OR: [{ status: 'OVERDUE' }, { status: { in: ['SENT', 'RETURNED'] }, deadlineAt: { lt: now } }],
    };
  }
  return {};
};

const resolveAssignmentTabWhereV2 = (tab: HomeworkAssignmentsTabV2, now: Date): Record<string, unknown> => {
  if (tab === 'draft') return { status: 'DRAFT' };
  if (tab === 'scheduled') return { status: 'SCHEDULED' };
  if (tab === 'in_progress') return { status: { in: ['SENT', 'RETURNED'] } };
  if (tab === 'review') return { status: { in: ['SUBMITTED', 'IN_REVIEW'] } };
  if (tab === 'closed') return { status: 'REVIEWED' };
  if (tab === 'overdue') {
    return {
      OR: [{ status: 'OVERDUE' }, { status: { in: ['SENT', 'RETURNED'] }, deadlineAt: { lt: now } }],
    };
  }
  if (tab === 'inbox') {
    return {
      OR: [
        { status: 'SUBMITTED' },
        { status: 'IN_REVIEW' },
        { status: 'RETURNED' },
        { status: 'OVERDUE' },
        { status: { in: ['SENT', 'RETURNED'] }, deadlineAt: { lt: now } },
        { sendMode: 'AUTO_AFTER_LESSON_DONE', lessonId: null },
      ],
    };
  }
  return {};
};

const attachLatestSubmissionMetaToAssignments = async (items: any[]) => {
  if (!items.length) return items;
  const assignmentIds = items
    .map((item) => Number(item.id))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (!assignmentIds.length) return items;

  const submissions = await (prisma as any).homeworkSubmission.findMany({
    where: { assignmentId: { in: assignmentIds } },
    orderBy: [{ assignmentId: 'asc' }, { attemptNo: 'desc' }, { id: 'desc' }],
    select: {
      assignmentId: true,
      attemptNo: true,
      status: true,
      submittedAt: true,
    },
  });

  const latestByAssignmentId = new Map<number, any>();
  submissions.forEach((submission: any) => {
    if (!latestByAssignmentId.has(submission.assignmentId)) {
      latestByAssignmentId.set(submission.assignmentId, submission);
    }
  });

  return items.map((item) => {
    const latest = latestByAssignmentId.get(item.id);
    return {
      ...item,
      latestSubmissionAttemptNo: latest?.attemptNo ?? null,
      latestSubmissionStatus: latest ? normalizeHomeworkSubmissionStatus(latest.status) : null,
      latestSubmissionSubmittedAt: latest?.submittedAt ?? null,
    };
  });
};

const attachAssignmentDisplayMeta = async (teacherId: bigint, assignments: any[], now: Date) => {
  if (!assignments.length) return assignments;
  const studentIds = Array.from(
    new Set(
      assignments
        .map((item) => Number(item.studentId))
        .filter((studentId) => Number.isFinite(studentId) && studentId > 0),
    ),
  );
  const links = studentIds.length
    ? await prisma.teacherStudent.findMany({
        where: { teacherId, studentId: { in: studentIds }, isArchived: false },
        select: { studentId: true, customName: true, uiColor: true },
      })
    : [];
  const linkByStudentId = new Map<number, { studentId: number; customName: string; uiColor: string }>(
    links.map((link) => [link.studentId, link]),
  );

  return assignments.map((assignment) => {
    const resolvedStatus = resolveAssignmentViewStatus(assignment, now);
    const isOverdue = resolvedStatus === 'OVERDUE';
    const hasConfigError = normalizeHomeworkSendMode(assignment.sendMode) === 'AUTO_AFTER_LESSON_DONE' && !assignment.lessonId;
    const studentLink = linkByStudentId.get(assignment.studentId);
    const studentName =
      studentLink?.customName?.trim() ||
      assignment.student?.username?.trim() ||
      `Ученик #${assignment.studentId}`;
    return {
      ...assignment,
      studentName,
      studentUsername: assignment.student?.username ?? null,
      studentUiColor: studentLink?.uiColor ?? null,
      lessonStartAt: assignment.lesson?.startAt ?? null,
      templateTitle: assignment.template?.title ?? null,
      groupTitle: assignment.group?.title ?? null,
      hasConfigError,
      isOverdue,
      problemFlags: Array.from(
        new Set(
          [
            isOverdue ? 'OVERDUE' : null,
            resolvedStatus === 'RETURNED' ? 'RETURNED' : null,
            hasConfigError ? 'CONFIG_ERROR' : null,
            resolvedStatus === 'SUBMITTED' ? 'SUBMITTED' : null,
            resolvedStatus === 'IN_REVIEW' ? 'IN_REVIEW' : null,
          ].filter(Boolean),
        ),
      ),
    };
  });
};

const matchesAssignmentSearchQuery = (assignment: any, queryLower: string) => {
  const fields = [
    assignment.title,
    assignment.studentName,
    assignment.studentUsername,
    assignment.templateTitle,
    assignment.groupTitle,
  ]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toLowerCase());
  return fields.some((value) => value.includes(queryLower));
};

const sortHomeworkAssignmentsV2 = (items: any[], sort: HomeworkAssignmentsSortV2) => {
  if (sort === 'created') {
    return items.sort((left, right) => {
      const rightCreated = new Date(right.createdAt).getTime();
      const leftCreated = new Date(left.createdAt).getTime();
      return rightCreated - leftCreated || Number(right.id) - Number(left.id);
    });
  }
  if (sort === 'updated') {
    return items.sort((left, right) => {
      const rightUpdated = new Date(right.updatedAt).getTime();
      const leftUpdated = new Date(left.updatedAt).getTime();
      return rightUpdated - leftUpdated || Number(right.id) - Number(left.id);
    });
  }
  if (sort === 'deadline') {
    return items.sort((left, right) => {
      const leftDeadline = toValidDate(left.deadlineAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightDeadline = toValidDate(right.deadlineAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return leftDeadline - rightDeadline || Number(right.id) - Number(left.id);
    });
  }
  if (sort === 'student') {
    return items.sort((left, right) => {
      const leftStudent = String(left.studentName ?? '').toLowerCase();
      const rightStudent = String(right.studentName ?? '').toLowerCase();
      if (leftStudent < rightStudent) return -1;
      if (leftStudent > rightStudent) return 1;
      const rightCreated = new Date(right.createdAt).getTime();
      const leftCreated = new Date(left.createdAt).getTime();
      return rightCreated - leftCreated;
    });
  }

  const priority = (item: any) => {
    if (item.hasConfigError) return 0;
    if (item.isOverdue) return 1;
    if (item.status === 'SUBMITTED' || item.status === 'IN_REVIEW') return 2;
    if (item.status === 'RETURNED') return 3;
    if (item.status === 'SCHEDULED') return 4;
    if (item.status === 'SENT') return 5;
    if (item.status === 'DRAFT') return 6;
    if (item.status === 'REVIEWED') return 7;
    return 8;
  };

  return items.sort((left, right) => {
    const priorityDiff = priority(left) - priority(right);
    if (priorityDiff !== 0) return priorityDiff;
    const leftDeadline = toValidDate(left.deadlineAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const rightDeadline = toValidDate(right.deadlineAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (leftDeadline !== rightDeadline) return leftDeadline - rightDeadline;
    const rightCreated = new Date(right.createdAt).getTime();
    const leftCreated = new Date(left.createdAt).getTime();
    return rightCreated - leftCreated;
  });
};

const serializeHomeworkTemplateV2 = (template: any) => ({
  id: template.id,
  teacherId: Number(template.teacherId),
  createdByTeacherId: template.createdByTeacherId ? Number(template.createdByTeacherId) : null,
  title: template.title ?? '',
  tags: normalizeHomeworkTemplateTags(template.tags),
  subject: template.subject ?? null,
  level: template.level ?? null,
  blocks: normalizeHomeworkBlocks(template.blocks),
  isArchived: Boolean(template.isArchived),
  createdAt: template.createdAt,
  updatedAt: template.updatedAt,
});

const serializeHomeworkGroupV2 = (group: any) => ({
  id: group.id,
  teacherId: Number(group.teacherId),
  title: group.title ?? '',
  description: group.description ?? null,
  iconKey: normalizeHomeworkGroupIconKey(group.iconKey),
  bgColor: normalizeHomeworkGroupBgColor(group.bgColor),
  sortOrder: normalizeHomeworkGroupSortOrder(group.sortOrder, 0),
  isArchived: Boolean(group.isArchived),
  createdAt: group.createdAt,
  updatedAt: group.updatedAt,
});

const serializeHomeworkGroupListItemV2 = (
  group: any,
  assignmentsCount: number,
  options?: { isSystem?: boolean; isUngrouped?: boolean },
) => {
  const isSystem = Boolean(options?.isSystem);
  const isUngrouped = Boolean(options?.isUngrouped);
  if (isSystem && isUngrouped) {
    return {
      id: null,
      teacherId: Number(group.teacherId),
      title: group.title ?? 'Без группы',
      description: group.description ?? 'Задания без категории',
      iconKey: normalizeHomeworkGroupIconKey(group.iconKey),
      bgColor: normalizeHomeworkGroupBgColor(group.bgColor),
      sortOrder: normalizeHomeworkGroupSortOrder(group.sortOrder, -1),
      isArchived: false,
      createdAt: null,
      updatedAt: null,
      assignmentsCount: Math.max(0, assignmentsCount),
      isSystem: true,
      isUngrouped: true,
    };
  }
  const serialized = serializeHomeworkGroupV2(group);
  return {
    ...serialized,
    assignmentsCount: Math.max(0, assignmentsCount),
    isSystem: isSystem || false,
    isUngrouped: isUngrouped || false,
  };
};

const serializeHomeworkAssignmentV2 = (assignment: any, now = new Date()) => {
  const status = resolveAssignmentViewStatus(assignment, now);
  const isOverdue = status === 'OVERDUE';
  const hasConfigError = normalizeHomeworkSendMode(assignment.sendMode) === 'AUTO_AFTER_LESSON_DONE' && !assignment.lessonId;
  const problemFlags = Array.from(
    new Set(
      [
        isOverdue ? 'OVERDUE' : null,
        status === 'RETURNED' ? 'RETURNED' : null,
        hasConfigError ? 'CONFIG_ERROR' : null,
        status === 'SUBMITTED' ? 'SUBMITTED' : null,
        status === 'IN_REVIEW' ? 'IN_REVIEW' : null,
      ].filter(Boolean),
    ),
  );

  return {
    id: assignment.id,
    teacherId: Number(assignment.teacherId),
    studentId: assignment.studentId,
    studentName: assignment.studentName ?? null,
    studentUsername: assignment.studentUsername ?? assignment.student?.username ?? null,
    studentUiColor: assignment.studentUiColor ?? null,
    lessonId: assignment.lessonId ?? null,
    lessonStartAt: assignment.lessonStartAt ?? assignment.lesson?.startAt ?? null,
    templateId: assignment.templateId ?? null,
    templateTitle: assignment.templateTitle ?? assignment.template?.title ?? null,
    groupId: assignment.groupId ?? assignment.group?.id ?? null,
    groupTitle: assignment.groupTitle ?? assignment.group?.title ?? null,
    legacyHomeworkId: assignment.legacyHomeworkId ?? null,
    title: assignment.title ?? '',
    status,
    isOverdue,
    hasConfigError,
    problemFlags,
    sendMode: normalizeHomeworkSendMode(assignment.sendMode),
    deadlineAt: assignment.deadlineAt ?? null,
    sentAt: assignment.sentAt ?? null,
    contentSnapshot: normalizeHomeworkBlocks(assignment.contentSnapshot),
    teacherComment: assignment.teacherComment ?? null,
    reviewedAt: assignment.reviewedAt ?? null,
    reminder24hSentAt: assignment.reminder24hSentAt ?? null,
    reminderMorningSentAt: assignment.reminderMorningSentAt ?? null,
    reminder3hSentAt: assignment.reminder3hSentAt ?? null,
    overdueReminderCount: Number.isFinite(Number(assignment.overdueReminderCount))
      ? Number(assignment.overdueReminderCount)
      : 0,
    lastOverdueReminderAt: assignment.lastOverdueReminderAt ?? null,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
    latestSubmissionAttemptNo: Number.isFinite(Number(assignment.latestSubmissionAttemptNo))
      ? Number(assignment.latestSubmissionAttemptNo)
      : null,
    latestSubmissionStatus: assignment.latestSubmissionStatus
      ? normalizeHomeworkSubmissionStatus(assignment.latestSubmissionStatus)
      : null,
    latestSubmissionSubmittedAt: assignment.latestSubmissionSubmittedAt ?? null,
    score: {
      autoScore: clampHomeworkScore(assignment.autoScore),
      manualScore: clampHomeworkScore(assignment.manualScore),
      finalScore: clampHomeworkScore(assignment.finalScore),
    },
  };
};

type HomeworkReviewDraftV2 = {
  submissionId: number;
  scoresById: Record<string, number>;
  commentsById: Record<string, string>;
  generalComment: string;
};

const normalizeHomeworkReviewDraftV2 = (value: unknown): HomeworkReviewDraftV2 | null => {
  const raw = parseObjectRecord(value);
  if (!raw) return null;

  const submissionId = Number(raw.submissionId);
  if (!Number.isFinite(submissionId) || submissionId <= 0) return null;

  const rawScores = parseObjectRecord(raw.scoresById) ?? {};
  const scoresById = Object.entries(rawScores).reduce<Record<string, number>>((acc, [key, score]) => {
    if (typeof key !== 'string' || !key.trim()) return acc;
    const numeric = Number(score);
    if (!Number.isFinite(numeric)) return acc;
    acc[key] = clampNumber(numeric, 0, 1000);
    return acc;
  }, {});

  const rawComments = parseObjectRecord(raw.commentsById) ?? {};
  const commentsById = Object.entries(rawComments).reduce<Record<string, string>>((acc, [key, comment]) => {
    if (typeof key !== 'string' || !key.trim()) return acc;
    if (typeof comment !== 'string') return acc;
    acc[key] = comment;
    return acc;
  }, {});

  return {
    submissionId,
    scoresById,
    commentsById,
    generalComment: typeof raw.generalComment === 'string' ? raw.generalComment : '',
  };
};

const serializeHomeworkSubmissionV2 = (submission: any) => ({
  id: submission.id,
  assignmentId: submission.assignmentId,
  studentId: submission.studentId,
  reviewerTeacherId: submission.reviewerTeacherId ? Number(submission.reviewerTeacherId) : null,
  attemptNo: submission.attemptNo,
  status: normalizeHomeworkSubmissionStatus(submission.status),
  answerText: submission.answerText ?? null,
  attachments: normalizeHomeworkAttachments(submission.attachments),
  voice: normalizeHomeworkAttachments(submission.voice),
  testAnswers: parseObjectRecord(submission.testAnswers),
  teacherComment: submission.teacherComment ?? null,
  reviewDraft: normalizeHomeworkReviewDraftV2(submission.reviewDraft),
  submittedAt: submission.submittedAt ?? null,
  reviewedAt: submission.reviewedAt ?? null,
  createdAt: submission.createdAt,
  updatedAt: submission.updatedAt,
  score: {
    autoScore: clampHomeworkScore(submission.autoScore),
    manualScore: clampHomeworkScore(submission.manualScore),
    finalScore: clampHomeworkScore(submission.finalScore),
  },
});

const resolveTimedAttemptState = (assignmentContentSnapshot: unknown, startedAt: unknown, now = new Date()) => {
  const blocks = normalizeHomeworkBlocks(assignmentContentSnapshot) as unknown as HomeworkBlock[];
  const timerConfig = resolveHomeworkAttemptTimerConfig(blocks);
  const startedAtDate = toValidDate(startedAt);
  if (!timerConfig.enabled || timerConfig.durationMs === null || !startedAtDate) {
    return {
      enabled: false,
      startedAt: startedAtDate,
      expiresAt: null as Date | null,
      isExpired: false,
    };
  }

  const expiresAt = new Date(startedAtDate.getTime() + timerConfig.durationMs);
  return {
    enabled: true,
    startedAt: startedAtDate,
    expiresAt,
    isExpired: expiresAt.getTime() <= now.getTime(),
  };
};

const isAssignmentAcceptingStudentWork = (status: unknown) => {
  const normalized = normalizeHomeworkAssignmentStatus(status);
  return normalized === 'SENT' || normalized === 'RETURNED' || normalized === 'OVERDUE';
};

const finalizeTimedOutDraftSubmission = async (
  assignment: any,
  draftSubmission: any,
  now = new Date(),
): Promise<{ assignment: any; submission: any } | null> => {
  if (!assignment || !draftSubmission) return null;
  if (normalizeHomeworkSubmissionStatus(draftSubmission.status) !== 'DRAFT') return null;
  if (!isAssignmentAcceptingStudentWork(assignment.status)) return null;

  const timerState = resolveTimedAttemptState(assignment.contentSnapshot, draftSubmission.createdAt, now);
  if (!timerState.enabled || !timerState.isExpired) return null;

  const submittedAt = timerState.expiresAt ?? now;
  const [updatedSubmission, updatedAssignment] = await Promise.all([
    (prisma as any).homeworkSubmission.update({
      where: { id: draftSubmission.id },
      data: {
        status: 'SUBMITTED',
        submittedAt,
        autoScore: 0,
        manualScore: null,
        finalScore: 0,
      },
    }),
    (prisma as any).homeworkAssignment.update({
      where: { id: assignment.id },
      data: {
        status: 'SUBMITTED',
        autoScore: 0,
        manualScore: null,
        finalScore: 0,
      },
    }),
  ]);

  return {
    assignment: updatedAssignment,
    submission: updatedSubmission,
  };
};

const normalizeAnswerString = (value: unknown, caseSensitive = false) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return caseSensitive ? trimmed : trimmed.toLowerCase();
};

const normalizeQuestionPoints = (question: Record<string, unknown>) => {
  const points = Number(question.points);
  if (!Number.isFinite(points) || points <= 0) return 1;
  return points;
};

const calculateHomeworkAutoScore = (blocks: Record<string, unknown>[], testAnswersRaw: unknown): number | null => {
  const answers = parseObjectRecord(testAnswersRaw);
  if (!answers) return null;
  const questions = blocks
    .filter((block) => block.type === 'TEST')
    .flatMap((block) => {
      const q = block.questions;
      return Array.isArray(q) ? q : [];
    })
    .filter((question): question is Record<string, unknown> => typeof question === 'object' && question !== null);

  const autoQuestions = questions.filter((question) => {
    const type = String(question.type ?? '');
    if (type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE' || type === 'MATCHING') return true;
    if (type !== 'SHORT_ANSWER') return false;
    const kind = typeof question.uiQuestionKind === 'string' ? question.uiQuestionKind : '';
    return kind === 'FILL_WORD' || kind === 'ORDERING' || kind === 'TABLE';
  });
  if (autoQuestions.length === 0) return null;

  let earned = 0;
  let maxPoints = 0;

  for (const question of autoQuestions) {
    const questionId = typeof question.id === 'string' ? question.id : '';
    if (!questionId) continue;
    const points = normalizeQuestionPoints(question);
    maxPoints += points;
    const answer = answers[questionId];
    const type = String(question.type ?? '');
    const kind = typeof question.uiQuestionKind === 'string' ? question.uiQuestionKind : '';

    if (type === 'SINGLE_CHOICE') {
      const correctIds = Array.isArray(question.correctOptionIds)
        ? question.correctOptionIds.filter((item): item is string => typeof item === 'string')
        : [];
      const selected = Array.isArray(answer) ? answer[0] : answer;
      if (typeof selected === 'string' && correctIds.length === 1 && selected === correctIds[0]) {
        earned += points;
      }
      continue;
    }

    if (type === 'MULTIPLE_CHOICE') {
      const correctIds = Array.isArray(question.correctOptionIds)
        ? question.correctOptionIds.filter((item): item is string => typeof item === 'string')
        : [];
      const selectedIds = Array.isArray(answer)
        ? answer.filter((item): item is string => typeof item === 'string')
        : [];
      const correctSet = new Set(correctIds);
      const selectedSet = new Set(selectedIds);
      const correctTotal = correctSet.size;
      if (correctTotal === 0) continue;
      let correctSelected = 0;
      let incorrectSelected = 0;
      selectedSet.forEach((selectedId) => {
        if (correctSet.has(selectedId)) correctSelected += 1;
        else incorrectSelected += 1;
      });
      const ratio = Math.max(0, (correctSelected - incorrectSelected) / correctTotal);
      earned += ratio * points;
      continue;
    }

    if (type === 'MATCHING') {
      const pairs = Array.isArray(question.matchingPairs)
        ? question.matchingPairs.filter(
            (pair): pair is { left: string; right: string } =>
              typeof pair === 'object' &&
              pair !== null &&
              typeof (pair as { left?: unknown }).left === 'string' &&
              typeof (pair as { right?: unknown }).right === 'string',
          )
        : [];
      if (pairs.length === 0) continue;
      const answerPairsMap = new Map<string, string>();
      if (Array.isArray(answer)) {
        answer.forEach((entry) => {
          if (
            typeof entry === 'object' &&
            entry !== null &&
            typeof (entry as { left?: unknown }).left === 'string' &&
            typeof (entry as { right?: unknown }).right === 'string'
          ) {
            answerPairsMap.set((entry as { left: string }).left, (entry as { right: string }).right);
          }
        });
      } else if (answer && typeof answer === 'object') {
        Object.entries(answer as Record<string, unknown>).forEach(([left, right]) => {
          if (typeof right === 'string') {
            answerPairsMap.set(left, right);
          }
        });
      }
      const correctPairs = pairs.filter((pair) => answerPairsMap.get(pair.left) === pair.right).length;
      earned += (correctPairs / pairs.length) * points;
      continue;
    }

    if (type === 'SHORT_ANSWER' && kind === 'FILL_WORD') {
      const caseSensitive = Boolean(question.caseSensitive);
      const allowPartialCredit = question.allowPartialCredit !== false;
      const expectedAnswers = Array.isArray(question.acceptedAnswers)
        ? question.acceptedAnswers.filter((item): item is string => typeof item === 'string').map((item) => item.trim())
        : [];
      if (expectedAnswers.length === 0) continue;
      const submittedAnswers = Array.isArray(answer)
        ? answer.filter((item): item is string => typeof item === 'string')
        : [];
      const correctCount = expectedAnswers.reduce((sum, expectedAnswer, index) => {
        const submitted = submittedAnswers[index];
        if (!expectedAnswer) return sum;
        if (normalizeAnswerString(submitted, caseSensitive) === normalizeAnswerString(expectedAnswer, caseSensitive)) {
          return sum + 1;
        }
        return sum;
      }, 0);

      if (allowPartialCredit) {
        earned += (correctCount / expectedAnswers.length) * points;
      } else if (correctCount === expectedAnswers.length) {
        earned += points;
      }
      continue;
    }

    if (type === 'SHORT_ANSWER' && kind === 'ORDERING') {
      const expectedOrderIds = Array.isArray(question.orderingItems)
        ? question.orderingItems
            .filter(
              (item): item is { id: string; text?: string } =>
                typeof item === 'object' && item !== null && typeof (item as { id?: unknown }).id === 'string',
            )
            .map((item) => item.id)
        : [];
      if (expectedOrderIds.length < 2) continue;
      const submittedOrderIds = Array.isArray(answer)
        ? answer.filter((item): item is string => typeof item === 'string')
        : [];
      const correctPositions = expectedOrderIds.reduce((sum, expectedId, index) => {
        if (submittedOrderIds[index] === expectedId) return sum + 1;
        return sum;
      }, 0);
      const allowPartialCredit = Boolean(question.allowPartialCredit);
      if (allowPartialCredit) {
        earned += (correctPositions / expectedOrderIds.length) * points;
      } else if (correctPositions === expectedOrderIds.length) {
        earned += points;
      }
      continue;
    }

    if (type === 'SHORT_ANSWER' && kind === 'TABLE') {
      const table = question.table;
      if (!table || typeof table !== 'object' || Array.isArray(table)) continue;
      const tableRecord = table as Record<string, unknown>;
      const rows = Array.isArray(tableRecord.rows)
        ? tableRecord.rows.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
        : [];
      if (rows.length === 0) continue;

      const answerMap = answer && typeof answer === 'object' && !Array.isArray(answer)
        ? (answer as Record<string, unknown>)
        : {};

      let totalCells = 0;
      let correctCells = 0;
      const caseSensitive = Boolean(question.caseSensitive);

      rows.forEach((row) => {
        const rowId = typeof row.id === 'string' ? row.id : '';
        if (!rowId) return;
        const expectedAnswers = Array.isArray(row.answers)
          ? row.answers.filter((item): item is string => typeof item === 'string')
          : [];
        const submittedRow = answerMap[rowId];
        const submittedAnswers = Array.isArray(submittedRow)
          ? submittedRow.filter((item): item is string => typeof item === 'string')
          : [];

        expectedAnswers.forEach((expectedAnswer, columnIndex) => {
          const normalizedExpected = normalizeAnswerString(expectedAnswer, caseSensitive);
          if (!normalizedExpected) return;
          totalCells += 1;
          const normalizedSubmitted = normalizeAnswerString(submittedAnswers[columnIndex], caseSensitive);
          if (normalizedExpected === normalizedSubmitted) {
            correctCells += 1;
          }
        });
      });

      if (totalCells === 0) continue;
      const tablePartialCredit =
        tableRecord.partialCredit === undefined ? undefined : Boolean(tableRecord.partialCredit);
      const allowPartialCredit =
        question.allowPartialCredit === undefined
          ? (tablePartialCredit ?? true)
          : Boolean(question.allowPartialCredit);
      if (allowPartialCredit) {
        earned += (correctCells / totalCells) * points;
      } else if (correctCells === totalCells) {
        earned += points;
      }
      continue;
    }
  }

  if (maxPoints <= 0) return null;
  return clampNumber(Math.round((earned / maxPoints) * 100), 0, 100);
};

const resolveStudentAccessLinks = async (user: User): Promise<StudentAccessLink[]> => {
  const normalizedUsername = normalizeTelegramUsername(user.username);
  const students = await prisma.student.findMany({
    where: {
      OR: [
        { telegramId: user.telegramUserId },
        ...(normalizedUsername ? [{ username: normalizedUsername }] : []),
      ],
    },
    select: { id: true },
  });
  if (students.length === 0) return [];
  const studentIds = students.map((student) => student.id);
  const links = (await prisma.teacherStudent.findMany({
    where: { studentId: { in: studentIds }, isArchived: false },
    include: { student: true, teacher: true },
    orderBy: [{ teacherId: 'asc' }, { studentId: 'asc' }],
  })) as StudentAccessLink[];

  const byPair = new Map<string, StudentAccessLink>();
  links.forEach((link) => {
    byPair.set(`${link.teacherId.toString()}:${link.studentId}`, link);
  });
  return Array.from(byPair.values());
};

const pickStudentAccessLink = (
  links: StudentAccessLink[],
  requestedTeacherId?: number | null,
  requestedStudentId?: number | null,
) => {
  const teacherId = Number.isFinite(Number(requestedTeacherId)) ? Number(requestedTeacherId) : null;
  const studentId = Number.isFinite(Number(requestedStudentId)) ? Number(requestedStudentId) : null;

  if (teacherId !== null && studentId !== null) {
    return links.find((link) => Number(link.teacherId) === teacherId && link.studentId === studentId) ?? null;
  }

  if (teacherId !== null) {
    return links.find((link) => Number(link.teacherId) === teacherId) ?? null;
  }

  if (studentId !== null) {
    return links.find((link) => link.studentId === studentId) ?? null;
  }

  if (links.length === 1) return links[0];
  return null;
};

const ensureStudentAccessLink = async (
  user: User,
  requestedTeacherId?: number | null,
  requestedStudentId?: number | null,
) => {
  const links = await resolveStudentAccessLinks(user);
  if (links.length === 0) {
    throw new Error('student_context_not_found');
  }
  const active = pickStudentAccessLink(links, requestedTeacherId, requestedStudentId);
  if (!active) {
    throw new Error('student_context_required');
  }
  return { links, active };
};

const ensureTeacherStudentLinkV2 = async (teacherId: bigint, studentId: number) => {
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId, studentId } },
    include: { student: true, teacher: true },
  });
  if (!link || link.isArchived) throw new Error('Ученик не найден у текущего преподавателя');
  return link;
};

const normalizeHomeworkGroupIdInput = (value: unknown): number | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) throw new Error('Некорректный groupId');
  return numeric;
};

const resolveHomeworkGroupForTeacherV2 = async (
  teacherId: bigint,
  groupId: number,
  options?: { allowArchived?: boolean },
) => {
  const allowArchived = Boolean(options?.allowArchived);
  const group = await (prisma as any).homeworkGroup.findFirst({
    where: {
      id: groupId,
      teacherId,
      ...(allowArchived ? {} : { isArchived: false }),
    },
  });
  if (!group) throw createHttpError('Группа не найдена', 404);
  return group;
};

const formatHomeworkDeadlineLabel = (deadlineAt: Date | null, timeZone?: string | null) => {
  if (!deadlineAt) return 'без дедлайна';
  return formatInTimeZone(deadlineAt, 'dd.MM HH:mm', { timeZone: resolveTimeZone(timeZone) });
};

const buildHomeworkNotificationText = (
  kind: HomeworkV2NotificationKind,
  assignment: { title: string; deadlineAt?: Date | null; teacherComment?: string | null },
  timeZone?: string | null,
) => {
  const deadlineLabel = formatHomeworkDeadlineLabel(assignment.deadlineAt ?? null, timeZone);
  if (kind === 'ASSIGNED') return `📚 Новая домашка: ${assignment.title}\nДедлайн: ${deadlineLabel}`;
  if (kind === 'REVIEWED') return `✅ Домашка проверена: ${assignment.title}\nИтог доступен в приложении.`;
  if (kind === 'RETURNED')
    return `🛠 Домашка возвращена на доработку: ${assignment.title}\nКомментарий: ${assignment.teacherComment ?? '—'}`;
  if (kind === 'REMINDER_24H') return `⏰ Напоминание: дедлайн через 24 часа\n${assignment.title}\nДо: ${deadlineLabel}`;
  if (kind === 'REMINDER_MORNING') return `🌤 Сегодня дедлайн по домашке\n${assignment.title}\nДо: ${deadlineLabel}`;
  if (kind === 'REMINDER_3H') return `⌛ Дедлайн скоро (через 3 часа)\n${assignment.title}\nДо: ${deadlineLabel}`;
  if (kind === 'MANUAL_REMINDER') return `🔔 Напоминание по домашке\n${assignment.title}\nДедлайн: ${deadlineLabel}`;
  return `⚠️ Просрочена домашка: ${assignment.title}\nДедлайн был: ${deadlineLabel}`;
};

const createNotificationLogEntry = async (payload: {
  teacherId: bigint;
  studentId?: number | null;
  type: string;
  dedupeKey?: string | null;
}) => {
  const normalizedDedupeKey =
    typeof payload.dedupeKey === 'string' && payload.dedupeKey.trim().length > 0
      ? payload.dedupeKey.trim()
      : null;

  if (normalizedDedupeKey) {
    const existing = await prisma.notificationLog.findUnique({
      where: { dedupeKey: normalizedDedupeKey },
    });
    if (existing) {
      return null;
    }
  }

  try {
    return await prisma.notificationLog.create({
      data: {
        teacherId: payload.teacherId,
        studentId: payload.studentId ?? null,
        lessonId: null,
        type: payload.type,
        source: null,
        channel: 'TELEGRAM',
        scheduledFor: null,
        status: 'PENDING',
        dedupeKey: normalizedDedupeKey,
      },
    });
  } catch (error) {
    const prismaError = error as { code?: string; message?: string; meta?: { target?: unknown } } | null;
    const uniqueTarget = prismaError?.meta?.target;
    const uniqueByDedupeKey =
      prismaError?.code === 'P2002' &&
      (Array.isArray(uniqueTarget)
        ? uniqueTarget.includes('dedupeKey')
        : typeof prismaError?.message === 'string' && prismaError.message.includes('dedupeKey'));
    const isForeignKeyConflict = prismaError?.code === 'P2003';

    if (uniqueByDedupeKey || isForeignKeyConflict) {
      return null;
    }
    throw error;
  }
};

const finalizeNotificationLogEntry = async (logId: number, payload: { status: 'SENT' | 'FAILED'; errorText?: string }) => {
  await prisma.notificationLog.update({
    where: { id: logId },
    data: {
      status: payload.status,
      sentAt: payload.status === 'SENT' ? new Date() : null,
      errorText: payload.errorText ?? null,
    },
  });
};

const sendHomeworkNotificationToStudent = async (payload: {
  teacherId: bigint;
  studentId: number;
  type: string;
  dedupeKey?: string;
  text: string;
}) => {
  const student = await prisma.student.findUnique({ where: { id: payload.studentId } });
  if (!student) return { status: 'skipped' as const };
  const telegramId = await resolveStudentTelegramId(student);
  if (!telegramId) return { status: 'skipped' as const };

  const log = await createNotificationLogEntry({
    teacherId: payload.teacherId,
    studentId: payload.studentId,
    type: payload.type,
    dedupeKey: payload.dedupeKey ?? null,
  });
  if (!log) return { status: 'skipped' as const };

  try {
    await sendNotificationTelegramMessage(telegramId, payload.text);
    await finalizeNotificationLogEntry(log.id, { status: 'SENT' });
    return { status: 'sent' as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizeNotificationLogEntry(log.id, { status: 'FAILED', errorText: message });
    return { status: 'failed' as const, error: message };
  }
};

const resolveHomeworkFallbackDeadline = (now: Date, timeZone?: string | null) => {
  const dateKey = formatInTimeZone(addDays(now, 2), 'yyyy-MM-dd', { timeZone: resolveTimeZone(timeZone) });
  return toUtcDateFromTimeZone(dateKey, '20:00', timeZone);
};

const resolveHomeworkDefaultDeadline = async (teacherId: bigint, studentId: number, lessonId?: number | null) => {
  const teacher = await prisma.teacher.findUnique({ where: { chatId: teacherId } });
  let referenceDate = new Date();
  if (lessonId) {
    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
    if (lesson && lesson.teacherId === teacherId) {
      referenceDate = lesson.startAt;
    }
  }
  const nextLesson = await prisma.lesson.findFirst({
    where: {
      teacherId,
      status: { not: 'CANCELED' },
      startAt: { gt: referenceDate },
      OR: [{ studentId }, { participants: { some: { studentId } } }],
    },
    orderBy: { startAt: 'asc' },
  });
  if (nextLesson) {
    return { deadlineAt: nextLesson.startAt, warning: null as string | null };
  }
  return {
    deadlineAt: resolveHomeworkFallbackDeadline(referenceDate, teacher?.timezone ?? null),
    warning: 'NO_NEXT_LESSON',
  };
};

const settleLessonPayments = async (lessonId: number, teacherId: bigint) => {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { participants: { include: { student: true } } },
  });

  if (!lesson || lesson.teacherId !== teacherId) throw new Error('Урок не найден');
  if (lesson.status === 'CANCELED') return { lesson, links: [] as any[] };

  const participantIds = (lesson.participants ?? []).map((participant: any) => participant.studentId);
  const links = participantIds.length
    ? await prisma.teacherStudent.findMany({
        where: { teacherId, studentId: { in: participantIds }, isArchived: false },
        include: { student: true },
      })
    : [];

  const linksByStudentId = new Map<number, any>(links.map((link: any) => [link.studentId, link]));

  return prisma.$transaction(async (tx) => {
    const nextLinksByStudentId = new Map<number, any>(links.map((link: any) => [link.studentId, link]));
    const participantPriceMap = new Map<number, number>();
    const existingPayments = await tx.payment.findMany({ where: { lessonId: lesson.id } });
    const paymentTeacherStudentIds = new Set(existingPayments.map((payment) => payment.teacherStudentId));
    const existingEvents = await tx.paymentEvent.findMany({ where: { lessonId: lesson.id, type: 'AUTO_CHARGE' } });
    const eventStudentIds = new Set(existingEvents.map((event: any) => event.studentId));
    let primaryCharged = false;

    for (const participant of lesson.participants ?? []) {
      const link = linksByStudentId.get(participant.studentId);
      if (!link) continue;

      const profilePrice = resolveProfileLessonPrice(link);
      participantPriceMap.set(participant.studentId, profilePrice);

      if (participant.price !== profilePrice) {
        await tx.lessonParticipant.update({
          where: { lessonId_studentId: { lessonId: lesson.id, studentId: participant.studentId } },
          data: { price: profilePrice },
        });
      }

      if (participant.studentId === lesson.studentId && lesson.price !== profilePrice) {
        await tx.lesson.update({
          where: { id: lesson.id },
          data: { price: profilePrice },
        });
      }
    }

    for (const participant of lesson.participants ?? []) {
      const link = linksByStudentId.get(participant.studentId);
      if (!link || participant.isPaid) continue;
      if (link.balanceLessons <= 0) continue;

      const nextBalance = link.balanceLessons - 1;
      const priceSnapshot = participantPriceMap.get(participant.studentId) ?? resolveProfileLessonPrice(link);

      const savedLink = await tx.teacherStudent.update({
        where: { id: link.id },
        data: { balanceLessons: nextBalance },
      });
      nextLinksByStudentId.set(savedLink.studentId, savedLink);

      if (!paymentTeacherStudentIds.has(link.id)) {
        await tx.payment.create({
          data: {
            lessonId: lesson.id,
            teacherStudentId: link.id,
            amount: priceSnapshot,
            paidAt: new Date(),
            comment: null,
          },
        });
        paymentTeacherStudentIds.add(link.id);
      }
      if (!eventStudentIds.has(participant.studentId)) {
        await createPaymentEvent(tx, {
          studentId: participant.studentId,
          teacherId,
          lessonId: lesson.id,
          type: 'AUTO_CHARGE',
          lessonsDelta: -1,
          priceSnapshot,
          moneyAmount: null,
          createdBy: 'SYSTEM',
          reason: null,
        });
        eventStudentIds.add(participant.studentId);
      }

      await tx.lessonParticipant.update({
        where: { lessonId_studentId: { lessonId: lesson.id, studentId: participant.studentId } },
        data: { isPaid: true },
      });
      if (participant.studentId === lesson.studentId) {
        primaryCharged = true;
      }
    }

    const participants = await tx.lessonParticipant.findMany({ where: { lessonId: lesson.id } });
    const allPaid = participants.length ? participants.every((item: any) => item.isPaid) : false;
    const primaryParticipant = participants.find((item: any) => item.studentId === lesson.studentId);
    const primaryPaid = Boolean(primaryParticipant?.isPaid);
    const nextPaymentStatus = primaryPaid ? 'PAID' : 'UNPAID';
    const nextPaidSource = primaryPaid
      ? lesson.paidSource && lesson.paidSource !== 'NONE'
        ? lesson.paidSource
        : primaryCharged
          ? 'BALANCE'
          : 'MANUAL'
      : 'NONE';

    const updatedLesson = await tx.lesson.update({
      where: { id: lesson.id },
      data: {
        isPaid: allPaid,
        status: 'COMPLETED',
        completedAt: lesson.completedAt ?? new Date(),
        paidAt: allPaid ? lesson.paidAt ?? new Date() : null,
        paymentStatus: nextPaymentStatus,
        paidSource: nextPaidSource,
      },
      include: { participants: { include: { student: true } } },
    });

    return { lesson: updatedLesson, links: Array.from(nextLinksByStudentId.values()) };
  });
};

const parseTimeSpentMinutes = (value: any): number | null => {
  if (value === '' || value === undefined || value === null) return null;
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) return null;
  if (numericValue < 0) return null;
  return Math.round(numericValue);
};

const createHomework = async (user: User, body: any) => {
  const { studentId, text, deadline, status, attachments, timeSpentMinutes } = body ?? {};
  if (!studentId || !text) throw new Error('studentId и текст обязательны');
  const teacher = await ensureTeacher(user);
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId: Number(studentId) } },
  });
  if (!link || link.isArchived) throw new Error('Ученик не найден у текущего преподавателя');

  const normalizedStatus = normalizeTeacherStatus(status ?? 'DRAFT');
  const normalizedAttachments = Array.isArray(attachments) ? attachments : [];
  const parsedTimeSpent = parseTimeSpentMinutes(timeSpentMinutes);
  const completedAt = normalizedStatus === 'DONE' ? new Date() : null;

  const homework = await prisma.homework.create({
    data: {
      studentId: Number(studentId),
      teacherId: teacher.chatId,
      text,
      deadline: deadline ? new Date(deadline) : null,
      status: normalizedStatus,
      isDone: normalizedStatus === 'DONE',
      attachments: JSON.stringify(normalizedAttachments),
      timeSpentMinutes: parsedTimeSpent,
      completedAt,
    },
  });
  await safeLogActivityEvent({
    teacherId: teacher.chatId,
    studentId: Number(studentId),
    homeworkId: homework.id,
    category: 'HOMEWORK',
    action: 'CREATE',
    status: 'SUCCESS',
    source: 'USER',
    title: 'Создано домашнее задание',
    details: homework.text.slice(0, 140),
  });
  return homework;
};

const toggleHomework = async (user: User, homeworkId: number) => {
  const teacher = await ensureTeacher(user);
  const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });
  if (!homework || homework.teacherId !== teacher.chatId) throw new Error('Домашнее задание не найдено');

  const nextIsDone = !homework.isDone;
  const nextStatus = nextIsDone ? 'DONE' : 'ASSIGNED';

  const updated = await prisma.homework.update({
    where: { id: homeworkId },
    data: {
      isDone: nextIsDone,
      status: nextStatus,
      completedAt: nextIsDone ? new Date() : null,
    },
  });
  await safeLogActivityEvent({
    teacherId: teacher.chatId,
    studentId: homework.studentId,
    homeworkId,
    category: 'HOMEWORK',
    action: 'TOGGLE_DONE',
    status: 'SUCCESS',
    source: 'USER',
    title: nextIsDone ? 'Домашка отмечена выполненной' : 'Домашка возвращена в активные',
  });
  return updated;
};

const updateHomework = async (user: User, homeworkId: number, body: any) => {
  const teacher = await ensureTeacher(user);
  const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });
  if (!homework || homework.teacherId !== teacher.chatId) throw new Error('Домашнее задание не найдено');

  const payload: any = {};
  if (typeof body.text === 'string') payload.text = body.text;
  if ('deadline' in body) {
    payload.deadline = body.deadline ? new Date(body.deadline) : null;
  }
  if (Array.isArray(body.attachments)) {
    payload.attachments = JSON.stringify(body.attachments);
  }
  if ('timeSpentMinutes' in body) {
    payload.timeSpentMinutes = parseTimeSpentMinutes(body.timeSpentMinutes);
  }
  if (body.status) {
    const normalizedStatus = normalizeTeacherStatus(body.status);
    payload.status = normalizedStatus;
    payload.isDone = normalizedStatus === 'DONE';
    if (normalizedStatus === 'DONE' && homework.status !== 'DONE' && !homework.isDone) {
      payload.completedAt = new Date();
    }
    if (normalizedStatus !== 'DONE') {
      payload.completedAt = null;
    }
  }

  const updatedHomework = await prisma.homework.update({ where: { id: homeworkId }, data: payload });
  await safeLogActivityEvent({
    teacherId: teacher.chatId,
    studentId: homework.studentId,
    homeworkId,
    category: 'HOMEWORK',
    action: 'UPDATE',
    status: 'SUCCESS',
    source: 'USER',
    title: 'Обновлено домашнее задание',
    details: Object.keys(payload).length > 0 ? `Поля: ${Object.keys(payload).join(', ')}` : null,
  });
  return updatedHomework;
};

const takeHomeworkInWork = async (homeworkId: number, req: IncomingMessage) => {
  const role = getRequestRole(req);
  if (role !== 'STUDENT') {
    const error: any = new Error('Недостаточно прав для изменения статуса');
    error.statusCode = 403;
    throw error;
  }

  const requesterStudentId = getRequestedStudentId(req);
  if (requesterStudentId === null) {
    const error: any = new Error('studentId обязателен для взятия в работу');
    error.statusCode = 400;
    throw error;
  }

  const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });
  if (!homework) throw new Error('Домашнее задание не найдено');
  if (homework.studentId !== requesterStudentId) {
    const error: any = new Error('Домашнее задание недоступно этому ученику');
    error.statusCode = 403;
    throw error;
  }
  if (homework.status !== 'ASSIGNED' && homework.status !== 'IN_PROGRESS') {
    const error: any = new Error('Неверный статус для перевода в работу');
    error.statusCode = 400;
    throw error;
  }

  const updatedHomework = await prisma.homework.update({
    where: { id: homeworkId },
    data: {
      status: 'IN_PROGRESS',
      isDone: false,
      takenAt: new Date(),
      takenByStudentId: requesterStudentId,
    },
  });
  await safeLogActivityEvent({
    teacherId: homework.teacherId,
    studentId: requesterStudentId,
    homeworkId,
    category: 'HOMEWORK',
    action: 'TAKE_IN_WORK',
    status: 'SUCCESS',
    source: 'USER',
    title: 'Ученик взял домашку в работу',
    details: `studentId: ${requesterStudentId}`,
  });
  return updatedHomework;
};

const deleteHomework = async (user: User, homeworkId: number) => {
  const teacher = await ensureTeacher(user);
  const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });
  if (!homework || homework.teacherId !== teacher.chatId) throw new Error('Домашнее задание не найдено');

  await prisma.homework.delete({ where: { id: homeworkId } });
  await safeLogActivityEvent({
    teacherId: teacher.chatId,
    studentId: homework.studentId,
    homeworkId: null,
    category: 'HOMEWORK',
    action: 'DELETE',
    status: 'SUCCESS',
    source: 'USER',
    title: 'Удалено домашнее задание',
    details: homework.text.slice(0, 140),
    payload: { deletedHomeworkId: homeworkId },
  });
  return { id: homeworkId };
};

const validateLessonPayload = async (user: User, body: any) => {
  const { studentId, studentIds, durationMinutes } = body ?? {};
  const ids = studentIds && Array.isArray(studentIds) && studentIds.length > 0
    ? studentIds.map((id: any) => Number(id))
    : studentId
      ? [Number(studentId)]
      : [];

  if (ids.length === 0) throw new Error('Выберите хотя бы одного ученика');
  if (!durationMinutes) throw new Error('Заполните длительность');
  const durationValue = Number(durationMinutes);
  if (!Number.isFinite(durationValue) || durationValue <= 0) throw new Error('Длительность должна быть больше нуля');

  const teacher = await ensureTeacher(user);

  const links = await prisma.teacherStudent.findMany({
    where: {
      teacherId: teacher.chatId,
      studentId: { in: ids },
      isArchived: false,
    },
  });

  if (links.length !== ids.length) {
    throw new Error('Некоторые ученики не найдены у текущего преподавателя');
  }

  return { teacher, durationValue, studentIds: ids };
};

const createLesson = async (user: User, body: any) => {
  const { startAt } = body ?? {};
  if (!startAt) throw new Error('Заполните дату и время урока');
  const { teacher, durationValue, studentIds } = await validateLessonPayload(user, body);
  const lessonColor = normalizeLessonColor(body?.color);
  const meetingLink = resolveMeetingLinkValue(body?.meetingLink);

  const links = await prisma.teacherStudent.findMany({
    where: { teacherId: teacher.chatId, studentId: { in: studentIds }, isArchived: false },
    include: { student: true },
  });
  const basePrice = links.find((link) => link.studentId === studentIds[0])?.pricePerLesson ?? 0;
  const markPaid = Boolean(body?.isPaid || body?.markPaid);
  const participantNames = resolveLessonParticipantNames(studentIds, links);

  const lesson = await prisma.lesson.create({
    data: {
      teacherId: teacher.chatId,
      studentId: studentIds[0],
      price: 0,
      color: lessonColor,
      meetingLink: meetingLink ?? null,
      startAt: new Date(startAt),
      durationMinutes: durationValue,
      status: 'SCHEDULED',
      isPaid: false,
      participants: {
        create: studentIds.map((id) => ({
          studentId: id,
          price: 0,
          isPaid: false,
        })),
      },
    },
    include: {
      participants: {
        include: {
          student: true,
        },
      },
    },
  });

  if (markPaid) {
    const confirmedPrice = basePrice;

    await prisma.lessonParticipant.updateMany({
      where: { lessonId: lesson.id },
      data: { isPaid: true, price: confirmedPrice },
    });

    await prisma.payment.createMany({
      data: lesson.participants.map((participant: any) => ({
        lessonId: lesson.id,
        studentId: participant.studentId,
        amount: confirmedPrice,
        teacherId: teacher.chatId,
        paidAt: new Date(),
        comment: null,
      })),
      skipDuplicates: true,
    });
    await prisma.paymentEvent.createMany({
      data: lesson.participants.map((participant: any) => ({
        studentId: participant.studentId,
        teacherId: teacher.chatId,
        lessonId: lesson.id,
        type: 'MANUAL_PAID',
        lessonsDelta: 0,
        priceSnapshot: confirmedPrice,
        moneyAmount: confirmedPrice,
        createdBy: 'TEACHER',
        reason: null,
      })),
      skipDuplicates: true,
    });

    const updated = await prisma.lesson.update({
      where: { id: lesson.id },
      data: { isPaid: true, price: confirmedPrice },
      include: {
        participants: {
          include: { student: true },
        },
      },
    });

    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId: updated.studentId,
      lessonId: updated.id,
      category: 'LESSON',
      action: 'CREATE',
      status: 'SUCCESS',
      source: 'USER',
      title: 'Создано и оплачено занятие',
      payload: {
        lessonStartAt: updated.startAt.toISOString(),
        durationMinutes: updated.durationMinutes,
        studentIds,
        studentNames: participantNames,
        isPaidAtCreation: true,
      },
    });

    return updated;
  }

  await safeLogActivityEvent({
    teacherId: teacher.chatId,
    studentId: lesson.studentId,
    lessonId: lesson.id,
    category: 'LESSON',
    action: 'CREATE',
    status: 'SUCCESS',
    source: 'USER',
    title: 'Создано занятие',
    payload: {
      lessonStartAt: lesson.startAt.toISOString(),
      durationMinutes: lesson.durationMinutes,
      studentIds,
      studentNames: participantNames,
      isPaidAtCreation: false,
    },
  });

  return lesson;
};

const parseWeekdays = (repeatWeekdays: any): number[] => {
  const raw = Array.isArray(repeatWeekdays)
    ? repeatWeekdays
    : typeof repeatWeekdays === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(repeatWeekdays);
            return Array.isArray(parsed) ? parsed : [];
          } catch (error) {
            return [];
          }
        })()
      : [];

  return Array.from(
    new Set(raw.map((day: any) => Number(day)).filter((day: number) => Number.isInteger(day) && day >= 0 && day <= 6)),
  );
};

const createRecurringLessons = async (user: User, body: any) => {
  const { startAt, repeatWeekdays, repeatUntil } = body ?? {};
  if (!startAt) throw new Error('Заполните дату и время урока');
  const weekdays: number[] = parseWeekdays(repeatWeekdays);
  if (weekdays.length === 0) throw new Error('Выберите дни недели для повтора');

  const startDate = new Date(startAt);
  if (Number.isNaN(startDate.getTime())) throw new Error('Некорректная дата начала');
  const seriesStart = startDate;

  const { teacher, durationValue, studentIds } = await validateLessonPayload(user, body);
  const lessonColor = normalizeLessonColor(body?.color);
  const meetingLink = resolveMeetingLinkValue(body?.meetingLink);

  const links = await prisma.teacherStudent.findMany({
    where: { teacherId: teacher.chatId, studentId: { in: studentIds }, isArchived: false },
    include: { student: true },
  });

  const basePrice = links.find((link) => link.studentId === studentIds[0])?.pricePerLesson ?? 0;
  const markPaid = Boolean(body?.isPaid || body?.markPaid);
  const participantNames = resolveLessonParticipantNames(studentIds, links);

  const maxEndDate = addYears(seriesStart, 1);
  const requestedEndDate = repeatUntil ? new Date(repeatUntil) : null;
  const endDate =
    requestedEndDate && !Number.isNaN(requestedEndDate.getTime())
      ? requestedEndDate > maxEndDate
        ? maxEndDate
        : requestedEndDate
      : maxEndDate;

  if (endDate < seriesStart) {
    throw new Error('Дата окончания повтора должна быть не раньше даты начала');
  }
  const occurrences: Date[] = [];

  for (let cursor = new Date(seriesStart); cursor <= endDate; cursor = addDays(cursor, 1)) {
    if (weekdays.includes(cursor.getUTCDay())) {
      const withTime = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), startDate.getUTCHours(), startDate.getUTCMinutes()),
      );
      occurrences.push(withTime);
    }
    if (occurrences.length > 500) break;
  }

  if (occurrences.length === 0) throw new Error('Не найдено подходящих дат для создания повторов');

  const existingLessons = await prisma.lesson.findMany({
    where: {
      teacherId: teacher.chatId,
      startAt: {
        gte: seriesStart,
        lte: endDate,
      },
    },
  });

  const existingStartAt = new Set(existingLessons.map((lesson) => lesson.startAt.toISOString()));
  const slotsToCreate = occurrences.filter((date) => !existingStartAt.has(date.toISOString()));

  if (slotsToCreate.length === 0) {
    throw new Error('Все выбранные даты уже заняты или запланированы');
  }

  const recurrenceGroupId = crypto.randomUUID();
  const weekdaysPayload = JSON.stringify(weekdays);
  const created: any[] = [];
  for (const date of slotsToCreate) {
    const lesson = await prisma.lesson.create({
      data: {
        teacherId: teacher.chatId,
        studentId: studentIds[0],
        price: 0,
        color: lessonColor,
        meetingLink: meetingLink ?? null,
        startAt: date,
        durationMinutes: durationValue,
        status: 'SCHEDULED',
        isPaid: false,
        isRecurring: true,
        recurrenceUntil: endDate,
        recurrenceGroupId,
        recurrenceWeekdays: weekdaysPayload,
        participants: {
          create: studentIds.map((id) => ({
            studentId: id,
            price: 0,
            isPaid: false,
          })),
        },
      },
      include: {
        participants: {
          include: {
            student: true,
          },
        },
      },
    });
    if (markPaid) {
      const confirmedPrice = basePrice;

      await prisma.lessonParticipant.updateMany({
        where: { lessonId: lesson.id },
        data: { isPaid: true, price: confirmedPrice },
      });

      await prisma.payment.createMany({
        data: lesson.participants.map((participant: any) => ({
          lessonId: lesson.id,
          studentId: participant.studentId,
          amount: confirmedPrice,
          teacherId: teacher.chatId,
          paidAt: new Date(),
          comment: null,
        })),
        skipDuplicates: true,
      });
      await prisma.paymentEvent.createMany({
        data: lesson.participants.map((participant: any) => ({
          studentId: participant.studentId,
          teacherId: teacher.chatId,
          lessonId: lesson.id,
          type: 'MANUAL_PAID',
          lessonsDelta: 0,
          priceSnapshot: confirmedPrice,
          moneyAmount: confirmedPrice,
          createdBy: 'TEACHER',
          reason: null,
        })),
        skipDuplicates: true,
      });

      const updatedLesson = await prisma.lesson.update({
        where: { id: lesson.id },
        data: { isPaid: true, price: confirmedPrice },
        include: {
          participants: { include: { student: true } },
        },
      });

      created.push(updatedLesson);
    } else {
      created.push(lesson);
    }
  }

  await safeLogActivityEvent({
    teacherId: teacher.chatId,
    studentId: studentIds[0] ?? null,
    category: 'LESSON',
    action: 'CREATE_RECURRING',
    status: 'SUCCESS',
    source: 'USER',
    title: 'Создана серия занятий',
    payload: {
      recurrenceGroupId,
      lessonStartAt: seriesStart.toISOString(),
      createdCount: created.length,
      repeatWeekdays: weekdays,
      repeatWeekdayLabels: resolveWeekdayLabels(weekdays),
      repeatUntil: endDate.toISOString(),
      studentIds,
      studentNames: participantNames,
      isPaidAtCreation: markPaid,
    },
  });

  return created;
};

const updateLesson = async (user: User, lessonId: number, body: any) => {
  const {
    studentId,
    studentIds,
    startAt,
    durationMinutes,
    applyToSeries,
    detachFromSeries,
    repeatWeekdays,
    repeatUntil,
  } = body ?? {};
  const teacher = await ensureTeacher(user);
  const now = new Date();
  const existing = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { participants: true },
  });
  if (!existing || existing.teacherId !== teacher.chatId) throw new Error('Урок не найден');

  const ids = studentIds && Array.isArray(studentIds) && studentIds.length > 0
    ? studentIds.map((id: any) => Number(id))
    : studentId
      ? [Number(studentId)]
      : existing.participants.map((p: any) => p.studentId);

  if (ids.length === 0) throw new Error('Выберите хотя бы одного ученика');

  const nextDuration =
    durationMinutes !== undefined && durationMinutes !== null ? Number(durationMinutes) : existing.durationMinutes;
  if (!Number.isFinite(nextDuration) || nextDuration <= 0) throw new Error('Длительность должна быть больше нуля');

  const activeLinks = await prisma.teacherStudent.findMany({
    where: {
      teacherId: teacher.chatId,
      studentId: { in: ids },
      isArchived: false,
    },
  });

  if (activeLinks.length !== ids.length) {
    throw new Error('Некоторые ученики не найдены у текущего преподавателя');
  }

  const previousParticipantIds = existing.participants.map((participant: any) => participant.studentId);
  const allParticipantIds = Array.from(new Set([...ids, ...previousParticipantIds]));
  const allLinks = await prisma.teacherStudent.findMany({
    where: {
      teacherId: teacher.chatId,
      studentId: { in: allParticipantIds },
    },
    include: { student: true },
  });

  const students = await prisma.student.findMany({
    where: { id: { in: ids } },
  });

  const nextParticipantNames = resolveLessonParticipantNames(ids, allLinks as any);
  const previousParticipantNames = resolveLessonParticipantNames(previousParticipantIds, allLinks as any);

  const targetStart = startAt ? new Date(startAt) : existing.startAt;
  const existingLesson = existing as any;
  const normalizedColor = normalizeLessonColor(body?.color ?? existingLesson.color);
  const weekdays = parseWeekdays(repeatWeekdays ?? existingLesson.recurrenceWeekdays ?? []);
  const recurrenceEndRaw = repeatUntil ?? existingLesson.recurrenceUntil;
  const requestedMeetingLink = resolveMeetingLinkValue(body?.meetingLink);
  const resolvedSeriesMeetingLink =
    requestedMeetingLink === undefined ? existingLesson.meetingLink ?? null : requestedMeetingLink;

  if (!applyToSeries && detachFromSeries && existingLesson.isRecurring) {
    const detachedMeetingLink =
      requestedMeetingLink === undefined ? existingLesson.meetingLink ?? null : requestedMeetingLink;
    await prisma.lessonParticipant.deleteMany({
      where: { lessonId },
    });

    const detachedLesson = await prisma.lesson.update({
      where: { id: lessonId },
      data: {
        studentId: ids[0],
        price: existingLesson.isPaid ? (existingLesson as any).price ?? 0 : 0,
        color: normalizedColor,
        meetingLink: detachedMeetingLink,
        startAt: targetStart,
        durationMinutes: nextDuration,
        isRecurring: false,
        recurrenceUntil: null,
        recurrenceGroupId: null,
        recurrenceWeekdays: null,
        participants: {
          create: students.map((student) => ({
            studentId: student.id,
            price: 0,
            isPaid: false,
          })),
        },
      },
      include: {
        participants: {
          include: {
            student: true,
          },
        },
      },
    });
    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId: detachedLesson.studentId,
      lessonId: detachedLesson.id,
      category: 'LESSON',
      action: 'DETACH_FROM_SERIES',
      status: 'SUCCESS',
      source: 'USER',
      title: 'Занятие отделено от серии',
      payload: {
        lessonStartAt: detachedLesson.startAt.toISOString(),
        previousLessonStartAt: new Date(existingLesson.startAt).toISOString(),
        durationMinutes: detachedLesson.durationMinutes,
        studentIds: ids,
        studentNames: nextParticipantNames,
        previousStudentNames: previousParticipantNames,
      },
    });
    return detachedLesson;
  }

  if (!existingLesson.isRecurring && weekdays.length > 0 && repeatWeekdays) {
    if (Number.isNaN(targetStart.getTime())) throw new Error('Некорректная дата урока');

    const seriesStart = targetStart;
    const maxEnd = addYears(seriesStart, 1);
    const requestedEnd = recurrenceEndRaw ? new Date(recurrenceEndRaw) : null;
    const recurrenceEnd =
      requestedEnd && !Number.isNaN(requestedEnd.getTime())
        ? requestedEnd > maxEnd
          ? maxEnd
          : requestedEnd
        : maxEnd;

    if (recurrenceEnd < seriesStart) throw new Error('Дата окончания повтора должна быть не раньше даты начала');

    await (prisma.lesson as any).delete({ where: { id: lessonId } });

    const recurrenceGroupId = crypto.randomUUID();
    const seriesLessons: any[] = [];
    const weekdaysPayload = JSON.stringify(weekdays);

    for (let cursor = new Date(seriesStart); cursor <= recurrenceEnd; cursor = addDays(cursor, 1)) {
      if (weekdays.includes(cursor.getUTCDay())) {
        const start = new Date(
          Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), targetStart.getUTCHours(), targetStart.getUTCMinutes()),
        );

        const created = await prisma.lesson.create({
          data: {
            teacherId: teacher.chatId,
            studentId: ids[0],
            price: 0,
            color: normalizedColor,
            meetingLink: resolvedSeriesMeetingLink,
            startAt: start,
            durationMinutes: nextDuration,
            status: 'SCHEDULED',
            isPaid: false,
            isRecurring: true,
            recurrenceUntil: recurrenceEnd,
            recurrenceGroupId,
            recurrenceWeekdays: weekdaysPayload,
            participants: {
              create: students.map((student) => ({
                studentId: student.id,
                price: 0,
                isPaid: false,
              })),
            },
          },
          include: {
            participants: {
              include: {
                student: true,
              },
            },
          },
        });
        seriesLessons.push(created);
      }
      if (seriesLessons.length > 500) break;
    }

    if (seriesLessons.length === 0) {
      throw new Error('Не найдено дат для создания повторяющихся уроков');
    }

    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId: ids[0] ?? null,
      lessonId: null,
      category: 'LESSON',
      action: 'CONVERT_TO_SERIES',
      status: 'SUCCESS',
      source: 'USER',
      title: 'Одиночное занятие преобразовано в серию',
      payload: {
        convertedFromLessonId: lessonId,
        recurrenceGroupId,
        lessonStartAt: seriesStart.toISOString(),
        createdCount: seriesLessons.length,
        repeatWeekdays: weekdays,
        repeatWeekdayLabels: resolveWeekdayLabels(weekdays),
        repeatUntil: recurrenceEnd.toISOString(),
        studentIds: ids,
        studentNames: nextParticipantNames,
        previousStudentNames: previousParticipantNames,
      },
    });

    return { lessons: seriesLessons };
  }

  if (applyToSeries && existingLesson.isRecurring && existingLesson.recurrenceGroupId) {
    if (weekdays.length === 0) throw new Error('Выберите дни недели для повтора');
    if (Number.isNaN(targetStart.getTime())) throw new Error('Некорректная дата урока');

    const seriesStart = now;
    const maxEnd = addYears(seriesStart, 1);
    const requestedEnd = recurrenceEndRaw ? new Date(recurrenceEndRaw) : null;
    const recurrenceEnd =
      requestedEnd && !Number.isNaN(requestedEnd.getTime())
        ? requestedEnd > maxEnd
          ? maxEnd
          : requestedEnd
        : maxEnd;

    if (recurrenceEnd < seriesStart) throw new Error('Дата окончания повтора должна быть не раньше даты начала');

    await (prisma.lesson as any).deleteMany({
      where: {
        recurrenceGroupId: existingLesson.recurrenceGroupId,
        teacherId: teacher.chatId,
        status: 'SCHEDULED',
        startAt: {
          gte: seriesStart,
        },
      },
    });

    const seriesLessons: any[] = [];
    const weekdaysPayload = JSON.stringify(weekdays);
    for (let cursor = new Date(seriesStart); cursor <= recurrenceEnd; cursor = addDays(cursor, 1)) {
      if (weekdays.includes(cursor.getUTCDay())) {
        const start = new Date(
          Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), targetStart.getUTCHours(), targetStart.getUTCMinutes()),
        );

        if (start > now) {
          const created = await prisma.lesson.create({
            data: {
              teacherId: teacher.chatId,
              studentId: ids[0],
              price: 0,
              color: normalizedColor,
              meetingLink: resolvedSeriesMeetingLink,
              startAt: start,
              durationMinutes: nextDuration,
              status: 'SCHEDULED',
              isPaid: false,
              isRecurring: true,
              recurrenceUntil: recurrenceEnd,
              recurrenceGroupId: existingLesson.recurrenceGroupId,
              recurrenceWeekdays: weekdaysPayload,
              participants: {
                create: students.map((student) => ({
                  studentId: student.id,
                  price: 0,
                  isPaid: false,
                })),
              },
            },
            include: {
              participants: {
                include: {
                  student: true,
                },
              },
            },
          });
          seriesLessons.push(created);
        }
      }
      if (seriesLessons.length > 500) break;
    }

    if (seriesLessons.length === 0) {
      throw new Error('Не найдено дат для обновления серии');
    }

    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId: ids[0] ?? null,
      lessonId,
      category: 'LESSON',
      action: 'UPDATE_SERIES',
      status: 'SUCCESS',
      source: 'USER',
      title: 'Серия занятий обновлена',
      payload: {
        recurrenceGroupId: existingLesson.recurrenceGroupId,
        lessonStartAt: targetStart.toISOString(),
        updatedCount: seriesLessons.length,
        repeatWeekdays: weekdays,
        repeatWeekdayLabels: resolveWeekdayLabels(weekdays),
        repeatUntil: recurrenceEnd.toISOString(),
        studentIds: ids,
        studentNames: nextParticipantNames,
        previousStudentNames: previousParticipantNames,
      },
    });

    return { lessons: seriesLessons };
  }

  await prisma.lessonParticipant.deleteMany({
    where: { lessonId },
  });

  const updatePayload: Record<string, unknown> = {
    studentId: ids[0],
    price: existingLesson.isPaid ? (existingLesson as any).price ?? 0 : 0,
    color: normalizedColor,
    startAt: targetStart,
    durationMinutes: nextDuration,
    participants: {
      create: students.map((student) => ({
        studentId: student.id,
        price: 0,
        isPaid: false,
      })),
    },
  };

  if (requestedMeetingLink !== undefined) {
    updatePayload.meetingLink = requestedMeetingLink;
  }

  const updatedLesson = await prisma.lesson.update({
    where: { id: lessonId },
    data: updatePayload,
    include: {
      participants: {
        include: {
          student: true,
        },
      },
    },
  });

  const nextStudentIds = updatedLesson.participants.map((participant: any) => participant.studentId);
  const nextStudentNames = resolveLessonParticipantNames(nextStudentIds, allLinks as any);
  const previousStudentIdsSorted = [...previousParticipantIds].sort((left, right) => left - right);
  const nextStudentIdsSorted = [...nextStudentIds].sort((left, right) => left - right);
  const participantsChanged =
    previousStudentIdsSorted.length !== nextStudentIdsSorted.length ||
    previousStudentIdsSorted.some((studentId, index) => studentId !== nextStudentIdsSorted[index]);

  const changedFields: string[] = [];
  if (existingLesson.startAt.getTime() !== updatedLesson.startAt.getTime()) changedFields.push('date_time');
  if (existingLesson.durationMinutes !== updatedLesson.durationMinutes) changedFields.push('duration');
  if (participantsChanged) changedFields.push('participants');
  if ((existingLesson.meetingLink ?? null) !== (updatedLesson.meetingLink ?? null)) changedFields.push('meeting_link');
  if (existingLesson.color !== updatedLesson.color) changedFields.push('color');

  await safeLogActivityEvent({
    teacherId: teacher.chatId,
    studentId: updatedLesson.studentId,
    lessonId: updatedLesson.id,
    category: 'LESSON',
    action: 'UPDATE',
    status: 'SUCCESS',
    source: 'USER',
    title: 'Занятие обновлено',
    payload: {
      lessonStartAt: updatedLesson.startAt.toISOString(),
      previousLessonStartAt: existingLesson.startAt.toISOString(),
      durationMinutes: updatedLesson.durationMinutes,
      previousDurationMinutes: existingLesson.durationMinutes,
      studentIds: nextStudentIds,
      studentNames: nextStudentNames,
      previousStudentNames: previousParticipantNames,
      changedFields,
    },
  });
  return updatedLesson;
};

const deleteLesson = async (user: User, lessonId: number, applyToSeries?: boolean) => {
  const teacher = await ensureTeacher(user);
  const lesson = (await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      participants: {
        include: { student: true },
      },
    },
  })) as any;
  if (!lesson || lesson.teacherId !== teacher.chatId) throw new Error('Урок не найден');

  const lessonStudentIds: number[] = Array.from(
    new Set<number>(
      lesson.participants && lesson.participants.length > 0
        ? lesson.participants.map((participant: any) => Number(participant.studentId))
        : [Number(lesson.studentId)],
    ),
  ).filter((studentId) => Number.isFinite(studentId));
  const lessonLinks = await prisma.teacherStudent.findMany({
    where: {
      teacherId: teacher.chatId,
      studentId: { in: lessonStudentIds },
    },
    include: { student: true },
  });
  const lessonStudentNames = resolveLessonParticipantNames(lessonStudentIds, lessonLinks as any);

  if (applyToSeries && lesson.isRecurring && lesson.recurrenceGroupId) {
    const deleted = await (prisma.lesson as any).deleteMany({
      where: { teacherId: teacher.chatId, recurrenceGroupId: lesson.recurrenceGroupId },
    });
    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId: lesson.studentId,
      lessonId: null,
      category: 'LESSON',
      action: 'DELETE_SERIES',
      status: 'SUCCESS',
      source: 'USER',
      title: 'Серия занятий удалена',
      payload: {
        recurrenceGroupId: lesson.recurrenceGroupId,
        deletedFromLessonId: lessonId,
        deletedCount: deleted?.count ?? 0,
        lessonStartAt: new Date(lesson.startAt).toISOString(),
        studentIds: lessonStudentIds,
        studentNames: lessonStudentNames,
        repeatWeekdays: parseWeekdays(lesson.recurrenceWeekdays),
        repeatWeekdayLabels: resolveWeekdayLabels(parseWeekdays(lesson.recurrenceWeekdays)),
      },
    });
    return { deletedIds: [], deletedCount: deleted?.count ?? 0 };
  }

  await (prisma.lesson as any).delete({ where: { id: lessonId } });
  await safeLogActivityEvent({
    teacherId: teacher.chatId,
    studentId: lesson.studentId,
    lessonId: null,
    category: 'LESSON',
    action: 'DELETE',
    status: 'SUCCESS',
    source: 'USER',
    title: 'Занятие удалено',
    payload: {
      deletedLessonId: lessonId,
      lessonStartAt: new Date(lesson.startAt).toISOString(),
      studentIds: lessonStudentIds,
      studentNames: lessonStudentNames,
    },
  });
  return { deletedIds: [lessonId], deletedCount: 1 };
};

const markLessonCompleted = async (user: User, lessonId: number) => {
  const teacher = await ensureTeacher(user);
  const { lesson, links } = await settleLessonPayments(lessonId, teacher.chatId);
  await dispatchScheduledHomeworkAssignmentsForLesson(lesson.id);
  const primaryLink = links.find((link: any) => link.studentId === lesson.studentId) ?? null;
  const participantIds = lesson.participants.map((participant: any) => participant.studentId);
  const participantNames = resolveLessonParticipantNamesFromParticipants(lesson.participants as any, links as any);
  await safeLogActivityEvent({
    teacherId: teacher.chatId,
    studentId: lesson.studentId,
    lessonId: lesson.id,
    category: 'LESSON',
    action: 'MARK_COMPLETED',
    status: 'SUCCESS',
    source: 'USER',
    title: 'Занятие отмечено проведённым',
    payload: {
      lessonStartAt: lesson.startAt.toISOString(),
      isPaid: lesson.isPaid,
      studentIds: participantIds,
      studentNames: participantNames,
    },
  });
  return { lesson, link: primaryLink };
};

const togglePaymentForStudent = async (
  user: User,
  lessonId: number,
  studentId: number,
  options?: { cancelBehavior?: PaymentCancelBehavior; writeOffBalance?: boolean },
) => {
  const teacher = await ensureTeacher(user);
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { participants: true },
  });

  if (!lesson || lesson.teacherId !== teacher.chatId) throw new Error('Урок не найден');

  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
    include: { student: true },
  });

  if (!link || link.isArchived) throw new Error('Ученик не найден у текущего преподавателя');

  const participant = lesson.participants.find((entry: any) => entry.studentId === studentId);
  if (!participant) throw new Error('Участник урока не найден');

  const existingPayment = await prisma.payment.findUnique({
    where: { teacherStudentId_lessonId: { teacherStudentId: link.id, lessonId } },
  });

  let updatedLink = link;
  let nextPaidSource = lesson.paidSource ?? 'NONE';

  if (participant.isPaid || lesson.isPaid) {
    const cancelBehavior = normalizeCancelBehavior(options?.cancelBehavior);
    const shouldRefund = cancelBehavior === 'refund';
    const deltaChange = shouldRefund ? 1 : 0;
    const priceSnapshot =
      [link.pricePerLesson, participant.price, lesson.price].find(
        (value) => typeof value === 'number' && value > 0,
      ) ?? 0;
    if (existingPayment) {
      await prisma.payment.delete({ where: { id: existingPayment.id } });
    }
    if (shouldRefund) {
      updatedLink = await prisma.teacherStudent.update({
        where: { id: link.id },
        data: { balanceLessons: link.balanceLessons + 1 },
      });
    }
    await prisma.paymentEvent.create({
      data: {
        studentId,
        teacherId: teacher.chatId,
        lessonId,
        type: 'ADJUSTMENT',
        lessonsDelta: deltaChange,
        priceSnapshot,
        moneyAmount: null,
        createdBy: 'TEACHER',
        reason: shouldRefund ? 'PAYMENT_REVERT_REFUND' : 'PAYMENT_REVERT_WRITE_OFF',
      },
    });

    await prisma.lessonParticipant.update({
      where: { lessonId_studentId: { lessonId, studentId } },
      data: { isPaid: false },
    });
    if (studentId === lesson.studentId) {
      nextPaidSource = 'NONE';
    }
  } else {
    const amount =
      [link.pricePerLesson, participant.price, lesson.price].find(
        (value) => typeof value === 'number' && value > 0,
      ) ?? 0;
    const shouldWriteOffBalance = Boolean(options?.writeOffBalance && link.balanceLessons > 0);
    const balanceDelta = shouldWriteOffBalance ? -1 : 0;
    const paymentReason = shouldWriteOffBalance ? 'BALANCE_PAYMENT' : null;
    if (shouldWriteOffBalance) {
      updatedLink = await prisma.teacherStudent.update({
        where: { id: link.id },
        data: { balanceLessons: link.balanceLessons - 1 },
      });
    }
    await prisma.payment.create({
      data: {
        lessonId,
        teacherStudentId: link.id,
        amount,
        paidAt: new Date(),
        comment: null,
      },
    });
    await prisma.paymentEvent.create({
      data: {
        studentId,
        teacherId: teacher.chatId,
        lessonId,
        type: 'MANUAL_PAID',
        lessonsDelta: balanceDelta,
        priceSnapshot: amount,
        moneyAmount: shouldWriteOffBalance ? null : amount,
        createdBy: 'TEACHER',
        reason: paymentReason,
      },
    });

    if (link.balanceLessons < 0) {
      updatedLink = await prisma.teacherStudent.update({
        where: { id: link.id },
        data: { balanceLessons: Math.min(link.balanceLessons + 1, 0) },
      });
    }

    await prisma.lessonParticipant.update({
      where: { lessonId_studentId: { lessonId, studentId } },
      data: { isPaid: true, price: amount },
    });

    if (studentId === lesson.studentId) {
      await prisma.lesson.update({ where: { id: lessonId }, data: { price: amount } });
      nextPaidSource = shouldWriteOffBalance ? 'BALANCE' : 'MANUAL';
    }
  }

  const participants = await prisma.lessonParticipant.findMany({
    where: { lessonId },
    include: { student: true },
  });

  const participantsPaid = participants.length ? participants.every((item: any) => item.isPaid) : false;
  const primaryParticipant = participants.find((item: any) => item.studentId === lesson.studentId);
  const primaryPaid = Boolean(primaryParticipant?.isPaid);
  const nextPaymentStatus = primaryPaid ? 'PAID' : 'UNPAID';
  if (!primaryPaid) {
    nextPaidSource = 'NONE';
  } else if (nextPaidSource === 'NONE') {
    nextPaidSource = 'MANUAL';
  }

  const nextStatus = lesson.status === 'SCHEDULED' ? 'COMPLETED' : lesson.status;
  const completedAt = nextStatus === 'COMPLETED' ? lesson.completedAt ?? new Date() : null;
  const paidAt = participantsPaid ? lesson.paidAt ?? new Date() : null;

  const normalizedLesson = await prisma.lesson.update({
    where: { id: lessonId },
    data: {
      isPaid: participantsPaid,
      status: nextStatus,
      completedAt,
      paidAt,
      paymentStatus: nextPaymentStatus,
      paidSource: nextPaidSource,
    },
    include: {
      participants: {
        include: { student: true },
      },
    },
  });

  const updatedParticipant = normalizedLesson.participants.find((item: any) => item.studentId === studentId);
  return { lesson: normalizedLesson, participant: updatedParticipant, link: updatedLink };
};

const toggleLessonPaid = async (
  user: User,
  lessonId: number,
  cancelBehavior?: PaymentCancelBehavior,
  writeOffBalance?: boolean,
) => {
  const baseLesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!baseLesson) throw new Error('Урок не найден');

  const { lesson, link } = await togglePaymentForStudent(user, lessonId, baseLesson.studentId, {
    cancelBehavior,
    writeOffBalance,
  });
  return { lesson, link };
};

const toggleParticipantPaid = async (
  user: User,
  lessonId: number,
  studentId: number,
  cancelBehavior?: PaymentCancelBehavior,
  writeOffBalance?: boolean,
) => togglePaymentForStudent(user, lessonId, studentId, { cancelBehavior, writeOffBalance });

const updateLessonStatus = async (user: User, lessonId: number, status: any) => {
  const teacher = await ensureTeacher(user);
  const normalizedStatus = normalizeLessonStatus(status);

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { participants: { include: { student: true } } },
  });

  if (!lesson || lesson.teacherId !== teacher.chatId) throw new Error('Урок не найден');
  const lessonParticipantIds = lesson.participants.map((participant: any) => participant.studentId);

  if (normalizedStatus === 'COMPLETED') {
    const result = await settleLessonPayments(lessonId, teacher.chatId);
    await dispatchScheduledHomeworkAssignmentsForLesson(result.lesson.id);
    const participantIds = result.lesson.participants.map((participant: any) => participant.studentId);
    const participantNames = resolveLessonParticipantNamesFromParticipants(result.lesson.participants as any, result.links as any);
    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId: result.lesson.studentId,
      lessonId: result.lesson.id,
      category: 'LESSON',
      action: 'STATUS_COMPLETED',
      status: 'SUCCESS',
      source: 'USER',
      title: 'Статус занятия: проведён',
      payload: {
        lessonStartAt: result.lesson.startAt.toISOString(),
        studentIds: participantIds,
        studentNames: participantNames,
      },
    });
    return result;
  }
  if (normalizedStatus === 'CANCELED') {
    const result = await prisma.$transaction(async (tx) => {
      const autoChargeEvents = await tx.paymentEvent.findMany({
        where: { lessonId, type: 'AUTO_CHARGE' },
      });
      const existingAdjustments = await tx.paymentEvent.findMany({
        where: { lessonId, type: 'ADJUSTMENT', reason: 'LESSON_CANCELED' },
      });
      const adjustedStudentIds = new Set(existingAdjustments.map((event: any) => event.studentId));
      const links = lessonParticipantIds.length
        ? await tx.teacherStudent.findMany({
            where: { teacherId: teacher.chatId, studentId: { in: lessonParticipantIds }, isArchived: false },
            include: { student: true },
          })
        : [];
      const linksByStudentId = new Map<number, any>(links.map((link: any) => [link.studentId, link]));

      for (const event of autoChargeEvents) {
        if (adjustedStudentIds.has(event.studentId)) continue;
        const link = linksByStudentId.get(event.studentId);
        if (!link) continue;

        await tx.teacherStudent.update({
          where: { id: link.id },
          data: { balanceLessons: link.balanceLessons + 1 },
        });
        await createPaymentEvent(tx, {
          studentId: event.studentId,
          teacherId: teacher.chatId,
          lessonId,
          type: 'ADJUSTMENT',
          lessonsDelta: 1,
          priceSnapshot: event.priceSnapshot,
          moneyAmount: null,
          createdBy: 'SYSTEM',
          reason: 'LESSON_CANCELED',
        });
        await tx.lessonParticipant.update({
          where: { lessonId_studentId: { lessonId, studentId: event.studentId } },
          data: { isPaid: false, price: 0 },
        });
      }

      const participants = await tx.lessonParticipant.findMany({
        where: { lessonId },
        include: { student: true },
      });
      const participantsPaid = participants.length ? participants.every((item: any) => item.isPaid) : false;

      const updatedLesson = await tx.lesson.update({
        where: { id: lessonId },
        data: {
          status: normalizedStatus,
          isPaid: false,
          paymentStatus: 'UNPAID',
          paidSource: 'NONE',
        },
        include: { participants: { include: { student: true } } },
      });

      return { lesson: updatedLesson, links };
    });

    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId: result.lesson.studentId,
      lessonId: result.lesson.id,
      category: 'LESSON',
      action: 'STATUS_CANCELED',
      status: 'SUCCESS',
      source: 'USER',
      title: 'Статус занятия: отменён',
      payload: {
        lessonStartAt: result.lesson.startAt.toISOString(),
        studentIds: result.lesson.participants.map((participant: any) => participant.studentId),
        studentNames: resolveLessonParticipantNamesFromParticipants(
          result.lesson.participants as any,
          result.links as any,
        ),
      },
    });
    return result;
  }

  const updatedLesson = await prisma.lesson.update({
    where: { id: lessonId },
    data: { status: normalizedStatus, isPaid: false, paymentStatus: 'UNPAID', paidSource: 'NONE' },
    include: { participants: { include: { student: true } } },
  });
  const updatedLessonParticipantIds = updatedLesson.participants.map((participant: any) => participant.studentId);
  const updatedLessonLinks = updatedLessonParticipantIds.length
    ? await prisma.teacherStudent.findMany({
        where: { teacherId: teacher.chatId, studentId: { in: updatedLessonParticipantIds }, isArchived: false },
        include: { student: true },
      })
    : [];

  await safeLogActivityEvent({
    teacherId: teacher.chatId,
    studentId: updatedLesson.studentId,
    lessonId: updatedLesson.id,
    category: 'LESSON',
    action: 'STATUS_SCHEDULED',
    status: 'SUCCESS',
    source: 'USER',
    title: 'Статус занятия: запланирован',
    payload: {
      lessonStartAt: updatedLesson.startAt.toISOString(),
      studentIds: updatedLessonParticipantIds,
      studentNames: resolveLessonParticipantNames(updatedLessonParticipantIds, updatedLessonLinks as any),
    },
  });

  return { lesson: updatedLesson, links: [] as any[] };
};

const remindHomework = async (user: User, studentId: number) => {
  const teacher = await ensureTeacher(user);
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
  });
  if (!link || link.isArchived) throw new Error('Ученик не найден у текущего преподавателя');
  return { status: 'queued', studentId, teacherId: Number(teacher.chatId) };
};

const remindLessonPayment = async (
  user: User,
  lessonId: number,
  studentId?: number | null,
  options?: { force?: boolean },
) => {
  const teacher = await ensureTeacher(user);
  let lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { student: true, participants: true },
  });
  if (!lesson || lesson.teacherId !== teacher.chatId) throw new Error('Урок не найден');
  if (lesson.status !== 'COMPLETED') {
    const now = new Date();
    if (lesson.status === 'SCHEDULED' && lesson.startAt.getTime() < now.getTime()) {
      lesson = await prisma.lesson.update({
        where: { id: lessonId },
        data: { status: 'COMPLETED', completedAt: lesson.completedAt ?? now },
        include: { student: true, participants: true },
      });
    } else {
      throw new Error('Напоминание доступно только для завершённых занятий');
    }
  }
  if (lesson.status !== 'COMPLETED') {
    throw new Error('Напоминание доступно только для завершённых занятий');
  }
  if (lesson.paymentStatus === 'PAID' || lesson.isPaid) {
    throw new Error('Урок уже оплачен');
  }
  const resolvedStudentId = studentId ?? lesson.studentId;
  const participant = lesson.participants.find((item) => item.studentId === resolvedStudentId);
  if (!participant) {
    throw new Error('Ученик не найден');
  }
  const student = await prisma.student.findUnique({ where: { id: resolvedStudentId } });
  if (!student) {
    throw new Error('Ученик не найден');
  }
  const telegramId = await resolveStudentTelegramId(student);
  if (!telegramId) {
    throw new Error('student_not_activated');
  }

  if (lesson.lastPaymentReminderAt && !options?.force) {
    const cooldownMs = 2 * 60 * 60 * 1000;
    if (Date.now() - lesson.lastPaymentReminderAt.getTime() < cooldownMs) {
      throw new Error('recently_sent');
    }
  }

  const result = await sendStudentPaymentReminder({
    studentId: resolvedStudentId,
    lessonId,
    source: 'MANUAL',
  });
  if (result.status !== 'sent') {
    throw new Error('Не удалось отправить напоминание');
  }

  const now = new Date();
  await prisma.lesson.update({
    where: { id: lessonId },
    data: {
      paymentReminderCount: lesson.paymentReminderCount + 1,
      lastPaymentReminderAt: now,
      lastPaymentReminderSource: 'MANUAL',
    },
  });

  if (teacher.notifyTeacherOnManualPaymentReminder) {
    await sendTeacherPaymentReminderNotice({
      teacherId: teacher.chatId,
      studentId: resolvedStudentId,
      lessonId,
      source: 'MANUAL',
    });
  }

  return { status: 'sent' };
};

const sendHomeworkToStudent = async (user: User, homeworkId: number) => {
  const teacher = await ensureTeacher(user);
  const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });

  if (!homework || homework.teacherId !== teacher.chatId) throw new Error('Домашнее задание не найдено');

  const normalizedStatus = normalizeTeacherStatus(homework.status);
  const nextStatus = normalizedStatus === 'DRAFT' ? 'ASSIGNED' : normalizedStatus;

  const updated = await prisma.homework.update({
    where: { id: homeworkId },
    data: { status: nextStatus, isDone: nextStatus === 'DONE' ? true : homework.isDone },
  });

  await safeLogActivityEvent({
    teacherId: teacher.chatId,
    studentId: homework.studentId,
    homeworkId,
    category: 'HOMEWORK',
    action: 'SEND',
    status: 'SUCCESS',
    source: 'USER',
    title: 'Домашка отправлена ученику',
    details: `Статус: ${nextStatus}`,
  });

  return { status: 'queued', homework: updated };
};

const remindHomeworkById = async (user: User, homeworkId: number) => {
  const teacher = await ensureTeacher(user);
  const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });
  if (!homework || homework.teacherId !== teacher.chatId) throw new Error('Домашнее задание не найдено');

  const result = await prisma.homework.update({
    where: { id: homeworkId },
    data: { lastReminderAt: new Date(), status: homework.status === 'DRAFT' ? 'ASSIGNED' : homework.status },
  });

  await safeLogActivityEvent({
    teacherId: teacher.chatId,
    studentId: homework.studentId,
    homeworkId,
    category: 'HOMEWORK',
    action: 'REMIND',
    status: 'SUCCESS',
    source: 'USER',
    title: 'Отправлено напоминание по домашке',
  });

  return { status: 'queued', homework: result };
};

const listStudentContextV2 = async (user: User, requestedTeacherId?: number | null, requestedStudentId?: number | null) => {
  const links = await resolveStudentAccessLinks(user);
  const active = pickStudentAccessLink(links, requestedTeacherId, requestedStudentId);
  return {
    contexts: links.map((link) => ({
      teacherId: Number(link.teacherId),
      studentId: link.studentId,
      teacherName: link.teacher?.name ?? link.teacher?.username ?? 'Преподаватель',
      teacherUsername: link.teacher?.username ?? null,
      studentName: link.customName || link.student?.username || 'Ученик',
      studentUsername: link.student?.username ?? null,
    })),
    activeTeacherId: active ? Number(active.teacherId) : null,
    activeStudentId: active?.studentId ?? null,
  };
};

const listHomeworkGroupsV2 = async (user: User, params: { includeArchived?: boolean }) => {
  const teacher = await ensureTeacher(user);
  const groups = await (prisma as any).homeworkGroup.findMany({
    where: {
      teacherId: teacher.chatId,
      ...(params.includeArchived ? {} : { isArchived: false }),
    },
    orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }, { id: 'desc' }],
  });

  const groupIds = groups
    .map((group: any) => Number(group.id))
    .filter((id: number) => Number.isFinite(id) && id > 0);
  const countsRows = groupIds.length
    ? await (prisma as any).homeworkAssignment.groupBy({
        by: ['groupId'],
        where: {
          teacherId: teacher.chatId,
          groupId: { in: groupIds },
        },
        _count: { _all: true },
      })
    : [];
  const countsByGroupId = new Map<number, number>(
    countsRows
      .map((row: any) => [Number(row.groupId), Number(row._count?._all ?? 0)] as const)
      .filter(([groupId]) => Number.isFinite(groupId) && groupId > 0),
  );
  const ungroupedCount = await (prisma as any).homeworkAssignment.count({
    where: { teacherId: teacher.chatId, groupId: null },
  });

  const systemUngrouped = serializeHomeworkGroupListItemV2(
    {
      teacherId: teacher.chatId,
      title: 'Без группы',
      description: 'Задания без категории',
      iconKey: DEFAULT_HOMEWORK_GROUP_ICON_KEY,
      bgColor: DEFAULT_HOMEWORK_GROUP_BG_COLOR,
      sortOrder: -1,
    },
    ungroupedCount,
    { isSystem: true, isUngrouped: true },
  );

  return {
    items: [
      systemUngrouped,
      ...groups.map((group: any) =>
        serializeHomeworkGroupListItemV2(group, countsByGroupId.get(Number(group.id)) ?? 0),
      ),
    ],
  };
};

const createHomeworkGroupV2 = async (user: User, body: Record<string, unknown>) => {
  const teacher = await ensureTeacher(user);
  const title = normalizeHomeworkGroupTitle(body.title);
  if (!title) throw new Error('Название группы обязательно');
  const description = normalizeHomeworkGroupDescription(body.description);
  const iconKey = normalizeHomeworkGroupIconKey(body.iconKey);
  const bgColor = normalizeHomeworkGroupBgColor(body.bgColor);

  const maxSortResult = await (prisma as any).homeworkGroup.aggregate({
    where: { teacherId: teacher.chatId },
    _max: { sortOrder: true },
  });
  const fallbackSort = Number(maxSortResult?._max?.sortOrder ?? 0) + 100;
  const sortOrder = normalizeHomeworkGroupSortOrder(body.sortOrder, fallbackSort);

  const group = await (prisma as any).homeworkGroup.create({
    data: {
      teacherId: teacher.chatId,
      title,
      description,
      iconKey,
      bgColor,
      sortOrder,
      isArchived: false,
    },
  });
  return { group: serializeHomeworkGroupV2(group) };
};

const updateHomeworkGroupV2 = async (user: User, groupId: number, body: Record<string, unknown>) => {
  const teacher = await ensureTeacher(user);
  await resolveHomeworkGroupForTeacherV2(teacher.chatId, groupId, { allowArchived: true });

  const data: Record<string, unknown> = {};
  if ('title' in body) {
    const title = normalizeHomeworkGroupTitle(body.title);
    if (!title) throw new Error('Название группы обязательно');
    data.title = title;
  }
  if ('description' in body) data.description = normalizeHomeworkGroupDescription(body.description);
  if ('iconKey' in body) data.iconKey = normalizeHomeworkGroupIconKey(body.iconKey);
  if ('bgColor' in body) data.bgColor = normalizeHomeworkGroupBgColor(body.bgColor);
  if ('sortOrder' in body) data.sortOrder = normalizeHomeworkGroupSortOrder(body.sortOrder, 0);
  if ('isArchived' in body) data.isArchived = Boolean(body.isArchived);

  const updated = await (prisma as any).homeworkGroup.update({
    where: { id: groupId },
    data,
  });
  return { group: serializeHomeworkGroupV2(updated) };
};

const deleteHomeworkGroupV2 = async (user: User, groupId: number) => {
  const teacher = await ensureTeacher(user);
  await resolveHomeworkGroupForTeacherV2(teacher.chatId, groupId, { allowArchived: true });
  await (prisma as any).homeworkGroup.delete({
    where: { id: groupId },
  });
  return { deletedId: groupId };
};

const listHomeworkTemplatesV2 = async (user: User, params: { query?: string | null; includeArchived?: boolean }) => {
  const teacher = await ensureTeacher(user);
  const query = params.query?.trim() ?? '';
  const where: Record<string, unknown> = {
    teacherId: teacher.chatId,
    ...(params.includeArchived ? {} : { isArchived: false }),
  };
  if (query) {
    where.OR = [{ title: { contains: query } }, { tags: { contains: query } }];
  }

  const templates = await (prisma as any).homeworkTemplate.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
  });
  return {
    items: templates.map(serializeHomeworkTemplateV2),
  };
};

const createHomeworkTemplateV2 = async (user: User, body: Record<string, unknown>) => {
  const teacher = await ensureTeacher(user);
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const blocks = normalizeHomeworkBlocks(body.blocks) as unknown as HomeworkBlock[];
  const validationResult = validateHomeworkTemplatePayload({
    title,
    blocks,
  });
  if (validationResult.errorIssues.length > 0) {
    throw new RequestValidationError('Проверьте обязательные поля шаблона.', validationResult.issues);
  }

  if (!title) throw new Error('Название шаблона обязательно');
  const template = await (prisma as any).homeworkTemplate.create({
    data: {
      teacherId: teacher.chatId,
      createdByTeacherId: teacher.chatId,
      title,
      tags: JSON.stringify(normalizeHomeworkTemplateTags(body.tags)),
      subject: typeof body.subject === 'string' ? body.subject.trim() || null : null,
      level: typeof body.level === 'string' ? body.level.trim() || null : null,
      blocks: JSON.stringify(blocks),
      isArchived: false,
    },
  });
  return { template: serializeHomeworkTemplateV2(template) };
};

const updateHomeworkTemplateV2 = async (user: User, templateId: number, body: Record<string, unknown>) => {
  const teacher = await ensureTeacher(user);
  const template = await (prisma as any).homeworkTemplate.findUnique({ where: { id: templateId } });
  if (!template || template.teacherId !== teacher.chatId) throw new Error('Шаблон не найден');

  const hasTitleUpdate = typeof body.title === 'string';
  const hasBlocksUpdate = 'blocks' in body;
  const nextTitle = typeof body.title === 'string' ? body.title.trim() : template.title;
  const nextBlocks = hasBlocksUpdate
    ? (normalizeHomeworkBlocks(body.blocks) as unknown as HomeworkBlock[])
    : (normalizeHomeworkBlocks(template.blocks) as unknown as HomeworkBlock[]);

  if (hasTitleUpdate || hasBlocksUpdate) {
    const validationResult = validateHomeworkTemplatePayload({
      title: nextTitle,
      blocks: nextBlocks,
    });
    if (validationResult.errorIssues.length > 0) {
      throw new RequestValidationError('Проверьте обязательные поля шаблона.', validationResult.issues);
    }
  }

  const data: Record<string, unknown> = {};
  if (hasTitleUpdate) {
    if (!nextTitle) throw new Error('Название шаблона обязательно');
    data.title = nextTitle;
  }
  if ('tags' in body) data.tags = JSON.stringify(normalizeHomeworkTemplateTags(body.tags));
  if ('subject' in body) data.subject = typeof body.subject === 'string' ? body.subject.trim() || null : null;
  if ('level' in body) data.level = typeof body.level === 'string' ? body.level.trim() || null : null;
  if (hasBlocksUpdate) data.blocks = JSON.stringify(nextBlocks);
  if (typeof body.isArchived === 'boolean') data.isArchived = body.isArchived;

  const updated = await (prisma as any).homeworkTemplate.update({
    where: { id: templateId },
    data,
  });
  return { template: serializeHomeworkTemplateV2(updated) };
};

const listHomeworkAssignmentsV2 = async (
  user: User,
  params: {
    studentId?: number | null;
    lessonId?: number | null;
    groupId?: number | null;
    ungrouped?: boolean | null;
    status?: string | null;
    bucket?: string | null;
    tab?: string | null;
    q?: string | null;
    sort?: string | null;
    problemFilters?: string | null;
    limit?: number;
    offset?: number;
  },
) => {
  const teacher = await ensureTeacher(user);
  const limit = clampNumber(Number(params.limit ?? DEFAULT_PAGE_SIZE), 1, MAX_PAGE_SIZE);
  const offset = clampNumber(Number(params.offset ?? 0), 0, 100_000);
  const now = new Date();
  const where: Record<string, any> = { teacherId: teacher.chatId };
  if (params.studentId !== null && params.studentId !== undefined && Number.isFinite(Number(params.studentId))) {
    where.studentId = Number(params.studentId);
  }
  if (params.lessonId !== null && params.lessonId !== undefined && Number.isFinite(Number(params.lessonId))) {
    where.lessonId = Number(params.lessonId);
  }
  const includeUngroupedOnly = params.ungrouped === true;
  if (includeUngroupedOnly) {
    where.groupId = null;
  } else if (params.groupId !== null && params.groupId !== undefined && Number.isFinite(Number(params.groupId))) {
    const resolvedGroupId = Number(params.groupId);
    await resolveHomeworkGroupForTeacherV2(teacher.chatId, resolvedGroupId, { allowArchived: true });
    where.groupId = resolvedGroupId;
  }
  const tab = normalizeHomeworkAssignmentsTabV2(params.tab);
  const sort = normalizeHomeworkAssignmentsSortV2(params.sort);
  const problemFilters = normalizeHomeworkAssignmentProblemFiltersV2(params.problemFilters);
  const query = typeof params.q === 'string' ? params.q.trim() : '';

  if (params.status && params.status !== 'all') {
    where.status = normalizeHomeworkAssignmentStatus(params.status);
  } else if (tab !== 'all') {
    Object.assign(where, resolveAssignmentTabWhereV2(tab, now));
  } else {
    Object.assign(where, resolveAssignmentBucketWhereV2(normalizeHomeworkAssignmentBucketV2(params.bucket), now));
  }

  if (problemFilters.length > 0) {
    const conditions = problemFilters.map((filterName) => {
      if (filterName === 'overdue') {
        return {
          OR: [{ status: 'OVERDUE' }, { status: { in: ['SENT', 'RETURNED'] }, deadlineAt: { lt: now } }],
        };
      }
      if (filterName === 'returned') {
        return { status: 'RETURNED' };
      }
      return {
        sendMode: 'AUTO_AFTER_LESSON_DONE',
        lessonId: null,
      };
    });
    where.AND = [...(Array.isArray(where.AND) ? where.AND : []), { OR: conditions }];
  }

  if (query) {
    const matchedLinks = await prisma.teacherStudent.findMany({
      where: {
        teacherId: teacher.chatId,
        isArchived: false,
        customName: { contains: query, mode: 'insensitive' },
      },
      select: { studentId: true },
    });
    const matchedStudentIds = matchedLinks.map((link) => link.studentId);
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      {
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { student: { username: { contains: query, mode: 'insensitive' } } },
          { template: { title: { contains: query, mode: 'insensitive' } } },
          { group: { title: { contains: query, mode: 'insensitive' } } },
          ...(matchedStudentIds.length ? [{ studentId: { in: matchedStudentIds } }] : []),
        ],
      },
    ];
  }

  const shouldSortInMemory = sort === 'urgency' || sort === 'student' || Boolean(query);
  const orderBy: Record<string, 'asc' | 'desc'>[] =
    sort === 'deadline'
      ? [{ deadlineAt: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }]
      : sort === 'updated'
        ? [{ updatedAt: 'desc' }, { id: 'desc' }]
        : [{ createdAt: 'desc' }, { id: 'desc' }];

  const total = shouldSortInMemory
    ? undefined
    : await (prisma as any).homeworkAssignment.count({ where });
  const rawItems = await (prisma as any).homeworkAssignment.findMany({
    where,
    include: {
      student: {
        select: { username: true },
      },
      lesson: {
        select: { startAt: true },
      },
      template: {
        select: { title: true },
      },
      group: {
        select: { id: true, title: true },
      },
    },
    orderBy,
    ...(shouldSortInMemory ? {} : { skip: offset, take: limit }),
  });
  const withSubmissionMeta = await attachLatestSubmissionMetaToAssignments(rawItems);
  const withDisplayMeta = await attachAssignmentDisplayMeta(teacher.chatId, withSubmissionMeta, now);
  const filteredByQuery = query
    ? withDisplayMeta.filter((item) => matchesAssignmentSearchQuery(item, query.toLowerCase()))
    : withDisplayMeta;
  const sorted = sortHomeworkAssignmentsV2(filteredByQuery, sort);
  const pagedItems = shouldSortInMemory ? sorted.slice(offset, offset + limit) : sorted;
  const resolvedTotal = shouldSortInMemory ? sorted.length : total ?? sorted.length;
  return {
    items: pagedItems.map((item: any) => serializeHomeworkAssignmentV2(item, now)),
    total: resolvedTotal,
    nextOffset: offset + limit < resolvedTotal ? offset + limit : null,
  };
};

const getHomeworkAssignmentsSummaryV2 = async (
  user: User,
  params: { studentId?: number | null; lessonId?: number | null },
) => {
  const teacher = await ensureTeacher(user);
  const now = new Date();
  const resolvedTimeZone = resolveTimeZone(teacher.timezone);
  const baseWhere: Record<string, unknown> = { teacherId: teacher.chatId };
  if (params.studentId !== null && params.studentId !== undefined && Number.isFinite(Number(params.studentId))) {
    baseWhere.studentId = Number(params.studentId);
  }
  if (params.lessonId !== null && params.lessonId !== undefined && Number.isFinite(Number(params.lessonId))) {
    baseWhere.lessonId = Number(params.lessonId);
  }

  const buildWhere = (bucket: HomeworkAssignmentBucketV2) => ({
    ...baseWhere,
    ...resolveAssignmentBucketWhereV2(bucket, now),
  });

  const todayZoned = toZonedDate(now, resolvedTimeZone);
  const todayKey = formatInTimeZone(now, 'yyyy-MM-dd', { timeZone: resolvedTimeZone });
  const todayStart = toUtcDateFromTimeZone(todayKey, '00:00', resolvedTimeZone);
  const todayEnd = toUtcEndOfDay(todayKey, resolvedTimeZone);
  const monthStartKey = formatInTimeZone(now, 'yyyy-MM-01', { timeZone: resolvedTimeZone });
  const monthStart = toUtcDateFromTimeZone(monthStartKey, '00:00', resolvedTimeZone);
  const nextMonthZoned = toZonedDate(monthStart, resolvedTimeZone);
  nextMonthZoned.setMonth(nextMonthZoned.getMonth() + 1);
  const nextMonthStart = toUtcDateFromTimeZone(format(nextMonthZoned, 'yyyy-MM-dd'), '00:00', resolvedTimeZone);
  const scoreWindowStartKey = format(addDays(todayZoned, -29), 'yyyy-MM-dd');
  const scoreWindowStart = toUtcDateFromTimeZone(scoreWindowStartKey, '00:00', resolvedTimeZone);
  const currentWeekWindowStartKey = format(addDays(todayZoned, -6), 'yyyy-MM-dd');
  const currentWeekWindowStart = toUtcDateFromTimeZone(currentWeekWindowStartKey, '00:00', resolvedTimeZone);
  const previousWeekWindowStartKey = format(addDays(todayZoned, -13), 'yyyy-MM-dd');
  const previousWeekWindowStart = toUtcDateFromTimeZone(previousWeekWindowStartKey, '00:00', resolvedTimeZone);
  const previousWeekWindowEndKey = format(addDays(todayZoned, -7), 'yyyy-MM-dd');
  const previousWeekWindowEnd = toUtcEndOfDay(previousWeekWindowEndKey, resolvedTimeZone);

  const [
    totalCount,
    draftCount,
    sentCount,
    reviewCount,
    reviewedCount,
    overdueCount,
    scheduledCount,
    inProgressCount,
    closedCount,
    configErrorCount,
    returnedCount,
    reviewedThisMonthCount,
    sentTodayCount,
    inboxCount,
    dueTodayCount,
    reviewedThisWeekCount,
    reviewedPreviousWeekCount,
    scoredReviewedAssignments30d,
  ] = await Promise.all([
    (prisma as any).homeworkAssignment.count({ where: baseWhere }),
    (prisma as any).homeworkAssignment.count({ where: buildWhere('draft') }),
    (prisma as any).homeworkAssignment.count({ where: buildWhere('sent') }),
    (prisma as any).homeworkAssignment.count({ where: buildWhere('review') }),
    (prisma as any).homeworkAssignment.count({ where: buildWhere('reviewed') }),
    (prisma as any).homeworkAssignment.count({ where: buildWhere('overdue') }),
    (prisma as any).homeworkAssignment.count({ where: { ...baseWhere, status: 'SCHEDULED' } }),
    (prisma as any).homeworkAssignment.count({ where: { ...baseWhere, status: { in: ['SENT', 'RETURNED'] } } }),
    (prisma as any).homeworkAssignment.count({ where: { ...baseWhere, status: 'REVIEWED' } }),
    (prisma as any).homeworkAssignment.count({
      where: { ...baseWhere, sendMode: 'AUTO_AFTER_LESSON_DONE', lessonId: null },
    }),
    (prisma as any).homeworkAssignment.count({ where: { ...baseWhere, status: 'RETURNED' } }),
    (prisma as any).homeworkAssignment.count({
      where: {
        ...baseWhere,
        status: 'REVIEWED',
        reviewedAt: { gte: monthStart, lt: nextMonthStart },
      },
    }),
    (prisma as any).homeworkAssignment.count({
      where: {
        ...baseWhere,
        sentAt: { gte: todayStart, lte: todayEnd },
      },
    }),
    (prisma as any).homeworkAssignment.count({
      where: {
        ...baseWhere,
        OR: [
          { status: 'SUBMITTED' },
          { status: 'IN_REVIEW' },
          { status: 'RETURNED' },
          { status: 'OVERDUE' },
          { status: { in: ['SENT', 'RETURNED'] }, deadlineAt: { lt: now } },
          { sendMode: 'AUTO_AFTER_LESSON_DONE', lessonId: null },
        ],
      },
    }),
    (prisma as any).homeworkAssignment.count({
      where: {
        ...baseWhere,
        status: { in: ['SENT', 'SUBMITTED', 'IN_REVIEW', 'RETURNED', 'OVERDUE'] },
        deadlineAt: { gte: todayStart, lte: todayEnd },
      },
    }),
    (prisma as any).homeworkAssignment.count({
      where: {
        ...baseWhere,
        status: 'REVIEWED',
        reviewedAt: { gte: currentWeekWindowStart, lte: now },
      },
    }),
    (prisma as any).homeworkAssignment.count({
      where: {
        ...baseWhere,
        status: 'REVIEWED',
        reviewedAt: { gte: previousWeekWindowStart, lte: previousWeekWindowEnd },
      },
    }),
    (prisma as any).homeworkAssignment.findMany({
      where: {
        ...baseWhere,
        status: 'REVIEWED',
        reviewedAt: { gte: scoreWindowStart, lte: todayEnd },
        OR: [{ finalScore: { not: null } }, { manualScore: { not: null } }, { autoScore: { not: null } }],
      },
      select: { finalScore: true, manualScore: true, autoScore: true },
    }),
  ]);

  const normalizedScores = (scoredReviewedAssignments30d as Array<any>)
    .map((item) => {
      const raw = item.finalScore ?? item.manualScore ?? item.autoScore;
      if (!Number.isFinite(raw)) return null;
      const normalizedRaw = Number(raw);
      const normalized = normalizedRaw > 10 ? normalizedRaw / 10 : normalizedRaw;
      return Math.max(0, Math.min(10, normalized));
    })
    .filter((score): score is number => Number.isFinite(score));
  const averageScore30d =
    normalizedScores.length > 0
      ? Number((normalizedScores.reduce((sum, score) => sum + score, 0) / normalizedScores.length).toFixed(1))
      : null;
  const reviewedWeekDeltaPercent =
    reviewedPreviousWeekCount > 0
      ? Math.round(((reviewedThisWeekCount - reviewedPreviousWeekCount) / reviewedPreviousWeekCount) * 100)
      : reviewedThisWeekCount > 0
        ? 100
        : 0;

  return {
    totalCount,
    draftCount,
    sentCount,
    reviewCount,
    reviewedCount,
    overdueCount,
    inboxCount,
    scheduledCount,
    inProgressCount,
    closedCount,
    configErrorCount,
    returnedCount,
    reviewedThisMonthCount,
    sentTodayCount,
    dueTodayCount,
    reviewedWeekDeltaPercent,
    averageScore30d,
  };
};

const createHomeworkAssignmentV2 = async (user: User, body: Record<string, unknown>) => {
  const teacher = await ensureTeacher(user);
  const studentId = Number(body.studentId);
  if (!Number.isFinite(studentId)) throw new Error('studentId обязателен');
  await ensureTeacherStudentLinkV2(teacher.chatId, studentId);

  const templateId = Number(body.templateId);
  const hasTemplateId = Number.isFinite(templateId);
  const template = hasTemplateId
    ? await (prisma as any).homeworkTemplate.findFirst({
        where: { id: templateId, teacherId: teacher.chatId },
      })
    : null;
  if (hasTemplateId && !template) throw new Error('Шаблон не найден');

  const lessonIdRaw = Number(body.lessonId);
  const lessonId = Number.isFinite(lessonIdRaw) ? lessonIdRaw : null;
  if (lessonId !== null) {
    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson || lesson.teacherId !== teacher.chatId) throw new Error('Урок не найден');
  }
  const normalizedGroupId = normalizeHomeworkGroupIdInput(body.groupId);
  let groupId: number | null = null;
  if (typeof normalizedGroupId === 'number') {
    const group = await resolveHomeworkGroupForTeacherV2(teacher.chatId, normalizedGroupId);
    groupId = group.id;
  }

  const resolvedTitle =
    (typeof body.title === 'string' && body.title.trim()) ||
    (template?.title ? String(template.title) : '') ||
    'Домашнее задание';
  const snapshot = normalizeHomeworkBlocks(body.contentSnapshot ?? template?.blocks ?? []);
  const sendMode = normalizeHomeworkSendMode(body.sendMode);
  const status = body.status
    ? normalizeHomeworkAssignmentStatus(body.status)
    : sendMode === 'AUTO_AFTER_LESSON_DONE'
      ? 'SCHEDULED'
      : 'DRAFT';
  const deadlineAt =
    toValidDate(body.deadlineAt) ?? (await resolveHomeworkDefaultDeadline(teacher.chatId, studentId, lessonId)).deadlineAt;
  const sentAt = status === 'SENT' ? toValidDate(body.sentAt) ?? new Date() : null;
  const assignment = await (prisma as any).homeworkAssignment.create({
    data: {
      teacherId: teacher.chatId,
      studentId,
      lessonId,
      templateId: template?.id ?? null,
      groupId,
      legacyHomeworkId: Number.isFinite(Number(body.legacyHomeworkId)) ? Number(body.legacyHomeworkId) : null,
      title: resolvedTitle,
      status,
      sendMode,
      deadlineAt,
      sentAt,
      contentSnapshot: JSON.stringify(snapshot),
    },
  });

  if (status === 'SENT' && teacher.homeworkNotifyOnAssign) {
    await sendHomeworkNotificationToStudent({
      teacherId: teacher.chatId,
      studentId,
      type: 'HOMEWORK_ASSIGNED',
      dedupeKey: `HOMEWORK_ASSIGNED:${assignment.id}`,
      text: buildHomeworkNotificationText('ASSIGNED', assignment, teacher.timezone),
    });
  }

  return { assignment: serializeHomeworkAssignmentV2(assignment) };
};

const getHomeworkAssignmentV2 = async (user: User, assignmentId: number) => {
  const teacher = await ensureTeacher(user);
  const assignment = await (prisma as any).homeworkAssignment.findFirst({
    where: {
      id: assignmentId,
      teacherId: teacher.chatId,
    },
    include: {
      student: {
        select: { username: true },
      },
      lesson: {
        select: { startAt: true },
      },
      template: {
        select: { title: true },
      },
      group: {
        select: { id: true, title: true },
      },
    },
  });
  if (!assignment) throw createHttpError('Домашка не найдена', 404);

  const [withSubmissionMeta] = await attachLatestSubmissionMetaToAssignments([assignment]);
  const [withDisplayMeta] = await attachAssignmentDisplayMeta(teacher.chatId, [withSubmissionMeta], new Date());
  return {
    assignment: serializeHomeworkAssignmentV2(withDisplayMeta),
  };
};

const updateHomeworkAssignmentV2 = async (user: User, assignmentId: number, body: Record<string, unknown>) => {
  const teacher = await ensureTeacher(user);
  const existing = await (prisma as any).homeworkAssignment.findUnique({
    where: { id: assignmentId },
  });
  if (!existing) throw createHttpError('Домашка не найдена', 404);
  if (existing.teacherId !== teacher.chatId) throw createHttpError('forbidden', 403);

  const data: Record<string, unknown> = {};
  if (typeof body.title === 'string') {
    const title = body.title.trim();
    if (!title) throw new Error('Название обязательно');
    data.title = title;
  }
  if ('status' in body) data.status = normalizeHomeworkAssignmentStatus(body.status);
  if ('sendMode' in body) data.sendMode = normalizeHomeworkSendMode(body.sendMode);
  if ('lessonId' in body) {
    const lessonIdRaw = Number(body.lessonId);
    if (body.lessonId === null || body.lessonId === undefined || body.lessonId === '') {
      data.lessonId = null;
    } else if (Number.isFinite(lessonIdRaw)) {
      const lesson = await prisma.lesson.findUnique({ where: { id: lessonIdRaw } });
      if (!lesson || lesson.teacherId !== teacher.chatId) throw new Error('Урок не найден');
      data.lessonId = lessonIdRaw;
    } else {
      throw new Error('Некорректный lessonId');
    }
  }
  if ('templateId' in body) {
    const templateIdRaw = Number(body.templateId);
    if (body.templateId === null || body.templateId === undefined || body.templateId === '') {
      data.templateId = null;
    } else if (Number.isFinite(templateIdRaw)) {
      const template = await (prisma as any).homeworkTemplate.findFirst({
        where: { id: templateIdRaw, teacherId: teacher.chatId },
      });
      if (!template) throw new Error('Шаблон не найден');
      data.templateId = templateIdRaw;
    } else {
      throw new Error('Некорректный templateId');
    }
  }
  if ('groupId' in body) {
    const resolvedGroupId = normalizeHomeworkGroupIdInput(body.groupId);
    if (resolvedGroupId === null) {
      data.groupId = null;
    } else if (typeof resolvedGroupId === 'number') {
      const group = await resolveHomeworkGroupForTeacherV2(teacher.chatId, resolvedGroupId);
      data.groupId = group.id;
    } else {
      data.groupId = null;
    }
  }
  if ('deadlineAt' in body) data.deadlineAt = toValidDate(body.deadlineAt);
  if ('sentAt' in body) data.sentAt = toValidDate(body.sentAt);
  if ('contentSnapshot' in body) data.contentSnapshot = JSON.stringify(normalizeHomeworkBlocks(body.contentSnapshot));
  if ('teacherComment' in body) data.teacherComment = typeof body.teacherComment === 'string' ? body.teacherComment : null;
  if ('autoScore' in body) data.autoScore = clampHomeworkScore(body.autoScore);
  if ('manualScore' in body) data.manualScore = clampHomeworkScore(body.manualScore);
  if ('finalScore' in body) data.finalScore = clampHomeworkScore(body.finalScore);

  const nextStatus =
    'status' in data ? normalizeHomeworkAssignmentStatus(data.status) : normalizeHomeworkAssignmentStatus(existing.status);
  if (nextStatus === 'SENT' && !existing.sentAt && !('sentAt' in data)) {
    data.sentAt = new Date();
  }

  const updated = await (prisma as any).homeworkAssignment.update({
    where: { id: assignmentId },
    data,
  });

  if (
    nextStatus === 'SENT' &&
    normalizeHomeworkAssignmentStatus(existing.status) !== 'SENT' &&
    teacher.homeworkNotifyOnAssign
  ) {
    await sendHomeworkNotificationToStudent({
      teacherId: teacher.chatId,
      studentId: updated.studentId,
      type: 'HOMEWORK_ASSIGNED',
      dedupeKey: `HOMEWORK_ASSIGNED:${updated.id}`,
      text: buildHomeworkNotificationText('ASSIGNED', updated, teacher.timezone),
    });
  }

  return { assignment: serializeHomeworkAssignmentV2(updated) };
};

const sendManualHomeworkReminderForAssignmentV2 = async (teacher: any, assignment: any) => {
  const result = await sendHomeworkNotificationToStudent({
    teacherId: teacher.chatId,
    studentId: assignment.studentId,
    type: 'HOMEWORK_REMINDER_MANUAL',
    dedupeKey: `HOMEWORK_REMINDER_MANUAL:${assignment.id}:${Date.now()}`,
    text: buildHomeworkNotificationText('MANUAL_REMINDER', assignment, teacher.timezone),
  });

  await safeLogActivityEvent({
    teacherId: teacher.chatId,
    studentId: assignment.studentId,
    category: 'HOMEWORK',
    action: 'REMIND',
    status: result.status === 'sent' ? 'SUCCESS' : 'FAILED',
    source: 'USER',
    title: 'Отправлено напоминание по домашке',
    details: `Assignment #${assignment.id}`,
    payload: { assignmentId: assignment.id, status: result.status },
  });

  return result;
};

const remindHomeworkAssignmentV2 = async (user: User, assignmentId: number) => {
  const teacher = await ensureTeacher(user);
  const assignment = await (prisma as any).homeworkAssignment.findUnique({
    where: { id: assignmentId },
  });
  if (!assignment) throw createHttpError('Домашка не найдена', 404);
  if (assignment.teacherId !== teacher.chatId) throw createHttpError('forbidden', 403);

  const result = await sendManualHomeworkReminderForAssignmentV2(teacher, assignment);
  return {
    status: result.status,
    assignment: serializeHomeworkAssignmentV2(assignment),
  };
};

const deleteHomeworkAssignmentV2 = async (user: User, assignmentId: number) => {
  const teacher = await ensureTeacher(user);
  const existing = await (prisma as any).homeworkAssignment.findUnique({
    where: { id: assignmentId },
  });
  if (!existing) throw createHttpError('Домашка не найдена', 404);
  if (existing.teacherId !== teacher.chatId) throw createHttpError('forbidden', 403);
  await (prisma as any).homeworkAssignment.delete({ where: { id: assignmentId } });

  await safeLogActivityEvent({
    teacherId: teacher.chatId,
    studentId: existing.studentId,
    category: 'HOMEWORK',
    action: 'DELETE',
    status: 'SUCCESS',
    source: 'USER',
    title: 'Домашка удалена',
    details: `Assignment #${assignmentId}`,
    payload: { assignmentId },
  });

  return { deletedId: assignmentId };
};

const bulkHomeworkAssignmentsV2 = async (user: User, body: Record<string, unknown>) => {
  const teacher = await ensureTeacher(user);
  const ids = Array.isArray(body.ids)
    ? Array.from(
        new Set(
          body.ids
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value) && value > 0),
        ),
      )
    : [];
  if (!ids.length) throw new Error('ids обязательны');

  const actionRaw = typeof body.action === 'string' ? body.action.toUpperCase() : '';
  const action =
    actionRaw === 'SEND_NOW' || actionRaw === 'REMIND' || actionRaw === 'MOVE_TO_DRAFT' || actionRaw === 'DELETE'
      ? actionRaw
      : null;
  if (!action) throw new Error('Некорректное действие');

  const assignments = await (prisma as any).homeworkAssignment.findMany({
    where: {
      id: { in: ids },
      teacherId: teacher.chatId,
    },
  });
  const assignmentById = new Map<number, any>(assignments.map((assignment: any) => [assignment.id, assignment]));
  const results: Array<{ id: number; ok: boolean; message?: string }> = [];
  let successCount = 0;

  for (const id of ids) {
    const assignment = assignmentById.get(id);
    if (!assignment) {
      results.push({ id, ok: false, message: 'Домашка не найдена' });
      continue;
    }

    try {
      if (action === 'SEND_NOW') {
        const nextStatus = normalizeHomeworkAssignmentStatus(assignment.status) === 'SENT' ? 'SENT' : 'SENT';
        const updated = await (prisma as any).homeworkAssignment.update({
          where: { id },
          data: {
            status: nextStatus,
            sentAt: assignment.sentAt ?? new Date(),
          },
        });
        if (normalizeHomeworkAssignmentStatus(assignment.status) !== 'SENT' && teacher.homeworkNotifyOnAssign) {
          await sendHomeworkNotificationToStudent({
            teacherId: teacher.chatId,
            studentId: updated.studentId,
            type: 'HOMEWORK_ASSIGNED',
            dedupeKey: `HOMEWORK_ASSIGNED:${updated.id}`,
            text: buildHomeworkNotificationText('ASSIGNED', updated, teacher.timezone),
          });
        }
      } else if (action === 'REMIND') {
        await sendManualHomeworkReminderForAssignmentV2(teacher, assignment);
      } else if (action === 'MOVE_TO_DRAFT') {
        await (prisma as any).homeworkAssignment.update({
          where: { id },
          data: { status: 'DRAFT' },
        });
      } else if (action === 'DELETE') {
        await (prisma as any).homeworkAssignment.delete({ where: { id } });
      }

      successCount += 1;
      results.push({ id, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      results.push({ id, ok: false, message });
    }
  }

  return {
    action,
    total: ids.length,
    successCount,
    errorCount: ids.length - successCount,
    results,
  };
};

const listHomeworkSubmissionsV2 = async (user: User, assignmentId: number) => {
  const teacher = await ensureTeacher(user);
  const assignment = await (prisma as any).homeworkAssignment.findFirst({
    where: { id: assignmentId, teacherId: teacher.chatId },
  });
  if (!assignment) throw new Error('Домашка не найдена');
  const items = await (prisma as any).homeworkSubmission.findMany({
    where: { assignmentId },
    orderBy: [{ attemptNo: 'desc' }, { id: 'desc' }],
  });
  return { items: items.map(serializeHomeworkSubmissionV2) };
};

const openHomeworkReviewSessionV2 = async (user: User, assignmentId: number) => {
  const teacher = await ensureTeacher(user);

  const loadAssignment = async () =>
    (prisma as any).homeworkAssignment.findFirst({
      where: { id: assignmentId, teacherId: teacher.chatId },
      include: {
        student: {
          select: { username: true },
        },
        lesson: {
          select: { startAt: true },
        },
        template: {
          select: { title: true },
        },
      },
    });

  let assignment = await loadAssignment();
  if (!assignment) throw new Error('Домашка не найдена');

  if (normalizeHomeworkAssignmentStatus(assignment.status) === 'SUBMITTED') {
    await (prisma as any).homeworkAssignment.update({
      where: { id: assignmentId },
      data: {
        status: 'IN_REVIEW',
        updatedAt: new Date(),
      },
    });
    assignment = await loadAssignment();
    if (!assignment) throw new Error('Домашка не найдена');
  }

  const [assignmentWithSubmissionMeta] = await attachLatestSubmissionMetaToAssignments([assignment]);
  const [assignmentWithDisplayMeta] = await attachAssignmentDisplayMeta(
    teacher.chatId,
    [assignmentWithSubmissionMeta],
    new Date(),
  );

  const submissions = await (prisma as any).homeworkSubmission.findMany({
    where: { assignmentId },
    orderBy: [{ attemptNo: 'desc' }, { id: 'desc' }],
  });

  return {
    assignment: serializeHomeworkAssignmentV2(assignmentWithDisplayMeta),
    submissions: submissions.map(serializeHomeworkSubmissionV2),
  };
};

const saveHomeworkReviewDraftV2 = async (user: User, assignmentId: number, body: Record<string, unknown>) => {
  const teacher = await ensureTeacher(user);
  const assignment = await (prisma as any).homeworkAssignment.findFirst({
    where: { id: assignmentId, teacherId: teacher.chatId },
    include: {
      student: {
        select: { username: true },
      },
      lesson: {
        select: { startAt: true },
      },
      template: {
        select: { title: true },
      },
    },
  });
  if (!assignment) throw new Error('Домашка не найдена');

  const submissionId = Number(body.submissionId);
  const submission =
    Number.isFinite(submissionId) && submissionId > 0
      ? await (prisma as any).homeworkSubmission.findFirst({
          where: { id: submissionId, assignmentId },
          orderBy: [{ attemptNo: 'desc' }, { id: 'desc' }],
        })
      : await (prisma as any).homeworkSubmission.findFirst({
          where: { assignmentId },
          orderBy: [{ attemptNo: 'desc' }, { id: 'desc' }],
        });
  if (!submission) throw new Error('Попытка не найдена');

  const hasDraftField = Object.prototype.hasOwnProperty.call(body, 'draft');
  const rawDraft = hasDraftField ? body.draft : null;
  if (rawDraft !== null && rawDraft !== undefined && (typeof rawDraft !== 'object' || Array.isArray(rawDraft))) {
    throw new Error('Некорректный формат черновика проверки');
  }

  const normalizedDraft = rawDraft ? normalizeHomeworkReviewDraftV2(rawDraft) : null;
  if (rawDraft && !normalizedDraft) {
    throw new Error('Некорректный формат черновика проверки');
  }
  const draftToStore = normalizedDraft
    ? {
        ...normalizedDraft,
        submissionId: submission.id,
      }
    : null;

  const updatedSubmission = await (prisma as any).homeworkSubmission.update({
    where: { id: submission.id },
    data: {
      reviewDraft: draftToStore ? JSON.stringify(draftToStore) : null,
    },
  });

  const currentStatus = normalizeHomeworkAssignmentStatus(assignment.status);
  const updatedAssignment =
    currentStatus === 'SUBMITTED'
      ? await (prisma as any).homeworkAssignment.update({
          where: { id: assignmentId },
          data: {
            status: 'IN_REVIEW',
            updatedAt: new Date(),
          },
          include: {
            student: {
              select: { username: true },
            },
            lesson: {
              select: { startAt: true },
            },
            template: {
              select: { title: true },
            },
          },
        })
      : assignment;

  const [assignmentWithSubmissionMeta] = await attachLatestSubmissionMetaToAssignments([updatedAssignment]);
  const [assignmentWithDisplayMeta] = await attachAssignmentDisplayMeta(
    teacher.chatId,
    [assignmentWithSubmissionMeta],
    new Date(),
  );

  return {
    assignment: serializeHomeworkAssignmentV2(assignmentWithDisplayMeta),
    submission: serializeHomeworkSubmissionV2(updatedSubmission),
  };
};

const createHomeworkSubmissionV2 = async (
  user: User,
  role: RequestRole,
  assignmentId: number,
  body: Record<string, unknown>,
  requestedTeacherId?: number | null,
  requestedStudentId?: number | null,
) => {
  let assignment = await (prisma as any).homeworkAssignment.findUnique({
    where: { id: assignmentId },
  });
  if (!assignment) throw new Error('Домашка не найдена');

  let studentId: number;
  if (role === 'STUDENT') {
    const studentContext = await ensureStudentAccessLink(user, requestedTeacherId, requestedStudentId);
    if (
      assignment.studentId !== studentContext.active.studentId ||
      Number(assignment.teacherId) !== Number(studentContext.active.teacherId)
    ) {
      throw new Error('forbidden');
    }
    studentId = studentContext.active.studentId;
  } else {
    const teacher = await ensureTeacher(user);
    if (assignment.teacherId !== teacher.chatId) throw new Error('forbidden');
    studentId = assignment.studentId;
  }

  let latest = await (prisma as any).homeworkSubmission.findFirst({
    where: { assignmentId },
    orderBy: [{ attemptNo: 'desc' }, { id: 'desc' }],
  });
  const shouldSubmit = Boolean(body.submit);
  const latestStatus = latest ? normalizeHomeworkSubmissionStatus(latest.status) : null;

  if (latest && latestStatus === 'DRAFT') {
    const timedOutResult = await finalizeTimedOutDraftSubmission(assignment, latest, new Date());
    if (timedOutResult) {
      assignment = timedOutResult.assignment;
      latest = timedOutResult.submission;
      return {
        submission: serializeHomeworkSubmissionV2(latest),
        assignment: serializeHomeworkAssignmentV2(assignment),
      };
    }
  }

  const assignmentStatus = normalizeHomeworkAssignmentStatus(assignment.status);

  let targetAttempt = latest?.attemptNo ?? 1;
  let mode: 'create' | 'update' = 'create';
  if (latest && normalizeHomeworkSubmissionStatus(latest.status) === 'DRAFT') {
    targetAttempt = latest.attemptNo;
    mode = 'update';
  } else if (latest && normalizeHomeworkSubmissionStatus(latest.status) !== 'DRAFT') {
    if (assignmentStatus !== 'RETURNED') {
      throw new Error('Домашка уже сдана. Новая попытка доступна после возврата на доработку.');
    }
    targetAttempt = latest.attemptNo + 1;
    mode = 'create';
  }

  const answerText = typeof body.answerText === 'string' ? body.answerText : null;
  const attachments = normalizeHomeworkAttachments(body.attachments);
  const voice = normalizeHomeworkAttachments(body.voice);
  const testAnswers = parseObjectRecord(body.testAnswers);
  const autoScore = calculateHomeworkAutoScore(normalizeHomeworkBlocks(assignment.contentSnapshot), testAnswers);

  const submissionPayload: Record<string, unknown> = {
    answerText,
    attachments: JSON.stringify(attachments),
    voice: JSON.stringify(voice),
    testAnswers: testAnswers ? JSON.stringify(testAnswers) : null,
    autoScore,
  };

  if (shouldSubmit) {
    submissionPayload.status = 'SUBMITTED';
    submissionPayload.submittedAt = new Date();
  } else {
    submissionPayload.status = 'DRAFT';
  }

  const submission =
    mode === 'update'
      ? await (prisma as any).homeworkSubmission.update({
          where: { assignmentId_attemptNo: { assignmentId, attemptNo: targetAttempt } },
          data: submissionPayload,
        })
      : await (prisma as any).homeworkSubmission.create({
          data: {
            assignmentId,
            studentId,
            attemptNo: targetAttempt,
            ...submissionPayload,
          },
        });

  const assignmentUpdateData: Record<string, unknown> = {};
  if (shouldSubmit) {
    assignmentUpdateData.status = 'SUBMITTED';
    assignmentUpdateData.autoScore = autoScore;
    assignmentUpdateData.updatedAt = new Date();
  }

  const updatedAssignment =
    Object.keys(assignmentUpdateData).length > 0
      ? await (prisma as any).homeworkAssignment.update({
          where: { id: assignmentId },
          data: assignmentUpdateData,
        })
      : assignment;

  return {
    submission: serializeHomeworkSubmissionV2(submission),
    assignment: serializeHomeworkAssignmentV2(updatedAssignment),
  };
};

const reviewHomeworkAssignmentV2 = async (user: User, assignmentId: number, body: Record<string, unknown>) => {
  const teacher = await ensureTeacher(user);
  const assignment = await (prisma as any).homeworkAssignment.findFirst({
    where: { id: assignmentId, teacherId: teacher.chatId },
  });
  if (!assignment) throw new Error('Домашка не найдена');

  const action = body.action === 'RETURNED' ? 'RETURNED' : body.action === 'REVIEWED' ? 'REVIEWED' : null;
  if (!action) throw new Error('Некорректное действие проверки');

  const submissionId = Number(body.submissionId);
  const submission = Number.isFinite(submissionId)
    ? await (prisma as any).homeworkSubmission.findFirst({ where: { id: submissionId, assignmentId } })
    : await (prisma as any).homeworkSubmission.findFirst({
        where: { assignmentId },
        orderBy: [{ attemptNo: 'desc' }, { id: 'desc' }],
      });
  if (!submission) throw new Error('Попытка не найдена');

  const teacherComment = typeof body.teacherComment === 'string' ? body.teacherComment.trim() : '';
  if (action === 'RETURNED' && !teacherComment) {
    throw new Error('Комментарий обязателен при возврате на доработку');
  }

  const autoScore = clampHomeworkScore(body.autoScore ?? submission.autoScore ?? assignment.autoScore);
  const manualScore = clampHomeworkScore(body.manualScore ?? submission.manualScore ?? assignment.manualScore);
  const overrideFinal = clampHomeworkScore(body.finalScore);
  const finalScore = overrideFinal ?? (manualScore ?? autoScore);
  const now = new Date();

  const updatedSubmission = await (prisma as any).homeworkSubmission.update({
    where: { id: submission.id },
    data: {
      status: 'REVIEWED',
      reviewerTeacherId: teacher.chatId,
      teacherComment: teacherComment || null,
      reviewDraft: null,
      autoScore,
      manualScore,
      finalScore,
      reviewedAt: now,
    },
  });

  const updatedAssignment = await (prisma as any).homeworkAssignment.update({
    where: { id: assignmentId },
    data: {
      status: action,
      teacherComment: teacherComment || null,
      reviewedAt: now,
      autoScore,
      manualScore,
      finalScore,
    },
  });

  await sendHomeworkNotificationToStudent({
    teacherId: teacher.chatId,
    studentId: updatedAssignment.studentId,
    type: action === 'RETURNED' ? 'HOMEWORK_RETURNED' : 'HOMEWORK_REVIEWED',
    dedupeKey: `${action === 'RETURNED' ? 'HOMEWORK_RETURNED' : 'HOMEWORK_REVIEWED'}:${updatedAssignment.id}:${updatedSubmission.id}`,
    text: buildHomeworkNotificationText(
      action === 'RETURNED' ? 'RETURNED' : 'REVIEWED',
      { ...updatedAssignment, teacherComment: teacherComment || null },
      teacher.timezone,
    ),
  });

  return {
    assignment: serializeHomeworkAssignmentV2(updatedAssignment),
    submission: serializeHomeworkSubmissionV2(updatedSubmission),
  };
};

const listStudentHomeworkAssignmentsV2 = async (
  user: User,
  requestedTeacherId: number | null | undefined,
  requestedStudentId: number | null | undefined,
  params: { filter?: string | null; limit?: number; offset?: number },
) => {
  const { active } = await ensureStudentAccessLink(user, requestedTeacherId, requestedStudentId);
  const limit = clampNumber(Number(params.limit ?? DEFAULT_PAGE_SIZE), 1, MAX_PAGE_SIZE);
  const offset = clampNumber(Number(params.offset ?? 0), 0, 100_000);
  const now = new Date();
  const filter = params.filter ?? 'active';

  const where: Record<string, unknown> = {
    teacherId: active.teacherId,
    studentId: active.studentId,
  };
  if (filter === 'submitted') {
    where.status = { in: ['SUBMITTED', 'IN_REVIEW'] };
  } else if (filter === 'reviewed') {
    where.status = 'REVIEWED';
  } else if (filter === 'active') {
    where.status = { in: ['SENT', 'RETURNED', 'OVERDUE', 'SUBMITTED', 'IN_REVIEW'] };
  } else if (filter === 'overdue') {
    where.OR = [
      { status: 'OVERDUE' },
      { status: { in: ['SENT', 'RETURNED'] }, deadlineAt: { lt: now } },
    ];
  }

  const total = await (prisma as any).homeworkAssignment.count({ where });
  const rawItems = await (prisma as any).homeworkAssignment.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: offset,
    take: limit,
  });
  const items = await attachLatestSubmissionMetaToAssignments(rawItems);

  return {
    items: items.map((item: any) => serializeHomeworkAssignmentV2(item, now)),
    total,
    nextOffset: offset + limit < total ? offset + limit : null,
  };
};

const getStudentHomeworkAssignmentDetailV2 = async (
  user: User,
  requestedTeacherId: number | null | undefined,
  requestedStudentId: number | null | undefined,
  assignmentId: number,
) => {
  const { active } = await ensureStudentAccessLink(user, requestedTeacherId, requestedStudentId);
  let assignment = await (prisma as any).homeworkAssignment.findFirst({
    where: {
      id: assignmentId,
      teacherId: active.teacherId,
      studentId: active.studentId,
    },
  });
  if (!assignment) throw new Error('Домашка не найдена');

  let submissions = await (prisma as any).homeworkSubmission.findMany({
    where: { assignmentId },
    orderBy: [{ attemptNo: 'desc' }, { id: 'desc' }],
  });
  const latestDraftSubmission = submissions.find((submission: any) => normalizeHomeworkSubmissionStatus(submission.status) === 'DRAFT') ?? null;
  if (latestDraftSubmission) {
    const timedOutResult = await finalizeTimedOutDraftSubmission(assignment, latestDraftSubmission, new Date());
    if (timedOutResult) {
      assignment = timedOutResult.assignment;
      submissions = [
        timedOutResult.submission,
        ...submissions.filter((submission: any) => submission.id !== timedOutResult.submission.id),
      ];
    }
  }

  return {
    assignment: serializeHomeworkAssignmentV2(assignment, new Date()),
    submissions: submissions.map((item: any) => serializeHomeworkSubmissionV2(item)),
  };
};

const getStudentHomeworkSummaryV2 = async (
  user: User,
  requestedTeacherId: number | null | undefined,
  requestedStudentId: number | null | undefined,
) => {
  const { active } = await ensureStudentAccessLink(user, requestedTeacherId, requestedStudentId);
  const now = new Date();
  const assignments = await (prisma as any).homeworkAssignment.findMany({
    where: { teacherId: active.teacherId, studentId: active.studentId },
    select: { status: true, deadlineAt: true },
  });

  const todayKey = formatInTimeZone(now, 'yyyy-MM-dd', {
    timeZone: resolveTimeZone((active.student as any)?.timezone ?? active.teacher?.timezone),
  });
  let activeCount = 0;
  let overdueCount = 0;
  let submittedCount = 0;
  let reviewedCount = 0;
  let dueTodayCount = 0;

  assignments.forEach((item: any) => {
    const status = resolveAssignmentViewStatus(item, now);
    if (status === 'REVIEWED') reviewedCount += 1;
    if (status === 'SUBMITTED' || status === 'IN_REVIEW') submittedCount += 1;
    if (status === 'OVERDUE') overdueCount += 1;
    if (status === 'SENT' || status === 'RETURNED' || status === 'OVERDUE' || status === 'SUBMITTED' || status === 'IN_REVIEW') activeCount += 1;
    if (item.deadlineAt) {
      const deadlineKey = formatInTimeZone(item.deadlineAt, 'yyyy-MM-dd', {
        timeZone: resolveTimeZone((active.student as any)?.timezone ?? active.teacher?.timezone),
      });
      if (deadlineKey === todayKey && (status === 'SENT' || status === 'RETURNED' || status === 'OVERDUE')) {
        dueTodayCount += 1;
      }
    }
  });

  return { activeCount, overdueCount, submittedCount, reviewedCount, dueTodayCount };
};

const updateStudentPreferencesV2 = async (
  user: User,
  requestedTeacherId: number | null | undefined,
  requestedStudentId: number | null | undefined,
  body: Record<string, unknown>,
) => {
  const { active } = await ensureStudentAccessLink(user, requestedTeacherId, requestedStudentId);
  const data: Record<string, unknown> = {};
  if ('timezone' in body) {
    if (body.timezone === null) data.timezone = null;
    else if (typeof body.timezone === 'string') data.timezone = body.timezone.trim() || null;
  }
  const student = await prisma.student.update({
    where: { id: active.studentId },
    data,
  });
  return { student };
};

const dispatchScheduledHomeworkAssignmentsForLesson = async (lessonId: number) => {
  const scheduledAssignments = await (prisma as any).homeworkAssignment.findMany({
    where: { lessonId, status: 'SCHEDULED' },
    include: { teacher: true },
  });
  const now = new Date();
  for (const assignment of scheduledAssignments) {
    const updated = await (prisma as any).homeworkAssignment.updateMany({
      where: { id: assignment.id, status: 'SCHEDULED' },
      data: { status: 'SENT', sentAt: now },
    });
    if (!updated.count) continue;
    if (!assignment.teacher?.homeworkNotifyOnAssign) continue;
    await sendHomeworkNotificationToStudent({
      teacherId: assignment.teacherId,
      studentId: assignment.studentId,
      type: 'HOMEWORK_ASSIGNED',
      dedupeKey: `HOMEWORK_ASSIGNED:${assignment.id}`,
      text: buildHomeworkNotificationText('ASSIGNED', assignment, assignment.teacher?.timezone ?? null),
    });
  }
};

const runHomeworkAssignmentAutomationForTeacher = async (teacher: any, now: Date) => {
  const reminderMorningTime = isValidTimeString(teacher.homeworkReminderMorningTime) ? teacher.homeworkReminderMorningTime : '10:00';
  const overdueReminderTime = isValidTimeString(teacher.homeworkOverdueReminderTime) ? teacher.homeworkOverdueReminderTime : '10:00';
  const overdueMaxCount = clampNumber(Number(teacher.homeworkOverdueReminderMaxCount ?? 3), 1, 10);

  const assignments = await (prisma as any).homeworkAssignment.findMany({
    where: {
      teacherId: teacher.chatId,
      status: { in: ['SENT', 'RETURNED', 'OVERDUE'] },
    },
    include: { student: true },
  });

  for (const assignment of assignments) {
    const studentTimeZone = resolveTimeZone(assignment.student?.timezone ?? teacher.timezone);
    const nowTimeLabel = formatInTimeZone(now, 'HH:mm', { timeZone: studentTimeZone });
    const deadlineAt = toValidDate(assignment.deadlineAt);
    if (deadlineAt && deadlineAt.getTime() < now.getTime() && (assignment.status === 'SENT' || assignment.status === 'RETURNED')) {
      await (prisma as any).homeworkAssignment.update({
        where: { id: assignment.id },
        data: { status: 'OVERDUE' },
      });
      assignment.status = 'OVERDUE';
    }

    if (!deadlineAt) continue;
    const diffMs = deadlineAt.getTime() - now.getTime();
    const deadlineDateKey = formatInTimeZone(deadlineAt, 'yyyy-MM-dd', { timeZone: studentTimeZone });
    const nowDateKey = formatInTimeZone(now, 'yyyy-MM-dd', { timeZone: studentTimeZone });

    if (teacher.homeworkReminder24hEnabled && !assignment.reminder24hSentAt && diffMs > 0 && diffMs <= 24 * 60 * 60 * 1000) {
      const result = await sendHomeworkNotificationToStudent({
        teacherId: assignment.teacherId,
        studentId: assignment.studentId,
        type: 'HOMEWORK_REMINDER_24H',
        dedupeKey: `HOMEWORK_REMINDER_24H:${assignment.id}`,
        text: buildHomeworkNotificationText('REMINDER_24H', assignment, studentTimeZone),
      });
      if (result.status === 'sent') {
        await (prisma as any).homeworkAssignment.update({
          where: { id: assignment.id },
          data: { reminder24hSentAt: now },
        });
      }
    }

    if (teacher.homeworkReminder3hEnabled && !assignment.reminder3hSentAt && diffMs > 0 && diffMs <= 3 * 60 * 60 * 1000) {
      const result = await sendHomeworkNotificationToStudent({
        teacherId: assignment.teacherId,
        studentId: assignment.studentId,
        type: 'HOMEWORK_REMINDER_3H',
        dedupeKey: `HOMEWORK_REMINDER_3H:${assignment.id}`,
        text: buildHomeworkNotificationText('REMINDER_3H', assignment, studentTimeZone),
      });
      if (result.status === 'sent') {
        await (prisma as any).homeworkAssignment.update({
          where: { id: assignment.id },
          data: { reminder3hSentAt: now },
        });
      }
    }

    if (
      teacher.homeworkReminderMorningEnabled &&
      !assignment.reminderMorningSentAt &&
      deadlineDateKey === nowDateKey &&
      nowTimeLabel === reminderMorningTime
    ) {
      const result = await sendHomeworkNotificationToStudent({
        teacherId: assignment.teacherId,
        studentId: assignment.studentId,
        type: 'HOMEWORK_REMINDER_MORNING',
        dedupeKey: `HOMEWORK_REMINDER_MORNING:${assignment.id}`,
        text: buildHomeworkNotificationText('REMINDER_MORNING', assignment, studentTimeZone),
      });
      if (result.status === 'sent') {
        await (prisma as any).homeworkAssignment.update({
          where: { id: assignment.id },
          data: { reminderMorningSentAt: now },
        });
      }
    }

    if (
      teacher.homeworkOverdueRemindersEnabled &&
      assignment.status === 'OVERDUE' &&
      nowTimeLabel === overdueReminderTime &&
      Number(assignment.overdueReminderCount ?? 0) < overdueMaxCount
    ) {
      const lastOverdueDateKey = assignment.lastOverdueReminderAt
        ? formatInTimeZone(assignment.lastOverdueReminderAt, 'yyyy-MM-dd', { timeZone: studentTimeZone })
        : null;
      if (lastOverdueDateKey !== nowDateKey) {
        const result = await sendHomeworkNotificationToStudent({
          teacherId: assignment.teacherId,
          studentId: assignment.studentId,
          type: 'HOMEWORK_OVERDUE',
          dedupeKey: `HOMEWORK_OVERDUE:${assignment.id}:${nowDateKey}`,
          text: buildHomeworkNotificationText('OVERDUE', assignment, studentTimeZone),
        });
        if (result.status === 'sent') {
          await (prisma as any).homeworkAssignment.update({
            where: { id: assignment.id },
            data: {
              overdueReminderCount: Number(assignment.overdueReminderCount ?? 0) + 1,
              lastOverdueReminderAt: now,
            },
          });
        }
      }
    }
  }
};

const HOMEWORK_UPLOAD_TTL_SEC = 15 * 60;
const HOMEWORK_UPLOAD_DIR = path.resolve(process.cwd(), 'tmp', 'uploads');
const pendingHomeworkUploads = new Map<
  string,
  { objectKey: string; contentType: string; maxSize: number; expiresAt: number }
>();

const readRawBuffer = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const cleanupPendingHomeworkUploads = () => {
  const nowTs = Date.now();
  for (const [token, value] of pendingHomeworkUploads.entries()) {
    if (value.expiresAt <= nowTs) pendingHomeworkUploads.delete(token);
  }
};

const sanitizeFileName = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120) || 'file';

const createFilePresignUploadV2 = (req: IncomingMessage, body: Record<string, unknown>) => {
  cleanupPendingHomeworkUploads();
  const rawFileName = typeof body.fileName === 'string' ? body.fileName : 'file';
  const fileName = sanitizeFileName(rawFileName);
  const contentType = typeof body.contentType === 'string' && body.contentType.trim() ? body.contentType : 'application/octet-stream';
  const requestedSize = Number(body.size ?? 0);
  const size =
    Number.isFinite(requestedSize) && requestedSize > 0
      ? clampNumber(requestedSize, 1, 50 * 1024 * 1024)
      : 50 * 1024 * 1024;
  const token = crypto.randomUUID();
  const objectKey = `${Date.now()}_${crypto.randomUUID()}_${fileName}`;
  pendingHomeworkUploads.set(token, {
    objectKey,
    contentType,
    maxSize: size,
    expiresAt: Date.now() + HOMEWORK_UPLOAD_TTL_SEC * 1000,
  });

  // Relative URLs are resilient across localhost, tunnels and custom domains.
  // The frontend resolves them against VITE_API_BASE or current origin.
  const uploadUrl = `/api/v2/files/upload/${token}`;
  const fileUrl = `/api/v2/files/object/${objectKey}`;
  return {
    uploadUrl,
    method: 'PUT' as const,
    headers: { 'Content-Type': contentType },
    fileUrl,
    objectKey,
    expiresInSeconds: HOMEWORK_UPLOAD_TTL_SEC,
  };
};

const handlePresignedUploadPutV2 = async (req: IncomingMessage, res: ServerResponse, token: string) => {
  cleanupPendingHomeworkUploads();
  const pending = pendingHomeworkUploads.get(token);
  if (!pending || pending.expiresAt <= Date.now()) {
    res.statusCode = 410;
    return res.end('upload_token_expired');
  }
  const data = await readRawBuffer(req);
  if (data.length > pending.maxSize) {
    res.statusCode = 413;
    return res.end('payload_too_large');
  }

  const fullPath = path.join(HOMEWORK_UPLOAD_DIR, pending.objectKey);
  const normalizedRoot = path.resolve(HOMEWORK_UPLOAD_DIR);
  const normalizedPath = path.resolve(fullPath);
  if (!normalizedPath.startsWith(normalizedRoot)) {
    res.statusCode = 400;
    return res.end('invalid_object_key');
  }

  await fs.mkdir(path.dirname(normalizedPath), { recursive: true });
  await fs.writeFile(normalizedPath, data);
  pendingHomeworkUploads.delete(token);
  res.statusCode = 200;
  return res.end('ok');
};

const resolveUploadedFileContentType = (objectKey: string) => {
  const extension = path.extname(objectKey).toLowerCase();
  if (extension === '.m4a') return 'audio/mp4';
  if (extension === '.webm') return 'audio/webm';
  if (extension === '.ogg') return 'audio/ogg';
  if (extension === '.mp3') return 'audio/mpeg';
  if (extension === '.wav') return 'audio/wav';
  if (extension === '.pdf') return 'application/pdf';
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.gif') return 'image/gif';
  if (extension === '.mp4') return 'video/mp4';
  if (extension === '.mov') return 'video/quicktime';
  return 'application/octet-stream';
};

const handleUploadedFileObjectGetV2 = async (req: IncomingMessage, res: ServerResponse, objectKeyRaw: string) => {
  const objectKey = objectKeyRaw.replace(/\\/g, '/');
  const fullPath = path.join(HOMEWORK_UPLOAD_DIR, objectKey);
  const normalizedRoot = path.resolve(HOMEWORK_UPLOAD_DIR);
  const normalizedPath = path.resolve(fullPath);
  if (!normalizedPath.startsWith(normalizedRoot)) {
    return notFound(res);
  }
  try {
    const stat = await fs.stat(normalizedPath);
    const fileSize = stat.size;
    const contentType = resolveUploadedFileContentType(objectKey);
    const rangeHeader = req.headers.range;
    const file = await fs.readFile(normalizedPath);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Accept-Ranges', 'bytes');

    if (rangeHeader && fileSize > 0) {
      const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
      if (match) {
        const startRaw = match[1] ? Number(match[1]) : Number.NaN;
        const endRaw = match[2] ? Number(match[2]) : Number.NaN;
        const hasStart = Number.isFinite(startRaw);
        const hasEnd = Number.isFinite(endRaw);

        let start = hasStart ? startRaw : 0;
        let end = hasEnd ? endRaw : fileSize - 1;

        if (!hasStart && hasEnd) {
          const suffixLength = Math.max(0, endRaw);
          start = Math.max(0, fileSize - suffixLength);
          end = fileSize - 1;
        }

        if (start > end || start < 0 || end >= fileSize) {
          res.statusCode = 416;
          res.setHeader('Content-Range', `bytes */${fileSize}`);
          return res.end();
        }

        const chunk = file.subarray(start, end + 1);
        res.statusCode = 206;
        res.setHeader('Content-Length', String(chunk.length));
        res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        return res.end(chunk);
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Length', String(file.length));
    res.end(file);
  } catch {
    notFound(res);
  }
};

const AUTO_CONFIRM_GRACE_MINUTES = 5;
const AUTOMATION_TICK_MS = 5 * 60_000;
const QUIET_HOURS_START = 22;
const QUIET_HOURS_END = 9;
const QUIET_HOURS_RESUME_TIME = '09:30';

const resolveLessonEndTime = (lesson: { startAt: Date; durationMinutes: number }) =>
  new Date(lesson.startAt).getTime() + lesson.durationMinutes * 60_000;

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

const runLessonAutomationTick = async () => {
  if (isLessonAutomationRunning) return;
  isLessonAutomationRunning = true;
  try {
  const now = new Date();
  const teachers = await prisma.teacher.findMany();

  for (const teacher of teachers) {
    if (teacher.autoConfirmLessons) {
      const scheduledLessons = await prisma.lesson.findMany({
        where: { teacherId: teacher.chatId, status: 'SCHEDULED', startAt: { lt: now } },
        include: { participants: { include: { student: true } } },
      });

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
          await dispatchScheduledHomeworkAssignmentsForLesson(updatedLesson.id);
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
          // eslint-disable-next-line no-console
          console.error('Не удалось авто-подтвердить урок', error);
        }
      }
    }

    const unpaidCompleted = await prisma.lesson.findMany({
      where: {
        teacherId: teacher.chatId,
        status: 'COMPLETED',
        paymentStatus: 'UNPAID',
        paidSource: 'NONE',
      },
      include: { participants: { include: { student: true } } },
    });

    for (const lesson of unpaidCompleted) {
      try {
        await settleLessonPayments(lesson.id, teacher.chatId);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Не удалось списать баланс по уроку', error);
      }
    }

    if (!teacher.globalPaymentRemindersEnabled) continue;
    if (!teacher.studentNotificationsEnabled) continue;

    const maxCount = Math.max(0, teacher.paymentReminderMaxCount ?? 0);
    if (maxCount <= 0) continue;
    const delayHours = Number(teacher.paymentReminderDelayHours ?? 0);
    const repeatHours = Number(teacher.paymentReminderRepeatHours ?? 0);
    const delayMs = Math.max(0, delayHours) * 60 * 60 * 1000;
    const repeatMs = Math.max(0, repeatHours) * 60 * 60 * 1000;
    const completedBefore = new Date(now.getTime() - delayMs);
    const repeatBefore = new Date(now.getTime() - repeatMs);

    const reminderCandidates = await prisma.lesson.findMany({
      where: {
        teacherId: teacher.chatId,
        status: 'COMPLETED',
        paymentStatus: 'UNPAID',
        completedAt: { lte: completedBefore },
        paymentReminderCount: { lt: maxCount },
        OR: [{ lastPaymentReminderAt: null }, { lastPaymentReminderAt: { lte: repeatBefore } }],
      },
      include: { student: true },
    });

    const quietHours = resolveQuietHoursResume(now, teacher.timezone);
    if (quietHours.inQuietHours && now.getTime() < quietHours.nextSendAt.getTime()) {
      continue;
    }

    for (const lesson of reminderCandidates) {
      if (!lesson.student) continue;
      if (!lesson.student.paymentRemindersEnabled) continue;

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
        // eslint-disable-next-line no-console
        console.error('Не удалось отправить авто-напоминание об оплате', error);
      }
    }

    await runHomeworkAssignmentAutomationForTeacher(teacher, now);
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

const buildDailySummaryData = async (teacher: any, targetDate: Date, includeUnpaid: boolean) => {
  const resolvedTimeZone = resolveTimeZone(teacher.timezone);
  const dateKey = formatInTimeZone(targetDate, 'yyyy-MM-dd', { timeZone: resolvedTimeZone });
  const dayStart = toUtcDateFromTimeZone(dateKey, '00:00', resolvedTimeZone);
  const dayEnd = toUtcEndOfDay(dateKey, resolvedTimeZone);
  const summaryDate = toUtcDateFromTimeZone(dateKey, '12:00', resolvedTimeZone);

  const lessons = await prisma.lesson.findMany({
    where: {
      teacherId: teacher.chatId,
      status: 'SCHEDULED',
      startAt: { gte: dayStart, lte: dayEnd },
    },
    include: { student: true, participants: { include: { student: true } } },
    orderBy: { startAt: 'asc' },
  });

  const unpaidLessons = includeUnpaid
    ? await prisma.lesson.findMany({
        where: {
          teacherId: teacher.chatId,
          status: 'COMPLETED',
          isPaid: false,
          startAt: { lt: dayStart },
        },
        include: { student: true },
        orderBy: { startAt: 'asc' },
      })
    : [];

  const studentIds = new Set<number>();
  lessons.forEach((lesson) => {
    studentIds.add(lesson.studentId);
    lesson.participants.forEach((participant) => studentIds.add(participant.studentId));
  });
  unpaidLessons.forEach((lesson) => studentIds.add(lesson.studentId));

  const links = studentIds.size
    ? await prisma.teacherStudent.findMany({
        where: { teacherId: teacher.chatId, studentId: { in: Array.from(studentIds) } },
      })
    : [];
  const linksByStudentId = new Map<number, any>(links.map((link) => [link.studentId, link]));

  const resolveStudentName = (studentId: number, fallback?: string | null) => {
    const link = linksByStudentId.get(studentId);
    const customName = typeof link?.customName === 'string' ? link.customName.trim() : '';
    if (customName) return customName;
    const fallbackName = typeof fallback === 'string' ? fallback.trim() : '';
    return fallbackName || 'ученик';
  };

  const summaryLessons = lessons.map((lesson) => {
    const names = new Set<string>();
    names.add(resolveStudentName(lesson.studentId, lesson.student?.username));
    lesson.participants.forEach((participant) => {
      names.add(resolveStudentName(participant.studentId, participant.student?.username));
    });
    return {
      startAt: lesson.startAt,
      durationMinutes: lesson.durationMinutes,
      studentNames: Array.from(names),
    };
  });

  const summaryUnpaid = unpaidLessons.map((lesson) => ({
    startAt: lesson.startAt,
    studentName: resolveStudentName(lesson.studentId, lesson.student?.username),
    price: lesson.price ?? null,
  }));

  return {
    dateKey,
    summaryDate: Number.isNaN(summaryDate.getTime()) ? targetDate : summaryDate,
    lessons: summaryLessons,
    unpaidLessons: summaryUnpaid,
  };
};

const runNotificationTick = async () => {
  const now = new Date();
  const teachers = await prisma.teacher.findMany();

  for (const teacher of teachers) {
    if (teacher.lessonReminderEnabled) {
      const reminderMinutes = Number(teacher.lessonReminderMinutes ?? 0);
      const windowStart = new Date(now.getTime() + reminderMinutes * 60_000 - NOTIFICATION_TICK_MS);
      const windowEnd = new Date(now.getTime() + reminderMinutes * 60_000);
      const lessons = await prisma.lesson.findMany({
        where: {
          teacherId: teacher.chatId,
          status: 'SCHEDULED',
          startAt: { gte: windowStart, lt: windowEnd },
        },
      });

      for (const lesson of lessons) {
        const scheduledFor = new Date(lesson.startAt.getTime() - reminderMinutes * 60_000);
        if (!shouldSendLessonReminder(scheduledFor, now)) {
          continue;
        }
        const dedupeSuffix = formatDedupeTimeKey(scheduledFor, teacher.timezone);
        const teacherKey = `TEACHER_LESSON_REMINDER:${lesson.id}:${dedupeSuffix}`;
        const studentKey = `STUDENT_LESSON_REMINDER:${lesson.id}:${dedupeSuffix}`;
        await sendTeacherLessonReminder({
          teacherId: teacher.chatId,
          lessonId: lesson.id,
          scheduledFor,
          dedupeKey: teacherKey,
          minutesBefore: reminderMinutes,
        });
        await sendStudentLessonReminder({
          studentId: lesson.studentId,
          lessonId: lesson.id,
          scheduledFor,
          dedupeKey: studentKey,
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

const cleanupTransferTokens = async () => {
  const now = new Date();
  await prisma.transferToken.deleteMany({
    where: {
      OR: [{ usedAt: { not: null } }, { expiresAt: { lt: now } }],
    },
  });
};

const resolveNotificationLogRetentionDays = () => {
  if (!Number.isFinite(NOTIFICATION_LOG_RETENTION_DAYS) || NOTIFICATION_LOG_RETENTION_DAYS <= 0) {
    return null;
  }
  const normalized = NOTIFICATION_LOG_RETENTION_DAYS;
  return Math.min(Math.max(normalized, MIN_NOTIFICATION_LOG_RETENTION_DAYS), MAX_NOTIFICATION_LOG_RETENTION_DAYS);
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
      // eslint-disable-next-line no-console
      console.error('Не удалось очистить сессии', error);
    });
    cleanupTransferTokens().catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Не удалось очистить токены переноса', error);
    });
    cleanupNotificationLogs().catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Не удалось очистить логи уведомлений', error);
    });

    setInterval(() => {
      cleanupSessions().catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Не удалось очистить сессии', error);
      });
      cleanupTransferTokens().catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Не удалось очистить токены переноса', error);
      });
      cleanupNotificationLogs().catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Не удалось очистить логи уведомлений', error);
      });
    }, 24 * 60 * 60 * 1000);
  }, delayMs);
};

const handle = async (req: IncomingMessage, res: ServerResponse) => {
  if (!req.url) return notFound(res);

  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;
  const role = getRequestRole(req);
  const requestedStudentId = getRequestedStudentId(req);
  const requestedTeacherId = getRequestedTeacherId(req);

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Role, X-Student-Id, X-Teacher-Id');
    return res.end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const fileUploadMatch = pathname.match(/^\/api\/v2\/files\/upload\/([a-zA-Z0-9-]+)$/);
    if (req.method === 'PUT' && fileUploadMatch) {
      return handlePresignedUploadPutV2(req, res, fileUploadMatch[1]);
    }

    const fileObjectMatch = pathname.match(/^\/api\/v2\/files\/object\/(.+)$/);
    if (req.method === 'GET' && fileObjectMatch) {
      return handleUploadedFileObjectGetV2(req, res, fileObjectMatch[1]);
    }

    if (req.method === 'POST' && pathname === '/api/yookassa/webhook') {
      let payload: any;
      try {
        payload = await readBody(req);
      } catch (error) {
        console.error('[yookassa] Invalid webhook payload', error);
        return sendJson(res, 200, { ok: true });
      }

      const event = typeof payload?.event === 'string' ? payload.event : null;
      const object = payload?.object ?? null;
      const paymentId = typeof object?.id === 'string' ? object.id : null;
      const status = typeof object?.status === 'string' ? object.status : null;
      const metadata = object?.metadata ?? {};
      const telegramUserIdRaw = metadata?.telegramUserId;
      const messageIdRaw = metadata?.messageId;

      if (!paymentId || !event || status !== 'succeeded' || event !== 'payment.succeeded') {
        return sendJson(res, 200, { ok: true });
      }

      if (wasYookassaPaymentProcessed(paymentId)) {
        return sendJson(res, 200, { ok: true });
      }

      if (typeof telegramUserIdRaw !== 'string' && typeof telegramUserIdRaw !== 'number') {
        markYookassaPaymentProcessed(paymentId);
        return sendJson(res, 200, { ok: true });
      }

      let telegramUserId: bigint;
      try {
        telegramUserId = BigInt(telegramUserIdRaw);
      } catch (error) {
        markYookassaPaymentProcessed(paymentId);
        return sendJson(res, 200, { ok: true });
      }

      const user = await prisma.user.findUnique({ where: { telegramUserId } });
      if (!user) {
        markYookassaPaymentProcessed(paymentId);
        return sendJson(res, 200, { ok: true });
      }

      const now = new Date();
      const baseDate = user.subscriptionEndAt && user.subscriptionEndAt > now ? user.subscriptionEndAt : now;
      const nextEnd = addDays(baseDate, SUBSCRIPTION_MONTH_DAYS);
      await prisma.user.update({
        where: { telegramUserId },
        data: {
          subscriptionStartAt: user.subscriptionStartAt ?? now,
          subscriptionEndAt: nextEnd,
        },
      });

      markYookassaPaymentProcessed(paymentId);

      try {
        try {
          if (typeof messageIdRaw === 'number') {
            await deleteTelegramMessage(telegramUserId, messageIdRaw);
          } else if (typeof messageIdRaw === 'string') {
            const parsedMessageId = Number(messageIdRaw);
            if (Number.isFinite(parsedMessageId)) {
              await deleteTelegramMessage(telegramUserId, parsedMessageId);
            }
          }
        } catch (error) {
          console.error('[yookassa] Failed to delete subscription prompt message', error);
        }
        await sendTelegramMessage(
          telegramUserId,
          `✅ Оплата прошла успешно!\n🎉 Подписка активирована — полный доступ открыт.\n\n📅 Активна до: ${formatSubscriptionDate(nextEnd)}\n\n🧠 Меньше рутины — больше фокуса на занятиях.`,
        );
      } catch (error) {
        console.error('[yookassa] Failed to send subscription confirmation message', error);
      }

      return sendJson(res, 200, { ok: true });
    }

    const sessionUser = pathname.startsWith('/api/') ? await resolveSessionUser(req, res) : null;
    if (pathname.startsWith('/api/') && !sessionUser) {
      return sendJson(res, 401, { message: 'unauthorized' });
    }
    const apiUser = sessionUser as User | null;
    const requireApiUser = () => apiUser as User;
    if (pathname.startsWith('/api/') && apiUser && !hasActiveSubscription(apiUser) && role !== 'STUDENT') {
      return sendJson(res, 403, { message: 'subscription_required' });
    }

    if (
      await tryHandleAuthRoutes({
        req,
        res,
        pathname,
        resolveSessionUser,
        authSessionHandlers,
        authTransferHandlers,
      })
    ) {
      return;
    }

    if (req.method === 'GET' && pathname === '/api/bootstrap') {
      const lessonsStart = parseDateFilter(url.searchParams.get('lessonsStart'));
      const lessonsEnd = parseDateFilter(url.searchParams.get('lessonsEnd'));
      const includeHomeworks = url.searchParams.get('includeHomeworks') !== '0';
      const includeStudents = url.searchParams.get('includeStudents') !== '0';
      const includeLinks = url.searchParams.get('includeLinks') !== '0';
      const data = await bootstrap(requireApiUser(), {
        lessonsStart,
        lessonsEnd,
        includeHomeworks,
        includeStudents,
        includeLinks,
      });
      const filteredStudents =
        role === 'STUDENT' && requestedStudentId
          ? data.students.filter((student) => student.id === requestedStudentId)
          : data.students;
      const filteredLinks =
        role === 'STUDENT' && requestedStudentId
          ? data.links.filter((link) => link.studentId === requestedStudentId)
          : data.links;
      const filteredLessons =
        role === 'STUDENT' && requestedStudentId
          ? data.lessons.filter(
              (lesson) =>
                lesson.studentId === requestedStudentId ||
                lesson.participants?.some((participant) => participant.studentId === requestedStudentId),
            )
          : data.lessons;
      const filteredHomeworks = filterHomeworksForRole(data.homeworks, role, requestedStudentId);
      return sendJson(res, 200, {
        ...data,
        students: filteredStudents,
        links: filteredLinks,
        lessons: filteredLessons,
        homeworks: filteredHomeworks,
      });
    }

    if (req.method === 'GET' && pathname === '/api/dashboard/summary') {
      const data = await getDashboardSummary(requireApiUser());
      return sendJson(res, 200, data);
    }

    if (req.method === 'GET' && pathname === '/api/settings') {
      const data = await getSettings(requireApiUser());
      return sendJson(res, 200, data);
    }

    if (req.method === 'PATCH' && pathname === '/api/settings') {
      const body = await readBody(req);
      const data = await updateSettings(requireApiUser(), body);
      return sendJson(res, 200, data);
    }

    if (
      await tryHandleStudentV2Routes({
        req,
        res,
        pathname,
        url,
        role,
        requestedTeacherId,
        requestedStudentId,
        defaultPageSize: DEFAULT_PAGE_SIZE,
        requireApiUser,
        handlers: {
          listStudentContextV2,
          updateStudentPreferencesV2,
          getStudentHomeworkSummaryV2,
          listStudentHomeworkAssignmentsV2,
          getStudentHomeworkAssignmentDetailV2,
        },
      })
    ) {
      return;
    }

    if (
      await tryHandleHomeworkRoutesV2({
        req,
        res,
        pathname,
        url,
        role,
        requestedTeacherId,
        requestedStudentId,
        defaultPageSize: DEFAULT_PAGE_SIZE,
        requireApiUser,
        parsers: {
          parseOptionalNumberQueryParam,
          parseOptionalBooleanQueryParam,
        },
        handlers: {
          createFilePresignUploadV2,
          listHomeworkGroupsV2,
          createHomeworkGroupV2,
          updateHomeworkGroupV2,
          deleteHomeworkGroupV2,
          listHomeworkTemplatesV2,
          createHomeworkTemplateV2,
          updateHomeworkTemplateV2,
          listHomeworkAssignmentsV2,
          getHomeworkAssignmentsSummaryV2,
          createHomeworkAssignmentV2,
          bulkHomeworkAssignmentsV2,
          getHomeworkAssignmentV2,
          updateHomeworkAssignmentV2,
          deleteHomeworkAssignmentV2,
          remindHomeworkAssignmentV2,
          listHomeworkSubmissionsV2,
          createHomeworkSubmissionV2,
          openHomeworkReviewSessionV2,
          saveHomeworkReviewDraftV2,
          reviewHomeworkAssignmentV2,
        },
      })
    ) {
      return;
    }

    if (
      await tryHandleNotificationRoutes({
        req,
        res,
        pathname,
        url,
        requireApiUser,
        isNotificationTestType,
        handlers: {
          getNotificationChannelStatus,
          listNotificationTestRecipients,
          sendNotificationTest,
        },
      })
    ) {
      return;
    }

    if (
      await tryHandleSessionRoutes({
        req,
        res,
        pathname,
        requireApiUser,
        handlers: {
          listSessions,
          revokeOtherSessions,
          revokeSession,
        },
      })
    ) {
      return;
    }

    if (
      await tryHandleLessonRoutes({
        req,
        res,
        pathname,
        url,
        role,
        requestedStudentId,
        requireApiUser,
        normalizeCancelBehavior,
        isOnboardingReminderTemplate,
        handlers: {
          listUnpaidLessons,
          listLessonsForRange,
          createRecurringLessons,
          createLesson,
          updateLessonStatus,
          updateLesson,
          deleteLesson,
          markLessonCompleted,
          toggleLessonPaid,
          remindLessonPayment,
          toggleParticipantPaid,
          sendLessonReminder,
        },
      })
    ) {
      return;
    }

    if (
      await tryHandleActivityFeedRoutes({
        req,
        res,
        pathname,
        url,
        role,
        defaultPageSize: DEFAULT_PAGE_SIZE,
        requireApiUser,
        handlers: {
          parseActivityCategories,
          parseQueryDate,
          getActivityFeedUnreadStatus,
          markActivityFeedSeen,
          listActivityFeed,
        },
      })
    ) {
      return;
    }

    if (
      await tryHandleStudentRoutes({
        req,
        res,
        pathname,
        url,
        role,
        requestedStudentId,
        requireApiUser,
        handlers: {
          resolvePageParams,
          filterHomeworksForRole,
          listStudents,
          searchStudents,
          addStudent,
          updateStudent,
          archiveStudentLink,
          listStudentHomeworks,
          listStudentLessons,
          listStudentUnpaidLessons,
          listStudentPaymentReminders,
          updateStudentPaymentReminders,
          toggleAutoReminder,
          updatePricePerLesson,
          adjustBalance,
          listPaymentEventsForStudent,
        },
      })
    ) {
      return;
    }

    if (
      await tryHandleHomeworkRoutes({
        req,
        res,
        pathname,
        requireApiUser,
        handlers: {
          createHomework,
          updateHomework,
          takeHomeworkInWork,
          sendHomeworkToStudent,
          deleteHomework,
          toggleHomework,
          remindHomeworkById,
          remindHomework,
        },
      })
    ) {
      return;
    }

    return notFound(res);
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return sendJson(res, error.statusCode, { message: error.message, issues: error.issues });
    }

    const statusCodeRaw = (error as { statusCode?: unknown } | null)?.statusCode;
    const statusCode =
      typeof statusCodeRaw === 'number' && Number.isFinite(statusCodeRaw)
        ? Math.trunc(statusCodeRaw)
        : null;
    const message = error instanceof Error ? error.message : 'Unexpected error';
    const issues = Array.isArray((error as { issues?: unknown } | null)?.issues)
      ? (error as { issues: unknown[] }).issues
      : undefined;
    if (statusCode && statusCode >= 400 && statusCode <= 599) {
      return sendJson(res, statusCode, issues ? { message, issues } : { message });
    }
    return issues ? sendJson(res, 400, { message, issues }) : badRequest(res, message);
  }
};

setInterval(() => {
  runLessonAutomationTick().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Не удалось выполнить автоматические сценарии', error);
  });
}, AUTOMATION_TICK_MS);

void runLessonAutomationTick();

setInterval(() => {
  runNotificationTick().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Не удалось отправить уведомления', error);
  });
}, NOTIFICATION_TICK_MS);

void runNotificationTick();

setInterval(() => {
  runOnboardingNudgeTick().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Не удалось отправить напоминание по онбордингу', error);
  });
}, ONBOARDING_NUDGE_TICK_MS);

void runOnboardingNudgeTick();

scheduleDailySessionCleanup();

const server = http.createServer((req, res) => {
  handle(req, res);
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API server running on http://localhost:${PORT}`);
});

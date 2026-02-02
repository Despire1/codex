import 'dotenv/config';
import crypto from 'node:crypto';
import http, { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { addDays, addYears } from 'date-fns';
import prisma from './prismaClient';
import type { Student, User } from '@prisma/client';
import type { HomeworkStatus, PaymentCancelBehavior } from '../entities/types';
import { normalizeLessonColor } from '../shared/lib/lessonColors';
import {
  isValidMeetingLink,
  MEETING_LINK_MAX_LENGTH,
  normalizeMeetingLinkInput,
} from '../shared/lib/meetingLink';
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
} from '../shared/lib/notificationTemplates';
import {
  sendStudentLessonReminder,
  sendStudentPaymentReminder,
  sendTeacherLessonReminder,
  sendTeacherDailySummary,
  sendTeacherOnboardingNudge,
  sendTeacherPaymentReminderNotice,
} from './notificationService';
import { resolveStudentTelegramId } from './studentContacts';

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
const NOTIFICATION_LOG_RETENTION_DAYS = Number(process.env.NOTIFICATION_LOG_RETENTION_DAYS ?? 30);
const MIN_NOTIFICATION_LOG_RETENTION_DAYS = 7;
const MAX_NOTIFICATION_LOG_RETENTION_DAYS = 30;
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

const sendJson = (res: ServerResponse, status: number, payload: unknown) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.end(JSON.stringify(serializeBigInt(payload)));
};

const notFound = (res: ServerResponse) => sendJson(res, 404, { message: 'Not found' });

const badRequest = (res: ServerResponse, message: string) => sendJson(res, 400, { message });

const serializeBigInt = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (_, v) => {
      if (typeof v === 'bigint') return Number(v);
      if (v instanceof Date) return v.toISOString();
      return v;
    }),
  );

const readBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {} as Record<string, unknown>;
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error('Invalid JSON body');
  }
};

const parseCookies = (header?: string) => {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  header.split(';').forEach((part) => {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey) return;
    cookies[rawKey] = decodeURIComponent(rawValue.join('='));
  });
  return cookies;
};

const buildCookie = (name: string, value: string, options: { maxAgeSeconds?: number; secure?: boolean } = {}) => {
  const segments = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (options.secure ?? true) {
    segments.push('Secure');
  }
  if (options.maxAgeSeconds !== undefined) {
    segments.push(`Max-Age=${options.maxAgeSeconds}`);
  }
  return segments.join('; ');
};

const getRequestIp = (req: IncomingMessage) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() ?? '';
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0] ?? '';
  }
  return req.socket.remoteAddress ?? '';
};

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

const randomToken = (lengthBytes = 32) => crypto.randomBytes(lengthBytes).toString('base64url');

const getForwardedHost = (req: IncomingMessage) => {
  const forwardedHost = req.headers['x-forwarded-host'];
  if (typeof forwardedHost === 'string') {
    return forwardedHost.split(',')[0]?.trim() ?? '';
  }
  if (Array.isArray(forwardedHost)) {
    return forwardedHost[0] ?? '';
  }
  return '';
};

const getBaseUrl = (req: IncomingMessage) => {
  const configured = process.env.APP_BASE_URL ?? process.env.PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');
  const forwardedHost = getForwardedHost(req);
  const host = forwardedHost || req.headers.host || `localhost:${PORT}`;
  const isLocalhost = host.includes('localhost') || host.startsWith('127.0.0.1');
  const forwardedProto = typeof req.headers['x-forwarded-proto'] === 'string' ? req.headers['x-forwarded-proto'] : '';
  const forwardedProtocol = forwardedProto.split(',')[0];
  const protocol = isLocalhost ? 'http' : forwardedProtocol || 'https';
  return `${protocol}://${host}`;
};

const isLocalhostRequest = (req: IncomingMessage) => {
  const forwardedHost = getForwardedHost(req);
  const host = forwardedHost || req.headers.host || '';
  return host.includes('localhost') || host.startsWith('127.0.0.1');
};

const isSecureRequest = (req: IncomingMessage) => {
  const isLocalhost = isLocalhostRequest(req);
  if (isLocalhost) return false;
  const forwardedProto = typeof req.headers['x-forwarded-proto'] === 'string' ? req.headers['x-forwarded-proto'] : '';
  const forwardedProtocol = forwardedProto.split(',')[0]?.trim();
  if (forwardedProtocol) return forwardedProtocol === 'https';
  return true;
};

const verifyTelegramInitData = (initData: string) => {
  if (!TELEGRAM_BOT_TOKEN) {
    return { ok: false, reason: 'signature_invalid' as const };
  }
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) {
    return { ok: false, reason: 'signature_invalid' as const };
  }
  params.delete('hash');
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(TELEGRAM_BOT_TOKEN).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  const actualBuffer = Buffer.from(hash, 'hex');
  if (expectedBuffer.length !== actualBuffer.length) {
    return { ok: false, reason: 'signature_invalid' as const };
  }
  if (!crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    return { ok: false, reason: 'signature_invalid' as const };
  }
  return { ok: true as const, params };
};

const getSessionUser = async (req: IncomingMessage) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;
  const tokenHash = hashToken(token);
  const now = new Date();
  const session = await prisma.session.findFirst({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
    include: { user: true },
  });
  return session?.user ?? null;
};

const ensureLocalDevUser = async () => {
  const existing = await prisma.user.findUnique({ where: { telegramUserId: LOCAL_DEV_TELEGRAM_ID } });
  if (existing) {
    if (!existing.subscriptionStartAt) {
      return prisma.user.update({
        where: { id: existing.id },
        data: { subscriptionStartAt: new Date(), subscriptionEndAt: null },
      });
    }
    return existing;
  }
  return prisma.user.create({
    data: {
      telegramUserId: LOCAL_DEV_TELEGRAM_ID,
      username: LOCAL_DEV_USERNAME,
      firstName: LOCAL_DEV_FIRST_NAME,
      lastName: LOCAL_DEV_LAST_NAME,
      role: 'TEACHER',
      subscriptionStartAt: new Date(),
    },
  });
};

const resolveSessionUser = async (req: IncomingMessage, res: ServerResponse) => {
  const sessionUser = await getSessionUser(req);
  if (sessionUser) return sessionUser;
  if (!LOCAL_AUTH_BYPASS || !isLocalhostRequest(req)) return null;
  const localUser = await ensureLocalDevUser();
  await createSession(localUser.id, req, res);
  return localUser;
};

const getSessionTokenHash = (req: IncomingMessage) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;
  return hashToken(token);
};

const createSession = async (userId: number, req: IncomingMessage, res: ServerResponse) => {
  const ttlMinutes = Number.isFinite(SESSION_TTL_MINUTES) ? SESSION_TTL_MINUTES : 1440;
  const token = randomToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      ip: getRequestIp(req) || null,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    },
  });
  res.setHeader(
    'Set-Cookie',
    buildCookie(SESSION_COOKIE_NAME, token, { maxAgeSeconds: ttlMinutes * 60, secure: isSecureRequest(req) }),
  );
  return { expiresAt };
};

type RateLimitEntry = { count: number; resetAt: number };
const rateLimitStore = new Map<string, RateLimitEntry>();

const isRateLimited = (key: string, limit: number, windowMs: number) => {
  const now = Date.now();
  const existing = rateLimitStore.get(key);
  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  if (existing.count >= limit) return true;
  existing.count += 1;
  return false;
};

const clampNumber = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const isValidTimeString = (value: string) => /^\d{2}:\d{2}$/.test(value);

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
});

const getSettings = async (user: User) => {
  const teacher = await ensureTeacher(user);
  return { settings: pickTeacherSettings(teacher) };
};

const updateSettings = async (user: User, body: any) => {
  const teacher = await ensureTeacher(user);
  const data: Record<string, any> = {};

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

  if (Object.keys(data).length === 0) {
    return { settings: pickTeacherSettings(teacher) };
  }

  const updatedTeacher = await prisma.teacher.update({
    where: { chatId: teacher.chatId },
    data,
  });

  return { settings: pickTeacherSettings(updatedTeacher) };
};

const listSessions = async (user: User, req: IncomingMessage) => {
  const tokenHash = getSessionTokenHash(req);
  const now = new Date();
  const sessions = await prisma.session.findMany({
    where: { userId: user.id, revokedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
  });

  return {
    sessions: sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      ip: session.ip,
      userAgent: session.userAgent,
      isCurrent: tokenHash ? session.tokenHash === tokenHash : false,
    })),
  };
};

const revokeSession = async (user: User, sessionId: number) => {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== user.id) {
    throw new Error('Сессия не найдена');
  }
  const updated = await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
  return { status: 'ok', sessionId: updated.id };
};

const revokeOtherSessions = async (user: User, req: IncomingMessage) => {
  const tokenHash = getSessionTokenHash(req);
  const result = await prisma.session.updateMany({
    where: {
      userId: user.id,
      revokedAt: null,
      ...(tokenHash ? { tokenHash: { not: tokenHash } } : {}),
    },
    data: { revokedAt: new Date() },
  });
  return { status: 'ok', revoked: result.count };
};

const searchStudents = async (user: User, query?: string, filter?: 'all' | 'pendingHomework' | 'noReminder') => {
  const teacher = await ensureTeacher(user);
  const normalizedQuery = query?.trim().toLowerCase();

  const links = await prisma.teacherStudent.findMany({ where: { teacherId: teacher.chatId, isArchived: false } });
  const students = await prisma.student.findMany({
    where: {
      teacherLinks: {
        some: {
          teacherId: teacher.chatId,
          isArchived: false,
        },
      },
    },
  });

  const filteredLinks = links.filter((link) => {
    const student = students.find((s) => s.id === link.studentId);
    if (!student) return false;

    const matchesQuery = !normalizedQuery
      ? true
      : link.customName.toLowerCase().includes(normalizedQuery) ||
        (student.username ?? '').toLowerCase().includes(normalizedQuery);

    if (!matchesQuery) return false;

    if (filter === 'noReminder') return !link.autoRemindHomework;

    if (filter === 'pendingHomework') {
      // Homeworks will be filtered below; preliminary include all to evaluate after fetch.
      return true;
    }

    return true;
  });

  const studentIds = filteredLinks.map((link) => link.studentId);

  const homeworks = await prisma.homework.findMany({
    where: {
      teacherId: teacher.chatId,
      studentId: studentIds.length ? { in: studentIds } : { in: [-1] },
    },
  });

  const withPending = filteredLinks.filter((link) => {
    if (filter !== 'pendingHomework') return true;
    return homeworks.some((hw) => hw.studentId === link.studentId && !hw.isDone);
  });

  return {
    students: students
      .filter((student) => withPending.some((link) => link.studentId === student.id))
      .map((student) => student),
    links: withPending,
    homeworks,
  };
};

const resolvePageParams = (url: URL) => {
  const limitRaw = Number(url.searchParams.get('limit') ?? DEFAULT_PAGE_SIZE);
  const offsetRaw = Number(url.searchParams.get('offset') ?? 0);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.floor(offsetRaw) : 0;
  return { limit, offset };
};

const isHomeworkDone = (homework: any) => normalizeTeacherStatus(homework.status) === 'DONE' || homework.isDone;

const isHomeworkOverdue = (homework: any, todayStart: Date) => {
  if (!homework.deadline) return false;
  if (isHomeworkDone(homework)) return false;
  return new Date(homework.deadline).getTime() < todayStart.getTime();
};

const buildHomeworkStats = (homeworks: any[], todayStart: Date) => {
  let pendingHomeworkCount = 0;
  let overdueHomeworkCount = 0;
  const totalHomeworkCount = homeworks.length;

  homeworks.forEach((homework) => {
    if (!isHomeworkDone(homework)) {
      pendingHomeworkCount += 1;
    }
    if (isHomeworkOverdue(homework, todayStart)) {
      overdueHomeworkCount += 1;
    }
  });

  return { pendingHomeworkCount, overdueHomeworkCount, totalHomeworkCount };
};

const normalizeTelegramUsername = (username?: string | null) => {
  if (!username) return null;
  const trimmed = username.trim();
  if (!trimmed) return null;
  const withoutAt = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  return withoutAt.trim().toLowerCase() || null;
};

const findUserByTelegramUsername = async (normalizedUsername: string) => {
  const candidates = await prisma.user.findMany({
    where: { username: { contains: normalizedUsername } },
  });
  return candidates.find((user) => normalizeTelegramUsername(user.username) === normalizedUsername) ?? null;
};

const listStudents = async (
  user: User,
  query?: string,
  filter?: 'all' | 'debt' | 'overdue',
  limit = DEFAULT_PAGE_SIZE,
  offset = 0,
) => {
  const teacher = await ensureTeacher(user);
  const normalizedQuery = query?.trim();
  const normalizedQueryLower = normalizedQuery?.toLowerCase();
  const where: any = { teacherId: teacher.chatId, isArchived: false };

  if (normalizedQuery) {
    where.OR = [
      { customName: { contains: normalizedQuery } },
      { student: { username: { contains: normalizedQuery } } },
    ];
  }

  let links = await prisma.teacherStudent.findMany({
    where,
    include: { student: true },
    orderBy: { customName: 'asc' },
  });
  if (normalizedQueryLower) {
    links = links.filter((link) => {
      const customName = link.customName?.toLowerCase() ?? '';
      const username = link.student?.username?.toLowerCase() ?? '';
      return customName.includes(normalizedQueryLower) || username.includes(normalizedQueryLower);
    });
  }

  const studentIds = links.map((link) => link.studentId);
  const homeworks = studentIds.length
    ? await prisma.homework.findMany({
        where: { teacherId: teacher.chatId, studentId: { in: studentIds } },
      })
    : [];

  const homeworksByStudent = new Map<number, any[]>();
  homeworks.forEach((homework) => {
    const existing = homeworksByStudent.get(homework.studentId) ?? [];
    existing.push(homework);
    homeworksByStudent.set(homework.studentId, existing);
  });

  const todayStart = getTimeZoneStartOfDay(new Date(), teacher.timezone);

  const statsByStudent = new Map<number, ReturnType<typeof buildHomeworkStats>>();
  links.forEach((link) => {
    const stats = buildHomeworkStats(homeworksByStudent.get(link.studentId) ?? [], todayStart);
    statsByStudent.set(link.studentId, stats);
  });

  const filteredLinks = links.filter((link) => {
    const stats = statsByStudent.get(link.studentId) ?? { pendingHomeworkCount: 0, overdueHomeworkCount: 0, totalHomeworkCount: 0 };
    if (filter === 'debt') return link.balanceLessons < 0;
    if (filter === 'overdue') return stats.overdueHomeworkCount > 0;
    return true;
  });

  const total = filteredLinks.length;
  const pageItems = filteredLinks.slice(offset, offset + limit).map((link) => {
    const { student, ...linkData } = link;
    return {
      student,
      link: linkData,
      stats: statsByStudent.get(link.studentId) ?? { pendingHomeworkCount: 0, overdueHomeworkCount: 0, totalHomeworkCount: 0 },
    };
  });

  const debtSummariesByStudent = new Map<number, { total: number; count: number }>();
  const reminderCountsByStudent = new Map<number, number>();
  if (pageItems.length) {
    const debtResults = await Promise.all(
      pageItems.map(async (item) => {
        try {
          const summary = await resolveStudentDebtSummary(teacher.chatId, item.student.id);
          return { studentId: item.student.id, total: summary.total, count: summary.items.length };
        } catch {
          return { studentId: item.student.id, total: 0, count: 0 };
        }
      }),
    );

    debtResults.forEach((result) => {
      if (result.total > 0 || result.count > 0) {
        debtSummariesByStudent.set(result.studentId, { total: result.total, count: result.count });
      }
    });
  }

  if (pageItems.length) {
    const reminderCounts = await prisma.notificationLog.findMany({
      where: {
        teacherId: teacher.chatId,
        lessonId: { not: null },
        type: 'PAYMENT_REMINDER_STUDENT',
        studentId: { in: pageItems.map((item) => item.student.id) },
      },
      select: { studentId: true },
    });

    reminderCounts.forEach((reminder) => {
      if (!reminder.studentId) return;
      reminderCountsByStudent.set(
        reminder.studentId,
        (reminderCountsByStudent.get(reminder.studentId) ?? 0) + 1,
      );
    });
  }

  const items = pageItems.map((item) => {
    const debtSummary = debtSummariesByStudent.get(item.student.id);
    const paymentRemindersCount = reminderCountsByStudent.get(item.student.id) ?? null;
    if (!debtSummary) {
      return {
        ...item,
        paymentRemindersCount,
      };
    }
    return {
      ...item,
      debtRub: debtSummary.total > 0 ? debtSummary.total : null,
      debtLessonCount: debtSummary.count > 0 ? debtSummary.count : null,
      paymentRemindersCount,
    };
  });

  const nextOffset = offset + limit < total ? offset + limit : null;
  const counts = {
    withDebt: links.filter((link) => link.balanceLessons < 0).length,
    overdue: links.filter((link) => (statsByStudent.get(link.studentId)?.overdueHomeworkCount ?? 0) > 0).length,
  };

  return { items, total, nextOffset, counts };
};

const listStudentHomeworks = async (
  user: User,
  studentId: number,
  filter: 'all' | HomeworkStatus | 'overdue' = 'all',
  limit = DEFAULT_PAGE_SIZE,
  offset = 0,
) => {
  const teacher = await ensureTeacher(user);
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
  });
  if (!link || link.isArchived) throw new Error('Ученик не найден у текущего преподавателя');

  const where: any = { teacherId: teacher.chatId, studentId };
  if (filter === 'overdue') {
    const todayStart = getTimeZoneStartOfDay(new Date(), teacher.timezone);
    where.deadline = { lt: todayStart };
    where.isDone = false;
    where.NOT = { status: 'DONE' };
  } else if (filter && filter !== 'all') {
    where.status = filter;
  }

  const total = await prisma.homework.count({ where });
  const items = await prisma.homework.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: offset,
    take: limit,
  });
  const nextOffset = offset + limit < total ? offset + limit : null;
  return { items, total, nextOffset };
};

const parseDateFilter = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const resolveStudentDebtSummary = async (teacherId: number, studentId: number) => {
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId, studentId } },
  });
  const now = new Date();
  const lessons = await prisma.lesson.findMany({
    where: {
      teacherId,
      status: { not: 'CANCELED' },
      OR: [{ status: 'COMPLETED' }, { startAt: { lt: now } }],
      participants: {
        some: {
          studentId,
          isPaid: false,
        },
      },
    },
    include: {
      participants: true,
    },
    orderBy: { startAt: 'asc' },
  });

  const items = lessons.map((lesson) => {
    const participant = lesson.participants.find((item) => item.studentId === studentId);
    const participantPrice =
      typeof participant?.price === 'number' && participant.price > 0 ? participant.price : null;
    const fallbackPrice =
      typeof link?.pricePerLesson === 'number' && link.pricePerLesson > 0
        ? link.pricePerLesson
        : typeof lesson.price === 'number' && lesson.price > 0
          ? lesson.price
          : null;
    const price = participantPrice ?? fallbackPrice;
    return {
      id: lesson.id,
      startAt: lesson.startAt,
      status: lesson.status,
      price,
      lastPaymentReminderAt: lesson.lastPaymentReminderAt,
    };
  });

  const total = items.reduce((sum, item) => sum + (item.price ?? 0), 0);

  return { items, total };
};

const listStudentUnpaidLessons = async (user: User, studentId: number) => {
  const teacher = await ensureTeacher(user);
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
  });
  if (!link || link.isArchived) throw new Error('Ученик не найден у текущего преподавателя');

  return resolveStudentDebtSummary(teacher.chatId, studentId);
};

const listStudentPaymentReminders = async (user: User, studentId: number, limit = 10) => {
  const teacher = await ensureTeacher(user);
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
  });
  if (!link || link.isArchived) throw new Error('Ученик не найден у текущего преподавателя');

  const safeLimit = clampNumber(limit, 1, 50);
  const reminders = await prisma.notificationLog.findMany({
    where: {
      teacherId: teacher.chatId,
      studentId,
      lessonId: { not: null },
      type: 'PAYMENT_REMINDER_STUDENT',
    },
    orderBy: { createdAt: 'desc' },
    take: safeLimit,
  });

  return {
    reminders: reminders.map((reminder) => ({
      id: reminder.id,
      lessonId: reminder.lessonId!,
      createdAt: reminder.createdAt,
      status: reminder.status,
      source: reminder.source ?? 'AUTO',
    })),
  };
};

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
) => {
  const teacher = await ensureTeacher(user);
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
  });
  if (!link || link.isArchived) throw new Error('Ученик не найден у текущего преподавателя');

  const participantWhere: Record<string, any> = { studentId };
  if (filters.payment === 'paid') {
    participantWhere.isPaid = true;
  }
  if (filters.payment === 'unpaid') {
    participantWhere.isPaid = false;
  }

  const where: Record<string, any> = {
    teacherId: teacher.chatId,
    participants: {
      some: participantWhere,
    },
  };

  if (filters.status === 'completed') {
    where.status = 'COMPLETED';
  }

  if (filters.status === 'not_completed') {
    where.status = { not: 'COMPLETED' };
  }

  const startFrom = parseDateFilter(filters.startFrom);
  const startTo = parseDateFilter(filters.startTo);
  if (startFrom || startTo) {
    where.startAt = {};
    if (startFrom) where.startAt.gte = startFrom;
    if (startTo) where.startAt.lte = startTo;
  }

  const items = await prisma.lesson.findMany({
    where,
    include: {
      participants: {
        include: {
          student: true,
        },
      },
    },
    orderBy: { startAt: filters.sort === 'asc' ? 'asc' : 'desc' },
  });

  const debt = await resolveStudentDebtSummary(teacher.chatId, studentId);

  return { items, debt };
};

const bootstrap = async (user: User, filters?: { lessonsStart?: Date | null; lessonsEnd?: Date | null }) => {
  const teacher = await ensureTeacher(user);
  const links = await prisma.teacherStudent.findMany({ where: { teacherId: teacher.chatId, isArchived: false } });
  const students = await prisma.student.findMany({
    where: {
      teacherLinks: {
        some: {
          teacherId: teacher.chatId,
          isArchived: false,
        },
      },
    },
  });
  const homeworks = await prisma.homework.findMany({ where: { teacherId: teacher.chatId } });
  const lessonsWhere: Record<string, any> = { teacherId: teacher.chatId };
  if (filters?.lessonsStart || filters?.lessonsEnd) {
    lessonsWhere.startAt = {};
    if (filters.lessonsStart) lessonsWhere.startAt.gte = filters.lessonsStart;
    if (filters.lessonsEnd) lessonsWhere.startAt.lte = filters.lessonsEnd;
  }
  const lessons = await prisma.lesson.findMany({
    where: lessonsWhere,
    include: {
      participants: {
        include: {
          student: true,
        },
      },
    },
  });

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
  const linkMap = new Map(links.map((link) => [link.studentId, link]));

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

const addStudent = async (user: User, body: any) => {
  const { customName, username, pricePerLesson } = body ?? {};
  if (!customName || typeof customName !== 'string' || !customName.trim()) {
    throw new Error('Имя ученика обязательно');
  }
  if (!username || typeof username !== 'string' || !normalizeTelegramUsername(username)) {
    throw new Error('Telegram username обязателен');
  }
  if (!Number.isFinite(Number(pricePerLesson)) || Number(pricePerLesson) < 0) {
    throw new Error('Цена занятия обязательна и должна быть неотрицательной');
  }

  const teacher = await ensureTeacher(user);
  const normalizedUsername = typeof username === 'string' ? normalizeTelegramUsername(username) : null;
  if (!normalizedUsername) throw new Error('Telegram username обязателен');
  const existingStudent = normalizedUsername
    ? await prisma.student.findFirst({ where: { username: normalizedUsername } })
    : null;

  const normalizedPrice = Math.round(Number(pricePerLesson));
  let student =
    existingStudent ||
    (await prisma.student.create({
      data: {
        username: normalizedUsername,
        pricePerLesson: normalizedPrice,
      },
    }));

  if (normalizedUsername && (!student.telegramId || !student.isActivated)) {
    const matchedUser = await findUserByTelegramUsername(normalizedUsername);
    if (matchedUser) {
      student = await prisma.student.update({
        where: { id: student.id },
        data: {
          telegramId: matchedUser.telegramUserId,
          isActivated: true,
          activatedAt: new Date(),
        },
      });
    }
  }

  const existingLink = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId: student.id } },
  });

  if (existingLink) {
    if (existingLink.isArchived) {
      const restoredLink = await prisma.teacherStudent.update({
        where: { teacherId_studentId: { teacherId: teacher.chatId, studentId: student.id } },
        data: { isArchived: false, customName, pricePerLesson: normalizedPrice },
      });
      return { student, link: restoredLink };
    }
    return { student, link: existingLink };
  }

  const link = await prisma.teacherStudent.create({
    data: {
      teacherId: teacher.chatId,
      studentId: student.id,
      customName,
      autoRemindHomework: true,
      balanceLessons: 0,
      pricePerLesson: normalizedPrice,
    },
  });
  return { student, link };
};

const updateStudent = async (user: User, studentId: number, body: any) => {
  const { customName, username, pricePerLesson } = body ?? {};
  if (!customName || typeof customName !== 'string' || !customName.trim()) {
    throw new Error('Имя ученика обязательно');
  }
  if (!username || typeof username !== 'string' || !normalizeTelegramUsername(username)) {
    throw new Error('Telegram username обязателен');
  }
  const numericPrice = Number(pricePerLesson);
  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    throw new Error('Цена занятия обязательна и должна быть неотрицательной');
  }

  const teacher = await ensureTeacher(user);
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
  });
  if (!link || link.isArchived) throw new Error('Ученик не найден у текущего преподавателя');

  const normalizedUsername = normalizeTelegramUsername(typeof username === 'string' ? username : null);
  if (!normalizedUsername) throw new Error('Telegram username обязателен');
  const matchedUser = await findUserByTelegramUsername(normalizedUsername);

  const [student, updatedLink] = await prisma.$transaction([
    prisma.student.update({
      where: { id: studentId },
      data: {
        username: normalizedUsername,
        ...(matchedUser
          ? {
              telegramId: matchedUser.telegramUserId,
              isActivated: true,
              activatedAt: new Date(),
            }
          : {}),
      },
    }),
    prisma.teacherStudent.update({
      where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
      data: { customName: customName.trim(), pricePerLesson: Math.round(numericPrice) },
    }),
  ]);

  return { student, link: updatedLink };
};

const archiveStudentLink = async (user: User, studentId: number) => {
  const teacher = await ensureTeacher(user);
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
  });
  if (!link || link.isArchived) throw new Error('Ученик не найден у текущего преподавателя');

  return prisma.teacherStudent.update({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
    data: { isArchived: true },
  });
};

const toggleAutoReminder = async (user: User, studentId: number, value: boolean) => {
  const teacher = await ensureTeacher(user);
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
  });
  if (!link || link.isArchived) throw new Error('Student link not found');
  return prisma.teacherStudent.update({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
    data: { autoRemindHomework: value },
  });
};

const updateStudentPaymentReminders = async (user: User, studentId: number, enabled: boolean) => {
  const teacher = await ensureTeacher(user);
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
  });
  if (!link || link.isArchived) throw new Error('Ученик не найден у текущего преподавателя');
  const student = await prisma.student.update({
    where: { id: studentId },
    data: { paymentRemindersEnabled: enabled },
  });
  return { student };
};

const updatePricePerLesson = async (user: User, studentId: number, value: number) => {
  if (Number.isNaN(value) || value < 0) {
    throw new Error('Цена должна быть неотрицательным числом');
  }
  const teacher = await ensureTeacher(user);
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
  });
  if (!link || link.isArchived) throw new Error('Ученик не найден у текущего преподавателя');

  return prisma.teacherStudent.update({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
    data: { pricePerLesson: Math.round(value) },
  });
};

const adjustBalance = async (
  user: User,
  studentId: number,
  payload: { delta: number; type?: string; comment?: string; createdAt?: string },
) => {
  const teacher = await ensureTeacher(user);
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
    include: { student: true },
  });
  if (!link || link.isArchived) throw new Error('Student link not found');
  const delta = Number(payload.delta ?? 0);
  if (!Number.isFinite(delta)) {
    throw new Error('Некорректное значение баланса');
  }
  const nextBalance = link.balanceLessons + delta;
  const updatedLink = await prisma.teacherStudent.update({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
    data: { balanceLessons: nextBalance },
  });
  if (delta !== 0) {
    const type = payload.type?.toString().trim() || (delta > 0 ? 'TOP_UP' : 'ADJUSTMENT');
    const createdAt = payload.createdAt ? new Date(payload.createdAt) : new Date();
    const resolvedDate = Number.isNaN(createdAt.getTime()) ? new Date() : createdAt;
    const comment = typeof payload.comment === 'string' && payload.comment.trim() ? payload.comment.trim() : null;
    await prisma.paymentEvent.create({
      data: {
        studentId,
        teacherId: teacher.chatId,
        lessonId: null,
        type,
        lessonsDelta: delta,
        priceSnapshot: link.pricePerLesson ?? 0,
        moneyAmount: null,
        createdAt: resolvedDate,
        createdBy: 'TEACHER',
        reason: 'BALANCE_ADJUSTMENT',
        comment,
      },
    });
  }
  return updatedLink;
};

const listPaymentEventsForStudent = async (
  user: User,
  studentId: number,
  options?: { filter?: string; date?: string },
) => {
  const teacher = await ensureTeacher(user);
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
  });

  if (!link || link.isArchived) throw new Error('Ученик не найден у текущего преподавателя');

  const filter = options?.filter ?? 'all';
  const where: Record<string, any> = {
    studentId,
    OR: [
      { teacherId: teacher.chatId },
      { teacherId: null, lesson: { teacherId: teacher.chatId } },
    ],
  };

  if (filter === 'topup') {
    where.AND = [
      {
        OR: [
          { type: { in: ['TOP_UP', 'SUBSCRIPTION', 'OTHER'] } },
          { type: 'ADJUSTMENT', lessonsDelta: { gt: 0 } },
        ],
      },
    ];
  } else if (filter === 'manual') {
    where.AND = [
      {
        OR: [{ type: 'MANUAL_PAID' }, { reason: 'BALANCE_ADJUSTMENT' }],
      },
    ];
  } else if (filter === 'charges') {
    where.AND = [
      {
        OR: [
          { type: 'AUTO_CHARGE' },
          { type: 'ADJUSTMENT', lessonsDelta: { lt: 0 } },
          { type: 'MANUAL_PAID', lessonsDelta: { lt: 0 } },
        ],
      },
    ];
  }

  if (options?.date) {
    const parsed = new Date(`${options.date}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      const start = new Date(parsed);
      const end = new Date(parsed);
      end.setDate(end.getDate() + 1);
      where.createdAt = { gte: start, lt: end };
    }
  }

  const events = await prisma.paymentEvent.findMany({
    where,
    include: { lesson: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

  return events;
};

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
    const updatedLinks: any[] = [];
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
      updatedLinks.push(savedLink);

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

    return { lesson: updatedLesson, links: updatedLinks };
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

  return prisma.homework.create({
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
};

const toggleHomework = async (user: User, homeworkId: number) => {
  const teacher = await ensureTeacher(user);
  const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });
  if (!homework || homework.teacherId !== teacher.chatId) throw new Error('Домашнее задание не найдено');

  const nextIsDone = !homework.isDone;
  const nextStatus = nextIsDone ? 'DONE' : 'ASSIGNED';

  return prisma.homework.update({
    where: { id: homeworkId },
    data: {
      isDone: nextIsDone,
      status: nextStatus,
      completedAt: nextIsDone ? new Date() : null,
    },
  });
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

  return prisma.homework.update({ where: { id: homeworkId }, data: payload });
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

  return prisma.homework.update({
    where: { id: homeworkId },
    data: {
      status: 'IN_PROGRESS',
      isDone: false,
      takenAt: new Date(),
      takenByStudentId: requesterStudentId,
    },
  });
};

const deleteHomework = async (user: User, homeworkId: number) => {
  const teacher = await ensureTeacher(user);
  const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });
  if (!homework || homework.teacherId !== teacher.chatId) throw new Error('Домашнее задание не найдено');

  await prisma.homework.delete({ where: { id: homeworkId } });
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
  });
  const basePrice = links.find((link) => link.studentId === studentIds[0])?.pricePerLesson ?? 0;
  const markPaid = Boolean(body?.isPaid || body?.markPaid);

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

    return updated;
  }

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
  });

  const basePrice = links.find((link) => link.studentId === studentIds[0])?.pricePerLesson ?? 0;
  const markPaid = Boolean(body?.isPaid || body?.markPaid);

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

  const students = await prisma.student.findMany({
    where: { id: { in: ids } },
  });

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

    return prisma.lesson.update({
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

  return prisma.lesson.update({
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
};

const deleteLesson = async (user: User, lessonId: number, applyToSeries?: boolean) => {
  const teacher = await ensureTeacher(user);
  const lesson = (await prisma.lesson.findUnique({ where: { id: lessonId } })) as any;
  if (!lesson || lesson.teacherId !== teacher.chatId) throw new Error('Урок не найден');

  if (applyToSeries && lesson.isRecurring && lesson.recurrenceGroupId) {
    const deleted = await (prisma.lesson as any).deleteMany({
      where: { teacherId: teacher.chatId, recurrenceGroupId: lesson.recurrenceGroupId },
    });
    return { deletedIds: [], deletedCount: deleted?.count ?? 0 };
  }

  await (prisma.lesson as any).delete({ where: { id: lessonId } });
  return { deletedIds: [lessonId], deletedCount: 1 };
};

const markLessonCompleted = async (user: User, lessonId: number) => {
  const teacher = await ensureTeacher(user);
  const { lesson, links } = await settleLessonPayments(lessonId, teacher.chatId);
  const primaryLink = links.find((link: any) => link.studentId === lesson.studentId) ?? null;
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

  if (normalizedStatus === 'COMPLETED') {
    return settleLessonPayments(lessonId, teacher.chatId);
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
      const autoChargeStudentIds = Array.from(new Set(autoChargeEvents.map((event: any) => event.studentId)));
      const links = autoChargeStudentIds.length
        ? await tx.teacherStudent.findMany({
            where: { teacherId: teacher.chatId, studentId: { in: autoChargeStudentIds }, isArchived: false },
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
          isPaid: normalizedStatus === 'COMPLETED' ? participantsPaid : false,
          paymentStatus: normalizedStatus === 'COMPLETED' ? (participantsPaid ? 'PAID' : 'UNPAID') : 'UNPAID',
          paidSource: normalizedStatus === 'COMPLETED' && participantsPaid ? 'MANUAL' : 'NONE',
        },
        include: { participants: { include: { student: true } } },
      });

      return { lesson: updatedLesson, links };
    });

    return result;
  }

  const updatedLesson = await prisma.lesson.update({
    where: { id: lessonId },
    data: { status: normalizedStatus, isPaid: false, paymentStatus: 'UNPAID', paidSource: 'NONE' },
    include: { participants: { include: { student: true } } },
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
      studentId: lesson.studentId,
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

  return { status: 'queued', homework: result };
};

const AUTO_CONFIRM_GRACE_MINUTES = 30;
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
  const now = new Date();
  const teachers = await prisma.teacher.findMany();

  for (const teacher of teachers) {
    if (teacher.autoConfirmLessons) {
      const scheduledLessons = await prisma.lesson.findMany({
        where: { teacherId: teacher.chatId, status: 'SCHEDULED', startAt: { lt: now } },
      });

      const dueLessons = scheduledLessons.filter((lesson) => {
        const lessonEnd = resolveLessonEndTime(lesson);
        return lessonEnd + AUTO_CONFIRM_GRACE_MINUTES * 60_000 <= now.getTime();
      });

      for (const lesson of dueLessons) {
        try {
          await prisma.lesson.update({
            where: { id: lesson.id },
            data: { status: 'COMPLETED', completedAt: lesson.completedAt ?? now },
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

    const reminderCandidates = await prisma.lesson.findMany({
      where: {
        teacherId: teacher.chatId,
        status: 'COMPLETED',
        paymentStatus: 'UNPAID',
        completedAt: { not: null },
        paymentReminderCount: { lt: teacher.paymentReminderMaxCount },
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
      if (!lesson.student.isActivated || !lesson.student.telegramId) continue;
      if (!lesson.completedAt) continue;

      const delayMs = teacher.paymentReminderDelayHours * 60 * 60 * 1000;
      if (now.getTime() < lesson.completedAt.getTime() + delayMs) {
        continue;
      }

      if (lesson.lastPaymentReminderAt) {
        const repeatMs = teacher.paymentReminderRepeatHours * 60 * 60 * 1000;
        if (now.getTime() < lesson.lastPaymentReminderAt.getTime() + repeatMs) {
          continue;
        }
      }

      try {
        const result = await sendStudentPaymentReminder({
          studentId: lesson.studentId,
          lessonId: lesson.id,
          source: 'AUTO',
        });

        if (result.status === 'sent') {
          await prisma.lesson.update({
            where: { id: lesson.id },
            data: {
              paymentReminderCount: lesson.paymentReminderCount + 1,
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
        } else if (result.status === 'failed') {
          await prisma.lesson.update({
            where: { id: lesson.id },
            data: {
              lastPaymentReminderAt: now,
              lastPaymentReminderSource: 'AUTO',
            },
          });
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Не удалось отправить авто-напоминание об оплате', error);
      }
    }
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
  const normalized = Number.isFinite(NOTIFICATION_LOG_RETENTION_DAYS)
    ? NOTIFICATION_LOG_RETENTION_DAYS
    : MAX_NOTIFICATION_LOG_RETENTION_DAYS;
  return Math.min(Math.max(normalized, MIN_NOTIFICATION_LOG_RETENTION_DAYS), MAX_NOTIFICATION_LOG_RETENTION_DAYS);
};

const cleanupNotificationLogs = async () => {
  const retentionDays = resolveNotificationLogRetentionDays();
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

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Role, X-Student-Id');
    return res.end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
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
        await sendTelegramMessage(
          telegramUserId,
          `Оплата прошла успешно. Подписка активна до ${formatSubscriptionDate(nextEnd)}.`,
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

    if (req.method === 'GET' && pathname === '/transfer') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
      return res.end(`<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Вход в аккаунт</title>
    <style>
      body { font-family: sans-serif; background: #f5f6fa; margin: 0; padding: 32px; color: #101828; }
      .card { max-width: 520px; margin: 0 auto; background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08); }
      h1 { font-size: 20px; margin: 0 0 12px; }
      p { margin: 0 0 16px; color: #475467; }
      button { background: #3b82f6; color: #fff; border: none; border-radius: 10px; padding: 10px 16px; cursor: pointer; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Подтверждаем вход…</h1>
      <p id="status">Проверяем ссылку и открываем кабинет.</p>
      <button id="retry" style="display:none;">Запросить новую ссылку</button>
    </div>
    <script>
      const params = new URLSearchParams(window.location.search);
      const token = params.get('t');
      const statusEl = document.getElementById('status');
      const retryBtn = document.getElementById('retry');
      const showError = (message) => {
        statusEl.textContent = message;
        retryBtn.style.display = 'inline-block';
        retryBtn.addEventListener('click', () => {
          window.location.href = '/';
        });
      };
      if (!token) {
        showError('Ссылка недействительна. Откройте Mini App и создайте новую ссылку.');
      } else {
        fetch('/auth/transfer/consume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token }),
        })
          .then(async (response) => {
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
              throw new Error(data.message || 'Не удалось подтвердить вход.');
            }
            const redirectUrl = data.redirect_url || '/';
            window.location.replace(redirectUrl);
          })
          .catch(() => {
            showError('Ссылка устарела или уже использована. Создайте новую в Telegram.');
          });
      }
    </script>
  </body>
        </html>`);
    }

    if (req.method === 'GET' && pathname === '/auth/session') {
      const user = await resolveSessionUser(req, res);
      if (!user) return sendJson(res, 401, { message: 'unauthorized' });
      return sendJson(res, 200, { user });
    }

    if (req.method === 'POST' && pathname === '/auth/telegram/webapp') {
      const body = await readBody(req);
      const initData = typeof body.initData === 'string' ? body.initData : '';
      if (!initData) return badRequest(res, 'invalid_init_data');
      if (isRateLimited(`webapp:${getRequestIp(req)}`, RATE_LIMIT_WEBAPP_PER_MIN, 60_000)) {
        return sendJson(res, 429, { message: 'rate_limited' });
      }
      const verification = verifyTelegramInitData(initData);
      if (!verification.ok) {
        return sendJson(res, 401, { message: verification.reason });
      }
      const authDateRaw = verification.params.get('auth_date');
      const userRaw = verification.params.get('user');
      const authDate = authDateRaw ? Number(authDateRaw) : NaN;
      if (!userRaw || !Number.isFinite(authDate)) {
        return badRequest(res, 'invalid_init_data');
      }
      const nowSec = Math.floor(Date.now() / 1000);
      const initDataTtlSec = Number.isFinite(TELEGRAM_INITDATA_TTL_SEC) ? TELEGRAM_INITDATA_TTL_SEC : 300;
      if (nowSec - authDate > initDataTtlSec) {
        return sendJson(res, 401, { message: 'auth_date_expired' });
      }
      let telegramUser: any;
      try {
        telegramUser = JSON.parse(userRaw);
      } catch (error) {
        return badRequest(res, 'invalid_init_data');
      }
      if (!telegramUser?.id) {
        return badRequest(res, 'invalid_init_data');
      }
      const telegramUserId = BigInt(telegramUser.id);
      const existingUser = await prisma.user.findUnique({ where: { telegramUserId } });
      const isNewUser = !existingUser;
      const userRecord = existingUser
        ? await prisma.user.update({
            where: { id: existingUser.id },
            data: {
              username: telegramUser.username ?? null,
              firstName: telegramUser.first_name ?? null,
              lastName: telegramUser.last_name ?? null,
              photoUrl: telegramUser.photo_url ?? null,
            },
          })
        : await prisma.user.create({
            data: {
              telegramUserId,
              username: telegramUser.username ?? null,
              firstName: telegramUser.first_name ?? null,
              lastName: telegramUser.last_name ?? null,
              photoUrl: telegramUser.photo_url ?? null,
            },
          });
      const lastAuthDate = existingUser?.lastAuthDate ?? userRecord.lastAuthDate;
      if (lastAuthDate && authDate + TELEGRAM_REPLAY_SKEW_SEC < lastAuthDate) {
        return badRequest(res, 'invalid_init_data');
      }
      await prisma.user.update({
        where: { id: userRecord.id },
        data: { lastAuthDate: authDate },
      });
      const session = await createSession(userRecord.id, req, res);
      return sendJson(res, 200, {
        user: userRecord,
        session: { expiresAt: session.expiresAt },
        isNewUser,
      });
    }

    if (req.method === 'POST' && pathname === '/auth/transfer/create') {
      const user = await getSessionUser(req);
      if (!user) return sendJson(res, 401, { message: 'unauthorized' });
      const ip = getRequestIp(req);
      if (isRateLimited(`transfer:create:ip:${ip}`, RATE_LIMIT_TRANSFER_CREATE_IP_PER_MIN, 60_000)) {
        return sendJson(res, 429, { message: 'rate_limited' });
      }
      if (isRateLimited(`transfer:create:${user.id}`, RATE_LIMIT_TRANSFER_CREATE_PER_MIN, 60_000)) {
        return sendJson(res, 429, { message: 'rate_limited' });
      }
      const token = randomToken(32);
      const tokenHash = hashToken(token);
      const configuredTtlSec = Number.isFinite(TRANSFER_TOKEN_TTL_SEC) ? TRANSFER_TOKEN_TTL_SEC : 120;
      const ttlSeconds = clampNumber(configuredTtlSec, TRANSFER_TOKEN_MIN_TTL_SEC, TRANSFER_TOKEN_MAX_TTL_SEC);
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      await prisma.transferToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
          createdIp: getRequestIp(req) || null,
          createdUserAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
        },
      });
      const baseUrl = getBaseUrl(req);
      const transferUrl = new URL(baseUrl);
      if (transferUrl.hostname === 'localhost' || transferUrl.hostname === '127.0.0.1') {
        transferUrl.protocol = 'http:';
        transferUrl.port = '5173';
      }
      const url = `${transferUrl.toString().replace(/\/$/, '')}/transfer?t=${token}`;
      return sendJson(res, 200, { url, expires_in: ttlSeconds });
    }

    if (req.method === 'POST' && pathname === '/auth/transfer/consume') {
      const body = await readBody(req);
      const token = typeof body.token === 'string' ? body.token : '';
      if (!token) return badRequest(res, 'invalid_token');
      const ip = getRequestIp(req);
      if (isRateLimited(`transfer:consume:ip:${ip}`, RATE_LIMIT_TRANSFER_CONSUME_IP_PER_MIN, 60_000)) {
        return sendJson(res, 429, { message: 'rate_limited' });
      }
      if (isRateLimited(`transfer:consume:token:${token}`, RATE_LIMIT_TRANSFER_CONSUME_TOKEN_PER_MIN, 60_000)) {
        return sendJson(res, 429, { message: 'rate_limited' });
      }
      const tokenHash = hashToken(token);
      const record = await prisma.transferToken.findFirst({ where: { tokenHash } });
      if (!record) {
        return badRequest(res, 'invalid_token');
      }
      if (record.usedAt || record.expiresAt.getTime() < Date.now()) {
        return sendJson(res, 410, { message: 'token_expired_or_used' });
      }
      const consumeResult = await prisma.$transaction(async (tx) => {
        const updateResult = await tx.transferToken.updateMany({
          where: { id: record.id, usedAt: null, expiresAt: { gte: new Date() } },
          data: { usedAt: new Date() },
        });
        if (updateResult.count === 0) {
          return false;
        }
        await tx.transferToken.deleteMany({ where: { id: record.id } });
        return true;
      });
      if (!consumeResult) {
        return sendJson(res, 410, { message: 'token_expired_or_used' });
      }
      const session = await createSession(record.userId, req, res);
      return sendJson(res, 200, { redirect_url: TRANSFER_REDIRECT_URL, session: { expiresAt: session.expiresAt } });
    }

    if (req.method === 'POST' && pathname === '/auth/logout') {
      const cookies = parseCookies(req.headers.cookie);
      const token = cookies[SESSION_COOKIE_NAME];
      if (token) {
        await prisma.session.updateMany({
          where: { tokenHash: hashToken(token), revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      res.setHeader('Set-Cookie', buildCookie(SESSION_COOKIE_NAME, '', { maxAgeSeconds: 0, secure: isSecureRequest(req) }));
      return sendJson(res, 200, { status: 'ok' });
    }

    if (req.method === 'GET' && pathname === '/api/bootstrap') {
      const lessonsStart = parseDateFilter(url.searchParams.get('lessonsStart'));
      const lessonsEnd = parseDateFilter(url.searchParams.get('lessonsEnd'));
      const data = await bootstrap(requireApiUser(), { lessonsStart, lessonsEnd });
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

    if (req.method === 'GET' && pathname === '/api/settings') {
      const data = await getSettings(requireApiUser());
      return sendJson(res, 200, data);
    }

    if (req.method === 'PATCH' && pathname === '/api/settings') {
      const body = await readBody(req);
      const data = await updateSettings(requireApiUser(), body);
      return sendJson(res, 200, data);
    }

    if (req.method === 'GET' && pathname === '/api/sessions') {
      const data = await listSessions(requireApiUser(), req);
      return sendJson(res, 200, data);
    }

    if (req.method === 'POST' && pathname === '/api/sessions/revoke-others') {
      const data = await revokeOtherSessions(requireApiUser(), req);
      return sendJson(res, 200, data);
    }

    const sessionRevokeMatch = pathname.match(/^\/api\/sessions\/(\d+)\/revoke$/);
    if (req.method === 'POST' && sessionRevokeMatch) {
      const sessionId = Number(sessionRevokeMatch[1]);
      if (!Number.isFinite(sessionId)) return badRequest(res, 'invalid_session_id');
      const data = await revokeSession(requireApiUser(), sessionId);
      return sendJson(res, 200, data);
    }

    if (req.method === 'GET' && pathname === '/api/lessons/unpaid') {
      const data = await listUnpaidLessons(requireApiUser());
      const filteredEntries =
        role === 'STUDENT' && requestedStudentId
          ? data.entries.filter((entry) => entry.studentId === requestedStudentId)
          : data.entries;
      return sendJson(res, 200, { entries: filteredEntries });
    }

    if (req.method === 'GET' && pathname === '/api/lessons') {
      const data = await listLessonsForRange(requireApiUser(), {
        start: url.searchParams.get('start'),
        end: url.searchParams.get('end'),
      });
      const filteredLessons =
        role === 'STUDENT' && requestedStudentId
          ? data.lessons.filter(
              (lesson) =>
                lesson.studentId === requestedStudentId ||
                lesson.participants?.some((participant) => participant.studentId === requestedStudentId),
            )
          : data.lessons;
      return sendJson(res, 200, { lessons: filteredLessons });
    }

    if (req.method === 'GET' && pathname === '/api/students') {
      const { searchParams } = url;
      const query = searchParams.get('query') ?? undefined;
      const filter = (searchParams.get('filter') as 'all' | 'debt' | 'overdue' | null) ?? 'all';
      const { limit, offset } = resolvePageParams(url);
      const data = await listStudents(requireApiUser(), query, filter, limit, offset);
      return sendJson(res, 200, data);
    }

    if (req.method === 'GET' && pathname === '/api/students/search') {
      const { searchParams } = url;
      const query = searchParams.get('query') ?? undefined;
      const filter = (searchParams.get('filter') as 'all' | 'pendingHomework' | 'noReminder' | null) ?? 'all';
      const data = await searchStudents(requireApiUser(), query, filter);
      const filteredHomeworks = filterHomeworksForRole(data.homeworks, role, requestedStudentId);
      const filteredLinks =
        role === 'STUDENT' && requestedStudentId
          ? data.links.filter((link) => link.studentId === requestedStudentId)
          : data.links;
      const filteredStudents =
        role === 'STUDENT' && requestedStudentId
          ? data.students.filter((student) => student.id === requestedStudentId)
          : data.students;
      return sendJson(res, 200, { ...data, homeworks: filteredHomeworks, links: filteredLinks, students: filteredStudents });
    }

    if (req.method === 'POST' && pathname === '/api/students') {
      const body = await readBody(req);
      const data = await addStudent(requireApiUser(), body);
      return sendJson(res, 201, data);
    }

    const studentUpdateMatch = pathname.match(/^\/api\/students\/(\d+)$/);
    if ((req.method === 'PATCH' || req.method === 'PUT') && studentUpdateMatch) {
      const studentId = Number(studentUpdateMatch[1]);
      const body = await readBody(req);
      const data = await updateStudent(requireApiUser(), studentId, body);
      return sendJson(res, 200, data);
    }

    const studentDeleteMatch = pathname.match(/^\/api\/students\/(\d+)$/);
    if (req.method === 'DELETE' && studentDeleteMatch) {
      const studentId = Number(studentDeleteMatch[1]);
      const link = await archiveStudentLink(requireApiUser(), studentId);
      return sendJson(res, 200, { link });
    }

    const studentHomeworkListMatch = pathname.match(/^\/api\/students\/(\d+)\/homeworks$/);
    if (req.method === 'GET' && studentHomeworkListMatch) {
      const studentId = Number(studentHomeworkListMatch[1]);
      const { searchParams } = url;
      const filter = (searchParams.get('filter') as HomeworkStatus | 'all' | 'overdue' | null) ?? 'all';
      const { limit, offset } = resolvePageParams(url);
      const data = await listStudentHomeworks(requireApiUser(), studentId, filter, limit, offset);
      const filteredHomeworks = filterHomeworksForRole(data.items, role, requestedStudentId);
      return sendJson(res, 200, { ...data, items: filteredHomeworks });
    }

    const studentLessonsMatch = pathname.match(/^\/api\/students\/(\d+)\/lessons$/);
    if (req.method === 'GET' && studentLessonsMatch) {
      const studentId = Number(studentLessonsMatch[1]);
      const { searchParams } = url;
      const payment = (searchParams.get('payment') as 'all' | 'paid' | 'unpaid' | null) ?? 'all';
      const status = (searchParams.get('status') as 'all' | 'completed' | 'not_completed' | null) ?? 'all';
      const startFrom = searchParams.get('startFrom') ?? undefined;
      const startTo = searchParams.get('startTo') ?? undefined;
      const sort = (searchParams.get('sort') as 'asc' | 'desc' | null) ?? 'desc';
      const data = await listStudentLessons(requireApiUser(), studentId, { payment, status, startFrom, startTo, sort });
      return sendJson(res, 200, data);
    }

    const studentUnpaidMatch = pathname.match(/^\/api\/students\/(\d+)\/unpaid-lessons$/);
    if (req.method === 'GET' && studentUnpaidMatch) {
      const studentId = Number(studentUnpaidMatch[1]);
      const data = await listStudentUnpaidLessons(requireApiUser(), studentId);
      return sendJson(res, 200, data);
    }

    const studentRemindersMatch = pathname.match(/^\/api\/students\/(\d+)\/payment-reminders$/);
    if (studentRemindersMatch) {
      const studentId = Number(studentRemindersMatch[1]);
      if (req.method === 'GET') {
        const limit = Number(url.searchParams.get('limit') ?? 10);
        const data = await listStudentPaymentReminders(requireApiUser(), studentId, limit);
        return sendJson(res, 200, data);
      }
      if (req.method === 'POST') {
        const body = await readBody(req);
        const enabled = Boolean((body as any)?.enabled);
        const data = await updateStudentPaymentReminders(requireApiUser(), studentId, enabled);
        return sendJson(res, 200, data);
      }
    }

    const autoRemindMatch = pathname.match(/^\/api\/students\/(\d+)\/auto-remind$/);
    if (req.method === 'POST' && autoRemindMatch) {
      const studentId = Number(autoRemindMatch[1]);
      const body = await readBody(req);
      const link = await toggleAutoReminder(requireApiUser(), studentId, Boolean(body.value));
      return sendJson(res, 200, { link });
    }

    const priceMatch = pathname.match(/^\/api\/students\/(\d+)\/price$/);
    if ((req.method === 'POST' || req.method === 'PATCH') && priceMatch) {
      const studentId = Number(priceMatch[1]);
      const body = await readBody(req);
      const link = await updatePricePerLesson(requireApiUser(), studentId, Number(body.value));
      return sendJson(res, 200, { link });
    }

    const balanceMatch = pathname.match(/^\/api\/students\/(\d+)\/balance$/);
    if (req.method === 'POST' && balanceMatch) {
      const studentId = Number(balanceMatch[1]);
      const body = await readBody(req);
      const link = await adjustBalance(requireApiUser(), studentId, {
        delta: Number(body.delta || 0),
        type: body.type,
        comment: body.comment,
        createdAt: body.createdAt,
      });
      return sendJson(res, 200, { link });
    }

    const paymentsMatch = pathname.match(/^\/api\/students\/(\d+)\/payments$/);
    if (req.method === 'GET' && paymentsMatch) {
      const studentId = Number(paymentsMatch[1]);
      const filter = url.searchParams.get('filter') ?? undefined;
      const date = url.searchParams.get('date') ?? undefined;
      const events = await listPaymentEventsForStudent(requireApiUser(), studentId, { filter, date });
      return sendJson(res, 200, { events });
    }

    if (req.method === 'POST' && pathname === '/api/homeworks') {
      const body = await readBody(req);
      const homework = await createHomework(requireApiUser(), body);
      return sendJson(res, 201, { homework });
    }

    const homeworkUpdateMatch = pathname.match(/^\/api\/homeworks\/(\d+)$/);
    if (req.method === 'PATCH' && homeworkUpdateMatch) {
      const homeworkId = Number(homeworkUpdateMatch[1]);
      const body = await readBody(req);
      const homework = await updateHomework(requireApiUser(), homeworkId, body);
      return sendJson(res, 200, { homework });
    }

    const takeInWorkMatch = pathname.match(/^\/api\/homeworks\/(\d+)\/take-in-work$/);
    if (req.method === 'POST' && takeInWorkMatch) {
      const homeworkId = Number(takeInWorkMatch[1]);
      const homework = await takeHomeworkInWork(homeworkId, req);
      return sendJson(res, 200, { homework });
    }

    const homeworkSendMatch = pathname.match(/^\/api\/homeworks\/(\d+)\/send$/);
    if (req.method === 'POST' && homeworkSendMatch) {
      const homeworkId = Number(homeworkSendMatch[1]);
      const result = await sendHomeworkToStudent(requireApiUser(), homeworkId);
      return sendJson(res, 200, result);
    }

    if (req.method === 'DELETE' && homeworkUpdateMatch) {
      const homeworkId = Number(homeworkUpdateMatch[1]);
      const result = await deleteHomework(requireApiUser(), homeworkId);
      return sendJson(res, 200, result);
    }

    const homeworkToggleMatch = pathname.match(/^\/api\/homeworks\/(\d+)\/toggle$/);
    if (req.method === 'PATCH' && homeworkToggleMatch) {
      const homeworkId = Number(homeworkToggleMatch[1]);
      const homework = await toggleHomework(requireApiUser(), homeworkId);
      return sendJson(res, 200, { homework });
    }

    const homeworkRemindMatch = pathname.match(/^\/api\/homeworks\/(\d+)\/remind$/);
    if (req.method === 'POST' && homeworkRemindMatch) {
      const homeworkId = Number(homeworkRemindMatch[1]);
      const result = await remindHomeworkById(requireApiUser(), homeworkId);
      return sendJson(res, 200, result);
    }

    if (req.method === 'POST' && pathname === '/api/lessons/recurring') {
      const body = await readBody(req);
      const lessons = await createRecurringLessons(requireApiUser(), body);
      return sendJson(res, 201, { lessons });
    }

    if (req.method === 'POST' && pathname === '/api/lessons') {
      const body = await readBody(req);
      const lesson = await createLesson(requireApiUser(), body);
      return sendJson(res, 201, { lesson });
    }

    const lessonStatusMatch = pathname.match(/^\/api\/lessons\/(\d+)\/status$/);
    if (req.method === 'PATCH' && lessonStatusMatch) {
      const lessonId = Number(lessonStatusMatch[1]);
      const body = await readBody(req);
      const result = await updateLessonStatus(requireApiUser(), lessonId, body.status);
      return sendJson(res, 200, { lesson: result.lesson, links: result.links });
    }

    const lessonUpdateMatch = pathname.match(/^\/api\/lessons\/(\d+)$/);
    if (req.method === 'PATCH' && lessonUpdateMatch) {
      const lessonId = Number(lessonUpdateMatch[1]);
      const body = await readBody(req);
      const result = await updateLesson(requireApiUser(), lessonId, body);
      if (result && typeof result === 'object' && 'lessons' in result) {
        return sendJson(res, 200, { lessons: (result as any).lessons });
      }
      return sendJson(res, 200, { lesson: result });
    }

    if (req.method === 'DELETE' && lessonUpdateMatch) {
      const lessonId = Number(lessonUpdateMatch[1]);
      const body = await readBody(req);
      const result = await deleteLesson(requireApiUser(), lessonId, Boolean(body.applyToSeries));
      return sendJson(res, 200, result);
    }

    const lessonCompleteMatch = pathname.match(/^\/api\/lessons\/(\d+)\/complete$/);
    if (req.method === 'POST' && lessonCompleteMatch) {
      const lessonId = Number(lessonCompleteMatch[1]);
      const result = await markLessonCompleted(requireApiUser(), lessonId);
      return sendJson(res, 200, result);
    }

    const lessonPaidMatch = pathname.match(/^\/api\/lessons\/(\d+)\/toggle-paid$/);
    if (req.method === 'POST' && lessonPaidMatch) {
      const lessonId = Number(lessonPaidMatch[1]);
      const body = await readBody(req);
      const result = await toggleLessonPaid(
        requireApiUser(),
        lessonId,
        normalizeCancelBehavior((body as any)?.cancelBehavior),
        Boolean((body as any)?.writeOffBalance),
      );
      return sendJson(res, 200, { lesson: result.lesson, link: result.link });
    }

    const remindPaymentMatch = pathname.match(/^\/api\/lessons\/(\d+)\/remind-payment$/);
    if (req.method === 'POST' && remindPaymentMatch) {
      const lessonId = Number(remindPaymentMatch[1]);
      const body = await readBody(req);
      const studentId = Number((body as any)?.studentId);
      const resolvedStudentId = Number.isFinite(studentId) ? studentId : null;
      const force = Boolean((body as any)?.force);
      const result = await remindLessonPayment(requireApiUser(), lessonId, resolvedStudentId, { force });
      return sendJson(res, 200, result);
    }

    const participantPaidMatch = pathname.match(/^\/api\/lessons\/(\d+)\/participants\/(\d+)\/toggle-paid$/);
    if (req.method === 'POST' && participantPaidMatch) {
      const lessonId = Number(participantPaidMatch[1]);
      const studentId = Number(participantPaidMatch[2]);
      const body = await readBody(req);
      const result = await toggleParticipantPaid(
        requireApiUser(),
        lessonId,
        studentId,
        normalizeCancelBehavior((body as any)?.cancelBehavior),
        Boolean((body as any)?.writeOffBalance),
      );
      return sendJson(res, 200, { participant: result.participant, lesson: result.lesson, link: result.link });
    }

    const remindMatch = pathname.match(/^\/api\/reminders\/homework$/);
    if (req.method === 'POST' && remindMatch) {
      const body = await readBody(req);
      const result = await remindHomework(requireApiUser(), Number(body.studentId));
      return sendJson(res, 200, result);
    }

    return notFound(res);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return badRequest(res, message);
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

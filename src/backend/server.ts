import 'dotenv/config';
import http, { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import prisma from './prismaClient';
import type { Student, User } from '@prisma/client';
import type { HomeworkStatus, LessonMutationAction, LessonSeriesScope, PaymentCancelBehavior } from '../entities/types';
import { normalizeLessonColor } from '../shared/lib/lessonColors';
import { isValidMeetingLink, MEETING_LINK_MAX_LENGTH, normalizeMeetingLinkInput } from '../shared/lib/meetingLink';
import { isValidEmail, normalizeEmail } from '../shared/lib/email';
import {
  formatInTimeZone,
  resolveTimeZone,
  toUtcDateFromTimeZone,
  toUtcEndOfDay,
  toZonedDate,
} from '../shared/lib/timezoneDates';
import {
  hasWeekdayOverlap,
  isDateInWeekdayList,
  normalizeWeekdayList,
  stringifyWeekdayList,
} from '../shared/lib/weekdays';
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
import {
  getWebPushPublicConfig,
  hasWebPushSubscriptionsForStudent,
  isWebPushConfigured,
  sendWebPushToUser,
  upsertWebPushSubscription,
  deleteWebPushSubscription,
} from './webPushService';
import { buildOnboardingReminderMessage, type OnboardingReminderTemplate } from '../shared/lib/onboardingReminder';
import { logActivityEvent } from './activityFeedService';
import { badRequest, notFound, readBody, readRawBody, sendJson } from './server/lib/http';
import {
  applyCorsHeaders,
  applySecurityHeaders,
  createSecurityConfig,
  isMutationOriginValid,
  isYookassaWebhookAuthorized,
} from './server/lib/security';
import { createAuthService } from './server/modules/auth';
import { createSessionService } from './server/modules/sessions';
import { createActivityFeedService, parseActivityCategories, parseQueryDate } from './server/modules/activityFeed';
import { createStudentsService, normalizeTelegramUsername } from './server/modules/students';
import { createSettingsService } from './server/modules/settings';
import { createOverviewService } from './server/modules/overview';
import { createScheduleNotesService } from './server/modules/scheduleNotes';
import { createLegacyHomeworkService } from './server/modules/legacyHomework';
import { createUploadsService } from './server/modules/uploads';
import { createAutomationService } from './server/modules/automation';
import { createLessonOperationsService } from './server/modules/lessonOperations';
import { createLessonEditingService } from './server/modules/lessonEditing';
import { createLessonSchedulingService } from './server/modules/lessonScheduling';
import { createLessonSeriesService } from './server/modules/lessonSeries';
import { createStudentAccessService } from './server/modules/studentAccess';
import { createSubscriptionService } from './server/modules/subscription';
import {
  filterHomeworksForRole,
  getRequestedStudentId,
  getRequestedTeacherId,
  getRequestRole,
  normalizeTeacherStatus,
  parseOptionalBooleanQueryParam,
  parseOptionalNumberQueryParam,
} from './server/modules/requestContext';
import { clampNumber, isValidTimeString } from './server/lib/runtimeLimits';
import { createAuthSessionHandlers } from './server/routes/authSession';
import { tryHandleAuthRoutes } from './server/routes/authRoutes';
import { tryHandleBillingRoutes } from './server/routes/billingRoutes';
import { tryHandleStudentV2Routes } from './server/routes/studentRoutesV2';
import { tryHandleHomeworkRoutesV2 } from './server/routes/homeworkRoutesV2';
import { tryHandleNotificationRoutes } from './server/routes/notificationRoutes';
import { tryHandlePwaPushRoutes } from './server/routes/pwaPushRoutes';
import { tryHandleSessionRoutes } from './server/routes/sessionRoutes';
import { tryHandleAccountRoutes } from './server/routes/accountRoutes';
import { tryHandleActivityFeedRoutes } from './server/routes/activityFeedRoutes';
import { tryHandleStudentRoutes } from './server/routes/studentRoutes';
import { tryHandleHomeworkRoutes } from './server/routes/homeworkRoutes';
import { tryHandleLessonRoutes } from './server/routes/lessonRoutes';
import { tryHandleScheduleNoteRoutes } from './server/routes/scheduleNoteRoutes';
import { RequestValidationError } from './server/lib/requestValidationError';
import { validateHomeworkTemplatePayload } from './server/modules/homeworkTemplateValidation';
import { resolveHomeworkFallbackDeadline } from './server/modules/homeworkV2/shared';
import { createHomeworkV2Service } from './server/modules/homeworkV2/service';

const PORT = Number(process.env.API_PORT ?? 4000);
const DEFAULT_PAGE_SIZE = 15;
const MAX_PAGE_SIZE = 50;
const parseDateFilter = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const parseServerTimeout = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
};
const API_REQUEST_TIMEOUT_MS = parseServerTimeout(process.env.API_REQUEST_TIMEOUT_MS, 60_000, 1_000, 300_000);
const API_HEADERS_TIMEOUT_MS = parseServerTimeout(process.env.API_HEADERS_TIMEOUT_MS, 65_000, 1_000, 300_000);
const API_KEEP_ALIVE_TIMEOUT_MS = parseServerTimeout(process.env.API_KEEP_ALIVE_TIMEOUT_MS, 5_000, 1_000, 120_000);
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const TELEGRAM_BOT_USERNAME = (process.env.TELEGRAM_BOT_USERNAME ?? '').trim().replace(/^@+/, '');
const TELEGRAM_INITDATA_TTL_SEC = Number(process.env.TELEGRAM_INITDATA_TTL_SEC ?? 300);
const TELEGRAM_REPLAY_SKEW_SEC = Number(process.env.TELEGRAM_REPLAY_SKEW_SEC ?? 60);
const SUBSCRIPTION_MONTH_DAYS = 30;
const YOOKASSA_EVENT_TTL_MS = 24 * 60 * 60 * 1000;
const LOCAL_AUTH_BYPASS = process.env.LOCAL_AUTH_BYPASS === 'true' && process.env.NODE_ENV !== 'production';
const LOCAL_DEV_TELEGRAM_ID = (() => {
  const raw = process.env.LOCAL_DEV_TELEGRAM_ID;
  if (!raw) return 999_999_999n;
  try {
    return BigInt(raw);
  } catch (_error) {
    return 999_999_999n;
  }
})();
const LOCAL_DEV_USERNAME = process.env.LOCAL_DEV_USERNAME ?? 'local_teacher';
const LOCAL_DEV_FIRST_NAME = process.env.LOCAL_DEV_FIRST_NAME ?? 'Local';
const LOCAL_DEV_LAST_NAME = process.env.LOCAL_DEV_LAST_NAME ?? 'Teacher';
const SESSION_TTL_MINUTES = Number(process.env.SESSION_TTL_MINUTES ?? 43_200);
const SESSION_RENEW_THRESHOLD_MINUTES = Number(process.env.SESSION_RENEW_THRESHOLD_MINUTES ?? 10_080);
const TELEGRAM_BROWSER_REDIRECT_URL = process.env.TELEGRAM_BROWSER_REDIRECT_URL ?? '/dashboard';
const SESSION_COOKIE_NAME = 'session_id';
const RATE_LIMIT_WEBAPP_PER_MIN = Number(process.env.RATE_LIMIT_WEBAPP_PER_MIN ?? 30);
const RATE_LIMIT_BROWSER_LOGIN_PER_MIN = Number(process.env.RATE_LIMIT_BROWSER_LOGIN_PER_MIN ?? 20);
const NOTIFICATION_TICK_MS = 60_000;
const AUTOMATION_TICK_MS = 5 * 60_000;
const ONBOARDING_NUDGE_TICK_MS = 15 * 60_000;
const ONBOARDING_NUDGE_DELAY_MS = 24 * 60 * 60 * 1000;
const ONBOARDING_NUDGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const NOTIFICATION_LOG_RETENTION_DAYS = Number(process.env.NOTIFICATION_LOG_RETENTION_DAYS ?? 0);
const MIN_NOTIFICATION_LOG_RETENTION_DAYS = 7;
const MAX_NOTIFICATION_LOG_RETENTION_DAYS = 30;
const securityConfig = createSecurityConfig();
const authService = createAuthService({
  sessionCookieName: SESSION_COOKIE_NAME,
  sessionTtlMinutes: SESSION_TTL_MINUTES,
  sessionRenewThresholdMinutes: SESSION_RENEW_THRESHOLD_MINUTES,
  localAuthBypass: LOCAL_AUTH_BYPASS,
  localDevUser: {
    telegramUserId: LOCAL_DEV_TELEGRAM_ID,
    username: LOCAL_DEV_USERNAME,
    firstName: LOCAL_DEV_FIRST_NAME,
    lastName: LOCAL_DEV_LAST_NAME,
  },
});
const { createSession, getSessionTokenHash, resolveSessionUser } = authService;
const sessionService = createSessionService({ getSessionTokenHash });
const { listSessions, revokeSession, revokeOtherSessions } = sessionService;
const authSessionHandlers = createAuthSessionHandlers({
  appBaseUrl: process.env.APP_BASE_URL ?? '',
  createSession,
  sessionCookieName: SESSION_COOKIE_NAME,
  telegramBotToken: TELEGRAM_BOT_TOKEN,
  telegramBotUsername: TELEGRAM_BOT_USERNAME,
  telegramInitDataTtlSec: TELEGRAM_INITDATA_TTL_SEC,
  telegramReplaySkewSec: TELEGRAM_REPLAY_SKEW_SEC,
  telegramBrowserRedirectUrl: TELEGRAM_BROWSER_REDIRECT_URL,
  rateLimitWebappPerMin: RATE_LIMIT_WEBAPP_PER_MIN,
  rateLimitBrowserLoginPerMin: RATE_LIMIT_BROWSER_LOGIN_PER_MIN,
});
const uploadsService = createUploadsService({
  clampNumber,
  readRawBody,
  notFound,
});
const { createFilePresignUploadV2, handlePresignedUploadPutV2, handleUploadedFileObjectGetV2 } = uploadsService;
const subscriptionService = createSubscriptionService({
  prisma,
  subscriptionMonthDays: SUBSCRIPTION_MONTH_DAYS,
  telegramBotToken: TELEGRAM_BOT_TOKEN,
  yookassaEventTtlMs: YOOKASSA_EVENT_TTL_MS,
});
const { hasActiveSubscription, handleYookassaWebhook } = subscriptionService;

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

const resolveTeacherWeekendWeekdays = (teacher: { weekendWeekdays?: unknown }) =>
  normalizeWeekdayList(teacher.weekendWeekdays);

const ensureLessonDateIsWorkingDay = (
  startAt: Date,
  teacher: { timezone?: string | null; weekendWeekdays?: unknown },
) => {
  const zonedDate = toZonedDate(startAt, teacher.timezone);
  if (isDateInWeekdayList(zonedDate, resolveTeacherWeekendWeekdays(teacher))) {
    throw new Error('На выходной день нельзя поставить занятие');
  }
};

const ensureRecurringWeekdaysAreWorking = (weekdays: number[], teacher: { weekendWeekdays?: unknown }) => {
  if (hasWeekdayOverlap(weekdays, resolveTeacherWeekendWeekdays(teacher))) {
    throw new Error('Серия занятий не может проходить в выходные дни');
  }
};

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
    console.error('Failed to log activity event', error);
  }
};

const formatTeacherName = (user: User) => {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return fullName || user.username || 'Teacher';
};

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

const serializeBigInt = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value, (_key, val) => (typeof val === 'bigint' ? val.toString() : val))) as T;

const exportAccount = async (user: User) => {
  const teacher = await ensureTeacher(user);
  const teacherId = teacher.chatId;

  const [students, lessons, homeworks, homeworkTemplates, homeworkAssignments, scheduleNotes, payments] =
    await Promise.all([
      prisma.teacherStudent.findMany({
        where: { teacherId },
        include: { student: true },
      }),
      prisma.lesson.findMany({
        where: { teacherId },
        include: { participants: true },
      }),
      prisma.homework.findMany({ where: { teacherId } }),
      prisma.homeworkTemplate.findMany({ where: { teacherId } }),
      prisma.homeworkAssignment.findMany({
        where: { teacherId },
        include: { submissions: true },
      }),
      prisma.scheduleNote.findMany({ where: { teacherId } }),
      prisma.payment.findMany({
        where: { teacherStudent: { teacherId } },
      }),
    ]);

  return serializeBigInt({
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    teacher,
    students,
    lessons,
    homeworks,
    homeworkTemplates,
    homeworkAssignments,
    scheduleNotes,
    payments,
  });
};
const activityFeedService = createActivityFeedService({ ensureTeacher });
const { listActivityFeed, getActivityFeedUnreadStatus, markActivityFeedSeen } = activityFeedService;

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

const scheduleNotesService = createScheduleNotesService({
  prisma,
  ensureTeacher,
});
const { listScheduleNotes, createScheduleNote, updateScheduleNote, deleteScheduleNote } = scheduleNotesService;

const addStudent = async (user: User, body: any) => studentsService.addStudent(user, body);

const updateStudent = async (user: User, studentId: number, body: any) =>
  studentsService.updateStudent(user, studentId, body);

const archiveStudentLink = async (user: User, studentId: number) => studentsService.archiveStudentLink(user, studentId);

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

const studentsService = createStudentsService({
  defaultPageSize: DEFAULT_PAGE_SIZE,
  maxPageSize: MAX_PAGE_SIZE,
  ensureTeacher,
  safeLogActivityEvent,
  normalizeTeacherStatus,
  parseDateFilter,
});

const normalizeCancelBehavior = (value: any): PaymentCancelBehavior => (value === 'writeoff' ? 'writeoff' : 'refund');

const normalizeLessonPaymentHandling = (value: unknown): 'KEEP' | 'RETURN_TO_BALANCE' =>
  value === 'RETURN_TO_BALANCE' ? 'RETURN_TO_BALANCE' : 'KEEP';

const normalizeLessonPriceValue = (value: any): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.round(numeric);
};

const resolveProfileLessonPrice = (link: any) => normalizeLessonPriceValue(link?.pricePerLesson);

const createPaymentEvent = async (tx: any, payload: any) => {
  return tx.paymentEvent.create({ data: payload });
};

const parseWeekdays = (repeatWeekdays: any): number[] => {
  return normalizeWeekdayList(repeatWeekdays);
};

const normalizeLessonScope = (value: unknown): LessonSeriesScope => {
  if (value === 'FOLLOWING') return 'FOLLOWING';
  if (value === 'SERIES') return 'FOLLOWING';
  return 'SINGLE';
};

const normalizeLessonMutationAction = (value: unknown): LessonMutationAction => {
  if (value === 'RESCHEDULE') return 'RESCHEDULE';
  if (value === 'CANCEL') return 'CANCEL';
  if (value === 'RESTORE') return 'RESTORE';
  if (value === 'DELETE') return 'DELETE';
  return 'EDIT';
};

const lessonSchedulingService = createLessonSchedulingService({
  prisma,
  ensureTeacher,
  safeLogActivityEvent,
  normalizeLessonColor,
  resolveMeetingLinkValue,
  ensureLessonDateIsWorkingDay,
  ensureRecurringWeekdaysAreWorking,
  resolveLessonParticipantNames,
  resolveWeekdayLabels,
  parseWeekdays,
  resolveTimeZone,
  toZonedDate,
  toUtcDateFromTimeZone,
  resolveProfileLessonPrice,
  createPaymentEvent,
});
const {
  buildRecurringOccurrences,
  syncSeriesParticipants,
  upsertLessonSeriesException,
  createLessonSeriesRecord,
  createSeriesLesson,
  updateLessonWithParticipants,
  createLesson,
  createRecurringLessons,
} = lessonSchedulingService;

const LESSON_HISTORY_LOCK_MESSAGE = 'Этот урок уже связан с домашкой, уведомлениями или оплатой. Изменение недоступно.';
const LESSON_EDIT_WARNING_MESSAGE =
  'Урок уже проведён или оплачен. После сохранения проверьте оплату, домашку и уведомления.';
const LESSON_EDIT_PAYMENT_RESET_MESSAGE =
  'Урок уже оплачен. Чтобы изменить учеников или логику серии, сначала верните оплату на баланс.';
const LESSON_EDIT_HARD_LOCK_MESSAGE =
  'Этот урок уже связан с домашкой или отправленными уведомлениями. Можно менять только дату, время, цвет и ссылку.';
const LESSON_SERIES_HISTORY_LOCK_MESSAGE =
  'В выбранной части серии есть оплаченные, проведённые или уже связанные с историей уроки. Чтобы не переписать историю, начните изменение с более позднего урока или редактируйте один урок отдельно.';
const LESSON_SERIES_NO_EDITABLE_TAIL_MESSAGE = 'После выбранного урока нет занятий, которые можно безопасно изменить.';
const LESSON_SERIES_PROTECTED_INSIDE_TAIL_MESSAGE =
  'В будущем хвосте серии есть уже связанные с историей уроки. Чтобы не переписать историю частично, выберите другой урок.';
const LESSON_SERIES_SPLIT_WARNING_MESSAGE =
  'Выбранный урок и защищённый префикс останутся без изменений. Новые настройки начнут действовать позже.';

const filterSuppressedLessons = async (tx: any, lessons: any[]) => {
  if (lessons.length === 0) return lessons;
  const visibleLessons = lessons.filter((lesson) => !lesson.isSuppressed);
  if (visibleLessons.length === 0) return [];
  const hidden = await tx.lessonSeriesException.findMany({
    where: {
      lessonId: {
        in: visibleLessons.map((lesson) => lesson.id),
      },
      kind: 'DELETE',
    },
    select: {
      lessonId: true,
    },
  });
  const hiddenIds = new Set(hidden.map((item: { lessonId: number | null }) => item.lessonId).filter(Boolean));
  return visibleLessons.filter((lesson) => !hiddenIds.has(lesson.id));
};
const studentAccessService = createStudentAccessService({
  prisma,
  normalizeTelegramUsername,
  filterSuppressedLessons,
  resolveHomeworkFallbackDeadline,
});
const {
  resolveStudentAccessLinks,
  ensureStudentAccessLink,
  ensureTeacherStudentLinkV2,
  resolveHomeworkDefaultDeadline,
  listStudentContextV2,
} = studentAccessService;

const lessonSeriesService = createLessonSeriesService({
  prisma,
  resolveTimeZone,
  parseWeekdays,
  filterSuppressedLessons,
  syncSeriesParticipants,
  upsertLessonSeriesException,
  createLessonSeriesRecord,
  createSeriesLesson,
  updateLessonWithParticipants,
  buildRecurringOccurrences,
  applyLessonCancelStatus: (tx, teacher, lessonId, refundMode) =>
    applyLessonCancelStatus(tx, teacher, lessonId, refundMode),
  toZonedDate,
  lessonSeriesHistoryLockMessage: LESSON_SERIES_HISTORY_LOCK_MESSAGE,
  lessonSeriesNoEditableTailMessage: LESSON_SERIES_NO_EDITABLE_TAIL_MESSAGE,
  lessonSeriesProtectedInsideTailMessage: LESSON_SERIES_PROTECTED_INSIDE_TAIL_MESSAGE,
});
const {
  hasLessonPaidParticipant,
  findLessonIdsWithHardDependents,
  buildLessonMutationPreview,
  resolveRecurringEditableLessons,
  deleteLessonInstance,
  loadScopedLessonTargets,
  mutateRecurringLessons,
} = lessonSeriesService;

const overviewService = createOverviewService({
  prisma,
  ensureTeacher,
  resolveTimeZone,
  toZonedDate,
  formatInTimeZone,
  toUtcDateFromTimeZone,
  toUtcEndOfDay,
  resolveTeacherWeekendWeekdays,
  filterSuppressedLessons,
  buildOnboardingReminderMessage,
  sendStudentLessonReminderManual,
  TELEGRAM_BOT_TOKEN,
});
const {
  bootstrap,
  listLessonsForRange,
  getDashboardSummary,
  buildDailySummaryData,
  sendLessonReminder,
  listUnpaidLessons,
} = overviewService;

const homeworkV2Service = createHomeworkV2Service({
  defaultPageSize: DEFAULT_PAGE_SIZE,
  maxPageSize: MAX_PAGE_SIZE,
  ensureTeacher,
  ensureStudentAccessLink,
  ensureTeacherStudentLinkV2,
  resolveHomeworkDefaultDeadline,
  safeLogActivityEvent,
  filterSuppressedLessons,
  validateHomeworkTemplatePayload,
});

const lessonOperationsService = createLessonOperationsService({
  prisma,
  ensureTeacher,
  safeLogActivityEvent,
  normalizeCancelBehavior,
  normalizeLessonScope,
  normalizeLessonMutationAction,
  resolveLessonParticipantNames,
  resolveLessonParticipantNamesFromParticipants,
  loadScopedLessonTargets,
  buildLessonMutationPreview,
  previewLessonEditMutation: (tx, teacher, lessonId, body, action) =>
    previewLessonEditMutation(tx, teacher, lessonId, body, action),
  deleteLessonInstance,
  parseWeekdays,
  resolveWeekdayLabels,
  resolveStudentTelegramId,
  isWebPushConfigured,
  hasWebPushSubscriptionsForStudent,
  sendStudentPaymentReminder,
  sendTeacherPaymentReminderNotice,
  dispatchScheduledHomeworkAssignmentsForLesson: homeworkV2Service.dispatchScheduledHomeworkAssignmentsForLesson,
});
const {
  settleLessonPayments,
  applyLessonCancelStatus,
  previewLessonMutation,
  deleteLesson,
  markLessonCompleted,
  cancelLesson,
  restoreLesson,
  toggleLessonPaid,
  toggleParticipantPaid,
  updateLessonStatus,
  remindLessonPayment,
} = lessonOperationsService;

const lessonEditingService = createLessonEditingService({
  prisma,
  ensureTeacher,
  safeLogActivityEvent,
  normalizeLessonPaymentHandling,
  normalizeLessonScope,
  ensureLessonDateIsWorkingDay,
  ensureRecurringWeekdaysAreWorking,
  normalizeLessonColor,
  parseWeekdays,
  resolveMeetingLinkValue,
  resolveLessonParticipantNames,
  resolveWeekdayLabels,
  buildLessonMutationPreview,
  loadScopedLessonTargets,
  resolveRecurringEditableLessons,
  findLessonIdsWithHardDependents,
  hasLessonPaidParticipant,
  createPaymentEvent,
  mutateRecurringLessons,
  createLessonSeriesRecord,
  createSeriesLesson,
  updateLessonWithParticipants,
  buildRecurringOccurrences,
  lessonHistoryLockMessage: LESSON_HISTORY_LOCK_MESSAGE,
  lessonEditWarningMessage: LESSON_EDIT_WARNING_MESSAGE,
  lessonEditPaymentResetMessage: LESSON_EDIT_PAYMENT_RESET_MESSAGE,
  lessonSeriesSplitWarningMessage: LESSON_SERIES_SPLIT_WARNING_MESSAGE,
  lessonEditHardLockMessage: LESSON_EDIT_HARD_LOCK_MESSAGE,
});
const { previewLessonEditMutation, updateLesson } = lessonEditingService;

const settingsService = createSettingsService({
  prisma,
  ensureTeacher,
  clampNumber,
  isValidTimeString,
  normalizeEmail,
  isValidEmail,
  resolveTeacherWeekendWeekdays,
  normalizeWeekdayList,
  stringifyWeekdayList,
  toZonedDate,
  formatInTimeZone,
  STUDENT_LESSON_TEMPLATE_VARIABLES,
  STUDENT_PAYMENT_TEMPLATE_VARIABLES,
  STUDENT_LESSON_TEMPLATE_EXAMPLES,
  STUDENT_PAYMENT_TEMPLATE_EXAMPLES,
  renderNotificationTemplate,
  sendNotificationTelegramMessage,
  getWebPushPublicConfig,
  upsertWebPushSubscription,
  deleteWebPushSubscription,
  sendWebPushToUser,
  TELEGRAM_BOT_TOKEN,
  LOCAL_AUTH_BYPASS,
  applyLessonCancelStatus,
  safeLogActivityEvent,
});
const {
  getSettings,
  updateSettings,
  getNotificationChannelStatus,
  getPwaPushConfig,
  savePwaPushSubscription,
  removePwaPushSubscription,
  sendPwaPushTest,
  listNotificationTestRecipients,
  sendNotificationTest,
  isNotificationTestType,
} = settingsService;

const legacyHomeworkService = createLegacyHomeworkService({
  prisma,
  ensureTeacher,
  safeLogActivityEvent,
  normalizeTeacherStatus,
  ensureStudentAccessLink,
});
const {
  createHomework,
  toggleHomework,
  updateHomework,
  takeHomeworkInWork,
  deleteHomework,
  remindHomework,
  sendHomeworkToStudent,
  remindHomeworkById,
} = legacyHomeworkService;

const automationService = createAutomationService({
  prisma,
  homeworkV2Service,
  filterSuppressedLessons,
  safeLogActivityEvent,
  resolveLessonParticipantNames,
  settleLessonPayments,
  sendStudentPaymentReminder,
  sendTeacherPaymentReminderNotice,
  sendTeacherDailySummary,
  sendTeacherLessonReminder,
  sendStudentLessonReminder,
  sendTeacherOnboardingNudge,
  resolveTimeZone,
  toZonedDate,
  toUtcDateFromTimeZone,
  toUtcEndOfDay,
  formatInTimeZone,
  buildDailySummaryData,
  NOTIFICATION_TICK_MS,
  ONBOARDING_NUDGE_DELAY_MS,
  ONBOARDING_NUDGE_COOLDOWN_MS,
  NOTIFICATION_LOG_RETENTION_DAYS,
  MIN_NOTIFICATION_LOG_RETENTION_DAYS,
  MAX_NOTIFICATION_LOG_RETENTION_DAYS,
});
const {
  runLessonAutomationTick,
  runNotificationTick,
  runOnboardingNudgeTick,
  scheduleDailySessionCleanup: scheduleAutomationMaintenance,
} = automationService;

const handle = async (req: IncomingMessage, res: ServerResponse) => {
  if (!req.url) return notFound(res);

  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;
  const role = getRequestRole(req);
  const requestedStudentId = getRequestedStudentId(req);
  const requestedTeacherId = getRequestedTeacherId(req);

  applySecurityHeaders(req, res, securityConfig);

  const corsResult = applyCorsHeaders(req, res, securityConfig);
  if (!corsResult.allowed) {
    return sendJson(res, 403, { message: 'origin_not_allowed' });
  }

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (!isMutationOriginValid(req, pathname, securityConfig)) {
    return sendJson(res, 403, { message: 'invalid_origin' });
  }

  try {
    const fileUploadMatch = pathname.match(/^\/api\/v2\/files\/upload\/([a-zA-Z0-9-]+)$/);
    if (req.method === 'PUT' && fileUploadMatch) {
      return handlePresignedUploadPutV2(req, res, fileUploadMatch[1]);
    }

    const fileObjectMatch = pathname.match(/^\/api\/v2\/files\/object\/(.+)$/);
    if (req.method === 'GET' && fileObjectMatch) {
      return handleUploadedFileObjectGetV2(req, res, fileObjectMatch[1]);
    }

    if (
      await tryHandleBillingRoutes({
        req,
        res,
        pathname,
        isAuthorized: (request) => isYookassaWebhookAuthorized(request, securityConfig),
        handleYookassaWebhook,
      })
    ) {
      return;
    }

    const sessionUser = pathname.startsWith('/api/') ? await resolveSessionUser(req, res) : null;
    if (pathname.startsWith('/api/') && !sessionUser) {
      return sendJson(res, 401, { message: 'unauthorized' });
    }
    const apiUser = sessionUser as User | null;
    const requireApiUser = () => apiUser as User;
    if (pathname.startsWith('/api/') && apiUser && !hasActiveSubscription(apiUser)) {
      const actingAsStudent = role === 'STUDENT' && (await resolveStudentAccessLinks(apiUser)).length > 0;
      if (!actingAsStudent) {
        return sendJson(res, 403, { message: 'subscription_required' });
      }
    }

    if (
      await tryHandlePwaPushRoutes({
        req,
        res,
        pathname,
        requireApiUser,
        handlers: {
          getPwaPushConfig,
          savePwaPushSubscription,
          removePwaPushSubscription,
          sendPwaPushTest,
        },
      })
    ) {
      return;
    }

    if (
      await tryHandleAuthRoutes({
        req,
        res,
        pathname,
        resolveSessionUser,
        authSessionHandlers,
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
          updateStudentPreferencesV2: homeworkV2Service.updateStudentPreferencesV2,
          getStudentHomeworkSummaryV2: homeworkV2Service.getStudentHomeworkSummaryV2,
          listStudentHomeworkAssignmentsV2: homeworkV2Service.listStudentHomeworkAssignmentsV2,
          getStudentHomeworkAssignmentDetailV2: homeworkV2Service.getStudentHomeworkAssignmentDetailV2,
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
          listHomeworkGroupsV2: homeworkV2Service.listHomeworkGroupsV2,
          createHomeworkGroupV2: homeworkV2Service.createHomeworkGroupV2,
          updateHomeworkGroupV2: homeworkV2Service.updateHomeworkGroupV2,
          deleteHomeworkGroupV2: homeworkV2Service.deleteHomeworkGroupV2,
          listHomeworkTemplatesV2: homeworkV2Service.listHomeworkTemplatesV2,
          createHomeworkTemplateV2: homeworkV2Service.createHomeworkTemplateV2,
          updateHomeworkTemplateV2: homeworkV2Service.updateHomeworkTemplateV2,
          deleteHomeworkTemplateV2: homeworkV2Service.deleteHomeworkTemplateV2,
          listHomeworkAssignmentsV2: homeworkV2Service.listHomeworkAssignmentsV2,
          getHomeworkAssignmentsSummaryV2: homeworkV2Service.getHomeworkAssignmentsSummaryV2,
          createHomeworkAssignmentV2: homeworkV2Service.createHomeworkAssignmentV2,
          bulkHomeworkAssignmentsV2: homeworkV2Service.bulkHomeworkAssignmentsV2,
          getHomeworkAssignmentV2: homeworkV2Service.getHomeworkAssignmentV2,
          updateHomeworkAssignmentV2: homeworkV2Service.updateHomeworkAssignmentV2,
          sendHomeworkAssignmentV2: homeworkV2Service.sendHomeworkAssignmentV2,
          deleteHomeworkAssignmentV2: homeworkV2Service.deleteHomeworkAssignmentV2,
          remindHomeworkAssignmentV2: homeworkV2Service.remindHomeworkAssignmentV2,
          cancelHomeworkAssignmentIssueV2: homeworkV2Service.cancelHomeworkAssignmentIssueV2,
          reissueHomeworkAssignmentV2: homeworkV2Service.reissueHomeworkAssignmentV2,
          listHomeworkSubmissionsV2: homeworkV2Service.listHomeworkSubmissionsV2,
          createHomeworkSubmissionV2: homeworkV2Service.createHomeworkSubmissionV2,
          openHomeworkReviewSessionV2: homeworkV2Service.openHomeworkReviewSessionV2,
          saveHomeworkReviewDraftV2: homeworkV2Service.saveHomeworkReviewDraftV2,
          reviewHomeworkAssignmentV2: homeworkV2Service.reviewHomeworkAssignmentV2,
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
      await tryHandleAccountRoutes({
        req,
        res,
        pathname,
        requireApiUser,
        handlers: { exportAccount },
      })
    ) {
      return;
    }

    if (
      await tryHandleScheduleNoteRoutes({
        req,
        res,
        pathname,
        url,
        role,
        requireApiUser,
        handlers: {
          listScheduleNotes,
          createScheduleNote,
          updateScheduleNote,
          deleteScheduleNote,
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
          previewLessonMutation,
          updateLessonStatus,
          updateLesson,
          cancelLesson,
          restoreLesson,
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
      typeof statusCodeRaw === 'number' && Number.isFinite(statusCodeRaw) ? Math.trunc(statusCodeRaw) : null;
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
    console.error('Не удалось выполнить автоматические сценарии', error);
  });
}, AUTOMATION_TICK_MS);

void runLessonAutomationTick();

setInterval(() => {
  runNotificationTick().catch((error) => {
    console.error('Не удалось отправить уведомления', error);
  });
}, NOTIFICATION_TICK_MS);

void runNotificationTick();

setInterval(() => {
  runOnboardingNudgeTick().catch((error) => {
    console.error('Не удалось отправить напоминание по онбордингу', error);
  });
}, ONBOARDING_NUDGE_TICK_MS);

void runOnboardingNudgeTick().catch((error) => {
  console.error('Не удалось отправить напоминание по онбордингу', error);
});

scheduleAutomationMaintenance();

const server = http.createServer((req, res) => {
  handle(req, res);
});
server.requestTimeout = API_REQUEST_TIMEOUT_MS;
server.headersTimeout = API_HEADERS_TIMEOUT_MS;
server.keepAliveTimeout = API_KEEP_ALIVE_TIMEOUT_MS;
server.maxHeadersCount = 100;

server.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});

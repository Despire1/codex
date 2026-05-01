import type { IncomingMessage } from 'node:http';
import type { Student, User } from '@prisma/client';
import { ru } from 'date-fns/locale';

type NotificationTestTemplateType = 'LESSON_REMINDER' | 'PAYMENT_REMINDER';
type NotificationTestRecipientMode = 'SELF' | 'STUDENTS';
type NotificationTestDataSource = 'PREVIEW_EXAMPLE_A' | 'PREVIEW_EXAMPLE_B';

type TeacherStudentLink = {
  studentId: number;
  customName: string;
  student: Student | null;
};

type WeekendConflictLessonRecord = {
  id: number;
  teacherId: bigint;
  studentId: number;
  startAt: Date;
  status: string;
  isSuppressed: boolean;
  isRecurring: boolean;
  seriesId?: number | null;
  recurrenceGroupId?: string | null;
  participants: Array<{ studentId: number; isPaid?: boolean | null; student?: Student | null }>;
};

type WeekendConflictSeriesUpdate = {
  id: number;
  groupKey: string;
  nextWeekdays: number[];
  shouldStop: boolean;
};

type SettingsDependencies = {
  prisma: any;
  ensureTeacher: (user: User) => Promise<any>;
  clampNumber: (value: number, min: number, max: number) => number;
  isValidTimeString: (value: string) => boolean;
  normalizeEmail: (value: string) => string | null;
  isValidEmail: (value: string) => boolean;
  resolveTeacherWeekendWeekdays: (teacher: { weekendWeekdays?: unknown }) => number[];
  normalizeWeekdayList: (value: unknown) => number[];
  stringifyWeekdayList: (weekdays: number[]) => string;
  toZonedDate: (date: Date, timeZone?: string | null) => Date;
  formatInTimeZone: (date: Date, pattern: string, options?: Record<string, unknown>) => string;
  STUDENT_LESSON_TEMPLATE_VARIABLES: readonly string[];
  STUDENT_PAYMENT_TEMPLATE_VARIABLES: readonly string[];
  STUDENT_LESSON_TEMPLATE_EXAMPLES: Record<'A' | 'B', Record<string, string>>;
  STUDENT_PAYMENT_TEMPLATE_EXAMPLES: Record<'A' | 'B', Record<string, string>>;
  renderNotificationTemplate: (params: {
    template: string;
    values: Record<string, string>;
    allowedVariables: readonly string[];
  }) => {
    renderedText: string;
    missingData: string[];
    unknownPlaceholders: string[];
  };
  sendNotificationTelegramMessage: (chatId: bigint, text: string) => Promise<void>;
  getWebPushPublicConfig: () => unknown;
  upsertWebPushSubscription: (
    userId: number,
    payload: {
      subscription: {
        endpoint: string;
        expirationTime?: number | null;
        keys: { p256dh: string; auth: string };
      };
      routeMode: 'history' | 'hash';
      userAgent?: string | null;
    },
  ) => Promise<{ endpoint: string }>;
  deleteWebPushSubscription: (userId: number, endpoint: string) => Promise<void>;
  sendWebPushToUser: (
    userId: number,
    payload: { title: string; body: string; path: string; tag: string },
  ) => Promise<{ status: 'sent' | 'skipped' | 'failed'; reason?: string; error?: string }>;
  TELEGRAM_BOT_TOKEN: string;
  LOCAL_AUTH_BYPASS: boolean;
  applyLessonCancelStatus: (
    tx: any,
    teacher: { chatId: bigint },
    lessonId: number,
    refundMode?: 'RETURN_TO_BALANCE' | 'KEEP_AS_PAID',
  ) => Promise<{ lesson: unknown; links: any[] }>;
  safeLogActivityEvent: (payload: Record<string, unknown>) => Promise<void>;
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
  const variableRegex = /{{\s*([^}]+)\s*}}/g;
  for (const match of value.matchAll(variableRegex)) {
    const rawVariable = match[1]?.trim() ?? '';
    if (!allowedSet.has(rawVariable)) {
      throw new Error(`Неизвестная переменная: {{${rawVariable}}}`);
    }
  }

  return value;
};

const isNotificationTestType = (value: unknown): value is NotificationTestTemplateType =>
  value === 'LESSON_REMINDER' || value === 'PAYMENT_REMINDER';

const isNotificationTestRecipientMode = (value: unknown): value is NotificationTestRecipientMode =>
  value === 'SELF' || value === 'STUDENTS';

const isNotificationTestDataSource = (value: unknown): value is NotificationTestDataSource =>
  value === 'PREVIEW_EXAMPLE_A' || value === 'PREVIEW_EXAMPLE_B';

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

const uniqueStrings = (values: string[]) => Array.from(new Set(values.filter((value) => value.trim().length > 0)));

const SETTINGS_FIELD_LABELS: Record<string, string> = {
  timezone: 'Часовой пояс',
  defaultLessonDuration: 'Длительность урока по умолчанию',
  lessonReminderEnabled: 'Напоминания об уроке',
  lessonReminderMinutes: 'Когда напоминать об уроке',
  dailySummaryEnabled: 'Сводка на сегодня',
  dailySummaryTime: 'Время сводки на сегодня',
  tomorrowSummaryEnabled: 'Сводка на завтра',
  tomorrowSummaryTime: 'Время сводки на завтра',
  weekendWeekdays: 'Выходные дни',
  studentNotificationsEnabled: 'Напоминания ученикам',
  studentUpcomingLessonTemplate: 'Шаблон напоминания об уроке ученику',
  studentPaymentDueTemplate: 'Шаблон напоминания об оплате ученику',
  autoConfirmLessons: 'Автоподтверждение уроков',
  globalPaymentRemindersEnabled: 'Автоматические напоминания об оплате',
  paymentReminderDelayHours: 'Отправлять напоминание об оплате через',
  paymentReminderRepeatHours: 'Повторять напоминание об оплате',
  paymentReminderMaxCount: 'Максимум напоминаний об оплате',
  notifyTeacherOnAutoPaymentReminder: 'Уведомлять меня об авто-напоминаниях об оплате',
  notifyTeacherOnManualPaymentReminder: 'Уведомлять меня о ручных напоминаниях об оплате',
  homeworkNotifyOnAssign: 'Уведомлять при выдаче домашки',
  homeworkReminder24hEnabled: 'Напоминание о ДЗ за 24 часа',
  homeworkReminderMorningEnabled: 'Утреннее напоминание о ДЗ',
  homeworkReminderMorningTime: 'Время утреннего напоминания о ДЗ',
  homeworkReminder3hEnabled: 'Напоминание о ДЗ за 3 часа',
  homeworkOverdueRemindersEnabled: 'Напоминания о просроченной ДЗ',
  homeworkOverdueReminderTime: 'Время напоминания о просрочке ДЗ',
  homeworkOverdueReminderMaxCount: 'Максимум напоминаний о просрочке ДЗ',
  receiptEmail: 'Email для чеков',
};

const SETTINGS_VALUE_UNITS: Record<string, 'minutes' | 'hours' | 'count'> = {
  defaultLessonDuration: 'minutes',
  lessonReminderMinutes: 'minutes',
  paymentReminderDelayHours: 'hours',
  paymentReminderRepeatHours: 'hours',
  paymentReminderMaxCount: 'count',
  homeworkOverdueReminderMaxCount: 'count',
};

const WEEKDAY_LABELS_RU = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

const pluralizeMinutes = (value: number): string => {
  const abs = Math.abs(value) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 14) return `${value} минут`;
  if (last === 1) return `${value} минута`;
  if (last >= 2 && last <= 4) return `${value} минуты`;
  return `${value} минут`;
};

const pluralizeHours = (value: number): string => {
  const abs = Math.abs(value) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 14) return `${value} часов`;
  if (last === 1) return `${value} час`;
  if (last >= 2 && last <= 4) return `${value} часа`;
  return `${value} часов`;
};

const formatSettingsValue = (key: string, value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'включено' : 'выключено';
  if (key === 'weekendWeekdays') {
    const raw = typeof value === 'string' ? value : '';
    const indexes = raw
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
    if (!indexes.length) return 'нет';
    return indexes.map((index) => WEEKDAY_LABELS_RU[index]).join(', ');
  }
  if (typeof value === 'number') {
    const unit = SETTINGS_VALUE_UNITS[key];
    if (unit === 'minutes') return pluralizeMinutes(value);
    if (unit === 'hours') return pluralizeHours(value);
    return String(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 60) return `${trimmed.slice(0, 57)}…`;
    return trimmed || '—';
  }
  return String(value);
};

const buildSettingsChangeDetails = (
  changedTeacherKeys: string[],
  changedUserKeys: string[],
  oldTeacher: Record<string, unknown>,
  newTeacher: Record<string, unknown>,
  oldUser: Record<string, unknown>,
  newUser: Record<string, unknown>,
): string => {
  const parts: string[] = [];

  const describe = (key: string, oldSource: Record<string, unknown>, newSource: Record<string, unknown>) => {
    const label = SETTINGS_FIELD_LABELS[key];
    if (!label) return null;
    const oldValue = formatSettingsValue(key, oldSource[key]);
    const newValue = formatSettingsValue(key, newSource[key]);
    if (oldValue === newValue) return `${label}: ${newValue}`;
    return `${label}: ${oldValue} → ${newValue}`;
  };

  for (const key of changedTeacherKeys) {
    const line = describe(key, oldTeacher, newTeacher);
    if (line) parts.push(line);
  }
  for (const key of changedUserKeys) {
    const line = describe(key, oldUser, newUser);
    if (line) parts.push(line);
  }

  return parts.join('; ');
};

export const createSettingsService = ({
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
}: SettingsDependencies) => {
  const resolveNotificationTestVariables = (type: NotificationTestTemplateType) =>
    type === 'LESSON_REMINDER' ? STUDENT_LESSON_TEMPLATE_VARIABLES : STUDENT_PAYMENT_TEMPLATE_VARIABLES;

  const resolveNotificationTestExamples = (type: NotificationTestTemplateType, source: NotificationTestDataSource) => {
    const key = source === 'PREVIEW_EXAMPLE_A' ? 'A' : 'B';
    return type === 'LESSON_REMINDER' ? STUDENT_LESSON_TEMPLATE_EXAMPLES[key] : STUDENT_PAYMENT_TEMPLATE_EXAMPLES[key];
  };

  const pickTeacherSettings = (teacher: any) => ({
    timezone: teacher.timezone ?? null,
    defaultLessonDuration: teacher.defaultLessonDuration,
    lessonReminderEnabled: teacher.lessonReminderEnabled,
    lessonReminderMinutes: teacher.lessonReminderMinutes,
    dailySummaryEnabled: teacher.dailySummaryEnabled,
    dailySummaryTime: teacher.dailySummaryTime,
    tomorrowSummaryEnabled: teacher.tomorrowSummaryEnabled,
    tomorrowSummaryTime: teacher.tomorrowSummaryTime,
    weekendWeekdays: resolveTeacherWeekendWeekdays(teacher),
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

  const getLessonWeekdayInTeacherTimeZone = (startAt: Date, timeZone?: string | null) =>
    toZonedDate(startAt, timeZone).getDay();

  const resolveWeekendConflictSeriesUpdates = async (
    tx: any,
    lessons: WeekendConflictLessonRecord[],
    weekendWeekdays: number[],
  ) => {
    const seriesIds = Array.from(
      new Set(
        lessons.map((lesson) => lesson.seriesId ?? null).filter((value): value is number => typeof value === 'number'),
      ),
    );
    const groupKeys = Array.from(
      new Set(lessons.map((lesson) => lesson.recurrenceGroupId?.trim() ?? '').filter((value) => value.length > 0)),
    );

    if (seriesIds.length === 0 && groupKeys.length === 0) {
      return [] as WeekendConflictSeriesUpdate[];
    }

    const seriesRecords = await tx.lessonSeries.findMany({
      where: {
        OR: [
          seriesIds.length > 0 ? { id: { in: seriesIds } } : null,
          groupKeys.length > 0 ? { groupKey: { in: groupKeys } } : null,
        ].filter(Boolean),
      },
    });

    const seriesById = new Map<number, any>(seriesRecords.map((series: any) => [series.id, series]));
    const seriesByGroupKey = new Map<string, any>(seriesRecords.map((series: any) => [series.groupKey, series]));
    const updates = new Map<number, WeekendConflictSeriesUpdate>();

    lessons.forEach((lesson) => {
      const series =
        (typeof lesson.seriesId === 'number' ? seriesById.get(lesson.seriesId) : null) ??
        (lesson.recurrenceGroupId ? seriesByGroupKey.get(lesson.recurrenceGroupId) : null);
      if (!series || updates.has(series.id)) return;

      const currentWeekdays = normalizeWeekdayList(series.recurrenceWeekdays);
      const nextWeekdays = currentWeekdays.filter((weekday) => !weekendWeekdays.includes(weekday));
      updates.set(series.id, {
        id: series.id,
        groupKey: series.groupKey,
        nextWeekdays,
        shouldStop: nextWeekdays.length === 0,
      });
    });

    return Array.from(updates.values());
  };

  const resolveWeekendSettingsConflict = async (
    tx: any,
    teacher: { chatId: bigint; timezone?: string | null; weekendWeekdays?: unknown },
    nextWeekendWeekdays: number[],
  ) => {
    const previousWeekendWeekdays = resolveTeacherWeekendWeekdays(teacher);
    const newlyAddedWeekendWeekdays = nextWeekendWeekdays.filter(
      (weekday) => !previousWeekendWeekdays.includes(weekday),
    );

    if (newlyAddedWeekendWeekdays.length === 0) {
      return {
        lessons: [] as WeekendConflictLessonRecord[],
        conflict: null,
        seriesUpdates: [] as WeekendConflictSeriesUpdate[],
      };
    }

    const candidateLessons = (await tx.lesson.findMany({
      where: {
        teacherId: teacher.chatId,
        startAt: { gt: new Date() },
        isSuppressed: false,
        status: { not: 'CANCELED' },
      },
      include: {
        participants: {
          include: {
            student: true,
          },
        },
      },
      orderBy: {
        startAt: 'asc',
      },
    })) as WeekendConflictLessonRecord[];

    const lessons = candidateLessons.filter((lesson) =>
      newlyAddedWeekendWeekdays.includes(getLessonWeekdayInTeacherTimeZone(lesson.startAt, teacher.timezone)),
    );

    if (lessons.length === 0) {
      return {
        lessons,
        conflict: null,
        seriesUpdates: [] as WeekendConflictSeriesUpdate[],
      };
    }

    const participantIds = Array.from(
      new Set(lessons.flatMap((lesson) => lesson.participants.map((participant) => participant.studentId))),
    );
    const links = participantIds.length
      ? await tx.teacherStudent.findMany({
          where: { teacherId: teacher.chatId, studentId: { in: participantIds }, isArchived: false },
          include: { student: true },
        })
      : [];
    const seriesUpdates = await resolveWeekendConflictSeriesUpdates(tx, lessons, nextWeekendWeekdays);
    const paidLessonsCount = lessons.filter((lesson) =>
      lesson.participants.some((participant) => Boolean(participant.isPaid)),
    ).length;
    const refundAmount = lessons.reduce(
      (count, lesson) => count + lesson.participants.filter((participant) => Boolean(participant.isPaid)).length,
      0,
    );

    return {
      lessons,
      seriesUpdates,
      conflict: {
        conflictingLessonsCount: lessons.length,
        paidLessonsCount,
        refundAmount,
        affectedDates: uniqueStrings(
          lessons.map((lesson) =>
            formatInTimeZone(lesson.startAt, 'dd.MM (EEE)', { timeZone: teacher.timezone, locale: ru }),
          ),
        ),
        affectedLessons: lessons.map((lesson) => ({
          id: lesson.id,
          startAt: lesson.startAt.toISOString(),
          participantNames: lesson.participants
            .map((participant) => {
              const link = links.find((item: any) => item.studentId === participant.studentId);
              return resolveStudentDisplayName(link ?? {}, participant.student);
            })
            .filter(Boolean),
          isRecurring: Boolean(lesson.isRecurring),
          seriesId: lesson.seriesId ?? null,
        })),
        affectedRecurringSeriesCount: seriesUpdates.length,
        seriesToUpdateCount: seriesUpdates.filter((series) => !series.shouldStop).length,
        seriesToStopCount: seriesUpdates.filter((series) => series.shouldStop).length,
      },
    };
  };

  const getSettings = async (user: User) => {
    const teacher = await ensureTeacher(user);
    return {
      settings: {
        ...pickTeacherSettings(teacher),
        receiptEmail: user.receiptEmail ?? null,
        securityAlertsEnabled: user.securityAlertsEnabled,
        securityAlertNewDevice: user.securityAlertNewDevice,
        securityAlertLogout: user.securityAlertLogout,
        securityAlertSessionRevoke: user.securityAlertSessionRevoke,
      },
    };
  };

  const updateSettings = async (user: User, body: any) => {
    const teacher = await ensureTeacher(user);
    const data: Record<string, any> = {};
    const userData: Record<string, any> = {};
    const nextWeekendWeekdays =
      body.weekendWeekdays !== undefined ? normalizeWeekdayList(body.weekendWeekdays) : undefined;
    const shouldConfirmWeekendConflicts = Boolean(body?.confirmWeekendConflicts);

    if (typeof body.timezone === 'string') {
      const trimmed = body.timezone.trim();
      data.timezone = trimmed ? trimmed : null;
    } else if (body.timezone === null) {
      data.timezone = null;
    }
    if (typeof body.name === 'string') {
      const trimmedName = body.name.trim().slice(0, 60);
      data.name = trimmedName ? trimmedName : null;
    } else if (body.name === null) {
      data.name = null;
    }
    if (body.defaultLessonDuration !== undefined) {
      const numeric = Number(body.defaultLessonDuration);
      if (Number.isFinite(numeric)) {
        data.defaultLessonDuration = clampNumber(Math.round(numeric), 15, 240);
      }
    }
    if (typeof body.lessonReminderEnabled === 'boolean') data.lessonReminderEnabled = body.lessonReminderEnabled;
    if (body.lessonReminderMinutes !== undefined) {
      const numeric = Number(body.lessonReminderMinutes);
      if (Number.isFinite(numeric)) data.lessonReminderMinutes = clampNumber(Math.round(numeric), 5, 120);
    }
    if (typeof body.dailySummaryEnabled === 'boolean') data.dailySummaryEnabled = body.dailySummaryEnabled;
    if (typeof body.dailySummaryTime === 'string' && isValidTimeString(body.dailySummaryTime)) {
      data.dailySummaryTime = body.dailySummaryTime;
    }
    if (typeof body.tomorrowSummaryEnabled === 'boolean') data.tomorrowSummaryEnabled = body.tomorrowSummaryEnabled;
    if (typeof body.tomorrowSummaryTime === 'string' && isValidTimeString(body.tomorrowSummaryTime)) {
      data.tomorrowSummaryTime = body.tomorrowSummaryTime;
    }
    if (nextWeekendWeekdays !== undefined) data.weekendWeekdays = stringifyWeekdayList(nextWeekendWeekdays);
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
    if (typeof body.autoConfirmLessons === 'boolean') data.autoConfirmLessons = body.autoConfirmLessons;
    if (typeof body.globalPaymentRemindersEnabled === 'boolean') {
      data.globalPaymentRemindersEnabled = body.globalPaymentRemindersEnabled;
    }
    if (body.paymentReminderDelayHours !== undefined) {
      const numeric = Number(body.paymentReminderDelayHours);
      if (Number.isFinite(numeric)) data.paymentReminderDelayHours = clampNumber(Math.round(numeric), 1, 168);
    }
    if (body.paymentReminderRepeatHours !== undefined) {
      const numeric = Number(body.paymentReminderRepeatHours);
      if (Number.isFinite(numeric)) data.paymentReminderRepeatHours = clampNumber(Math.round(numeric), 1, 168);
    }
    if (body.paymentReminderMaxCount !== undefined) {
      const numeric = Number(body.paymentReminderMaxCount);
      if (Number.isFinite(numeric)) data.paymentReminderMaxCount = clampNumber(Math.round(numeric), 1, 10);
    }
    if (typeof body.notifyTeacherOnAutoPaymentReminder === 'boolean') {
      data.notifyTeacherOnAutoPaymentReminder = body.notifyTeacherOnAutoPaymentReminder;
    }
    if (typeof body.notifyTeacherOnManualPaymentReminder === 'boolean') {
      data.notifyTeacherOnManualPaymentReminder = body.notifyTeacherOnManualPaymentReminder;
    }
    if (typeof body.homeworkNotifyOnAssign === 'boolean') data.homeworkNotifyOnAssign = body.homeworkNotifyOnAssign;
    if (typeof body.homeworkReminder24hEnabled === 'boolean') {
      data.homeworkReminder24hEnabled = body.homeworkReminder24hEnabled;
    }
    if (typeof body.homeworkReminderMorningEnabled === 'boolean') {
      data.homeworkReminderMorningEnabled = body.homeworkReminderMorningEnabled;
    }
    if (typeof body.homeworkReminderMorningTime === 'string' && isValidTimeString(body.homeworkReminderMorningTime)) {
      data.homeworkReminderMorningTime = body.homeworkReminderMorningTime;
    }
    if (typeof body.homeworkReminder3hEnabled === 'boolean')
      data.homeworkReminder3hEnabled = body.homeworkReminder3hEnabled;
    if (typeof body.homeworkOverdueRemindersEnabled === 'boolean') {
      data.homeworkOverdueRemindersEnabled = body.homeworkOverdueRemindersEnabled;
    }
    if (typeof body.homeworkOverdueReminderTime === 'string' && isValidTimeString(body.homeworkOverdueReminderTime)) {
      data.homeworkOverdueReminderTime = body.homeworkOverdueReminderTime;
    }
    if (body.homeworkOverdueReminderMaxCount !== undefined) {
      const numeric = Number(body.homeworkOverdueReminderMaxCount);
      if (Number.isFinite(numeric)) data.homeworkOverdueReminderMaxCount = clampNumber(Math.round(numeric), 1, 10);
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
    if (typeof body.securityAlertsEnabled === 'boolean') {
      userData.securityAlertsEnabled = body.securityAlertsEnabled;
    }
    if (typeof body.securityAlertNewDevice === 'boolean') {
      userData.securityAlertNewDevice = body.securityAlertNewDevice;
    }
    if (typeof body.securityAlertLogout === 'boolean') {
      userData.securityAlertLogout = body.securityAlertLogout;
    }
    if (typeof body.securityAlertSessionRevoke === 'boolean') {
      userData.securityAlertSessionRevoke = body.securityAlertSessionRevoke;
    }

    const shouldUpdateTeacher = Object.keys(data).length > 0;
    const shouldUpdateUser = Object.keys(userData).length > 0;
    const weekendConflict =
      nextWeekendWeekdays !== undefined
        ? await prisma.$transaction((tx: any) => resolveWeekendSettingsConflict(tx, teacher, nextWeekendWeekdays))
        : null;

    if (weekendConflict?.conflict && !shouldConfirmWeekendConflicts) {
      return {
        requiresWeekendConflictConfirmation: true as const,
        conflict: weekendConflict.conflict,
      };
    }

    const result = await prisma.$transaction(async (tx: any) => {
      const updatedTeacher = shouldUpdateTeacher
        ? await tx.teacher.update({
            where: { chatId: teacher.chatId },
            data,
          })
        : teacher;

      const updatedUser = shouldUpdateUser
        ? await tx.user.update({
            where: { id: user.id },
            data: userData,
          })
        : user;

      const linksMap = new Map<string, any>();
      const removedLessonIds: number[] = [];

      if (weekendConflict?.lessons.length) {
        for (const lesson of weekendConflict.lessons) {
          const cancelResult = await applyLessonCancelStatus(tx, teacher, lesson.id, 'RETURN_TO_BALANCE');
          removedLessonIds.push(lesson.id);
          cancelResult.links.forEach((link: any) => {
            linksMap.set(`${link.teacherId}_${link.studentId}`, link);
          });
          await tx.lesson.update({
            where: { id: lesson.id },
            data: { isSuppressed: true },
          });
        }

        const now = new Date();
        for (const series of weekendConflict.seriesUpdates) {
          const recurrenceWeekdays = JSON.stringify(series.nextWeekdays);
          await tx.lessonSeries.update({
            where: { id: series.id },
            data: {
              recurrenceWeekdays,
              status: series.shouldStop ? 'STOPPED' : 'ACTIVE',
            },
          });
          await tx.lesson.updateMany({
            where: {
              teacherId: teacher.chatId,
              startAt: { gt: now },
              OR: [{ seriesId: series.id }, { recurrenceGroupId: series.groupKey }],
            },
            data: {
              recurrenceWeekdays,
            },
          });
        }
      }

      return {
        updatedTeacher,
        updatedUser,
        links: Array.from(linksMap.values()),
        removedLessonIds,
      };
    });

    const changedTeacherKeys = Object.keys(data).filter(
      (key) => (teacher as any)[key] !== (result.updatedTeacher as any)[key],
    );
    const changedUserKeys = Object.keys(userData).filter(
      (key) => (user as any)[key] !== (result.updatedUser as any)[key],
    );
    if (changedTeacherKeys.length > 0 || changedUserKeys.length > 0) {
      const details = buildSettingsChangeDetails(
        changedTeacherKeys,
        changedUserKeys,
        teacher as Record<string, unknown>,
        result.updatedTeacher as Record<string, unknown>,
        user as Record<string, unknown>,
        result.updatedUser as Record<string, unknown>,
      );
      await safeLogActivityEvent({
        teacherId: teacher.chatId,
        category: 'SETTINGS',
        action: 'UPDATE_SETTINGS',
        status: 'SUCCESS',
        source: 'USER',
        title: 'Обновлены настройки',
        details,
        payload: {
          changedTeacherKeys,
          changedUserKeys,
          weekendConflictLessonsCanceled: result.removedLessonIds.length,
          weekendSeriesUpdated: weekendConflict?.seriesUpdates.length ?? 0,
        },
      });
    }

    return {
      settings: {
        ...pickTeacherSettings(result.updatedTeacher),
        receiptEmail: result.updatedUser.receiptEmail ?? null,
        securityAlertsEnabled: result.updatedUser.securityAlertsEnabled,
        securityAlertNewDevice: result.updatedUser.securityAlertNewDevice,
        securityAlertLogout: result.updatedUser.securityAlertLogout,
        securityAlertSessionRevoke: result.updatedUser.securityAlertSessionRevoke,
      },
      links: result.links,
      removedLessonIds: result.removedLessonIds,
    };
  };

  const getNotificationChannelStatus = () => ({
    channel: 'telegram',
    configured: Boolean(TELEGRAM_BOT_TOKEN),
    reason: TELEGRAM_BOT_TOKEN ? undefined : 'missing_token',
  });

  const getPwaPushConfig = () => getWebPushPublicConfig();

  const savePwaPushSubscription = async (
    user: User,
    req: IncomingMessage,
    body: {
      subscription: {
        endpoint: string;
        expirationTime?: number | null;
        keys: { p256dh: string; auth: string };
      };
      routeMode: 'history' | 'hash';
      userAgent?: string | null;
    },
  ) => {
    const subscription = await upsertWebPushSubscription(user.id, {
      subscription: body.subscription,
      routeMode: body.routeMode,
      userAgent: body.userAgent ?? req.headers['user-agent'] ?? null,
    });

    return {
      status: 'ok' as const,
      endpoint: subscription.endpoint,
    };
  };

  const removePwaPushSubscription = async (user: User, body: { endpoint: string }) => {
    await deleteWebPushSubscription(user.id, body.endpoint);
    return {
      status: 'ok' as const,
      endpoint: body.endpoint,
    };
  };

  const sendPwaPushTest = async (user: User) => {
    const testTag = `teacherbot-pwa-test-${Date.now()}`;
    const result = await sendWebPushToUser(user.id, {
      title: 'Тестовое уведомление TeacherBot',
      body: 'TeacherBot подключен. Уведомления на этом устройстве работают.',
      path: '/dashboard',
      tag: testTag,
    });

    if (result.status === 'sent') return { status: 'sent' as const };
    if (result.status === 'skipped') {
      return { status: 'skipped' as const, reason: result.reason };
    }
    return { status: 'failed' as const, error: result.error };
  };

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
    const studentIds: number[] = Array.from(new Set(rawIds.map((value) => Number(value)).filter(Number.isFinite)));
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
      } catch {
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

  return {
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
  };
};

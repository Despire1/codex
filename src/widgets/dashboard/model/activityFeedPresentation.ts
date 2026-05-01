import ru, { addDays, isSameDay } from 'date-fns';
import type { ActivityFeedItem } from '../../../entities/types';
import { inflectFirstName } from '../../../shared/lib/inflectName';
import { formatInTimeZone, toZonedDate } from '../../../shared/lib/timezoneDates';

export type ActivityTimelineTone = 'success' | 'failed' | 'info';

export type ActivityTimelinePresentation = {
  timeLabel: string;
  message: string;
  details: string | null;
  tone: ActivityTimelineTone;
};

const sentence = (value: string) => {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) return '';
  if (/[.!?]$/.test(normalized)) return normalized;
  return `${normalized}.`;
};

const payloadAsRecord = (item: ActivityFeedItem): Record<string, unknown> | null => {
  const value = item.payload;
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
};

const payloadString = (item: ActivityFeedItem, key: string): string | null => {
  const payload = payloadAsRecord(item);
  const value = payload?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const payloadNumber = (item: ActivityFeedItem, key: string): number | null => {
  const payload = payloadAsRecord(item);
  const value = payload?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

const payloadStringArray = (item: ActivityFeedItem, key: string): string[] => {
  const payload = payloadAsRecord(item);
  const value = payload?.[key];
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const payloadNumberArray = (item: ActivityFeedItem, key: string): number[] => {
  const payload = payloadAsRecord(item);
  const value = payload?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry));
};

const LESSON_WEEKDAY_LABELS_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const;

const resolveWeekdayLabels = (item: ActivityFeedItem) => {
  const explicitLabels = payloadStringArray(item, 'repeatWeekdayLabels');
  if (explicitLabels.length > 0) return explicitLabels;
  return payloadNumberArray(item, 'repeatWeekdays')
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .map((day) => LESSON_WEEKDAY_LABELS_RU[day]);
};

const resolveParticipantNames = (item: ActivityFeedItem) => {
  const names = payloadStringArray(item, 'studentNames');
  if (names.length > 0) return names;
  if (item.studentName?.trim()) return [item.studentName.trim()];
  return [];
};

const resolveTimeLabel = (occurredAt: string, timeZone: string) => {
  const eventDate = toZonedDate(occurredAt, timeZone);
  const nowDate = toZonedDate(new Date(), timeZone);
  const timeLabel = formatInTimeZone(occurredAt, 'HH:mm', { timeZone });
  if (isSameDay(eventDate, nowDate)) return timeLabel;
  if (isSameDay(eventDate, addDays(nowDate, -1))) return `Вчера, ${timeLabel}`;
  return formatInTimeZone(occurredAt, 'd MMM, HH:mm', { locale: ru, timeZone });
};

const resolveLessonContext = (item: ActivityFeedItem, timeZone: string): string | null => {
  const lessonStartAt = payloadString(item, 'lessonStartAt');
  if (lessonStartAt) {
    return formatInTimeZone(lessonStartAt, 'd MMM, HH:mm', { locale: ru, timeZone });
  }
  return null;
};

const resolveHomeworkTitle = (item: ActivityFeedItem): string | null => payloadString(item, 'homeworkTitle');

const resolveHomeworkDeadlineLabel = (item: ActivityFeedItem, timeZone: string): string | null => {
  const deadline = payloadString(item, 'homeworkDeadlineAt');
  if (!deadline) return null;
  return formatInTimeZone(deadline, 'd MMM, HH:mm', { locale: ru, timeZone });
};

const wrapHomeworkTitle = (title: string | null) => (title ? `«${title}»` : 'домашка');

const resolveStudentContexts = (item: ActivityFeedItem) => {
  const name = item.studentName?.trim() || null;
  return {
    name,
    dative: name ? `ученику ${inflectFirstName(name, 'dative')}` : 'ученику',
    genitive: name ? `у ${inflectFirstName(name, 'genitive')}` : 'у ученика',
    forName: name ? `для ${inflectFirstName(name, 'genitive')}` : null,
  };
};

const buildPaymentValue = (item: ActivityFeedItem) => {
  const moneyAmount = payloadNumber(item, 'moneyAmount');
  if (moneyAmount !== null) return `${moneyAmount} ₽`;
  const lessonsDelta = payloadNumber(item, 'lessonsDelta');
  if (lessonsDelta !== null) {
    const sign = lessonsDelta > 0 ? '+' : '';
    return `${sign}${lessonsDelta} ур.`;
  }
  return null;
};

const resolveFailureDetails = (item: ActivityFeedItem): string | null => {
  const raw = item.details?.trim();
  if (!raw) return null;
  const normalized = raw.toLowerCase();

  if (normalized.includes('chat not found')) {
    const isTeacherTarget = item.action === 'PAYMENT_REMINDER_TEACHER' || item.action === 'TEACHER_LESSON_REMINDER';
    if (isTeacherTarget) {
      return 'Чат с ботом не открыт. Откройте бота в Telegram и нажмите /start, чтобы получать уведомления.';
    }
    return 'У получателя не открыт чат с ботом. Попросите ученика найти бота в Telegram и нажать /start.';
  }

  if (normalized.includes('blocked by the user')) {
    const isTeacherTarget = item.action === 'PAYMENT_REMINDER_TEACHER' || item.action === 'TEACHER_LESSON_REMINDER';
    if (isTeacherTarget) {
      return 'Вы заблокировали бота в Telegram. Разблокируйте бота, чтобы получать уведомления.';
    }
    return 'Получатель заблокировал бота. Попросите ученика разблокировать бота в Telegram.';
  }

  if (normalized.includes('bad request')) {
    return `Ошибка Telegram API: ${raw}`;
  }

  if (
    normalized.includes('fetch failed') ||
    normalized.includes('network') ||
    normalized.includes('econnrefused') ||
    normalized.includes('econnreset') ||
    normalized.includes('enotfound')
  ) {
    return 'Не удалось связаться с Telegram. Попробуем отправить позже.';
  }

  if (normalized.includes('timeout') || normalized.includes('etimedout')) {
    return 'Telegram не ответил вовремя. Попробуем отправить позже.';
  }

  if (normalized.includes('too many requests') || normalized.includes('rate limit')) {
    return 'Telegram временно ограничил отправку. Повторим попытку позже.';
  }

  // Не показываем сырой английский технический текст пользователю.
  if (!/[а-яё]/i.test(raw)) {
    return 'Сообщение не доставлено. Попробуем отправить позже.';
  }

  return raw;
};

const NOTIFICATION_CHANNEL_LABELS: Record<string, string> = {
  TELEGRAM: 'Telegram',
  PWA_PUSH: 'Push в браузере',
};

const HOMEWORK_ACTIONS_WITH_DEADLINE = new Set([
  'HOMEWORK_ASSIGNED',
  'HOMEWORK_REMINDER_24H',
  'HOMEWORK_REMINDER_3H',
  'HOMEWORK_REMINDER_MORNING',
  'HOMEWORK_REMINDER_MANUAL',
]);

const composeNotificationDetails = (item: ActivityFeedItem, timeZone: string): string | null => {
  const parts: string[] = [];
  const channel = payloadString(item, 'channel') ?? payloadString(item, 'notificationChannel');

  if (HOMEWORK_ACTIONS_WITH_DEADLINE.has(item.action)) {
    const deadline = resolveHomeworkDeadlineLabel(item, timeZone);
    if (deadline) parts.push(`Дедлайн: ${deadline}`);
  }

  if (channel && NOTIFICATION_CHANNEL_LABELS[channel]) {
    parts.push(NOTIFICATION_CHANNEL_LABELS[channel]);
  }

  return parts.length > 0 ? parts.join(' • ') : null;
};

const failPrefix = (failed: boolean) => (failed ? 'Не отправлено: ' : '');

const composeNotificationMessage = (item: ActivityFeedItem, lessonContext: string | null) => {
  const student = resolveStudentContexts(item);
  const failed = item.status === 'FAILED';
  const lessonSuffix = lessonContext ? ` • ${lessonContext}` : '';
  const homeworkTitle = resolveHomeworkTitle(item);
  const hwLabel = wrapHomeworkTitle(homeworkTitle);

  switch (item.action) {
    case 'PAYMENT_REMINDER_STUDENT': {
      const manual = item.source === 'USER' && !failed;
      const head = `${failPrefix(failed)}${manual ? 'Ручное напоминание' : 'Напоминание'} об оплате — ${student.dative}`;
      return sentence(`${head}${lessonSuffix}`);
    }
    case 'PAYMENT_REMINDER_TEACHER':
      return sentence(
        `${failPrefix(failed)}Копия напоминания об оплате${student.name ? ` — ${student.name}` : ''}${lessonSuffix}`,
      );
    case 'STUDENT_LESSON_REMINDER':
      return sentence(`${failPrefix(failed)}Напоминание об уроке — ${student.dative}${lessonSuffix}`);
    case 'TEACHER_LESSON_REMINDER':
      return sentence(
        `${failPrefix(failed)}Напоминание преподавателю об уроке${student.name ? ` — ${student.name}` : ''}${lessonSuffix}`,
      );
    case 'TEACHER_DAILY_SUMMARY':
      return sentence(`${failPrefix(failed)}Сводка преподавателю на сегодня`);
    case 'TEACHER_TOMORROW_SUMMARY':
      return sentence(`${failPrefix(failed)}Сводка преподавателю на завтра`);
    case 'TEACHER_ONBOARDING_NUDGE':
      return sentence(`${failPrefix(failed)}Подсказка о настройке бота`);
    case 'HOMEWORK_ASSIGNED':
      return sentence(`${failPrefix(failed)}Новое ДЗ ${hwLabel} — ${student.dative}`);
    case 'HOMEWORK_REMINDER_24H':
      return sentence(`${failPrefix(failed)}Напоминание о ДЗ ${hwLabel} (сутки до дедлайна) — ${student.dative}`);
    case 'HOMEWORK_REMINDER_3H':
      return sentence(`${failPrefix(failed)}Напоминание о ДЗ ${hwLabel} (3 часа до дедлайна) — ${student.dative}`);
    case 'HOMEWORK_REMINDER_MORNING':
      return sentence(`${failPrefix(failed)}Утреннее напоминание о ДЗ ${hwLabel} — ${student.dative}`);
    case 'HOMEWORK_REMINDER_MANUAL':
      return sentence(`${failPrefix(failed)}Ручное напоминание о ДЗ ${hwLabel} — ${student.dative}`);
    case 'HOMEWORK_OVERDUE':
      return sentence(`${failPrefix(failed)}ДЗ ${hwLabel} просрочено — ${student.dative}`);
    case 'HOMEWORK_UNISSUED':
      return sentence(`${failPrefix(failed)}ДЗ ${hwLabel} отозвано — ${student.dative}`);
    case 'HOMEWORK_RETURNED':
      return sentence(`${failPrefix(failed)}ДЗ ${hwLabel} возвращено на доработку — ${student.dative}`);
    case 'HOMEWORK_REVIEWED':
      return sentence(`${failPrefix(failed)}ДЗ ${hwLabel} проверено — ${student.dative}`);
    default: {
      const subject = student.dative !== 'ученику' ? ` — ${student.dative}` : '';
      return sentence(`${failPrefix(failed)}Уведомление${subject}`);
    }
  }
};

const composePaymentMessage = (item: ActivityFeedItem, lessonContext: string | null) => {
  const student = resolveStudentContexts(item);
  const studentTag = student.name ? ` — ${student.name}` : '';
  const reason = payloadString(item, 'reason');
  const value = buildPaymentValue(item);
  const lessonSuffix = lessonContext ? ` • ${lessonContext}` : '';

  switch (item.action) {
    case 'AUTO_CHARGE':
      return sentence(`Автосписание за занятие${studentTag}${lessonSuffix}`);
    case 'MANUAL_PAID':
      if (reason === 'BALANCE_PAYMENT') {
        return sentence(`Списано с баланса${studentTag}${lessonSuffix}`);
      }
      return sentence(`Оплата принята${studentTag}${lessonSuffix}`);
    case 'TOP_UP':
      return sentence(`Пополнение баланса${studentTag}${value ? ` • ${value}` : ''}`);
    case 'SUBSCRIPTION':
      return sentence(`Оформлен абонемент${studentTag}${value ? ` • ${value}` : ''}`);
    case 'ADJUSTMENT':
      if (reason === 'LESSON_CANCELED') {
        return sentence(`Возврат за отменённое занятие${studentTag}${lessonSuffix}`);
      }
      if (reason === 'PAYMENT_REVERT_REFUND' || reason === 'PAYMENT_REVERT') {
        return sentence(`Оплата отменена с возвратом${studentTag}${lessonSuffix}`);
      }
      if (reason === 'PAYMENT_REVERT_WRITE_OFF') {
        return sentence(`Оплата отменена без возврата${studentTag}${lessonSuffix}`);
      }
      return sentence(`Корректировка баланса${studentTag}${value ? ` • ${value}` : ''}`);
    default:
      return sentence(item.title || 'Событие оплаты');
  }
};

const composeLessonMessage = (item: ActivityFeedItem, lessonContext: string | null) => {
  const participantNames = resolveParticipantNames(item);
  const participantTag =
    participantNames.length === 1
      ? ` — ${participantNames[0]}`
      : participantNames.length > 1
        ? ` — ${participantNames.join(', ')}`
        : '';
  const lessonSuffix = lessonContext ? ` • ${lessonContext}` : '';

  if (item.action === 'REMIND_PAYMENT') {
    return sentence(`Ручное напоминание об оплате${participantTag}${lessonSuffix}`);
  }
  if (item.action === 'AUTO_COMPLETE') {
    return sentence(`Занятие автоматически проведено${participantTag}${lessonSuffix}`);
  }
  if (item.action === 'CREATE') {
    return sentence(`Создано занятие${participantTag}${lessonSuffix}`);
  }
  if (item.action === 'CREATE_RECURRING') {
    return sentence(`Создана серия занятий${participantTag}${lessonSuffix}`);
  }
  if (item.action === 'CONVERT_TO_SERIES') {
    return sentence(`Занятие преобразовано в серию${participantTag}${lessonSuffix}`);
  }
  if (item.action === 'UPDATE_SERIES') {
    return sentence(`Серия занятий обновлена${participantTag}`);
  }
  if (item.action === 'DETACH_FROM_SERIES') {
    return sentence(`Занятие отделено от серии${participantTag}${lessonSuffix}`);
  }
  if (item.action === 'UPDATE') {
    return sentence(`Занятие обновлено${participantTag}${lessonSuffix}`);
  }
  if (item.action === 'DELETE') {
    return sentence(`Занятие удалено${participantTag}${lessonSuffix}`);
  }
  if (item.action === 'DELETE_SERIES') {
    return sentence(`Серия занятий удалена${participantTag}`);
  }
  if (item.action === 'STATUS_CANCELED') {
    return sentence(`Занятие отменено${participantTag}${lessonSuffix}`);
  }
  if (item.action === 'STATUS_SCHEDULED') {
    return sentence(`Занятие восстановлено${participantTag}${lessonSuffix}`);
  }
  if (item.action === 'STATUS_COMPLETED' || item.action === 'MARK_COMPLETED') {
    return sentence(`Занятие проведено${participantTag}${lessonSuffix}`);
  }
  return sentence(item.title || 'Событие урока');
};

const formatDurationLabel = (minutes: number): string => {
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ч`;
  }
  if (minutes > 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `${hours} ч ${rest} мин`;
  }
  return `${minutes} мин`;
};

const resolveLessonDurationDetail = (item: ActivityFeedItem) => {
  const minutes = payloadNumber(item, 'durationMinutes');
  if (!minutes) return null;
  return formatDurationLabel(minutes);
};

const resolveChangedFieldsDetail = (item: ActivityFeedItem) => {
  const changed = payloadStringArray(item, 'changedFields');
  if (changed.length === 0) return null;
  const labelsMap: Record<string, string> = {
    date_time: 'дата и время',
    duration: 'длительность',
    participants: 'участники',
    meeting_link: 'ссылка на занятие',
    color: 'цвет',
  };
  const labels = changed.map((field) => labelsMap[field] ?? field);
  return `Изменено: ${labels.join(', ')}`;
};

const composeLessonDetails = (item: ActivityFeedItem, timeZone: string) => {
  const parts: string[] = [];
  const weekdays = resolveWeekdayLabels(item);
  const repeatUntil = payloadString(item, 'repeatUntil');

  if (
    item.action === 'CREATE' ||
    item.action === 'UPDATE' ||
    item.action === 'STATUS_SCHEDULED' ||
    item.action === 'STATUS_COMPLETED' ||
    item.action === 'MARK_COMPLETED'
  ) {
    const duration = resolveLessonDurationDetail(item);
    if (duration) parts.push(duration);
  }

  if (
    item.action === 'CREATE_RECURRING' ||
    item.action === 'CONVERT_TO_SERIES' ||
    item.action === 'UPDATE_SERIES' ||
    item.action === 'DELETE_SERIES'
  ) {
    if (weekdays.length > 0) {
      parts.push(weekdays.join(', '));
    }
    if (repeatUntil) {
      parts.push(`до ${formatInTimeZone(repeatUntil, 'd MMM yyyy', { locale: ru, timeZone })}`);
    }
  }

  if (item.action === 'UPDATE') {
    const changedFields = resolveChangedFieldsDetail(item);
    if (changedFields) {
      parts.push(changedFields);
    }
  }

  return parts.length > 0 ? parts.join(' • ') : null;
};

const composeFallbackMessage = (item: ActivityFeedItem, lessonContext: string | null) => {
  const student = resolveStudentContexts(item);
  const base = sentence(item.title || 'Событие');
  const hasStudentInTitle = student.name ? base.includes(student.name) : false;
  const withStudentContext =
    student.forName && !hasStudentInTitle ? `${base.slice(0, -1)} (${student.forName}).` : base;
  if (lessonContext && !withStudentContext.includes(lessonContext)) {
    return `${withStudentContext.slice(0, -1)} (${lessonContext}).`;
  }
  return withStudentContext;
};

const normalizeStudentDetails = (details: string) =>
  details
    .replace(/\busername\s*:/gi, 'Telegram:')
    .replace(/\bpricePerLesson\s*:/gi, 'Цена занятия:')
    .replace(/\bprice\s*per\s*lesson\s*:/gi, 'Цена занятия:');

export const buildActivityTimelinePresentation = (
  item: ActivityFeedItem,
  timeZone: string,
): ActivityTimelinePresentation => {
  const lessonContext = resolveLessonContext(item, timeZone);
  let message: string;

  if (item.category === 'NOTIFICATION') {
    message = composeNotificationMessage(item, lessonContext);
  } else if (item.category === 'PAYMENT') {
    message = composePaymentMessage(item, lessonContext);
  } else if (item.category === 'LESSON') {
    message = composeLessonMessage(item, lessonContext);
  } else {
    message = composeFallbackMessage(item, lessonContext);
  }

  const tone: ActivityTimelineTone =
    item.status === 'FAILED'
      ? 'failed'
      : item.source === 'AUTO' || item.source === 'SYSTEM' || item.source === 'LEGACY'
        ? 'info'
        : 'success';

  const lessonDetails = item.category === 'LESSON' ? composeLessonDetails(item, timeZone) : null;
  const notificationDetails =
    item.category === 'NOTIFICATION' && item.status !== 'FAILED' ? composeNotificationDetails(item, timeZone) : null;
  const baseDetails =
    item.status === 'FAILED'
      ? resolveFailureDetails(item)
      : (lessonDetails ?? notificationDetails ?? item.details?.trim() ?? null);

  return {
    timeLabel: resolveTimeLabel(item.occurredAt, timeZone),
    message,
    details: baseDetails && item.category === 'STUDENT' ? normalizeStudentDetails(baseDetails) : baseDetails,
    tone,
  };
};

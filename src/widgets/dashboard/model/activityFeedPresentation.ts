import { addDays, isSameDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { ActivityFeedItem } from '../../../entities/types';
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

const resolveParticipantPhrase = (item: ActivityFeedItem) => {
  const names = resolveParticipantNames(item);
  if (names.length === 0) return '';
  if (names.length === 1) return `для ${names[0]}`;
  return `для учеников: ${names.join(', ')}`;
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
    return `по занятию ${formatInTimeZone(lessonStartAt, 'd MMM, HH:mm', { locale: ru, timeZone })}`;
  }
  return null;
};

const resolveStudentContexts = (item: ActivityFeedItem) => {
  const name = item.studentName?.trim() || null;
  return {
    name,
    dative: name ? `ученику ${name}` : 'ученику',
    genitive: name ? `у ${name}` : 'у ученика',
    forName: name ? `для ${name}` : null,
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
    const target = isTeacherTarget ? 'преподавателя' : 'получателя';
    return `Telegram вернул «chat not found»: бот не нашёл чат ${target}. Обычно это значит, что чат с ботом не открыт (не было /start), чат удалён или используется другой bot token/окружение.`;
  }

  if (normalized.includes('blocked by the user')) {
    return 'Telegram вернул «blocked by the user»: получатель заблокировал бота.';
  }

  if (normalized.includes('bad request')) {
    return `Ошибка Telegram API: ${raw}`;
  }

  return raw;
};

const composeNotificationMessage = (item: ActivityFeedItem, lessonContext: string | null) => {
  const student = resolveStudentContexts(item);
  const failed = item.status === 'FAILED';

  switch (item.action) {
    case 'PAYMENT_REMINDER_STUDENT':
      if (failed) {
        return sentence(`Не удалось отправить напоминание об оплате ${student.dative}${lessonContext ? ` ${lessonContext}` : ''}`);
      }
      return sentence(
        `${item.source === 'USER' ? 'Отправлено ручное' : 'Отправлено'} напоминание об оплате ${student.dative}${lessonContext ? ` ${lessonContext}` : ''}`,
      );
    case 'PAYMENT_REMINDER_TEACHER':
      if (failed) {
        return sentence(
          `Не удалось отправить вам служебное подтверждение: напоминание об оплате${student.forName ? ` ${student.forName}` : ''}${lessonContext ? ` ${lessonContext}` : ''}`,
        );
      }
      return sentence(
        `Вам отправлено служебное подтверждение: напоминание об оплате${student.forName ? ` ${student.forName}` : ''}${lessonContext ? ` ${lessonContext}` : ''}`,
      );
    case 'STUDENT_LESSON_REMINDER':
      if (failed) {
        return sentence(`Не удалось отправить напоминание о занятии ${student.dative}${lessonContext ? ` ${lessonContext}` : ''}`);
      }
      return sentence(`Отправлено напоминание о занятии ${student.dative}${lessonContext ? ` ${lessonContext}` : ''}`);
    case 'TEACHER_LESSON_REMINDER':
      return sentence(
        `${failed ? 'Не удалось отправить' : 'Отправлено'} напоминание преподавателю о занятии${student.forName ? ` ${student.forName}` : ''}${lessonContext ? ` ${lessonContext}` : ''}`,
      );
    case 'TEACHER_DAILY_SUMMARY':
      return sentence(`${failed ? 'Не удалось отправить' : 'Отправлена'} сводка преподавателю на сегодня`);
    case 'TEACHER_TOMORROW_SUMMARY':
      return sentence(`${failed ? 'Не удалось отправить' : 'Отправлена'} сводка преподавателю на завтра`);
    case 'TEACHER_ONBOARDING_NUDGE':
      return sentence(`${failed ? 'Не удалось отправить' : 'Отправлено'} напоминание преподавателю о настройке бота`);
    default:
      return sentence(item.title || 'Событие уведомлений');
  }
};

const composePaymentMessage = (item: ActivityFeedItem, lessonContext: string | null) => {
  const student = resolveStudentContexts(item);
  const reason = payloadString(item, 'reason');
  const value = buildPaymentValue(item);

  switch (item.action) {
    case 'AUTO_CHARGE':
      return sentence(`Выполнено автосписание за занятие ${student.genitive}${lessonContext ? ` ${lessonContext}` : ''}`);
    case 'MANUAL_PAID':
      if (reason === 'BALANCE_PAYMENT') {
        return sentence(`Списана оплата с баланса ${student.genitive}${lessonContext ? ` ${lessonContext}` : ''}`);
      }
      return sentence(`Зафиксирована ручная оплата ${student.genitive}${lessonContext ? ` ${lessonContext}` : ''}`);
    case 'TOP_UP':
      return sentence(`Пополнен баланс ${student.genitive}${value ? ` на ${value}` : ''}`);
    case 'SUBSCRIPTION':
      return sentence(`Оформлен абонемент ${student.genitive}${value ? ` (${value})` : ''}`);
    case 'ADJUSTMENT':
      if (reason === 'LESSON_CANCELED') {
        return sentence(`Сделан возврат после отмены занятия ${student.genitive}${lessonContext ? ` ${lessonContext}` : ''}`);
      }
      if (reason === 'PAYMENT_REVERT_REFUND' || reason === 'PAYMENT_REVERT') {
        return sentence(`Отменена оплата с возвратом ${student.genitive}${lessonContext ? ` ${lessonContext}` : ''}`);
      }
      if (reason === 'PAYMENT_REVERT_WRITE_OFF') {
        return sentence(`Отменена оплата без возврата ${student.genitive}${lessonContext ? ` ${lessonContext}` : ''}`);
      }
      return sentence(`Скорректирован баланс ${student.genitive}${value ? ` на ${value}` : ''}`);
    default:
      return sentence(item.title || 'Событие оплаты');
  }
};

const composeLessonMessage = (item: ActivityFeedItem, lessonContext: string | null) => {
  const participantPhrase = resolveParticipantPhrase(item);
  const suffix = participantPhrase ? ` ${participantPhrase}` : '';

  if (item.action === 'REMIND_PAYMENT') {
    return sentence(
      `Отправлено ручное напоминание об оплате${participantPhrase ? ` ${participantPhrase}` : ''}${lessonContext ? ` ${lessonContext}` : ''}`,
    );
  }
  if (item.action === 'AUTO_COMPLETE') {
    return sentence(
      `Занятие автоматически отмечено проведённым${participantPhrase ? ` ${participantPhrase}` : ''}${lessonContext ? ` ${lessonContext}` : ''}`,
    );
  }
  if (item.action === 'CREATE') {
    return sentence(`Создано занятие${suffix}`);
  }
  if (item.action === 'CREATE_RECURRING') {
    return sentence(`Создана серия занятий${suffix}`);
  }
  if (item.action === 'CONVERT_TO_SERIES') {
    return sentence(`Занятие преобразовано в серию${suffix}`);
  }
  if (item.action === 'UPDATE_SERIES') {
    return sentence(`Серия занятий обновлена${suffix}`);
  }
  if (item.action === 'DETACH_FROM_SERIES') {
    return sentence(`Занятие отделено от серии${suffix}`);
  }
  if (item.action === 'UPDATE') {
    return sentence(`Занятие обновлено${suffix}`);
  }
  if (item.action === 'DELETE') {
    return sentence(`Занятие удалено${suffix}`);
  }
  if (item.action === 'DELETE_SERIES') {
    return sentence(`Серия занятий удалена${suffix}`);
  }
  if (item.action === 'STATUS_CANCELED') {
    return sentence(`Занятие отменено${suffix}`);
  }
  if (item.action === 'STATUS_SCHEDULED') {
    return sentence(`Занятие восстановлено${suffix}`);
  }
  if (item.action === 'STATUS_COMPLETED' || item.action === 'MARK_COMPLETED') {
    return sentence(`Занятие отмечено проведённым${suffix}`);
  }
  return sentence(item.title || 'Событие урока');
};

const resolveLessonDateDetail = (item: ActivityFeedItem, timeZone: string) => {
  const lessonStartAt = payloadString(item, 'lessonStartAt');
  if (!lessonStartAt) return null;
  return `Дата занятия: ${formatInTimeZone(lessonStartAt, 'd MMM yyyy, HH:mm', { locale: ru, timeZone })}`;
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
  const lessonDate = resolveLessonDateDetail(item, timeZone);
  const weekdays = resolveWeekdayLabels(item);
  const repeatUntil = payloadString(item, 'repeatUntil');
  const participants = resolveParticipantNames(item);

  if (lessonDate) {
    parts.push(lessonDate);
  }

  if (item.action === 'CREATE_RECURRING' || item.action === 'CONVERT_TO_SERIES' || item.action === 'UPDATE_SERIES' || item.action === 'DELETE_SERIES') {
    if (weekdays.length > 0) {
      parts.push(`Дни: ${weekdays.join(', ')}`);
    }
    if (repeatUntil) {
      parts.push(`До: ${formatInTimeZone(repeatUntil, 'd MMM yyyy', { locale: ru, timeZone })}`);
    }
    if (participants.length > 0) {
      parts.push(`Участники: ${participants.join(', ')}`);
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
  const withStudentContext = student.forName && !hasStudentInTitle ? `${base.slice(0, -1)} (${student.forName}).` : base;
  if (lessonContext && !withStudentContext.includes(lessonContext)) {
    return `${withStudentContext.slice(0, -1)} (${lessonContext}).`;
  }
  return withStudentContext;
};

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

  return {
    timeLabel: resolveTimeLabel(item.occurredAt, timeZone),
    message,
    details:
      item.status === 'FAILED'
        ? resolveFailureDetails(item)
        : (lessonDetails ?? item.details?.trim() ?? null),
    tone,
  };
};

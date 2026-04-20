import { format } from 'date-fns';
import { Lesson } from '../../../../entities/types';
import { formatInTimeZone, toUtcDateFromTimeZone, toZonedDate } from '../../../../shared/lib/timezoneDates';

export const createQuickDateTimeValue = (
  daysFromNow: number,
  timeZone: string,
  options?: { hours?: number; minutes?: number },
) => {
  const now = toZonedDate(new Date(), timeZone);
  now.setDate(now.getDate() + daysFromNow);
  now.setHours(options?.hours ?? 20, options?.minutes ?? 0, 0, 0);
  return format(now, "yyyy-MM-dd'T'HH:mm");
};

export const createQuickDeadlineValue = (daysFromNow: number, timeZone: string) =>
  createQuickDateTimeValue(daysFromNow, timeZone, { hours: 20, minutes: 0 });

export const createEndOfWeekDeadlineValue = (timeZone: string) => {
  const now = toZonedDate(new Date(), timeZone);
  const daysUntilSunday = (7 - now.getDay()) % 7;
  now.setDate(now.getDate() + daysUntilSunday);
  now.setHours(20, 0, 0, 0);

  if (now.getTime() <= Date.now()) {
    now.setDate(now.getDate() + 7);
  }

  return format(now, "yyyy-MM-dd'T'HH:mm");
};

export const toLocalDateTimeValue = (iso: string, timeZone: string) =>
  formatInTimeZone(iso, "yyyy-MM-dd'T'HH:mm", { timeZone });

export const toUtcIsoFromLocal = (value: string, timeZone: string) => {
  const [datePart, timePart] = value.split('T');
  if (!datePart || !timePart) return null;
  const utcDate = toUtcDateFromTimeZone(datePart, timePart, timeZone);
  if (Number.isNaN(utcDate.getTime())) return null;
  return utcDate.toISOString();
};

export const resolveNextUpcomingLesson = (lessons: Lesson[]) => {
  const nowTs = Date.now();
  return lessons
    .filter((lesson) => {
      if (lesson.status === 'CANCELED') return false;
      const lessonTs = new Date(lesson.startAt).getTime();
      return Number.isFinite(lessonTs) && lessonTs > nowTs;
    })
    .sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime())[0] ?? null;
};

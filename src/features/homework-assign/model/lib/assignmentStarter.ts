import { format } from 'date-fns';
import { Lesson } from '../../../../entities/types';
import { formatInTimeZone, toUtcDateFromTimeZone, toZonedDate } from '../../../../shared/lib/timezoneDates';

export const createQuickDeadlineValue = (daysFromNow: number, timeZone: string) => {
  const now = toZonedDate(new Date(), timeZone);
  now.setDate(now.getDate() + daysFromNow);
  now.setHours(20, 0, 0, 0);
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

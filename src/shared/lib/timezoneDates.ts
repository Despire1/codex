import { format } from 'date-fns';
import type { Locale } from 'date-fns';

type DateInput = Date | number | string;

type TimeZoneParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const toDate = (input: DateInput) => (input instanceof Date ? input : new Date(input));

export const resolveTimeZone = (timeZone?: string | null) => (timeZone && timeZone.trim() ? timeZone : 'UTC');

const getTimeZoneParts = (date: Date, timeZone: string): TimeZoneParts => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
};

export const getTimeZoneOffsetMinutes = (date: DateInput, timeZone?: string | null) => {
  const resolvedTimeZone = resolveTimeZone(timeZone);
  const base = toDate(date);
  const parts = getTimeZoneParts(base, resolvedTimeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return (asUtc - base.getTime()) / 60000;
};

export const toZonedDate = (date: DateInput, timeZone?: string | null) => {
  const resolvedTimeZone = resolveTimeZone(timeZone);
  const base = toDate(date);
  const parts = getTimeZoneParts(base, resolvedTimeZone);
  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    base.getMilliseconds(),
  );
};

const parseDateString = (value: string) => {
  const [year, month, day] = value.split('-').map((part) => Number(part));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  return { year, month, day };
};

const parseTimeString = (value: string) => {
  const [hour, minute] = value.split(':').map((part) => Number(part));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }
  return { hour, minute };
};

export const toUtcDateFromTimeZone = (date: string, time: string, timeZone?: string | null) => {
  const dateParts = parseDateString(date);
  const timeParts = parseTimeString(time);
  if (!dateParts || !timeParts) {
    return new Date(NaN);
  }
  const utcGuess = new Date(
    Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, timeParts.hour, timeParts.minute, 0, 0),
  );
  const offsetMinutes = getTimeZoneOffsetMinutes(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offsetMinutes * 60_000);
};

export const toUtcDateFromDate = (date: string, timeZone?: string | null) => {
  const dateParts = parseDateString(date);
  if (!dateParts) {
    return new Date(NaN);
  }
  const utcGuess = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 0, 0, 0, 0));
  const offsetMinutes = getTimeZoneOffsetMinutes(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offsetMinutes * 60_000);
};

export const toUtcEndOfDay = (date: string, timeZone?: string | null) => {
  const end = toUtcDateFromTimeZone(date, '23:59', timeZone);
  if (Number.isNaN(end.getTime())) {
    return end;
  }
  end.setSeconds(59, 999);
  return end;
};

export const getTimeZoneStartOfDay = (date: DateInput, timeZone?: string | null) => {
  const resolvedTimeZone = resolveTimeZone(timeZone);
  const base = toDate(date);
  const parts = getTimeZoneParts(base, resolvedTimeZone);
  const utcGuess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0));
  const offsetMinutes = getTimeZoneOffsetMinutes(utcGuess, resolvedTimeZone);
  return new Date(utcGuess.getTime() - offsetMinutes * 60_000);
};

export const formatInTimeZone = (
  date: DateInput,
  formatString: string,
  options?: { timeZone?: string | null; locale?: Locale },
) => format(toZonedDate(date, options?.timeZone), formatString, { locale: options?.locale });

export const todayISO = (timeZone?: string | null) => formatInTimeZone(new Date(), 'yyyy-MM-dd', { timeZone });

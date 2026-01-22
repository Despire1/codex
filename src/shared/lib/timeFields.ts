const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const parseTimeParts = (value: string) => {
  const match = value.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return { hour, minute };
};

export const normalizeTimeInput = (value: string) => {
  if (!value) return '';
  const parts = parseTimeParts(value);
  if (!parts) return value;
  const hour = clampNumber(parts.hour, 0, 23);
  const minute = clampNumber(parts.minute, 0, 59);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

export const parseTimeToMinutes = (value: string) => {
  const normalized = normalizeTimeInput(value);
  const parts = parseTimeParts(normalized);
  if (!parts) return null;
  const hour = clampNumber(parts.hour, 0, 23);
  const minute = clampNumber(parts.minute, 0, 59);
  return hour * 60 + minute;
};

export const formatMinutesToTime = (minutes: number) => {
  const clamped = clampNumber(Math.round(minutes), 0, 23 * 60 + 59);
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

export const addMinutesToTime = (time: string, minutes: number) => {
  const baseMinutes = parseTimeToMinutes(time);
  if (baseMinutes === null) return '';
  return formatMinutesToTime(baseMinutes + minutes);
};

export const diffTimeMinutes = (start: string, end: string) => {
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  if (startMinutes === null || endMinutes === null) return null;
  return endMinutes - startMinutes;
};

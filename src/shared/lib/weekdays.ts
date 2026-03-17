export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Пн', fullLabel: 'Понедельник' },
  { value: 2, label: 'Вт', fullLabel: 'Вторник' },
  { value: 3, label: 'Ср', fullLabel: 'Среда' },
  { value: 4, label: 'Чт', fullLabel: 'Четверг' },
  { value: 5, label: 'Пт', fullLabel: 'Пятница' },
  { value: 6, label: 'Сб', fullLabel: 'Суббота' },
  { value: 0, label: 'Вс', fullLabel: 'Воскресенье' },
] as const;

const isValidWeekday = (value: number): value is (typeof WEEKDAY_ORDER)[number] =>
  Number.isInteger(value) && value >= 0 && value <= 6;

const parseWeekdaySource = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
};

export const normalizeWeekdayList = (value: unknown): number[] => {
  const uniqueValues = new Set(
    parseWeekdaySource(value)
      .map((item) => Number(item))
      .filter(isValidWeekday),
  );

  return WEEKDAY_ORDER.filter((day) => uniqueValues.has(day));
};

export const stringifyWeekdayList = (value: unknown) => JSON.stringify(normalizeWeekdayList(value));

export const getWeekdayShortLabel = (day: number) =>
  WEEKDAY_OPTIONS.find((option) => option.value === day)?.label ?? '';

export const formatWeekdayShortList = (days: unknown) =>
  normalizeWeekdayList(days)
    .map((day) => getWeekdayShortLabel(day))
    .filter(Boolean)
    .join(', ');

export const isDateInWeekdayList = (date: Date, weekdays: unknown) =>
  normalizeWeekdayList(weekdays).includes(date.getDay());

export const hasWeekdayOverlap = (left: unknown, right: unknown) => {
  const leftDays = new Set(normalizeWeekdayList(left));
  return normalizeWeekdayList(right).some((day) => leftDays.has(day));
};

export const getFirstAvailableWeekday = (blockedDays: unknown, preferredDay?: number) => {
  const blocked = new Set(normalizeWeekdayList(blockedDays));
  if (typeof preferredDay === 'number' && isValidWeekday(preferredDay) && !blocked.has(preferredDay)) {
    return preferredDay;
  }
  return WEEKDAY_ORDER.find((day) => !blocked.has(day)) ?? null;
};

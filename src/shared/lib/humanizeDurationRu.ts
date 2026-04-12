import { pluralizeRu } from './pluralizeRu';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type DurationUnit = 'hours' | 'days';

const resolveDurationUnit = (deltaMs: number): { unit: DurationUnit; value: number } => {
  const absoluteMs = Math.max(0, Math.abs(deltaMs));
  const totalHours = Math.floor(absoluteMs / HOUR_MS);
  const totalDays = Math.floor(totalHours / 24);

  if (totalDays >= 1) {
    return {
      unit: 'days',
      value: totalDays,
    };
  }

  return {
    unit: 'hours',
    value: Math.max(1, totalHours),
  };
};

export const formatHumanizedDurationRu = (deltaMs: number) => {
  const { unit, value } = resolveDurationUnit(deltaMs);

  if (unit === 'days') {
    return pluralizeRu(value, {
      one: 'день',
      few: 'дня',
      many: 'дней',
    });
  }

  return pluralizeRu(value, {
    one: 'час',
    few: 'часа',
    many: 'часов',
  });
};

export const formatHumanizedRelativeDurationRu = (deltaMs: number, mode: 'past' | 'future') => {
  const label = formatHumanizedDurationRu(deltaMs);
  return mode === 'past' ? `Прошло ${label}` : `Осталось ${label}`;
};

export const formatHumanizedCompactRelativeDurationRu = (deltaMs: number, mode: 'past' | 'future') => {
  const label = formatHumanizedDurationRu(deltaMs);
  return mode === 'past' ? `+${label}` : label;
};

export const DAY_DURATION_MS = DAY_MS;

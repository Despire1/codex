export const STUDENT_UI_COLOR_PALETTE = [
  '#5A8DFF',
  '#3BAAFF',
  '#8B5CF6',
  '#F59E0B',
  '#22C55E',
  '#EF4444',
] as const;

export type StudentUiColor = (typeof STUDENT_UI_COLOR_PALETTE)[number];

export const DEFAULT_STUDENT_UI_COLOR: StudentUiColor = STUDENT_UI_COLOR_PALETTE[0];

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{6})$/;

export const isStudentUiColor = (value: unknown): value is StudentUiColor =>
  typeof value === 'string' && STUDENT_UI_COLOR_PALETTE.includes(value.toUpperCase() as StudentUiColor);

export const normalizeStudentUiColor = (value: unknown, fallback: StudentUiColor = DEFAULT_STUDENT_UI_COLOR): StudentUiColor => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toUpperCase();
  if (!HEX_COLOR_PATTERN.test(normalized)) return fallback;
  if (isStudentUiColor(normalized)) return normalized;
  return fallback;
};

export const pickNextStudentUiColor = (usedColors: Array<string | null | undefined>): StudentUiColor => {
  const normalizedUsed = usedColors
    .map((color) => (typeof color === 'string' ? color.trim().toUpperCase() : null))
    .filter((color): color is StudentUiColor => Boolean(color) && isStudentUiColor(color));

  const usageMap = new Map<StudentUiColor, number>();
  STUDENT_UI_COLOR_PALETTE.forEach((color) => usageMap.set(color, 0));

  normalizedUsed.forEach((color) => {
    usageMap.set(color, (usageMap.get(color) ?? 0) + 1);
  });

  const unused = STUDENT_UI_COLOR_PALETTE.find((color) => (usageMap.get(color) ?? 0) === 0);
  if (unused) return unused;

  const sorted = [...STUDENT_UI_COLOR_PALETTE].sort((a, b) => (usageMap.get(a) ?? 0) - (usageMap.get(b) ?? 0));
  return sorted[0] ?? DEFAULT_STUDENT_UI_COLOR;
};

export const colorWithAlpha = (hexColor: string, alpha: number) => {
  const normalized = normalizeStudentUiColor(hexColor);
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  const base = normalized.slice(1);
  const r = Number.parseInt(base.slice(0, 2), 16);
  const g = Number.parseInt(base.slice(2, 4), 16);
  const b = Number.parseInt(base.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
};

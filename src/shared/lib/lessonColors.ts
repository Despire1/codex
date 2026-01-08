import { LessonColor } from '../../entities/types';

export type LessonColorTheme = {
  id: LessonColor;
  label: string;
  background: string;
  border: string;
  hoverBackground: string;
  hoverBorder: string;
  hoverText: string;
  shadow: string;
  hoverShadow: string;
};

export const LESSON_COLOR_OPTIONS: LessonColorTheme[] = [
  {
    id: 'blue',
    label: 'Синий',
    background: '#DBEAFE',
    border: '#93C5FD',
    hoverBackground: '#2563EB',
    hoverBorder: '#1D4ED8',
    hoverText: '#FFFFFF',
    shadow: 'rgba(37, 99, 235, 0.18)',
    hoverShadow: 'rgba(37, 99, 235, 0.24)',
  },
  {
    id: 'peach',
    label: 'Персиковый',
    background: '#FFE4D6',
    border: '#FDBA8C',
    hoverBackground: '#FB923C',
    hoverBorder: '#F97316',
    hoverText: '#FFFFFF',
    shadow: 'rgba(249, 115, 22, 0.16)',
    hoverShadow: 'rgba(249, 115, 22, 0.24)',
  },
  {
    id: 'rose',
    label: 'Розовый',
    background: '#FCE7F3',
    border: '#F9A8D4',
    hoverBackground: '#EC4899',
    hoverBorder: '#DB2777',
    hoverText: '#FFFFFF',
    shadow: 'rgba(236, 72, 153, 0.16)',
    hoverShadow: 'rgba(236, 72, 153, 0.24)',
  },
  {
    id: 'mint',
    label: 'Мятный',
    background: '#DCFCE7',
    border: '#86EFAC',
    hoverBackground: '#22C55E',
    hoverBorder: '#16A34A',
    hoverText: '#FFFFFF',
    shadow: 'rgba(34, 197, 94, 0.16)',
    hoverShadow: 'rgba(34, 197, 94, 0.24)',
  },
  {
    id: 'sand',
    label: 'Песочный',
    background: '#FEF3C7',
    border: '#FCD34D',
    hoverBackground: '#D97706',
    hoverBorder: '#B45309',
    hoverText: '#FFFFFF',
    shadow: 'rgba(217, 119, 6, 0.16)',
    hoverShadow: 'rgba(217, 119, 6, 0.24)',
  },
  {
    id: 'lavender',
    label: 'Лавандовый',
    background: '#EDE9FE',
    border: '#C4B5FD',
    hoverBackground: '#7C3AED',
    hoverBorder: '#6D28D9',
    hoverText: '#FFFFFF',
    shadow: 'rgba(124, 58, 237, 0.16)',
    hoverShadow: 'rgba(124, 58, 237, 0.24)',
  },
];

export const DEFAULT_LESSON_COLOR: LessonColor = 'blue';

const lessonColorMap = new Map(LESSON_COLOR_OPTIONS.map((option) => [option.id, option]));

export const normalizeLessonColor = (value?: string | null): LessonColor =>
  lessonColorMap.has(value as LessonColor) ? (value as LessonColor) : DEFAULT_LESSON_COLOR;

export const getLessonColorTheme = (value?: string | null): LessonColorTheme =>
  lessonColorMap.get(normalizeLessonColor(value)) ?? LESSON_COLOR_OPTIONS[0];

export const getLessonColorVars = (value?: string | null): Record<string, string> => {
  const theme = getLessonColorTheme(value);
  return {
    '--lesson-bg': theme.background,
    '--lesson-border': theme.border,
    '--lesson-hover-bg': theme.hoverBackground,
    '--lesson-hover-border': theme.hoverBorder,
    '--lesson-hover-text': theme.hoverText,
    '--lesson-shadow': theme.shadow,
    '--lesson-hover-shadow': theme.hoverShadow,
  };
};

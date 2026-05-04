import type { CSSProperties } from 'react';
import type { Lesson } from '../../../entities/types';
import { getLessonColorTheme, normalizeLessonColor } from '../../../shared/lib/lessonColors';

export type LessonThemeKey = 'c-1' | 'c-2' | 'c-3' | 'c-4' | 'c-5' | 'c-6' | 'c-7' | 'c-8';

export const LESSON_THEMES: LessonThemeKey[] = ['c-1', 'c-2', 'c-3', 'c-4', 'c-5', 'c-6', 'c-7', 'c-8'];

// Должны совпадать с .themeC1….themeC8 в ScheduleSectionV2.module.css.
export const LESSON_THEME_ACCENT: Record<LessonThemeKey, string> = {
  'c-1': '#3b82f6',
  'c-2': '#8b5cf6',
  'c-3': '#ec4899',
  'c-4': '#f59e0b',
  'c-5': '#a3e635',
  'c-6': '#06b6d4',
  'c-7': '#f43f5e',
  'c-8': '#10b981',
};

/**
 * Стабильно возвращает один из 8 цветов по идентификатору ученика.
 * Хеш-функция простая, важно лишь равномерное распределение и детерминированность.
 */
const hashStudent = (studentId: number) => {
  const v = Math.abs(studentId | 0);
  return v % LESSON_THEMES.length;
};

export const resolveLessonThemeKey = (lesson: Lesson): LessonThemeKey => {
  return LESSON_THEMES[hashStudent(lesson.studentId)];
};

/**
 * Если у урока явно задан `lesson.color` (выбран в LessonModal) — возвращает
 * inline-style с переопределением CSS-переменных темы (`--sv2-lesson-bg`,
 * `--sv2-lesson-accent`, `--sv2-lesson-time`). Эти переменные используются
 * `.weekBlock`, `.dayBlock`, `.monthChip` и т.п. в ScheduleSectionV2.module.css.
 *
 * Если color не задан — возвращает undefined и применяется тема по themeKey
 * из `resolveLessonThemeKey` (детерминированный hash по studentId).
 */
export const resolveLessonExplicitColorStyle = (lesson: Lesson): CSSProperties | undefined => {
  if (!lesson.color) return undefined;
  const normalized = normalizeLessonColor(lesson.color);
  // normalizeLessonColor возвращает default 'blue' для невалидного значения,
  // но default уже совпадает с одной из тем — поэтому отличаем только наличие.
  const theme = getLessonColorTheme(normalized);
  return {
    ['--sv2-lesson-bg' as string]: theme.background,
    ['--sv2-lesson-accent' as string]: theme.hoverBackground,
    ['--sv2-lesson-time' as string]: theme.hoverBorder,
  } as CSSProperties;
};

export const hasExplicitLessonColor = (lesson: Lesson): boolean => Boolean(lesson.color);

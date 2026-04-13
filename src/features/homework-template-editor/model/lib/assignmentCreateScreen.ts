import { HomeworkTestQuestion } from '../../../../entities/types';
import { CreateQuestionKind, getQuestionKind } from './createTemplateScreen';

import { normalizeStudentUiColor } from '../../../../shared/lib/studentUiColors';

export type AssignmentStudentOption = {
  id: number;
  name: string;
  level?: string | null;
  uiColor?: string | null;
};

export const buildStudentInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

const hexToRgb = (hexColor: string) => {
  const normalized = normalizeStudentUiColor(hexColor);
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
};

const relativeLuminance = (hexColor: string) => {
  const { r, g, b } = hexToRgb(hexColor);
  const transform = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
};

export const resolveAssignmentStudentOptionAvatarColor = (uiColor?: string | null) =>
  normalizeStudentUiColor(uiColor);

export const resolveAssignmentStudentOptionAvatarTextColor = (avatarColor: string) =>
  relativeLuminance(avatarColor) > 0.42 ? '#0F172A' : '#FFFFFF';

export const resolveAssignmentQuestionKind = (question: HomeworkTestQuestion): CreateQuestionKind => getQuestionKind(question);

export const QUESTION_KIND_LABELS: Record<CreateQuestionKind, string> = {
  CHOICE: 'Выбор',
  SHORT_TEXT: 'Текст',
  LONG_TEXT: 'Текст',
  AUDIO: 'Аудио',
  FILE: 'Файл',
  FILL_WORD: 'Заполнить',
  MATCHING: 'Сопоставить',
  ORDERING: 'Порядок',
  TABLE: 'Таблица',
};

export const QUESTION_KIND_TONES: Record<CreateQuestionKind, 'blue' | 'purple' | 'green' | 'amber' | 'rose'> = {
  CHOICE: 'blue',
  SHORT_TEXT: 'purple',
  LONG_TEXT: 'purple',
  AUDIO: 'green',
  FILE: 'green',
  FILL_WORD: 'amber',
  MATCHING: 'blue',
  ORDERING: 'rose',
  TABLE: 'amber',
};

export const resolveQuestionKindPresentation = (question: HomeworkTestQuestion) => {
  const kind = resolveAssignmentQuestionKind(question);
  return {
    kind,
    label: QUESTION_KIND_LABELS[kind],
    tone: QUESTION_KIND_TONES[kind],
  };
};

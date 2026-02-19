import { HomeworkBlockTest } from '../../../../entities/types';
import { HomeworkTemplateEditorDraft } from '../types';

export interface StoredCreateTemplateDraft {
  draft: HomeworkTemplateEditorDraft;
  quizSettings?: Record<string, unknown>;
  savedAt: string;
}

export interface StoredCreateTemplateDraftSummary {
  title: string;
  preview: string;
  savedAt: string;
  savedAtLabel: string;
  questionCount: number;
}

export const CREATE_TEMPLATE_DRAFT_STORAGE_KEY = 'homework_template_create_screen_draft_v1';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toDraft = (value: unknown): HomeworkTemplateEditorDraft | null => {
  if (!isRecord(value)) return null;
  const title = typeof value.title === 'string' ? value.title : '';
  const tagsText = typeof value.tagsText === 'string' ? value.tagsText : '';
  const subject = typeof value.subject === 'string' ? value.subject : '';
  const level = typeof value.level === 'string' ? value.level : '';
  const blocks = Array.isArray(value.blocks)
    ? (value.blocks.filter((item) => isRecord(item)) as unknown as HomeworkTemplateEditorDraft['blocks'])
    : [];

  return {
    title,
    tagsText,
    subject,
    level,
    blocks,
  };
};

export const formatStoredDraftTimeLabel = (savedAt: string): string => {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return 'только что';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const loadStoredCreateTemplateDraft = (): StoredCreateTemplateDraft | null => {
  if (typeof window === 'undefined') return null;

  let rawValue: string | null = null;
  try {
    rawValue = window.localStorage.getItem(CREATE_TEMPLATE_DRAFT_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    const draft = toDraft(parsed.draft);
    if (!draft) return null;

    const savedAt = typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString();
    const quizSettings = isRecord(parsed.quizSettings) ? parsed.quizSettings : undefined;

    return {
      draft,
      quizSettings,
      savedAt,
    };
  } catch {
    return null;
  }
};

export const saveStoredCreateTemplateDraft = (payload: StoredCreateTemplateDraft) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CREATE_TEMPLATE_DRAFT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore localStorage write errors
  }
};

export const clearStoredCreateTemplateDraft = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CREATE_TEMPLATE_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore localStorage write errors
  }
};

export const buildStoredCreateTemplateDraftSummary = (
  value: StoredCreateTemplateDraft,
): StoredCreateTemplateDraftSummary => {
  const questionCount = value.draft.blocks
    .filter((block): block is HomeworkBlockTest => block.type === 'TEST')
    .reduce((sum, block) => sum + (block.questions?.length ?? 0), 0);

  const firstText = value.draft.blocks.find((block) => block.type === 'TEXT')?.content?.trim() ?? '';
  const preview = firstText.length > 0 ? firstText.slice(0, 120) : 'Черновик шаблона без описания';

  return {
    title: value.draft.title.trim() || 'Новый шаблон (черновик)',
    preview,
    savedAt: value.savedAt,
    savedAtLabel: formatStoredDraftTimeLabel(value.savedAt),
    questionCount,
  };
};

export const loadStoredCreateTemplateDraftSummary = (): StoredCreateTemplateDraftSummary | null => {
  const stored = loadStoredCreateTemplateDraft();
  if (!stored) return null;
  return buildStoredCreateTemplateDraftSummary(stored);
};

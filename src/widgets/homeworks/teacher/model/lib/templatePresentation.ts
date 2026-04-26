import { HomeworkTemplate } from '../../../../../entities/types';
import { estimateHomeworkBlocksDurationMinutes } from '../../../../../entities/homework-template/model/lib/duration';

export const HOMEWORK_TEMPLATE_FAVORITE_TAG = '__favorite';
const CATEGORY_PURPLE_KEYWORDS = ['speaking', 'устн', 'говор', 'audio', 'voice'];

export const isHomeworkTemplateFavorite = (template: HomeworkTemplate) =>
  template.tags.some((tag) => tag.trim().toLowerCase() === HOMEWORK_TEMPLATE_FAVORITE_TAG);

export const toggleHomeworkTemplateFavoriteTags = (tags: string[], isFavorite: boolean) => {
  const cleanTags = tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag) => tag.toLowerCase() !== HOMEWORK_TEMPLATE_FAVORITE_TAG);
  if (isFavorite) {
    return [HOMEWORK_TEMPLATE_FAVORITE_TAG, ...cleanTags];
  }
  return cleanTags;
};

export const resolveHomeworkTemplateCategory = (template: HomeworkTemplate) => {
  const subject = template.subject?.trim();
  if (subject) return subject;
  const firstTag = template.tags
    .map((tag) => tag.trim())
    .find((tag) => tag.length > 0 && tag.toLowerCase() !== HOMEWORK_TEMPLATE_FAVORITE_TAG);
  return firstTag ?? 'Общее';
};

export const estimateHomeworkTemplateDurationMinutes = (template: HomeworkTemplate) =>
  estimateHomeworkBlocksDurationMinutes(template.blocks);

export const formatHomeworkTemplateDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (restMinutes === 0) return `${hours} ч`;
  return `${hours} ч ${restMinutes} мин`;
};

const hasAudioAnswerInTemplate = (template: HomeworkTemplate) =>
  template.blocks.some((block) => block.type === 'STUDENT_RESPONSE' && (block.allowVoice || block.allowAudio));

export const resolveHomeworkTemplateCardMeta = (template: HomeworkTemplate) => {
  if (hasAudioAnswerInTemplate(template)) {
    return { kind: 'audio' as const, label: 'Audio' };
  }
  return {
    kind: 'duration' as const,
    label: formatHomeworkTemplateDuration(estimateHomeworkTemplateDurationMinutes(template)),
  };
};

export const resolveHomeworkTemplateCategoryTone = (template: HomeworkTemplate) => {
  if (hasAudioAnswerInTemplate(template)) return 'purple' as const;
  const category = resolveHomeworkTemplateCategory(template).toLowerCase();
  if (CATEGORY_PURPLE_KEYWORDS.some((keyword) => category.includes(keyword))) return 'purple' as const;
  return 'blue' as const;
};

export const resolveHomeworkTemplatePreview = (template: HomeworkTemplate): string | null => {
  const textBlock = template.blocks.find((block) => block.type === 'TEXT');
  if (!textBlock || textBlock.type !== 'TEXT') return null;
  const normalized = textBlock.content.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (normalized.length <= 120) return normalized;
  return `${normalized.slice(0, 117)}...`;
};

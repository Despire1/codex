import { HomeworkBlock, HomeworkTemplate } from '../../../../../entities/types';

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

const estimateQuestionMinutes = (block: HomeworkBlock) => {
  if (block.type !== 'TEST') return 0;
  const questionsCount = Array.isArray(block.questions) ? block.questions.length : 0;
  return Math.max(questionsCount * 2, questionsCount > 0 ? 3 : 0);
};

const estimateTextMinutes = (block: HomeworkBlock) => {
  if (block.type !== 'TEXT') return 0;
  const words = block.content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 120));
};

const estimateMediaMinutes = (block: HomeworkBlock) => {
  if (block.type !== 'MEDIA') return 0;
  const attachmentsCount = Array.isArray(block.attachments) ? block.attachments.length : 0;
  return attachmentsCount > 0 ? attachmentsCount * 3 : 0;
};

const estimateStudentResponseMinutes = (block: HomeworkBlock) => {
  if (block.type !== 'STUDENT_RESPONSE') return 0;
  let score = 0;
  if (block.allowText) score += 5;
  if (block.allowVoice) score += 4;
  if (block.allowFiles || block.allowDocuments || block.allowPhotos || block.allowAudio || block.allowVideo) score += 3;
  return score;
};

export const estimateHomeworkTemplateDurationMinutes = (template: HomeworkTemplate) => {
  const estimated = template.blocks.reduce((total, block) => {
    return total + estimateQuestionMinutes(block) + estimateTextMinutes(block) + estimateMediaMinutes(block) + estimateStudentResponseMinutes(block);
  }, 0);
  return Math.max(estimated, 5);
};

export const formatHomeworkTemplateDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (restMinutes === 0) return `${hours} ч`;
  return `${hours} ч ${restMinutes} мин`;
};

const hasAudioAnswerInTemplate = (template: HomeworkTemplate) =>
  template.blocks.some(
    (block) => block.type === 'STUDENT_RESPONSE' && (block.allowVoice || block.allowAudio),
  );

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

export const resolveHomeworkTemplatePreview = (template: HomeworkTemplate) => {
  const textBlock = template.blocks.find((block) => block.type === 'TEXT');
  if (!textBlock || textBlock.type !== 'TEXT') return 'Описание не заполнено';
  const normalized = textBlock.content.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Описание не заполнено';
  if (normalized.length <= 120) return normalized;
  return `${normalized.slice(0, 117)}...`;
};

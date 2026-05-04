import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { HomeworkBlock, HomeworkTemplate } from '../../../../../entities/types';
import {
  HOMEWORK_TEMPLATE_FAVORITE_TAG,
  estimateHomeworkTemplateDurationMinutes,
  formatHomeworkTemplateDuration,
  resolveHomeworkTemplateCategory,
  resolveHomeworkTemplatePreview,
} from './templatePresentation';

export type HomeworkLibraryCategoryTone = 'purple' | 'blue' | 'green' | 'orange' | 'indigo' | 'pink' | 'gray';

export type HomeworkLibraryMetricIcon = 'clock' | 'questions' | 'paperclip' | 'microphone' | 'file';

export interface HomeworkLibraryMetric {
  id: string;
  icon: HomeworkLibraryMetricIcon;
  label: string;
}

const CATEGORY_TONE_RULES: Array<{ tone: HomeworkLibraryCategoryTone; keywords: string[] }> = [
  { tone: 'purple', keywords: ['grammar', 'грам', 'tense', 'passive', 'perfect'] },
  { tone: 'blue', keywords: ['lex', 'vocab', 'word', 'phrase', 'phrasal', 'лекс'] },
  { tone: 'green', keywords: ['reading', 'read', 'article', 'чтен'] },
  { tone: 'orange', keywords: ['speaking', 'устн', 'говор', 'voice'] },
  { tone: 'indigo', keywords: ['writing', 'essay', 'email', 'story', 'writ', 'письм', 'эссе'] },
  { tone: 'pink', keywords: ['listening', 'audio', 'podcast', 'listen', 'слуш'] },
];

const LEVEL_TONE_RULES: Array<{ tone: HomeworkLibraryCategoryTone; keywords: string[] }> = [
  { tone: 'green', keywords: ['elementary', 'pre-intermediate', 'a1', 'a2'] },
  { tone: 'blue', keywords: ['intermediate', 'b1', 'b2'] },
  { tone: 'orange', keywords: ['upper', 'advanced', 'c1', 'c2'] },
];

const normalize = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

const hasBlockType = (template: HomeworkTemplate, type: HomeworkBlock['type']) =>
  template.blocks.some((block) => block.type === type);

export const isHomeworkLibraryFavorite = (template: HomeworkTemplate) =>
  template.tags.some((tag) => normalize(tag) === HOMEWORK_TEMPLATE_FAVORITE_TAG);

export const hasHomeworkLibraryVoiceFlow = (template: HomeworkTemplate) =>
  template.blocks.some((block) => block.type === 'STUDENT_RESPONSE' && Boolean(block.allowVoice || block.allowAudio));

export const hasHomeworkLibraryMedia = (template: HomeworkTemplate) =>
  template.blocks.some((block) => block.type === 'MEDIA' && block.attachments.length > 0);

export const hasHomeworkLibraryWritingFlow = (template: HomeworkTemplate) =>
  template.blocks.some((block) => block.type === 'STUDENT_RESPONSE' && Boolean(block.allowText));

export const countHomeworkLibraryQuestions = (template: HomeworkTemplate) =>
  template.blocks.reduce((total, block) => {
    if (block.type !== 'TEST') return total;
    return total + block.questions.length;
  }, 0);

export const countHomeworkLibraryAttachments = (template: HomeworkTemplate) =>
  template.blocks.reduce((total, block) => {
    if (block.type !== 'MEDIA') return total;
    return total + block.attachments.length;
  }, 0);

export const resolveHomeworkLibraryCategoryTone = (template: HomeworkTemplate): HomeworkLibraryCategoryTone => {
  const category = normalize(resolveHomeworkTemplateCategory(template));
  const matchedRule = CATEGORY_TONE_RULES.find((rule) => rule.keywords.some((keyword) => category.includes(keyword)));
  return matchedRule?.tone ?? 'gray';
};

export const resolveHomeworkLibraryLevelTone = (template: HomeworkTemplate): HomeworkLibraryCategoryTone => {
  const level = normalize(template.level);
  const matchedRule = LEVEL_TONE_RULES.find((rule) => rule.keywords.some((keyword) => level.includes(keyword)));
  return matchedRule?.tone ?? 'gray';
};

export const resolveHomeworkLibraryCategoryLabel = (template: HomeworkTemplate) =>
  resolveHomeworkTemplateCategory(template).toUpperCase();

export const resolveHomeworkLibraryDescription = (template: HomeworkTemplate) =>
  resolveHomeworkTemplatePreview(template);

export const resolveHomeworkLibraryBadges = (template: HomeworkTemplate) => {
  const badges: Array<{ id: string; label: string; tone: HomeworkLibraryCategoryTone }> = [];
  const level = template.level?.trim();
  if (level) {
    badges.push({ id: 'level', label: level, tone: resolveHomeworkLibraryLevelTone(template) });
  }

  const category = normalize(resolveHomeworkTemplateCategory(template));
  const secondaryTag = template.tags
    .map((tag) => tag.trim())
    .find((tag) => {
      const normalized = normalize(tag);
      return normalized.length > 0 && normalized !== HOMEWORK_TEMPLATE_FAVORITE_TAG && normalized !== category;
    });

  if (secondaryTag) {
    badges.push({ id: 'tag', label: secondaryTag, tone: 'gray' });
  }

  return badges;
};

export const resolveHomeworkLibraryMetrics = (template: HomeworkTemplate): HomeworkLibraryMetric[] => {
  const metrics: HomeworkLibraryMetric[] = [
    {
      id: 'duration',
      icon: 'clock',
      label: `~${formatHomeworkTemplateDuration(estimateHomeworkTemplateDurationMinutes(template))}`,
    },
  ];

  const questionsCount = countHomeworkLibraryQuestions(template);
  const attachmentsCount = countHomeworkLibraryAttachments(template);
  const hasVoice = hasHomeworkLibraryVoiceFlow(template);
  const hasWriting = hasHomeworkLibraryWritingFlow(template);

  if (questionsCount > 0) {
    metrics.push({
      id: 'questions',
      icon: 'questions',
      label: `${questionsCount} ${questionsCount === 1 ? 'вопр.' : 'вопр.'}`,
    });
  }

  if (attachmentsCount > 0) {
    metrics.push({
      id: 'attachments',
      icon: 'paperclip',
      label: `${attachmentsCount}`,
    });
  } else if (hasVoice) {
    metrics.push({
      id: 'voice',
      icon: 'microphone',
      label: 'Голос',
    });
  } else if (hasWriting && !hasBlockType(template, 'TEST')) {
    metrics.push({
      id: 'writing',
      icon: 'file',
      label: 'Эссе',
    });
  }

  return metrics;
};

export const resolveHomeworkLibraryUpdatedLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Изм. недавно';
  // TEA-354: clamp future timestamps (clock skew) to "now" — иначе formatDistanceToNow
  // может выдать «через 6 минут» или отрицательные значения.
  const safeDate = date.getTime() > Date.now() ? new Date() : date;
  if (Date.now() - safeDate.getTime() < 60_000) return 'Изм. только что';
  return `Изм. ${formatDistanceToNow(safeDate, { addSuffix: true, locale: ru })}`;
};

export const resolveHomeworkLibraryUpdatedTooltip = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const resolveHomeworkLibraryIssuedCount = (template: HomeworkTemplate) => template.issuedAssignmentsCount ?? 0;

export const resolveHomeworkLibraryCollections = (templates: HomeworkTemplate[]) => {
  const uniqueCategories = new Map<string, string>();
  templates.forEach((template) => {
    const category = resolveHomeworkTemplateCategory(template).trim();
    if (!category) return;
    const normalized = normalize(category);
    if (!uniqueCategories.has(normalized)) {
      uniqueCategories.set(normalized, category);
    }
  });
  return Array.from(uniqueCategories.values()).sort((left, right) => left.localeCompare(right, 'ru'));
};

export const resolveHomeworkLibrarySearchText = (template: HomeworkTemplate) =>
  [template.title, template.subject, template.level, template.tags.join(' '), resolveHomeworkTemplatePreview(template)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

export const matchesHomeworkLibraryFormat = (
  template: HomeworkTemplate,
  format: 'test' | 'media' | 'voice' | 'writing',
) => {
  switch (format) {
    case 'test':
      return countHomeworkLibraryQuestions(template) > 0;
    case 'media':
      return hasHomeworkLibraryMedia(template);
    case 'voice':
      return hasHomeworkLibraryVoiceFlow(template);
    case 'writing':
      return hasHomeworkLibraryWritingFlow(template);
    default:
      return true;
  }
};

import { HomeworkBlock, HomeworkBlockStudentResponse, HomeworkTestQuestion } from '../../../../entities/types';
import {
  createMediaBlock,
  createStudentResponseBlock,
  createTestBlock,
  createTextBlock,
} from './blocks';

export type HomeworkTemplatePresetId = 'TEST_ONLY' | 'OPEN_ANSWER' | 'MEDIA_VOICE' | 'MIXED';

export type HomeworkTemplatePreset = {
  id: HomeworkTemplatePresetId;
  title: string;
  description: string;
  outcomeHint: string;
};

export const HOMEWORK_TEMPLATE_PRESETS: HomeworkTemplatePreset[] = [
  {
    id: 'TEST_ONLY',
    title: 'Только тест',
    description: 'Автопроверяемые вопросы без свободного ответа',
    outcomeHint: 'Ученик проходит тест и сразу сдает',
  },
  {
    id: 'OPEN_ANSWER',
    title: 'Текстовое задание',
    description: 'Инструкция + открытый ответ ученика',
    outcomeHint: 'Ученик отвечает текстом и/или файлами',
  },
  {
    id: 'MEDIA_VOICE',
    title: 'Материалы + voice',
    description: 'Фото/файлы и голосовой ответ ученика',
    outcomeHint: 'Ученик прикладывает voice без лишних полей',
  },
  {
    id: 'MIXED',
    title: 'Смешанный формат',
    description: 'Текст, тест и свободный ответ в одном шаблоне',
    outcomeHint: 'Максимально гибкий сценарий',
  },
];

const createVoiceOnlyResponseBlock = (): HomeworkBlockStudentResponse => ({
  ...createStudentResponseBlock(),
  allowText: false,
  allowVoice: true,
});

const createOpenAnswerResponseBlock = (): HomeworkBlockStudentResponse => ({
  ...createStudentResponseBlock(),
  allowText: true,
  allowFiles: true,
  allowPhotos: true,
  allowDocuments: true,
  allowAudio: false,
  allowVideo: false,
  allowVoice: true,
});

export const buildBlocksFromPreset = (presetId: HomeworkTemplatePresetId): HomeworkBlock[] => {
  if (presetId === 'TEST_ONLY') {
    return [createTestBlock()];
  }
  if (presetId === 'OPEN_ANSWER') {
    return [createTextBlock(), createOpenAnswerResponseBlock()];
  }
  if (presetId === 'MEDIA_VOICE') {
    return [createMediaBlock(), createVoiceOnlyResponseBlock()];
  }
  return [createTextBlock(), createTestBlock(), createOpenAnswerResponseBlock()];
};

const isQuestionConfigured = (question: HomeworkTestQuestion) => {
  if (!question.prompt.trim()) return false;
  if (question.type === 'SHORT_ANSWER') return true;
  if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') {
    const options = question.options ?? [];
    const filledOptions = options.filter((option) => option.text.trim().length > 0);
    return filledOptions.length >= 2;
  }
  const pairs = question.matchingPairs ?? [];
  return pairs.some((pair) => pair.left.trim().length > 0 || pair.right.trim().length > 0);
};

export const summarizeTemplateBlocks = (blocks: HomeworkBlock[]) => {
  const responseBlocks = blocks.filter((block): block is HomeworkBlockStudentResponse => block.type === 'STUDENT_RESPONSE');
  const testBlocks = blocks.filter((block) => block.type === 'TEST');
  const questionCount = testBlocks.reduce((sum, block) => sum + (block.questions?.length ?? 0), 0);
  const configuredQuestionCount = testBlocks.reduce(
    (sum, block) => sum + (block.questions ?? []).filter(isQuestionConfigured).length,
    0,
  );

  const responseCapabilities = {
    allowText: responseBlocks.some((block) => block.allowText),
    allowFiles: responseBlocks.some((block) => block.allowFiles),
    allowPhotos: responseBlocks.some((block) => block.allowPhotos),
    allowDocuments: responseBlocks.some((block) => block.allowDocuments),
    allowAudio: responseBlocks.some((block) => block.allowAudio),
    allowVideo: responseBlocks.some((block) => block.allowVideo),
    allowVoice: responseBlocks.some((block) => block.allowVoice),
  };

  const responseFormats: string[] = [];
  if (responseCapabilities.allowText) responseFormats.push('текст');
  if (responseCapabilities.allowFiles) responseFormats.push('файлы');
  if (responseCapabilities.allowPhotos) responseFormats.push('фото');
  if (responseCapabilities.allowDocuments) responseFormats.push('документы');
  if (responseCapabilities.allowAudio) responseFormats.push('аудио');
  if (responseCapabilities.allowVideo) responseFormats.push('видео');
  if (responseCapabilities.allowVoice) responseFormats.push('voice');

  return {
    blockCount: blocks.length,
    hasText: blocks.some((block) => block.type === 'TEXT'),
    hasMedia: blocks.some((block) => block.type === 'MEDIA'),
    hasTest: testBlocks.length > 0,
    hasStudentResponse: responseBlocks.length > 0,
    questionCount,
    configuredQuestionCount,
    responseFormats,
    responseCapabilities,
  };
};

export const detectPresetByBlocks = (blocks: HomeworkBlock[]): HomeworkTemplatePresetId | null => {
  const summary = summarizeTemplateBlocks(blocks);
  if (summary.hasTest && !summary.hasStudentResponse && blocks.length === 1) return 'TEST_ONLY';
  if (summary.hasMedia && summary.responseFormats.length === 1 && summary.responseFormats[0] === 'voice') {
    return 'MEDIA_VOICE';
  }
  if (summary.hasText && summary.hasStudentResponse && !summary.hasTest && !summary.hasMedia) {
    return 'OPEN_ANSWER';
  }
  if (summary.hasTest && summary.hasStudentResponse && summary.hasText) return 'MIXED';
  return null;
};

export const validateTemplateDraft = (draft: { title: string; blocks: HomeworkBlock[] }) => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const summary = summarizeTemplateBlocks(draft.blocks);

  if (!draft.title.trim()) {
    errors.push('Добавьте название шаблона.');
  }
  if (summary.blockCount === 0) {
    errors.push('Добавьте хотя бы один блок задания.');
  }

  const hasAnswerChannel = summary.hasTest || summary.responseFormats.length > 0;
  if (!hasAnswerChannel) {
    errors.push('Добавьте тест или блок «Ответ ученика», иначе ученик не сможет сдать домашку.');
  }

  if (summary.hasTest && summary.questionCount === 0) {
    errors.push('В тесте должен быть хотя бы один вопрос.');
  } else if (summary.hasTest && summary.configuredQuestionCount === 0) {
    warnings.push('Вопросы теста пока не заполнены, проверьте формулировки и варианты.');
  }

  if (summary.hasStudentResponse && summary.responseFormats.length === 0) {
    errors.push('В блоке «Ответ ученика» выберите хотя бы один формат ответа.');
  }

  if (summary.hasTest && !summary.hasStudentResponse) {
    warnings.push('Шаблон только с тестом: ученик сможет сдать только ответы теста.');
  }

  return { errors, warnings, summary };
};

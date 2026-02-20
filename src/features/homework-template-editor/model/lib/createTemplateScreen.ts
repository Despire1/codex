import {
  HomeworkAttachment,
  HomeworkBlock,
  HomeworkBlockMedia,
  HomeworkBlockStudentResponse,
  HomeworkBlockTest,
  HomeworkTestOption,
  HomeworkTestQuestion,
  HomeworkTestTableRow,
  HomeworkTestQuestionType,
} from '../../../../entities/types';
import {
  DEFAULT_HOMEWORK_TEMPLATE_QUIZ_SETTINGS,
  HOMEWORK_TEMPLATE_TEST_SETTINGS_KEY,
  HomeworkTemplateQuizSettings,
  readHomeworkTemplateQuizSettingsFromBlocks,
} from '../../../../entities/homework-template/model/lib/quizSettings';
import { HomeworkTemplateEditorDraft } from '../types';
import {
  createMediaBlock,
  createHomeworkBlockId,
  createStudentResponseBlock,
  createTestBlock,
  createTestQuestion,
  createTextBlock,
} from './blocks';
import { createAttachmentFromUrl as createAttachmentFromUrlInternal } from './templateMaterials';

export type CreateTemplateType = 'TEST' | 'WRITTEN' | 'ORAL' | 'FILE' | 'COMBO' | 'EXTERNAL';

export type CreateQuestionKind =
  | 'CHOICE'
  | 'SHORT_TEXT'
  | 'LONG_TEXT'
  | 'AUDIO'
  | 'FILE'
  | 'FILL_WORD'
  | 'MATCHING'
  | 'ORDERING'
  | 'TABLE';

export type TemplateQuizSettings = HomeworkTemplateQuizSettings;

export interface TemplateCreateStats {
  questionCount: number;
  totalPoints: number;
  estimatedMinutes: number;
  autoCheckEnabled: boolean;
}

const QUESTION_KIND_KEY = 'uiQuestionKind';
const QUESTION_REQUIRED_KEY = 'uiRequired';

const QUESTION_KIND_VALUES: CreateQuestionKind[] = [
  'CHOICE',
  'SHORT_TEXT',
  'LONG_TEXT',
  'AUDIO',
  'FILE',
  'FILL_WORD',
  'MATCHING',
  'ORDERING',
  'TABLE',
];

export const DEFAULT_TEMPLATE_QUIZ_SETTINGS: TemplateQuizSettings = DEFAULT_HOMEWORK_TEMPLATE_QUIZ_SETTINGS;

const toRecord = (value: unknown): Record<string, unknown> => (value as unknown as Record<string, unknown>);

const isCreateQuestionKind = (value: unknown): value is CreateQuestionKind =>
  typeof value === 'string' && QUESTION_KIND_VALUES.includes(value as CreateQuestionKind);

const createQuestionOption = (text = ''): HomeworkTestOption => ({
  id: createHomeworkBlockId(),
  text,
});

const createTableRow = (answerColumnCount: number): HomeworkTestTableRow => ({
  id: createHomeworkBlockId(),
  lead: '',
  answers: Array.from({ length: answerColumnCount }, () => ''),
});

const createOrderingItems = (count = 4): HomeworkTestOption[] =>
  Array.from({ length: count }, () => createQuestionOption(''));

const createShortQuestionByKind = (kind: Exclude<CreateQuestionKind, 'CHOICE' | 'MATCHING'>): HomeworkTestQuestion => {
  const base = withQuestionKind(createTestQuestion('SHORT_ANSWER'), kind);

  if (kind === 'FILL_WORD') {
    return {
      ...base,
      fillInTheBlankText: '',
      acceptedAnswers: [''],
      caseSensitive: false,
      allowPartialCredit: true,
    };
  }

  if (kind === 'ORDERING') {
    return {
      ...base,
      orderingItems: createOrderingItems(4),
      shuffleOptions: true,
      allowPartialCredit: false,
    };
  }

  if (kind === 'TABLE') {
    return {
      ...base,
      table: {
        leadHeader: 'Левая колонка',
        answerHeaders: ['Колонка 1', 'Колонка 2'],
        rows: [createTableRow(2), createTableRow(2)],
        partialCredit: true,
      },
      caseSensitive: false,
      allowPartialCredit: true,
    };
  }

  return base;
};

const normalizeQuestionType = (value: unknown): HomeworkTestQuestionType => {
  if (value === 'MULTIPLE_CHOICE') return 'MULTIPLE_CHOICE';
  if (value === 'SHORT_ANSWER') return 'SHORT_ANSWER';
  if (value === 'MATCHING') return 'MATCHING';
  return 'SINGLE_CHOICE';
};

const replaceQuestionTypePreservingContent = (
  question: HomeworkTestQuestion,
  type: HomeworkTestQuestionType,
): HomeworkTestQuestion => {
  const template = createTestQuestion(type);
  const questionRecord = toRecord(question);
  const nextQuestion: HomeworkTestQuestion = {
    ...template,
    id: question.id,
    prompt: question.prompt,
    explanation: question.explanation ?? null,
    points: question.points ?? null,
  };
  return withQuestionMeta(nextQuestion, QUESTION_REQUIRED_KEY, questionRecord[QUESTION_REQUIRED_KEY]);
};

const withQuestionKind = (question: HomeworkTestQuestion, kind: CreateQuestionKind): HomeworkTestQuestion =>
  withQuestionMeta(question, QUESTION_KIND_KEY, kind);

const clearQuestionKind = (question: HomeworkTestQuestion): HomeworkTestQuestion => {
  const next = toRecord(question);
  delete next[QUESTION_KIND_KEY];
  return next as unknown as HomeworkTestQuestion;
};

const withPreservedQuestionRequired = (
  source: HomeworkTestQuestion,
  target: HomeworkTestQuestion,
): HomeworkTestQuestion => withQuestionMeta(target, QUESTION_REQUIRED_KEY, toRecord(source)[QUESTION_REQUIRED_KEY]);

const withQuestionMeta = (
  question: HomeworkTestQuestion,
  key: string,
  value: unknown,
): HomeworkTestQuestion => ({
  ...toRecord(question),
  [key]: value,
}) as unknown as HomeworkTestQuestion;

const normalizeResponseBlock = (
  base: HomeworkBlockStudentResponse,
  config: Partial<Omit<HomeworkBlockStudentResponse, 'id' | 'type'>>,
): HomeworkBlockStudentResponse => ({
  ...base,
  allowText: config.allowText ?? false,
  allowFiles: config.allowFiles ?? false,
  allowPhotos: config.allowPhotos ?? false,
  allowDocuments: config.allowDocuments ?? false,
  allowAudio: config.allowAudio ?? false,
  allowVideo: config.allowVideo ?? false,
  allowVoice: config.allowVoice ?? false,
});

export const parseTagsText = (tagsText: string): string[] =>
  tagsText
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const stringifyTags = (tags: string[]): string => tags.join(', ');

export const getPrimaryTextContent = (blocks: HomeworkBlock[]): string => {
  const textBlock = blocks.find((block) => block.type === 'TEXT');
  return textBlock?.content ?? '';
};

export const setPrimaryTextContent = (blocks: HomeworkBlock[], content: string): HomeworkBlock[] => {
  const index = blocks.findIndex((block) => block.type === 'TEXT');
  if (index < 0) {
    return [
      {
        ...createTextBlock(),
        content,
      },
      ...blocks,
    ];
  }

  return blocks.map((block, blockIndex) =>
    blockIndex === index
      ? {
          ...block,
          content,
        }
      : block,
  );
};

export const getPrimaryTestBlockEntry = (blocks: HomeworkBlock[]) => {
  const index = blocks.findIndex((block) => block.type === 'TEST');
  if (index < 0) return null;
  return {
    index,
    block: blocks[index] as HomeworkBlockTest,
  };
};

export const getPrimaryMediaBlockEntry = (blocks: HomeworkBlock[]) => {
  const index = blocks.findIndex((block) => block.type === 'MEDIA');
  if (index < 0) return null;
  return {
    index,
    block: blocks[index] as HomeworkBlockMedia,
  };
};

export const getPrimaryResponseBlockEntry = (blocks: HomeworkBlock[]) => {
  const index = blocks.findIndex((block) => block.type === 'STUDENT_RESPONSE');
  if (index < 0) return null;
  return {
    index,
    block: blocks[index] as HomeworkBlockStudentResponse,
  };
};

export const ensurePrimaryTestBlock = (blocks: HomeworkBlock[]) => {
  const existing = getPrimaryTestBlockEntry(blocks);
  if (existing) {
    return {
      blocks,
      index: existing.index,
      block: existing.block,
    };
  }
  const created = createTestBlock();
  const nextBlocks = [...blocks, created];
  return {
    blocks: nextBlocks,
    index: nextBlocks.length - 1,
    block: created,
  };
};

export const ensurePrimaryMediaBlock = (blocks: HomeworkBlock[]) => {
  const existing = getPrimaryMediaBlockEntry(blocks);
  if (existing) {
    return {
      blocks,
      index: existing.index,
      block: existing.block,
    };
  }
  const created = createMediaBlock();
  const nextBlocks = [...blocks, created];
  return {
    blocks: nextBlocks,
    index: nextBlocks.length - 1,
    block: created,
  };
};

const buildTemplateTypeBlocks = (blocks: HomeworkBlock[], type: CreateTemplateType): HomeworkBlock[] => {
  const textBlock =
    blocks.find((block): block is HomeworkBlock & { type: 'TEXT' } => block.type === 'TEXT') ?? createTextBlock();
  const testBlock =
    blocks.find((block): block is HomeworkBlockTest => block.type === 'TEST') ?? createTestBlock();
  const mediaBlock =
    blocks.find((block): block is HomeworkBlockMedia => block.type === 'MEDIA') ?? createMediaBlock();
  const responseBase =
    blocks.find((block): block is HomeworkBlockStudentResponse => block.type === 'STUDENT_RESPONSE') ??
    createStudentResponseBlock();

  if (type === 'TEST') {
    return [textBlock, testBlock];
  }

  if (type === 'WRITTEN') {
    return [
      textBlock,
      normalizeResponseBlock(responseBase, {
        allowText: true,
        allowFiles: false,
        allowPhotos: false,
        allowDocuments: false,
        allowAudio: false,
        allowVideo: false,
        allowVoice: false,
      }),
    ];
  }

  if (type === 'ORAL') {
    return [
      textBlock,
      normalizeResponseBlock(responseBase, {
        allowText: false,
        allowFiles: false,
        allowPhotos: false,
        allowDocuments: false,
        allowAudio: false,
        allowVideo: false,
        allowVoice: true,
      }),
    ];
  }

  if (type === 'FILE') {
    return [
      textBlock,
      normalizeResponseBlock(responseBase, {
        allowText: false,
        allowFiles: true,
        allowPhotos: true,
        allowDocuments: true,
        allowAudio: false,
        allowVideo: false,
        allowVoice: false,
      }),
    ];
  }

  if (type === 'EXTERNAL') {
    return [
      textBlock,
      mediaBlock,
      normalizeResponseBlock(responseBase, {
        allowText: true,
        allowFiles: false,
        allowPhotos: false,
        allowDocuments: false,
        allowAudio: false,
        allowVideo: false,
        allowVoice: false,
      }),
    ];
  }

  return [
    textBlock,
    testBlock,
    normalizeResponseBlock(responseBase, {
      allowText: true,
      allowFiles: true,
      allowPhotos: true,
      allowDocuments: true,
      allowAudio: true,
      allowVideo: true,
      allowVoice: true,
    }),
  ];
};

export const applyCreateTemplateType = (blocks: HomeworkBlock[], type: CreateTemplateType): HomeworkBlock[] =>
  buildTemplateTypeBlocks(blocks, type);

export const detectCreateTemplateType = (blocks: HomeworkBlock[]): CreateTemplateType => {
  const hasTest = blocks.some((block) => block.type === 'TEST');
  const hasMedia = blocks.some((block) => block.type === 'MEDIA');
  const responseBlock = blocks.find(
    (block): block is HomeworkBlockStudentResponse => block.type === 'STUDENT_RESPONSE',
  );

  if (hasTest && !responseBlock) return 'TEST';
  if (hasTest && responseBlock) return 'COMBO';
  if (hasMedia && !responseBlock) return 'EXTERNAL';

  if (responseBlock) {
    const voiceOnly =
      responseBlock.allowVoice &&
      !responseBlock.allowText &&
      !responseBlock.allowFiles &&
      !responseBlock.allowPhotos &&
      !responseBlock.allowDocuments &&
      !responseBlock.allowAudio &&
      !responseBlock.allowVideo;
    if (voiceOnly) return 'ORAL';

    const filesOnly =
      (responseBlock.allowFiles || responseBlock.allowPhotos || responseBlock.allowDocuments) &&
      !responseBlock.allowText &&
      !responseBlock.allowVoice &&
      !responseBlock.allowAudio &&
      !responseBlock.allowVideo;
    if (filesOnly) return 'FILE';

    return 'WRITTEN';
  }

  return hasMedia ? 'EXTERNAL' : 'WRITTEN';
};

export const readTemplateQuizSettings = (blocks: HomeworkBlock[]): TemplateQuizSettings => {
  return readHomeworkTemplateQuizSettingsFromBlocks(blocks);
};

export const writeTemplateQuizSettings = (
  blocks: HomeworkBlock[],
  settings: TemplateQuizSettings,
): HomeworkBlock[] => {
  const testEntry = getPrimaryTestBlockEntry(blocks);
  if (!testEntry) return blocks;

  const nextTestBlock = {
    ...toRecord(testEntry.block),
    [HOMEWORK_TEMPLATE_TEST_SETTINGS_KEY]: settings,
  } as unknown as HomeworkBlockTest;

  return blocks.map((block, index) => (index === testEntry.index ? nextTestBlock : block));
};

export const getQuestionKind = (question: HomeworkTestQuestion): CreateQuestionKind => {
  if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') return 'CHOICE';
  if (question.type === 'MATCHING') return 'MATCHING';

  const raw = toRecord(question)[QUESTION_KIND_KEY];
  if (isCreateQuestionKind(raw) && raw !== 'CHOICE') return raw;
  return 'SHORT_TEXT';
};

export const createQuestionByKind = (kind: CreateQuestionKind): HomeworkTestQuestion => {
  if (kind === 'CHOICE') return createTestQuestion('SINGLE_CHOICE');
  if (kind === 'MATCHING') return withQuestionKind(createTestQuestion('MATCHING'), 'MATCHING');
  return createShortQuestionByKind(kind);
};

export const setQuestionKind = (question: HomeworkTestQuestion, kind: CreateQuestionKind): HomeworkTestQuestion => {
  const questionRecord = toRecord(question);

  if (kind === 'CHOICE') {
    const targetType =
      question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE'
        ? normalizeQuestionType(question.type)
        : 'SINGLE_CHOICE';
    const replaced = replaceQuestionTypePreservingContent(question, targetType);
    return clearQuestionKind(
      withQuestionMeta(replaced, QUESTION_REQUIRED_KEY, questionRecord[QUESTION_REQUIRED_KEY]),
    );
  }

  if (kind === 'MATCHING') {
    const replaced = replaceQuestionTypePreservingContent(question, 'MATCHING');
    return withPreservedQuestionRequired(question, withQuestionKind(replaced, 'MATCHING'));
  }

  const replaced = createShortQuestionByKind(kind);
  return withPreservedQuestionRequired(question, {
    ...replaced,
    id: question.id,
    prompt: question.prompt,
    explanation: question.explanation ?? null,
    points: question.points ?? null,
  });
};

export const getQuestionRequired = (question: HomeworkTestQuestion): boolean => {
  const raw = toRecord(question)[QUESTION_REQUIRED_KEY];
  return typeof raw === 'boolean' ? raw : false;
};

export const setQuestionRequired = (question: HomeworkTestQuestion, value: boolean): HomeworkTestQuestion =>
  withQuestionMeta(question, QUESTION_REQUIRED_KEY, value);

export const isQuestionMultipleChoice = (question: HomeworkTestQuestion): boolean =>
  question.type === 'MULTIPLE_CHOICE';

export const toggleQuestionMultipleChoice = (
  question: HomeworkTestQuestion,
  value: boolean,
): HomeworkTestQuestion => {
  if (question.type !== 'SINGLE_CHOICE' && question.type !== 'MULTIPLE_CHOICE') return question;

  const targetType: HomeworkTestQuestionType = value ? 'MULTIPLE_CHOICE' : 'SINGLE_CHOICE';
  if (question.type === targetType) return question;

  const replaced = replaceQuestionTypePreservingContent(question, targetType);

  if (targetType === 'SINGLE_CHOICE') {
    const firstCorrect = (question.correctOptionIds ?? [])[0];
    return {
      ...replaced,
      options: question.options ?? replaced.options,
      correctOptionIds: firstCorrect ? [firstCorrect] : [],
    };
  }

  return {
    ...replaced,
    options: question.options ?? replaced.options,
    correctOptionIds: question.correctOptionIds ?? [],
  };
};

export const normalizeEstimatedMinutes = (value: number | null): number => {
  if (!Number.isFinite(value ?? Number.NaN)) return 15;
  return Math.max(1, Math.min(240, Math.round(value as number)));
};

export const extractEstimatedMinutes = (value: string): number | null => {
  const digits = value.replace(/[^0-9]/g, '');
  if (!digits) return null;
  const numeric = Number(digits);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return normalizeEstimatedMinutes(numeric);
};

export const serializeEstimatedMinutes = (value: number | null): string => {
  if (value === null) return '';
  return String(normalizeEstimatedMinutes(value));
};

export const createAttachmentFromUrl = (value: string): HomeworkAttachment | null => {
  return createAttachmentFromUrlInternal(value);
};

export const buildTemplateCreateStats = (
  draft: HomeworkTemplateEditorDraft,
  settings: TemplateQuizSettings,
): TemplateCreateStats => {
  const questionCount = draft.blocks
    .filter((block): block is HomeworkBlockTest => block.type === 'TEST')
    .reduce((sum, block) => sum + (block.questions?.length ?? 0), 0);

  const totalPoints = draft.blocks
    .filter((block): block is HomeworkBlockTest => block.type === 'TEST')
    .flatMap((block) => block.questions ?? [])
    .reduce((sum, question) => {
      const points = Number(question.points);
      if (!Number.isFinite(points) || points <= 0) return sum + 1;
      return sum + points;
    }, 0);

  const explicitMinutes = extractEstimatedMinutes(draft.level);
  const derivedMinutes = questionCount > 0 ? Math.max(10, questionCount * 3) : 15;

  return {
    questionCount,
    totalPoints,
    estimatedMinutes: explicitMinutes ?? derivedMinutes,
    autoCheckEnabled: settings.autoCheckEnabled && questionCount > 0,
  };
};

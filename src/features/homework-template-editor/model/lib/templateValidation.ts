import {
  HomeworkBlock,
  HomeworkBlockStudentResponse,
  HomeworkBlockTest,
  HomeworkTestQuestion,
} from '../../../../entities/types';
import { readHomeworkTemplateQuizSettingsFromTestBlock } from '../../../../entities/homework-template/model/lib/quizSettings';
import { FormValidationIssue, FormValidationPath } from '../../../../shared/lib/form-validation/types';
import { getQuestionKind } from './createTemplateScreen';
import { summarizeTemplateBlocks } from './templateFlow';

const REQUIRED_FIELD_MESSAGE = 'Заполните поле.';

const PLACEHOLDER_REGEX = /\[___\]/g;

const pushIssue = (
  issues: FormValidationIssue[],
  path: FormValidationPath,
  code: string,
  message: string,
  severity: 'error' | 'warning' = 'error',
) => {
  issues.push({
    path,
    code,
    message,
    severity,
  });
};

const normalizeQuestionPoints = (question: HomeworkTestQuestion) => {
  const points = Number(question.points);
  if (!Number.isFinite(points) || points <= 0) return 1;
  return points;
};

const validateChoiceQuestion = (
  issues: FormValidationIssue[],
  questionPath: FormValidationPath,
  question: HomeworkTestQuestion,
) => {
  if (question.type !== 'SINGLE_CHOICE' && question.type !== 'MULTIPLE_CHOICE') return;

  const options = question.options ?? [];
  if (options.length < 2) {
    pushIssue(issues, [...questionPath, 'options'], 'choice_options_min', 'Добавьте минимум 2 варианта.');
  }

  options.forEach((option, optionIndex) => {
    if (option.text.trim().length > 0) return;
    pushIssue(
      issues,
      [...questionPath, 'options', optionIndex, 'text'],
      'choice_option_required',
      REQUIRED_FIELD_MESSAGE,
    );
  });

  const correctOptionIds = (question.correctOptionIds ?? []).filter(Boolean);
  if (correctOptionIds.length === 0) {
    pushIssue(
      issues,
      [...questionPath, 'correctOptionIds'],
      'choice_correct_required',
      'Выберите верный вариант.',
    );
  }
};

const validateMatchingQuestion = (
  issues: FormValidationIssue[],
  questionPath: FormValidationPath,
  question: HomeworkTestQuestion,
) => {
  const pairs = question.matchingPairs ?? [];
  if (pairs.length < 2) {
    pushIssue(issues, [...questionPath, 'matchingPairs'], 'matching_pairs_min', 'Добавьте минимум 2 пары.');
  }

  pairs.forEach((pair, pairIndex) => {
    if (!pair.left.trim()) {
      pushIssue(
        issues,
        [...questionPath, 'matchingPairs', pairIndex, 'left'],
        'matching_left_required',
        REQUIRED_FIELD_MESSAGE,
      );
    }
    if (!pair.right.trim()) {
      pushIssue(
        issues,
        [...questionPath, 'matchingPairs', pairIndex, 'right'],
        'matching_right_required',
        REQUIRED_FIELD_MESSAGE,
      );
    }
  });
};

const validateFillWordQuestion = (
  issues: FormValidationIssue[],
  questionPath: FormValidationPath,
  question: HomeworkTestQuestion,
) => {
  const text = question.fillInTheBlankText?.trim() ?? '';
  const placeholdersCount = Array.from(text.matchAll(PLACEHOLDER_REGEX)).length;
  if (placeholdersCount === 0) {
    pushIssue(
      issues,
      [...questionPath, 'fillInTheBlankText'],
      'fill_word_placeholder_required',
      'Добавьте хотя бы один пропуск [___].',
    );
    return;
  }

  const acceptedAnswers = question.acceptedAnswers ?? [];
  for (let answerIndex = 0; answerIndex < placeholdersCount; answerIndex += 1) {
    if ((acceptedAnswers[answerIndex] ?? '').trim()) continue;
    pushIssue(
      issues,
      [...questionPath, 'acceptedAnswers', answerIndex],
      'fill_word_answer_required',
      REQUIRED_FIELD_MESSAGE,
    );
  }
};

const validateOrderingQuestion = (
  issues: FormValidationIssue[],
  questionPath: FormValidationPath,
  question: HomeworkTestQuestion,
) => {
  const orderingItems = question.orderingItems ?? [];
  if (orderingItems.length < 2) {
    pushIssue(issues, [...questionPath, 'orderingItems'], 'ordering_items_min', 'Добавьте минимум 2 шага.');
  }

  orderingItems.forEach((item, itemIndex) => {
    if (item.text.trim().length > 0) return;
    pushIssue(
      issues,
      [...questionPath, 'orderingItems', itemIndex, 'text'],
      'ordering_item_required',
      REQUIRED_FIELD_MESSAGE,
    );
  });
};

const validateTableQuestion = (
  issues: FormValidationIssue[],
  questionPath: FormValidationPath,
  question: HomeworkTestQuestion,
) => {
  const table = question.table;
  if (!table) {
    pushIssue(issues, [...questionPath, 'table'], 'table_config_required', 'Настройте таблицу.');
    return;
  }

  if (!table.leadHeader?.trim()) {
    pushIssue(
      issues,
      [...questionPath, 'table', 'leadHeader'],
      'table_lead_header_required',
      REQUIRED_FIELD_MESSAGE,
    );
  }

  const answerHeaders = table.answerHeaders ?? [];
  if (answerHeaders.length === 0) {
    pushIssue(
      issues,
      [...questionPath, 'table', 'answerHeaders'],
      'table_answer_headers_required',
      'Добавьте хотя бы одну колонку ответов.',
    );
  }
  answerHeaders.forEach((answerHeader, headerIndex) => {
    if (answerHeader.trim()) return;
    pushIssue(
      issues,
      [...questionPath, 'table', 'answerHeaders', headerIndex],
      'table_answer_header_required',
      REQUIRED_FIELD_MESSAGE,
    );
  });

  const rows = table.rows ?? [];
  if (rows.length === 0) {
    pushIssue(issues, [...questionPath, 'table', 'rows'], 'table_rows_required', 'Добавьте минимум одну строку.');
    return;
  }

  rows.forEach((row, rowIndex) => {
    if (!row.lead.trim()) {
      pushIssue(
        issues,
        [...questionPath, 'table', 'rows', rowIndex, 'lead'],
        'table_lead_required',
        REQUIRED_FIELD_MESSAGE,
      );
    }
    answerHeaders.forEach((_, answerIndex) => {
      if ((row.answers?.[answerIndex] ?? '').trim()) return;
      pushIssue(
        issues,
        [...questionPath, 'table', 'rows', rowIndex, 'answers', answerIndex],
        'table_answer_required',
        REQUIRED_FIELD_MESSAGE,
      );
    });
  });
};

const hasResponseChannel = (blocks: HomeworkBlock[]) =>
  blocks.some((block): block is HomeworkBlockStudentResponse => {
    if (block.type !== 'STUDENT_RESPONSE') return false;
    return (
      block.allowText ||
      block.allowFiles ||
      block.allowPhotos ||
      block.allowDocuments ||
      block.allowAudio ||
      block.allowVideo ||
      block.allowVoice
    );
  });

const getQuestionPath = (testBlockIndex: number, questionIndex: number): FormValidationPath => [
  'blocks',
  testBlockIndex,
  'questions',
  questionIndex,
];

const validateQuestion = (
  issues: FormValidationIssue[],
  testBlockIndex: number,
  question: HomeworkTestQuestion,
  questionIndex: number,
) => {
  const questionPath = getQuestionPath(testBlockIndex, questionIndex);

  if (!question.prompt.trim()) {
    pushIssue(issues, [...questionPath, 'prompt'], 'question_prompt_required', REQUIRED_FIELD_MESSAGE);
  }

  const questionKind = getQuestionKind(question);
  if (questionKind === 'CHOICE') {
    validateChoiceQuestion(issues, questionPath, question);
    return;
  }

  if (questionKind === 'MATCHING') {
    validateMatchingQuestion(issues, questionPath, question);
    return;
  }

  if (questionKind === 'FILL_WORD') {
    validateFillWordQuestion(issues, questionPath, question);
    return;
  }

  if (questionKind === 'ORDERING') {
    validateOrderingQuestion(issues, questionPath, question);
    return;
  }

  if (questionKind === 'TABLE') {
    validateTableQuestion(issues, questionPath, question);
    return;
  }
};

const validateResponseBlock = (issues: FormValidationIssue[], responseBlock: HomeworkBlockStudentResponse, index: number) => {
  if (
    responseBlock.allowText ||
    responseBlock.allowFiles ||
    responseBlock.allowPhotos ||
    responseBlock.allowDocuments ||
    responseBlock.allowAudio ||
    responseBlock.allowVideo ||
    responseBlock.allowVoice
  ) {
    return;
  }
  pushIssue(
    issues,
    ['blocks', index, 'allowText'],
    'response_channel_required',
    'Выберите хотя бы один формат ответа.',
  );
};

const getQuestionCount = (blocks: HomeworkBlock[]) =>
  blocks
    .filter((block): block is HomeworkBlockTest => block.type === 'TEST')
    .reduce((sum, block) => sum + (block.questions?.length ?? 0), 0);

export interface TemplateValidationResult {
  issues: FormValidationIssue[];
  summary: {
    blockCount: number;
    hasText: boolean;
    hasMedia: boolean;
    hasTest: boolean;
    hasStudentResponse: boolean;
    questionCount: number;
    configuredQuestionCount: number;
    responseFormats: string[];
    responseCapabilities: {
      allowText: boolean;
      allowFiles: boolean;
      allowPhotos: boolean;
      allowDocuments: boolean;
      allowAudio: boolean;
      allowVideo: boolean;
      allowVoice: boolean;
    };
    totalPoints: number;
  };
}

export const validateTemplateDraft = (draft: { title: string; blocks: HomeworkBlock[] }): TemplateValidationResult => {
  const issues: FormValidationIssue[] = [];
  const summary = summarizeTemplateBlocks(draft.blocks);

  if (!draft.title.trim()) {
    pushIssue(issues, ['title'], 'template_title_required', REQUIRED_FIELD_MESSAGE);
  }

  if (summary.blockCount === 0) {
    pushIssue(issues, ['blocks'], 'template_blocks_required', 'Добавьте хотя бы один блок задания.');
  }

  if (!summary.hasTest && !hasResponseChannel(draft.blocks)) {
    pushIssue(
      issues,
      ['blocks'],
      'template_answer_channel_required',
      'Добавьте тест или блок ответа ученика.',
    );
  }

  const testBlocks = draft.blocks
    .map((block, blockIndex) => ({ block, blockIndex }))
    .filter((entry): entry is { block: HomeworkBlockTest; blockIndex: number } => entry.block.type === 'TEST');
  const responseBlocks = draft.blocks
    .map((block, blockIndex) => ({ block, blockIndex }))
    .filter((entry): entry is { block: HomeworkBlockStudentResponse; blockIndex: number } => entry.block.type === 'STUDENT_RESPONSE');

  if (summary.hasTest && getQuestionCount(draft.blocks) === 0) {
    const firstTestBlockIndex = testBlocks[0]?.blockIndex ?? 0;
    pushIssue(
      issues,
      ['blocks', firstTestBlockIndex, 'questions'],
      'template_questions_required',
      'Добавьте хотя бы один вопрос.',
    );
  }

  testBlocks.forEach(({ block, blockIndex }) => {
    (block.questions ?? []).forEach((question, questionIndex) => {
      validateQuestion(issues, blockIndex, question, questionIndex);
    });

    const quizSettings = readHomeworkTemplateQuizSettingsFromTestBlock(block);
    if (quizSettings.timerEnabled && quizSettings.timerDurationMinutes === null) {
      pushIssue(
        issues,
        ['blocks', blockIndex, 'templateSettings', 'timerDurationMinutes'],
        'template_timer_duration_required',
        'Укажите время для таймера (в минутах).',
      );
    }
  });

  responseBlocks.forEach(({ block, blockIndex }) => {
    validateResponseBlock(issues, block, blockIndex);
  });

  if (summary.hasTest && !summary.hasStudentResponse) {
    pushIssue(
      issues,
      ['blocks'],
      'template_test_only_warning',
      'Шаблон только с тестом: ученик сможет сдать только ответы теста.',
      'warning',
    );
  }

  const totalPoints = draft.blocks
    .filter((block): block is HomeworkBlockTest => block.type === 'TEST')
    .flatMap((block) => block.questions ?? [])
    .reduce((sum, question) => sum + normalizeQuestionPoints(question), 0);

  return {
    issues,
    summary: {
      ...summary,
      totalPoints,
    },
  };
};

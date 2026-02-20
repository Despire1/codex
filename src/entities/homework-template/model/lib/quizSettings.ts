import { HomeworkBlock, HomeworkBlockTest } from '../../../types';

export const HOMEWORK_TEMPLATE_TEST_SETTINGS_KEY = 'templateSettings';

export const HOMEWORK_TIMER_MIN_MINUTES = 1;
export const HOMEWORK_TIMER_MAX_MINUTES = 720;
export const HOMEWORK_TIMER_DEFAULT_MINUTES = 30;

export interface HomeworkTemplateQuizSettings {
  autoCheckEnabled: boolean;
  passingScorePercent: number;
  attemptsLimit: 1 | 2 | null;
  showCorrectAnswers: boolean;
  shuffleQuestions: boolean;
  timerEnabled: boolean;
  timerDurationMinutes: number | null;
}

export interface HomeworkAttemptTimerConfig {
  enabled: boolean;
  durationMinutes: number | null;
  durationMs: number | null;
}

export const DEFAULT_HOMEWORK_TEMPLATE_QUIZ_SETTINGS: HomeworkTemplateQuizSettings = {
  autoCheckEnabled: true,
  passingScorePercent: 70,
  attemptsLimit: null,
  showCorrectAnswers: false,
  shuffleQuestions: true,
  timerEnabled: false,
  timerDurationMinutes: null,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toRecord = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;

const clampPassingScorePercent = (value: number) => {
  if (!Number.isFinite(value)) return DEFAULT_HOMEWORK_TEMPLATE_QUIZ_SETTINGS.passingScorePercent;
  return Math.max(0, Math.min(100, Math.round(value)));
};

export const normalizeHomeworkTimerDurationMinutes = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.round(numeric);
  if (rounded < HOMEWORK_TIMER_MIN_MINUTES) return null;
  return Math.min(HOMEWORK_TIMER_MAX_MINUTES, rounded);
};

export const normalizeHomeworkTemplateQuizSettings = (value: unknown): HomeworkTemplateQuizSettings => {
  if (!isRecord(value)) return { ...DEFAULT_HOMEWORK_TEMPLATE_QUIZ_SETTINGS };

  const attemptsLimitRaw = value.attemptsLimit;
  let attemptsLimit: 1 | 2 | null = DEFAULT_HOMEWORK_TEMPLATE_QUIZ_SETTINGS.attemptsLimit;
  if (attemptsLimitRaw === 1 || attemptsLimitRaw === 2 || attemptsLimitRaw === null) {
    attemptsLimit = attemptsLimitRaw as 1 | 2 | null;
  }

  return {
    autoCheckEnabled:
      typeof value.autoCheckEnabled === 'boolean'
        ? value.autoCheckEnabled
        : DEFAULT_HOMEWORK_TEMPLATE_QUIZ_SETTINGS.autoCheckEnabled,
    passingScorePercent:
      typeof value.passingScorePercent === 'number'
        ? clampPassingScorePercent(value.passingScorePercent)
        : DEFAULT_HOMEWORK_TEMPLATE_QUIZ_SETTINGS.passingScorePercent,
    attemptsLimit,
    showCorrectAnswers:
      typeof value.showCorrectAnswers === 'boolean'
        ? value.showCorrectAnswers
        : DEFAULT_HOMEWORK_TEMPLATE_QUIZ_SETTINGS.showCorrectAnswers,
    shuffleQuestions:
      typeof value.shuffleQuestions === 'boolean'
        ? value.shuffleQuestions
        : DEFAULT_HOMEWORK_TEMPLATE_QUIZ_SETTINGS.shuffleQuestions,
    timerEnabled:
      typeof value.timerEnabled === 'boolean' ? value.timerEnabled : DEFAULT_HOMEWORK_TEMPLATE_QUIZ_SETTINGS.timerEnabled,
    timerDurationMinutes: normalizeHomeworkTimerDurationMinutes(value.timerDurationMinutes),
  };
};

export const readHomeworkTemplateQuizSettingsFromTestBlock = (
  testBlock: HomeworkBlockTest | null | undefined,
): HomeworkTemplateQuizSettings => {
  if (!testBlock) return { ...DEFAULT_HOMEWORK_TEMPLATE_QUIZ_SETTINGS };
  const rawSettings = toRecord(testBlock)[HOMEWORK_TEMPLATE_TEST_SETTINGS_KEY];
  return normalizeHomeworkTemplateQuizSettings(rawSettings);
};

export const readHomeworkTemplateQuizSettingsFromBlocks = (
  blocks: HomeworkBlock[],
): HomeworkTemplateQuizSettings => {
  const testBlock = blocks.find((block): block is HomeworkBlockTest => block.type === 'TEST');
  return readHomeworkTemplateQuizSettingsFromTestBlock(testBlock ?? null);
};

export const writeHomeworkTemplateQuizSettingsToBlocks = (
  blocks: HomeworkBlock[],
  settings: HomeworkTemplateQuizSettings,
): HomeworkBlock[] => {
  const testBlockIndex = blocks.findIndex((block) => block.type === 'TEST');
  if (testBlockIndex < 0) return blocks;

  const nextTestBlock = {
    ...toRecord(blocks[testBlockIndex]),
    [HOMEWORK_TEMPLATE_TEST_SETTINGS_KEY]: normalizeHomeworkTemplateQuizSettings(settings),
  } as unknown as HomeworkBlockTest;

  return blocks.map((block, index) => (index === testBlockIndex ? nextTestBlock : block));
};

export const resolveHomeworkAttemptTimerConfig = (
  blocks: HomeworkBlock[],
): HomeworkAttemptTimerConfig => {
  const settings = readHomeworkTemplateQuizSettingsFromBlocks(blocks);
  const durationMinutes = settings.timerEnabled ? settings.timerDurationMinutes : null;
  const enabled = settings.timerEnabled && typeof durationMinutes === 'number' && durationMinutes > 0;
  return {
    enabled,
    durationMinutes: enabled ? durationMinutes : null,
    durationMs: enabled && durationMinutes ? durationMinutes * 60_000 : null,
  };
};

import test from 'node:test';
import assert from 'node:assert/strict';
import { HomeworkBlock, HomeworkSubmission } from '../../../types';
import {
  HOMEWORK_ATTEMPTS_DEFAULT,
  HOMEWORK_ATTEMPTS_MAX,
  HOMEWORK_ATTEMPTS_MIN,
  normalizeHomeworkAttemptsLimit,
  normalizeHomeworkTemplateQuizSettings,
  sanitizeHomeworkTemplateQuizSettingsForSave,
} from './quizSettings';
import { resolveHomeworkQuizAttemptState, resolveHomeworkQuizCapabilities } from './quizProgress';

const buildAutoQuizBlocks = (settings?: Record<string, unknown>): HomeworkBlock[] => [
  {
    id: 'test',
    type: 'TEST',
    questions: [
      {
        id: 'q1',
        type: 'SINGLE_CHOICE',
        prompt: 'Choose',
        options: [
          { id: 'a', text: 'A' },
          { id: 'b', text: 'B' },
        ],
        correctOptionIds: ['a'],
      },
    ],
    ...(settings ? { templateSettings: settings } : {}),
  } as HomeworkBlock,
];

const buildSubmission = (overrides?: Partial<HomeworkSubmission>): HomeworkSubmission => ({
  id: 1,
  assignmentId: 1,
  studentId: 1,
  attemptNo: 1,
  status: 'REVIEWED',
  attachments: [],
  voice: [],
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
  score: {
    autoScore: 40,
    finalScore: 40,
  },
  ...overrides,
});

test('normalize homework attempts limit keeps legacy null and clamps numeric range', () => {
  assert.equal(normalizeHomeworkAttemptsLimit(null), null);
  assert.equal(normalizeHomeworkAttemptsLimit(0), HOMEWORK_ATTEMPTS_MIN);
  assert.equal(normalizeHomeworkAttemptsLimit(11), HOMEWORK_ATTEMPTS_MAX);
  assert.equal(normalizeHomeworkAttemptsLimit('foo'), HOMEWORK_ATTEMPTS_DEFAULT);
  assert.equal(normalizeHomeworkAttemptsLimit(3.4), 3);
});

test('normalize template quiz settings keeps legacy null while new defaults are numeric', () => {
  assert.equal(normalizeHomeworkTemplateQuizSettings({}).attemptsLimit, HOMEWORK_ATTEMPTS_DEFAULT);
  assert.equal(normalizeHomeworkTemplateQuizSettings({ attemptsLimit: null }).attemptsLimit, null);
});

test('sanitize settings for save disables correct answers when attempts exceed one', () => {
  const sanitized = sanitizeHomeworkTemplateQuizSettingsForSave({
    autoCheckEnabled: true,
    passingScorePercent: 70,
    attemptsLimit: 3,
    showCorrectAnswers: true,
    shuffleQuestions: true,
    timerEnabled: false,
    timerDurationMinutes: null,
  });

  assert.equal(sanitized.attemptsLimit, 3);
  assert.equal(sanitized.showCorrectAnswers, false);
});

test('quiz capabilities detect fully auto-checkable test without manual response channels', () => {
  assert.equal(resolveHomeworkQuizCapabilities(buildAutoQuizBlocks()).fullyAutoCheckable, true);

  const mixedBlocks: HomeworkBlock[] = [
    ...buildAutoQuizBlocks(),
    {
      id: 'response',
      type: 'STUDENT_RESPONSE',
      allowText: true,
      allowFiles: false,
      allowPhotos: false,
      allowDocuments: false,
      allowAudio: false,
      allowVideo: false,
      allowVoice: false,
    },
  ];

  assert.equal(resolveHomeworkQuizCapabilities(mixedBlocks).fullyAutoCheckable, false);
});

test('quiz attempt state allows retry after failed auto-checked attempt when attempts remain', () => {
  const state = resolveHomeworkQuizAttemptState(
    buildAutoQuizBlocks({
      autoCheckEnabled: true,
      attemptsLimit: 3,
      showCorrectAnswers: false,
      passingScorePercent: 70,
    }),
    [buildSubmission()],
  );

  assert.equal(state.attemptsUsed, 1);
  assert.equal(state.attemptsRemaining, 2);
  assert.equal(state.latestAttemptPassed, false);
  assert.equal(state.canRetry, true);
  assert.equal(state.isFinalAutoResult, false);
});

test('quiz attempt state marks final result and allows correct answers only for single-attempt final result', () => {
  const state = resolveHomeworkQuizAttemptState(
    buildAutoQuizBlocks({
      autoCheckEnabled: true,
      attemptsLimit: 1,
      showCorrectAnswers: true,
      passingScorePercent: 70,
    }),
    [
      buildSubmission({
        score: {
          autoScore: 100,
          finalScore: 100,
        },
      }),
    ],
  );

  assert.equal(state.latestAttemptPassed, true);
  assert.equal(state.canRetry, false);
  assert.equal(state.isFinalAutoResult, true);
  assert.equal(state.shouldShowCorrectAnswers, true);
});

import {
  HomeworkBlock,
  HomeworkBlockStudentResponse,
  HomeworkBlockTest,
  HomeworkSubmission,
  HomeworkTestQuestion,
} from '../../../types';
import { readHomeworkTemplateQuizSettingsFromBlocks } from './quizSettings';

export const isHomeworkQuestionAutoGradable = (question: HomeworkTestQuestion) => {
  if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE' || question.type === 'MATCHING') {
    return true;
  }
  if (question.type !== 'SHORT_ANSWER') return false;
  return question.uiQuestionKind === 'FILL_WORD' || question.uiQuestionKind === 'ORDERING' || question.uiQuestionKind === 'TABLE';
};

const collectTestQuestions = (blocks: HomeworkBlock[]) =>
  blocks
    .filter((block): block is HomeworkBlockTest => block.type === 'TEST')
    .flatMap((block) => block.questions ?? []);

const hasManualResponseChannels = (blocks: HomeworkBlock[]) =>
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

const getResolvedSubmissionScore = (submission: HomeworkSubmission | null | undefined) => {
  if (!submission) return null;
  const raw = submission.score.finalScore ?? submission.score.manualScore ?? submission.score.autoScore ?? null;
  if (!Number.isFinite(raw)) return null;
  return Number(raw);
};

const getLatestResolvedSubmission = (submissions: HomeworkSubmission[]) =>
  submissions
    .filter((submission) => submission.status !== 'DRAFT')
    .sort((left, right) => {
      if (right.attemptNo !== left.attemptNo) return right.attemptNo - left.attemptNo;
      return right.id - left.id;
    })[0] ?? null;

export type HomeworkQuizCapabilities = {
  hasTestQuestions: boolean;
  hasManualResponse: boolean;
  hasOnlyAutoGradableQuestions: boolean;
  fullyAutoCheckable: boolean;
  autoCheckActive: boolean;
  attemptsSupported: boolean;
  correctAnswersSupported: boolean;
};

export const resolveHomeworkQuizCapabilities = (blocks: HomeworkBlock[]): HomeworkQuizCapabilities => {
  const settings = readHomeworkTemplateQuizSettingsFromBlocks(blocks);
  const testQuestions = collectTestQuestions(blocks);
  const hasTestQuestions = testQuestions.length > 0;
  const hasManualResponse = hasManualResponseChannels(blocks);
  const hasOnlyAutoGradableQuestions = hasTestQuestions && testQuestions.every(isHomeworkQuestionAutoGradable);
  const fullyAutoCheckable = hasTestQuestions && !hasManualResponse && hasOnlyAutoGradableQuestions;

  return {
    hasTestQuestions,
    hasManualResponse,
    hasOnlyAutoGradableQuestions,
    fullyAutoCheckable,
    autoCheckActive: fullyAutoCheckable && settings.autoCheckEnabled,
    attemptsSupported: fullyAutoCheckable,
    correctAnswersSupported: fullyAutoCheckable,
  };
};

export type HomeworkQuizAttemptState = {
  latestResolvedSubmission: HomeworkSubmission | null;
  latestResolvedScore: number | null;
  latestAttemptPassed: boolean;
  attemptsUsed: number;
  attemptsRemaining: number | null;
  canRetry: boolean;
  isFinalAutoResult: boolean;
  shouldShowCorrectAnswers: boolean;
};

export const resolveHomeworkQuizAttemptState = (
  blocks: HomeworkBlock[],
  submissions: HomeworkSubmission[],
): HomeworkQuizAttemptState => {
  const settings = readHomeworkTemplateQuizSettingsFromBlocks(blocks);
  const capabilities = resolveHomeworkQuizCapabilities(blocks);
  const latestResolvedSubmission = getLatestResolvedSubmission(submissions);
  const latestResolvedScore = getResolvedSubmissionScore(latestResolvedSubmission);
  const latestAttemptPassed =
    capabilities.autoCheckActive &&
    latestResolvedScore !== null &&
    latestResolvedScore >= settings.passingScorePercent;
  const attemptsUsed = submissions.filter((submission) => submission.status !== 'DRAFT').length;
  const attemptsRemaining =
    settings.attemptsLimit === null ? null : Math.max(settings.attemptsLimit - attemptsUsed, 0);
  const canRetry =
    capabilities.autoCheckActive &&
    latestResolvedSubmission !== null &&
    !latestAttemptPassed &&
    (settings.attemptsLimit === null || attemptsUsed < settings.attemptsLimit);
  const isFinalAutoResult =
    capabilities.autoCheckActive &&
    latestResolvedSubmission !== null &&
    (latestAttemptPassed || !canRetry);

  return {
    latestResolvedSubmission,
    latestResolvedScore,
    latestAttemptPassed,
    attemptsUsed,
    attemptsRemaining,
    canRetry,
    isFinalAutoResult,
    shouldShowCorrectAnswers:
      isFinalAutoResult && capabilities.correctAnswersSupported && settings.showCorrectAnswers && settings.attemptsLimit === 1,
  };
};

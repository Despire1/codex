import {
  HomeworkAssignment,
  HomeworkSubmission,
  HomeworkTestQuestion,
  HomeworkTestQuestionKind,
} from '../../../../entities/types';
import { resolveAssignmentResponseConfig } from '../../../../entities/homework-assignment/model/lib/assignmentResponse';

export type HomeworkReviewItemKind = 'QUESTION' | 'TEXT_RESPONSE' | 'ATTACHMENTS_RESPONSE' | 'VOICE_RESPONSE';

export type HomeworkReviewEvaluationStatus = 'correct' | 'partial' | 'incorrect' | 'manual';

export interface HomeworkReviewItem {
  id: string;
  questionId: string | null;
  blockId: string | null;
  order: number;
  kind: HomeworkReviewItemKind;
  question: HomeworkTestQuestion | null;
  prompt: string;
  typeLabel: string;
  hint: string;
  maxPoints: number;
  initialPoints: number;
  studentAnswerSummary: string;
  correctAnswerSummary: string | null;
  answered: boolean;
  isAutoGradable: boolean;
  evaluationStatus: HomeworkReviewEvaluationStatus;
}

type QuestionEvaluation = {
  ratio: number | null;
  isAutoGradable: boolean;
  status: HomeworkReviewEvaluationStatus;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const roundToHalf = (value: number) => Math.round(value * 2) / 2;

const normalizeAnswerString = (value: unknown, caseSensitive = false) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return caseSensitive ? trimmed : trimmed.toLowerCase();
};

const resolveQuestionKind = (question: HomeworkTestQuestion): HomeworkTestQuestionKind => {
  if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') return 'CHOICE';
  if (question.type === 'MATCHING') return 'MATCHING';
  return question.uiQuestionKind ?? 'SHORT_TEXT';
};

const resolveQuestionTypeLabel = (question: HomeworkTestQuestion) => {
  const kind = resolveQuestionKind(question);
  if (kind === 'CHOICE') return question.type === 'MULTIPLE_CHOICE' ? 'Несколько вариантов' : 'Один вариант';
  if (kind === 'SHORT_TEXT') return 'Короткий ответ';
  if (kind === 'LONG_TEXT') return 'Эссе';
  if (kind === 'AUDIO') return 'Аудио ответ';
  if (kind === 'FILE') return 'Файл';
  if (kind === 'FILL_WORD') return 'Вставить слово';
  if (kind === 'MATCHING') return 'Сопоставление';
  if (kind === 'ORDERING') return 'Упорядочивание';
  return 'Таблица';
};

const resolveQuestionHint = (question: HomeworkTestQuestion) => {
  const kind = resolveQuestionKind(question);
  if (kind === 'CHOICE') {
    return question.type === 'MULTIPLE_CHOICE'
      ? 'Можно выбрать несколько правильных ответов'
      : 'Выберите один правильный ответ';
  }
  if (kind === 'SHORT_TEXT') return 'Введите короткий ответ';
  if (kind === 'LONG_TEXT') return 'Напишите развернутый ответ';
  if (kind === 'AUDIO') return 'Проверьте голосовой ответ';
  if (kind === 'FILE') return 'Проверьте загруженные файлы';
  if (kind === 'FILL_WORD') return 'Заполните пропуски в тексте';
  if (kind === 'MATCHING') return 'Соотнесите элементы в обеих колонках';
  if (kind === 'ORDERING') return 'Расставьте элементы в правильном порядке';
  return 'Заполните таблицу';
};

const resolveQuestionPoints = (question: HomeworkTestQuestion) => {
  if (typeof question.points === 'number' && Number.isFinite(question.points) && question.points > 0) {
    return roundToHalf(question.points);
  }
  return 2;
};

const resolveChoiceOptionText = (question: HomeworkTestQuestion, optionId: string) =>
  (question.options ?? []).find((option) => option.id === optionId)?.text ?? optionId;

const resolveAnswerSummary = (
  question: HomeworkTestQuestion,
  answer: unknown,
  submission: HomeworkSubmission,
): string => {
  const kind = resolveQuestionKind(question);

  if (kind === 'CHOICE' && question.type === 'SINGLE_CHOICE') {
    const selected =
      typeof answer === 'string'
        ? answer
        : Array.isArray(answer) && typeof answer[0] === 'string'
          ? answer[0]
          : '';
    if (!selected) return 'Ответ не выбран';
    return resolveChoiceOptionText(question, selected);
  }

  if (kind === 'CHOICE' && question.type === 'MULTIPLE_CHOICE') {
    const selected = Array.isArray(answer) ? answer.filter((item): item is string => typeof item === 'string') : [];
    if (selected.length === 0) return 'Ответы не выбраны';
    return selected.map((item) => resolveChoiceOptionText(question, item)).join(', ');
  }

  if (kind === 'SHORT_TEXT' || kind === 'LONG_TEXT') {
    return typeof answer === 'string' && answer.trim() ? answer.trim() : 'Ответ отсутствует';
  }

  if (kind === 'FILL_WORD') {
    const values = Array.isArray(answer) ? answer.filter((item): item is string => typeof item === 'string') : [];
    if (values.length === 0) return 'Пропуски не заполнены';
    return values.map((value, index) => `${index + 1}) ${value || '—'}`).join(' | ');
  }

  if (kind === 'MATCHING') {
    if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return 'Пары не выбраны';
    const map = answer as Record<string, unknown>;
    const rows = (question.matchingPairs ?? []).map((pair) => {
      const selected = typeof map[pair.left] === 'string' ? String(map[pair.left]) : '—';
      return `${pair.left} -> ${selected}`;
    });
    return rows.length > 0 ? rows.join(' | ') : 'Пары не выбраны';
  }

  if (kind === 'ORDERING') {
    const selected = Array.isArray(answer) ? answer.filter((item): item is string => typeof item === 'string') : [];
    if (selected.length === 0) return 'Порядок не задан';
    const byId = new Map((question.orderingItems ?? []).map((item) => [item.id, item.text] as const));
    return selected.map((id, index) => `${index + 1}) ${byId.get(id) ?? id}`).join(' | ');
  }

  if (kind === 'TABLE') {
    if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return 'Таблица не заполнена';
    const map = answer as Record<string, unknown>;
    const rows = (question.table?.rows ?? []).map((row) => {
      const rowValuesRaw = map[row.id];
      const rowValues = Array.isArray(rowValuesRaw)
        ? rowValuesRaw.filter((item): item is string => typeof item === 'string')
        : [];
      return `${row.lead}: ${rowValues.join(', ') || '—'}`;
    });
    return rows.length > 0 ? rows.join(' | ') : 'Таблица не заполнена';
  }

  if (kind === 'FILE') {
    return submission.attachments.length > 0
      ? `Файлов загружено: ${submission.attachments.length}`
      : 'Файлы не загружены';
  }

  if (kind === 'AUDIO') {
    return submission.voice.length > 0
      ? `Голосовых ответов: ${submission.voice.length}`
      : 'Голосовой ответ отсутствует';
  }

  return 'Ответ отсутствует';
};

const resolveCorrectSummary = (question: HomeworkTestQuestion): string | null => {
  const kind = resolveQuestionKind(question);

  if (kind === 'CHOICE') {
    const correct = (question.correctOptionIds ?? [])
      .map((id) => resolveChoiceOptionText(question, id))
      .filter((value) => value.trim().length > 0);
    return correct.length > 0 ? correct.join(', ') : null;
  }

  if (kind === 'SHORT_TEXT' || kind === 'LONG_TEXT' || kind === 'FILL_WORD') {
    const accepted = (question.acceptedAnswers ?? []).map((item) => item.trim()).filter(Boolean);
    return accepted.length > 0 ? accepted.join(' / ') : null;
  }

  if (kind === 'MATCHING') {
    const pairs = (question.matchingPairs ?? []).map((pair) => `${pair.left} -> ${pair.right}`);
    return pairs.length > 0 ? pairs.join(' | ') : null;
  }

  if (kind === 'ORDERING') {
    const values = (question.orderingItems ?? []).map((item) => item.text.trim()).filter(Boolean);
    return values.length > 0 ? values.join(' -> ') : null;
  }

  if (kind === 'TABLE') {
    const rows = (question.table?.rows ?? [])
      .map((row) => `${row.lead}: ${(row.answers ?? []).map((item) => item.trim()).filter(Boolean).join(', ')}`)
      .filter(Boolean);
    return rows.length > 0 ? rows.join(' | ') : null;
  }

  return null;
};

const isQuestionAnswered = (question: HomeworkTestQuestion, answer: unknown, submission: HomeworkSubmission) => {
  const kind = resolveQuestionKind(question);

  if (kind === 'CHOICE' && question.type === 'SINGLE_CHOICE') {
    if (typeof answer === 'string') return answer.trim().length > 0;
    return Array.isArray(answer) && typeof answer[0] === 'string' && answer[0].trim().length > 0;
  }

  if (kind === 'CHOICE' && question.type === 'MULTIPLE_CHOICE') {
    return Array.isArray(answer) && answer.some((item) => typeof item === 'string' && item.trim().length > 0);
  }

  if (kind === 'SHORT_TEXT' || kind === 'LONG_TEXT') {
    return typeof answer === 'string' && answer.trim().length > 0;
  }

  if (kind === 'AUDIO') {
    return submission.voice.length > 0;
  }

  if (kind === 'FILE') {
    return submission.attachments.length > 0;
  }

  if (kind === 'FILL_WORD') {
    return Array.isArray(answer) && answer.some((item) => typeof item === 'string' && item.trim().length > 0);
  }

  if (kind === 'ORDERING') {
    return Array.isArray(answer) && answer.some((item) => typeof item === 'string' && item.trim().length > 0);
  }

  if (kind === 'TABLE') {
    if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return false;
    return Object.values(answer as Record<string, unknown>).some((row) => {
      if (!Array.isArray(row)) return false;
      return row.some((cell) => typeof cell === 'string' && cell.trim().length > 0);
    });
  }

  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return false;
  return Object.values(answer as Record<string, unknown>).some(
    (value) => typeof value === 'string' && value.trim().length > 0,
  );
};

const resolveEvaluationStatus = (ratio: number): HomeworkReviewEvaluationStatus => {
  if (ratio >= 0.999) return 'correct';
  if (ratio <= 0.001) return 'incorrect';
  return 'partial';
};

const evaluateQuestion = (question: HomeworkTestQuestion, answer: unknown): QuestionEvaluation => {
  const kind = resolveQuestionKind(question);

  if (question.type === 'SINGLE_CHOICE') {
    const correctIds = Array.isArray(question.correctOptionIds)
      ? question.correctOptionIds.filter((item): item is string => typeof item === 'string')
      : [];
    if (correctIds.length !== 1) {
      return { ratio: null, isAutoGradable: false, status: 'manual' };
    }
    const selected = typeof answer === 'string' ? answer : Array.isArray(answer) ? answer[0] : null;
    const ratio = typeof selected === 'string' && selected === correctIds[0] ? 1 : 0;
    return { ratio, isAutoGradable: true, status: resolveEvaluationStatus(ratio) };
  }

  if (question.type === 'MULTIPLE_CHOICE') {
    const correctIds = Array.isArray(question.correctOptionIds)
      ? question.correctOptionIds.filter((item): item is string => typeof item === 'string')
      : [];
    if (correctIds.length === 0) {
      return { ratio: null, isAutoGradable: false, status: 'manual' };
    }
    const selectedIds = Array.isArray(answer)
      ? answer.filter((item): item is string => typeof item === 'string')
      : [];
    const correctSet = new Set(correctIds);
    const selectedSet = new Set(selectedIds);
    let correctSelected = 0;
    let incorrectSelected = 0;
    selectedSet.forEach((selectedId) => {
      if (correctSet.has(selectedId)) correctSelected += 1;
      else incorrectSelected += 1;
    });
    const ratio = Math.max(0, (correctSelected - incorrectSelected) / correctSet.size);
    return { ratio, isAutoGradable: true, status: resolveEvaluationStatus(ratio) };
  }

  if (question.type === 'MATCHING') {
    const pairs = Array.isArray(question.matchingPairs)
      ? question.matchingPairs.filter((pair) => pair.left.trim() && pair.right.trim())
      : [];
    if (pairs.length === 0) {
      return { ratio: null, isAutoGradable: false, status: 'manual' };
    }
    const answerMap = answer && typeof answer === 'object' && !Array.isArray(answer)
      ? (answer as Record<string, unknown>)
      : {};
    const correctPairs = pairs.reduce((sum, pair) => {
      return typeof answerMap[pair.left] === 'string' && String(answerMap[pair.left]) === pair.right ? sum + 1 : sum;
    }, 0);
    const ratio = correctPairs / pairs.length;
    return { ratio, isAutoGradable: true, status: resolveEvaluationStatus(ratio) };
  }

  if (question.type === 'SHORT_ANSWER' && kind === 'FILL_WORD') {
    const expectedAnswers = Array.isArray(question.acceptedAnswers)
      ? question.acceptedAnswers.filter((item): item is string => typeof item === 'string').map((item) => item.trim())
      : [];
    if (expectedAnswers.length === 0) {
      return { ratio: null, isAutoGradable: false, status: 'manual' };
    }
    const submittedAnswers = Array.isArray(answer)
      ? answer.filter((item): item is string => typeof item === 'string')
      : [];
    const caseSensitive = Boolean(question.caseSensitive);
    const correctCount = expectedAnswers.reduce((sum, expected, index) => {
      if (!expected) return sum;
      const submitted = submittedAnswers[index];
      return normalizeAnswerString(submitted, caseSensitive) === normalizeAnswerString(expected, caseSensitive)
        ? sum + 1
        : sum;
    }, 0);
    const allowPartialCredit = question.allowPartialCredit !== false;
    const ratio = allowPartialCredit
      ? correctCount / expectedAnswers.length
      : correctCount === expectedAnswers.length
        ? 1
        : 0;
    return { ratio, isAutoGradable: true, status: resolveEvaluationStatus(ratio) };
  }

  if (question.type === 'SHORT_ANSWER' && kind === 'ORDERING') {
    const expectedOrderIds = Array.isArray(question.orderingItems)
      ? question.orderingItems
          .filter((item) => typeof item?.id === 'string' && item.id.trim().length > 0)
          .map((item) => item.id)
      : [];
    if (expectedOrderIds.length < 2) {
      return { ratio: null, isAutoGradable: false, status: 'manual' };
    }
    const submittedOrderIds = Array.isArray(answer)
      ? answer.filter((item): item is string => typeof item === 'string')
      : [];
    const correctPositions = expectedOrderIds.reduce((sum, expectedId, index) => {
      return submittedOrderIds[index] === expectedId ? sum + 1 : sum;
    }, 0);
    const allowPartialCredit = Boolean(question.allowPartialCredit);
    const ratio = allowPartialCredit
      ? correctPositions / expectedOrderIds.length
      : correctPositions === expectedOrderIds.length
        ? 1
        : 0;
    return { ratio, isAutoGradable: true, status: resolveEvaluationStatus(ratio) };
  }

  if (question.type === 'SHORT_ANSWER' && kind === 'TABLE') {
    const rows = question.table?.rows ?? [];
    if (rows.length === 0) {
      return { ratio: null, isAutoGradable: false, status: 'manual' };
    }
    const answerMap = answer && typeof answer === 'object' && !Array.isArray(answer)
      ? (answer as Record<string, unknown>)
      : {};
    const caseSensitive = Boolean(question.caseSensitive);
    let totalCells = 0;
    let correctCells = 0;

    rows.forEach((row) => {
      const submitted = answerMap[row.id];
      const submittedAnswers = Array.isArray(submitted)
        ? submitted.filter((item): item is string => typeof item === 'string')
        : [];
      (row.answers ?? []).forEach((expected, index) => {
        const normalizedExpected = normalizeAnswerString(expected, caseSensitive);
        if (!normalizedExpected) return;
        totalCells += 1;
        const normalizedSubmitted = normalizeAnswerString(submittedAnswers[index], caseSensitive);
        if (normalizedExpected === normalizedSubmitted) {
          correctCells += 1;
        }
      });
    });

    if (totalCells === 0) {
      return { ratio: null, isAutoGradable: false, status: 'manual' };
    }

    const allowPartialCredit =
      question.allowPartialCredit === undefined
        ? question.table?.partialCredit !== false
        : Boolean(question.allowPartialCredit);

    const ratio = allowPartialCredit ? correctCells / totalCells : correctCells === totalCells ? 1 : 0;
    return { ratio, isAutoGradable: true, status: resolveEvaluationStatus(ratio) };
  }

  if (question.type === 'SHORT_ANSWER' && (kind === 'SHORT_TEXT' || kind === 'LONG_TEXT')) {
    const accepted = (question.acceptedAnswers ?? []).map((item) => item.trim()).filter(Boolean);
    if (accepted.length === 0) {
      return { ratio: null, isAutoGradable: false, status: 'manual' };
    }
    const caseSensitive = Boolean(question.caseSensitive);
    const normalizedAnswer = normalizeAnswerString(answer, caseSensitive);
    const isCorrect = accepted.some(
      (value) => normalizeAnswerString(value, caseSensitive) === normalizedAnswer,
    );
    const ratio = isCorrect ? 1 : 0;
    return { ratio, isAutoGradable: true, status: resolveEvaluationStatus(ratio) };
  }

  return { ratio: null, isAutoGradable: false, status: 'manual' };
};

const resolveInitialPoints = ({
  maxPoints,
  evaluation,
  answered,
}: {
  maxPoints: number;
  evaluation: QuestionEvaluation;
  answered: boolean;
}) => {
  if (evaluation.ratio !== null) {
    return clamp(roundToHalf(maxPoints * evaluation.ratio), 0, maxPoints);
  }
  if (answered) {
    return maxPoints;
  }
  return 0;
};

export const normalizeReviewPoints = (value: number, maxPoints: number) =>
  clamp(roundToHalf(value), 0, Math.max(0.5, roundToHalf(maxPoints)));

export const buildHomeworkReviewItems = (
  assignment: HomeworkAssignment,
  submission: HomeworkSubmission,
): HomeworkReviewItem[] => {
  const testAnswers = submission.testAnswers && typeof submission.testAnswers === 'object' && !Array.isArray(submission.testAnswers)
    ? (submission.testAnswers as Record<string, unknown>)
    : {};
  const result: HomeworkReviewItem[] = [];

  let order = 0;
  assignment.contentSnapshot.forEach((block) => {
    if (block.type !== 'TEST') return;
    (block.questions ?? []).forEach((question) => {
      order += 1;
      const answer = testAnswers[question.id];
      const maxPoints = resolveQuestionPoints(question);
      const evaluation = evaluateQuestion(question, answer);
      const answered = isQuestionAnswered(question, answer, submission);
      result.push({
        id: `${block.id}_${question.id}`,
        questionId: question.id,
        blockId: block.id,
        order,
        kind: 'QUESTION',
        question,
        prompt: question.prompt?.trim() || `Вопрос ${order}`,
        typeLabel: resolveQuestionTypeLabel(question),
        hint: resolveQuestionHint(question),
        maxPoints,
        initialPoints: resolveInitialPoints({ maxPoints, evaluation, answered }),
        studentAnswerSummary: resolveAnswerSummary(question, answer, submission),
        correctAnswerSummary: resolveCorrectSummary(question),
        answered,
        isAutoGradable: evaluation.isAutoGradable,
        evaluationStatus: evaluation.status,
      });
    });
  });

  const responseConfig = resolveAssignmentResponseConfig(assignment);
  const allQuestionKinds = new Set(
    result
      .filter((item): item is HomeworkReviewItem & { question: HomeworkTestQuestion } => item.kind === 'QUESTION' && Boolean(item.question))
      .map((item) => resolveQuestionKind(item.question!)),
  );
  const hasTestItems = result.length > 0;
  const responsePoints = hasTestItems
    ? { text: 2, attachments: 1, voice: 1 }
    : { text: 4, attachments: 3, voice: 3 };

  if (responseConfig.allowText || submission.answerText?.trim()) {
    order += 1;
    const answered = Boolean(submission.answerText?.trim());
    result.push({
      id: 'response_text',
      questionId: null,
      blockId: null,
      order,
      kind: 'TEXT_RESPONSE',
      question: null,
      prompt: 'Текстовый ответ ученика',
      typeLabel: 'Свободный ответ',
      hint: 'Проверьте связность, грамматику и полноту',
      maxPoints: responsePoints.text,
      initialPoints: answered ? responsePoints.text : 0,
      studentAnswerSummary: submission.answerText?.trim() || 'Текстовый ответ не добавлен',
      correctAnswerSummary: null,
      answered,
      isAutoGradable: false,
      evaluationStatus: 'manual',
    });
  }

  if ((responseConfig.allowFiles || responseConfig.allowPhotos || responseConfig.allowDocuments || responseConfig.allowAudio || responseConfig.allowVideo || submission.attachments.length > 0) && !allQuestionKinds.has('FILE')) {
    order += 1;
    const answered = submission.attachments.length > 0;
    result.push({
      id: 'response_attachments',
      questionId: null,
      blockId: null,
      order,
      kind: 'ATTACHMENTS_RESPONSE',
      question: null,
      prompt: 'Файлы в ответе ученика',
      typeLabel: 'Вложения',
      hint: 'Проверьте соответствие и качество материалов',
      maxPoints: responsePoints.attachments,
      initialPoints: answered ? responsePoints.attachments : 0,
      studentAnswerSummary: answered
        ? `Загружено файлов: ${submission.attachments.length}`
        : 'Файлы не загружены',
      correctAnswerSummary: null,
      answered,
      isAutoGradable: false,
      evaluationStatus: 'manual',
    });
  }

  if ((responseConfig.allowVoice || submission.voice.length > 0) && !allQuestionKinds.has('AUDIO')) {
    order += 1;
    const answered = submission.voice.length > 0;
    result.push({
      id: 'response_voice',
      questionId: null,
      blockId: null,
      order,
      kind: 'VOICE_RESPONSE',
      question: null,
      prompt: 'Голосовой ответ ученика',
      typeLabel: 'Голос',
      hint: 'Оцените произношение и полноту ответа',
      maxPoints: responsePoints.voice,
      initialPoints: answered ? responsePoints.voice : 0,
      studentAnswerSummary: answered
        ? `Голосовых сообщений: ${submission.voice.length}`
        : 'Голосовой ответ не добавлен',
      correctAnswerSummary: null,
      answered,
      isAutoGradable: false,
      evaluationStatus: 'manual',
    });
  }

  return result;
};

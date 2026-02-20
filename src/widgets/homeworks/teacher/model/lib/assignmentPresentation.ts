import { readHomeworkTemplateQuizSettingsFromBlocks } from '../../../../../entities/homework-template/model/lib/quizSettings';
import { HomeworkAssignment, HomeworkBlockStudentResponse, HomeworkBlockTest, HomeworkTestQuestion } from '../../../../../entities/types';
import { ASSIGNMENT_STATUS_LABELS } from '../../../../../entities/homework-assignment/model/lib/assignmentBuckets';

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const isSameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const startOfDay = (date: Date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const endOfDay = (date: Date) => {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
};

const formatDuration = (deltaMs: number) => {
  const absMs = Math.abs(deltaMs);
  const totalHours = Math.floor(absMs / (60 * 60 * 1000));
  const totalMinutes = Math.floor((absMs % (60 * 60 * 1000)) / (60 * 1000));
  if (totalHours > 0) return `${totalHours} ч ${totalMinutes} мин`;
  return `${totalMinutes} мин`;
};

export type AutoCheckBadgeTone = 'success' | 'warning' | 'danger';

export type AutoCheckBadge = {
  label: 'проверено' | 'частично' | 'не проверено';
  tone: AutoCheckBadgeTone;
};

const isAutoGradableQuestion = (question: HomeworkTestQuestion) => {
  if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE' || question.type === 'MATCHING') {
    return true;
  }
  if (question.type !== 'SHORT_ANSWER') return false;
  return question.uiQuestionKind === 'FILL_WORD' || question.uiQuestionKind === 'ORDERING' || question.uiQuestionKind === 'TABLE';
};

const hasManualResponseChannels = (block: HomeworkBlockStudentResponse) =>
  Boolean(
    block.allowText ||
      block.allowFiles ||
      block.allowPhotos ||
      block.allowDocuments ||
      block.allowAudio ||
      block.allowVideo ||
      block.allowVoice,
  );

const collectTestQuestions = (assignment: HomeworkAssignment) =>
  assignment.contentSnapshot
    .filter((block): block is HomeworkBlockTest => block.type === 'TEST')
    .flatMap((block) => block.questions ?? []);

const isSubmittedOrReviewed = (assignment: HomeworkAssignment) =>
  assignment.latestSubmissionStatus === 'SUBMITTED' || assignment.latestSubmissionStatus === 'REVIEWED';

export const isAssignmentAutoCheckEnabled = (assignment: HomeworkAssignment) => {
  const hasTestQuestions = collectTestQuestions(assignment).length > 0;
  if (!hasTestQuestions) return false;
  return readHomeworkTemplateQuizSettingsFromBlocks(assignment.contentSnapshot).autoCheckEnabled;
};

export const resolveAssignmentAutoCheckBadge = (assignment: HomeworkAssignment): AutoCheckBadge | null => {
  if (!isSubmittedOrReviewed(assignment)) return null;
  if (!isAssignmentAutoCheckEnabled(assignment)) return null;

  const testQuestions = collectTestQuestions(assignment);
  const autoQuestions = testQuestions.filter(isAutoGradableQuestion);
  const hasAutoScore = Number.isFinite(assignment.score?.autoScore);
  if (!hasAutoScore || autoQuestions.length === 0) {
    return { label: 'не проверено', tone: 'danger' };
  }

  const hasManualTestQuestions = testQuestions.some((question) => !isAutoGradableQuestion(question));
  const hasManualResponse = assignment.contentSnapshot
    .filter((block): block is HomeworkBlockStudentResponse => block.type === 'STUDENT_RESPONSE')
    .some(hasManualResponseChannels);
  if (hasManualTestQuestions || hasManualResponse) {
    return { label: 'частично', tone: 'warning' };
  }

  return { label: 'проверено', tone: 'success' };
};

export const formatAssignmentStatus = (assignment: HomeworkAssignment) => ASSIGNMENT_STATUS_LABELS[assignment.status];

export const resolveAssignmentDeadlineMeta = (assignment: HomeworkAssignment, now = new Date()) => {
  if (!assignment.deadlineAt) {
    return {
      primary: 'Без дедлайна',
      secondary: assignment.status === 'SCHEDULED' ? 'Будет отправлено позже' : 'Срок не ограничен',
      tone: 'muted' as const,
    };
  }

  const deadline = new Date(assignment.deadlineAt);
  if (Number.isNaN(deadline.getTime())) {
    return { primary: 'Без дедлайна', secondary: 'Некорректная дата', tone: 'muted' as const };
  }

  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const tomorrow = new Date(todayStart);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const isOverdue = Boolean(assignment.isOverdue);
  if (isOverdue) {
    return {
      primary: dateFormatter.format(deadline),
      secondary: `Просрочено на ${formatDuration(now.getTime() - deadline.getTime())}`,
      tone: 'danger' as const,
    };
  }

  if (deadline >= todayStart && deadline <= todayEnd) {
    return {
      primary: `Сегодня, ${deadline.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`,
      secondary: 'Срок сегодня',
      tone: 'today' as const,
    };
  }

  if (isSameDay(deadline, tomorrow)) {
    return {
      primary: `Завтра, ${deadline.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`,
      secondary: 'Срок завтра',
      tone: 'normal' as const,
    };
  }

  return {
    primary: dateFormatter.format(deadline),
    secondary: 'В сроке',
    tone: 'normal' as const,
  };
};

export const resolveAssignmentResponseMeta = (assignment: HomeworkAssignment) => {
  if (!assignment.latestSubmissionStatus) return 'Нет ответа';
  if (assignment.latestSubmissionStatus === 'DRAFT') return 'Черновик';
  if (assignment.latestSubmissionStatus === 'SUBMITTED') return 'Сдано';
  return 'Проверено';
};

export const resolveAssignmentProblemBadges = (assignment: HomeworkAssignment) => {
  const flags = assignment.problemFlags ?? [];
  return {
    hasOverdue: flags.includes('OVERDUE'),
    hasReturned: flags.includes('RETURNED'),
    hasConfigError: flags.includes('CONFIG_ERROR'),
  };
};

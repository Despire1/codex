import { HomeworkAssignment } from '../../../../../entities/types';
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
  if (assignment.latestSubmissionStatus === 'DRAFT') {
    return assignment.latestSubmissionAttemptNo ? `Черновик #${assignment.latestSubmissionAttemptNo}` : 'Черновик';
  }
  if (assignment.latestSubmissionStatus === 'SUBMITTED') {
    return assignment.latestSubmissionAttemptNo ? `Сдано, попытка #${assignment.latestSubmissionAttemptNo}` : 'Сдано';
  }
  return assignment.latestSubmissionAttemptNo
    ? `Проверено, попытка #${assignment.latestSubmissionAttemptNo}`
    : 'Проверено';
};

export const resolveAssignmentProblemBadges = (assignment: HomeworkAssignment) => {
  const flags = assignment.problemFlags ?? [];
  return {
    hasOverdue: flags.includes('OVERDUE'),
    hasReturned: flags.includes('RETURNED'),
    hasConfigError: flags.includes('CONFIG_ERROR'),
  };
};

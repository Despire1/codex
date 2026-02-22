import { HomeworkAssignment } from '../../../../../entities/types';
import { StudentHomeworkSummary } from '../../../types';
import { pluralizeRu } from '../../../../../shared/lib/pluralizeRu';
import {
  calculateStudentHomeworkCompletedThisWeek,
  calculateStudentHomeworkCurrentStreak,
  resolveStudentHomeworkCardKind,
  resolveStudentHomeworkProgress,
  resolveStudentHomeworkResponseTraits,
  resolveStudentHomeworkScoreValue,
  resolveStudentHomeworkSubjectLabel,
} from './presentation';

export type StudentHomeworkSort = 'deadline' | 'subject' | 'status';

export type StudentHomeworkReferenceTypeTone = 'red' | 'blue' | 'green' | 'purple' | 'indigo' | 'slate';

export type StudentHomeworkReferenceStatusTone = 'overdue' | 'new' | 'in_progress' | 'pending' | 'completed';

export type StudentHomeworkReferenceDeadlineTone = 'danger' | 'warning' | 'normal' | 'success' | 'muted';

export type StudentHomeworkReferenceProgressTone = 'danger' | 'primary' | 'amber' | 'green';

export type StudentHomeworkReferenceActionTone = 'danger' | 'primary' | 'ghost';

export type StudentHomeworkReferenceDashboardStats = {
  activeCount: number;
  overdueCount: number;
  reviewedCount: number;
  newCount: number;
  inProgressCount: number;
  completedThisWeek: number;
  averageScore: number | null;
  streakDays: number;
  performancePercent: number;
  awardsCount: number;
  groupRankLabel: string;
  levelLabel: string;
  xp: number;
};

export type StudentHomeworkReferenceTypeMeta = {
  label: string;
  tone: StudentHomeworkReferenceTypeTone;
};

export type StudentHomeworkReferenceStatusMeta = {
  label: string;
  tone: StudentHomeworkReferenceStatusTone;
};

export type StudentHomeworkReferenceDeadlineMeta = {
  primary: string;
  secondary: string;
  tone: StudentHomeworkReferenceDeadlineTone;
};

export type StudentHomeworkReferenceProgressMeta = {
  percent: number;
  label: string;
  tone: StudentHomeworkReferenceProgressTone;
};

export type StudentHomeworkReferenceActionMeta = {
  label: string;
  tone: StudentHomeworkReferenceActionTone;
};

const MONTH_LABELS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

const DAY_MS = 24 * 60 * 60 * 1000;

const toValidDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const toDateMs = (value?: string | null, fallback = 0) => {
  const date = toValidDate(value);
  if (!date) return fallback;
  return date.getTime();
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const formatTime = (date: Date) =>
  date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });

const formatShortDate = (date: Date) => `${date.getDate()} ${MONTH_LABELS[date.getMonth()] ?? ''}`.trim();

const formatShortDateTime = (date: Date) => `${formatShortDate(date)}, ${formatTime(date)}`;

const startOfDay = (date: Date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const isSameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const formatRelativeDeadlinePrimary = (date: Date, now: Date) => {
  const today = startOfDay(now);
  const yesterday = new Date(today.getTime() - DAY_MS);
  const tomorrow = new Date(today.getTime() + DAY_MS);

  if (isSameDay(date, today)) return `Сегодня, ${formatTime(date)}`;
  if (isSameDay(date, yesterday)) return `Вчера, ${formatTime(date)}`;
  if (isSameDay(date, tomorrow)) return `Завтра, ${formatTime(date)}`;
  return formatShortDateTime(date);
};

const formatCompactDuration = (durationMs: number) => {
  const absolute = Math.max(0, Math.floor(Math.abs(durationMs)));
  const totalMinutes = Math.max(1, Math.floor(absolute / 60_000));
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);

  if (totalDays > 0) {
    return pluralizeRu(totalDays, {
      one: 'день',
      few: 'дня',
      many: 'дней',
    });
  }

  if (totalHours > 0) {
    return pluralizeRu(totalHours, {
      one: 'час',
      few: 'часа',
      many: 'часов',
    });
  }

  return pluralizeRu(totalMinutes, {
    one: 'минута',
    few: 'минуты',
    many: 'минут',
  });
};

const resolveEffectiveDeadlineDate = (assignment: HomeworkAssignment) =>
  toValidDate(assignment.deadlineAt) ??
  toValidDate(assignment.sentAt) ??
  toValidDate(assignment.createdAt) ??
  null;

const resolveAverageScore = (assignments: HomeworkAssignment[]) => {
  const values = assignments
    .map((assignment) => resolveStudentHomeworkScoreValue(assignment))
    .filter((score): score is number => typeof score === 'number');

  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
};

const resolveLevelLabel = (performancePercent: number) => {
  if (performancePercent >= 95) return 'A2+';
  if (performancePercent >= 85) return 'A2';
  if (performancePercent >= 70) return 'A1+';
  return 'A1';
};

export const resolveStudentHomeworkReferenceTypeMeta = (
  assignment: HomeworkAssignment,
  now = new Date(),
): StudentHomeworkReferenceTypeMeta => {
  const subject = resolveStudentHomeworkSubjectLabel(assignment);
  const kind = resolveStudentHomeworkCardKind(assignment, now);

  if (subject === 'Грамматика') {
    return {
      label: subject,
      tone: kind === 'completed' ? 'indigo' : 'red',
    };
  }

  if (subject === 'Лексика') {
    return { label: subject, tone: 'blue' };
  }

  if (subject === 'Чтение') {
    return { label: subject, tone: 'green' };
  }

  if (subject === 'Speaking') {
    return { label: subject, tone: 'purple' };
  }

  if (subject === 'Writing') {
    return { label: subject, tone: 'indigo' };
  }

  return { label: subject, tone: 'slate' };
};

export const resolveStudentHomeworkReferenceStatusMeta = (
  assignment: HomeworkAssignment,
  now = new Date(),
): StudentHomeworkReferenceStatusMeta => {
  const kind = resolveStudentHomeworkCardKind(assignment, now);

  if (kind === 'overdue') return { label: 'Просрочено', tone: 'overdue' };
  if (kind === 'new') return { label: 'Новое', tone: 'new' };
  if (kind === 'in_progress') return { label: 'В работе', tone: 'in_progress' };
  if (kind === 'submitted') return { label: 'Проверка', tone: 'pending' };
  return { label: 'Проверено', tone: 'completed' };
};

export const resolveStudentHomeworkReferenceDeadlineMeta = (
  assignment: HomeworkAssignment,
  now = new Date(),
): StudentHomeworkReferenceDeadlineMeta => {
  const kind = resolveStudentHomeworkCardKind(assignment, now);
  const deadline = resolveEffectiveDeadlineDate(assignment);

  if (kind === 'submitted') {
    const submittedAt = toValidDate(assignment.latestSubmissionSubmittedAt);
    if (deadline && submittedAt) {
      return {
        primary: 'Сдано',
        secondary: submittedAt.getTime() <= deadline.getTime() ? 'Вовремя' : 'С опозданием',
        tone: submittedAt.getTime() <= deadline.getTime() ? 'success' : 'warning',
      };
    }

    return {
      primary: 'Сдано',
      secondary: 'Ожидает проверку',
      tone: 'warning',
    };
  }

  if (kind === 'completed') {
    const reviewedAt = toValidDate(assignment.reviewedAt);
    return {
      primary: deadline ? formatShortDate(deadline) : 'Проверено',
      secondary: reviewedAt ? `Пров. ${formatShortDate(reviewedAt)}` : 'Проверено',
      tone: 'normal',
    };
  }

  if (!deadline) {
    return {
      primary: 'Без дедлайна',
      secondary: 'Срок не указан',
      tone: 'muted',
    };
  }

  const primary = formatRelativeDeadlinePrimary(deadline, now);

  if (kind === 'overdue') {
    return {
      primary,
      secondary: `+${formatCompactDuration(now.getTime() - deadline.getTime())}`,
      tone: 'danger',
    };
  }

  const diffMs = deadline.getTime() - now.getTime();
  return {
    primary,
    secondary: formatCompactDuration(diffMs),
    tone: diffMs <= DAY_MS ? 'warning' : 'normal',
  };
};

export const resolveStudentHomeworkReferenceProgressMeta = (
  assignment: HomeworkAssignment,
  now = new Date(),
): StudentHomeworkReferenceProgressMeta => {
  const kind = resolveStudentHomeworkCardKind(assignment, now);
  const scoreValue = resolveStudentHomeworkScoreValue(assignment);
  const progress = resolveStudentHomeworkProgress(assignment);
  const traits = resolveStudentHomeworkResponseTraits(assignment);

  if (kind === 'completed') {
    const percent = scoreValue === null ? 100 : Math.round(scoreValue * 10);
    return {
      percent: clamp(percent, 0, 100),
      label: `${clamp(percent, 0, 100)}%`,
      tone: 'green',
    };
  }

  if (kind === 'submitted') {
    return {
      percent: 100,
      label: '100%',
      tone: 'amber',
    };
  }

  if (kind === 'in_progress') {
    if (progress && progress.total >= 10) {
      return {
        percent: clamp(progress.percent, 0, 100),
        label: `${progress.completed}/${progress.total}`,
        tone: 'primary',
      };
    }

    const percent = progress ? clamp(progress.percent, 0, 100) : 45;
    return {
      percent,
      label: `${percent}%`,
      tone: 'primary',
    };
  }

  if (kind === 'new') {
    if (traits.hasTest && traits.totalQuestions >= 10) {
      return {
        percent: 0,
        label: `0/${traits.totalQuestions}`,
        tone: 'primary',
      };
    }

    return {
      percent: 0,
      label: '0%',
      tone: 'primary',
    };
  }

  return {
    percent: 0,
    label: '0%',
    tone: 'danger',
  };
};

export const resolveStudentHomeworkReferenceActionMeta = (
  assignment: HomeworkAssignment,
  now = new Date(),
): StudentHomeworkReferenceActionMeta => {
  const kind = resolveStudentHomeworkCardKind(assignment, now);

  if (kind === 'overdue') {
    return { label: 'Срочно', tone: 'danger' };
  }

  if (kind === 'new') {
    return { label: 'Начать', tone: 'primary' };
  }

  if (kind === 'in_progress') {
    return { label: 'Продолжить', tone: 'primary' };
  }

  if (kind === 'submitted') {
    return { label: 'Просмотр', tone: 'ghost' };
  }

  return { label: 'Детали', tone: 'ghost' };
};

export const resolveStudentHomeworkReferenceRecentResult = (assignment: HomeworkAssignment) => {
  const score = resolveStudentHomeworkScoreValue(assignment);
  if (score === null) return 'Завершено';
  if (score >= 9) return 'Отлично!';
  if (score >= 8) return 'Хорошо';
  return 'Принято';
};

export const resolveStudentHomeworkReferenceSortDate = (assignment: HomeworkAssignment) =>
  toDateMs(assignment.deadlineAt, Number.POSITIVE_INFINITY);

export const resolveStudentHomeworkReferenceCompletedAt = (assignment: HomeworkAssignment) =>
  toDateMs(assignment.reviewedAt, toDateMs(assignment.updatedAt, 0));

export const buildStudentHomeworkReferenceDashboardStats = (
  assignments: HomeworkAssignment[],
  summary: StudentHomeworkSummary,
): StudentHomeworkReferenceDashboardStats => {
  const now = new Date();
  let newCount = 0;
  let inProgressCount = 0;

  assignments.forEach((assignment) => {
    const kind = resolveStudentHomeworkCardKind(assignment, now);
    if (kind === 'new') newCount += 1;
    if (kind === 'in_progress') inProgressCount += 1;
  });

  const completedThisWeek = calculateStudentHomeworkCompletedThisWeek(assignments, now);
  const streakDays = calculateStudentHomeworkCurrentStreak(assignments, now);
  const averageScore = resolveAverageScore(assignments);

  const overdueBasedPerformance = clamp(100 - summary.overdueCount * 5, 0, 100);
  const scoreBasedPerformance = averageScore === null ? 0 : clamp(Math.round(averageScore * 10), 0, 100);
  const performancePercent =
    scoreBasedPerformance > 0 ? Math.max(scoreBasedPerformance, overdueBasedPerformance) : overdueBasedPerformance;

  const awardsCount = [performancePercent >= 90, completedThisWeek >= 3, streakDays >= 7].filter(Boolean).length;

  const rank = clamp(10 - Math.floor((performancePercent + summary.reviewedCount) / 20), 1, 15);

  const xp = Math.max(
    0,
    Math.round(
      summary.reviewedCount * 4 + completedThisWeek * 10 + streakDays * 2 + (averageScore ?? 0) + (summary.reviewedCount > 0 ? 1 : 0),
    ),
  );

  return {
    activeCount: summary.activeCount,
    overdueCount: summary.overdueCount,
    reviewedCount: summary.reviewedCount,
    newCount,
    inProgressCount,
    completedThisWeek,
    averageScore,
    streakDays,
    performancePercent,
    awardsCount,
    groupRankLabel: `TOP ${rank}`,
    levelLabel: resolveLevelLabel(performancePercent),
    xp,
  };
};

export const formatStudentHomeworkReferenceCompactDate = (assignment: HomeworkAssignment) => {
  const candidate =
    toValidDate(assignment.reviewedAt) ??
    toValidDate(assignment.latestSubmissionSubmittedAt) ??
    toValidDate(assignment.deadlineAt) ??
    toValidDate(assignment.createdAt);

  if (!candidate) return 'Без даты';
  return formatShortDate(candidate);
};

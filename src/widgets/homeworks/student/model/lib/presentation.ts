import { HomeworkAssignment, HomeworkBlock } from '../../../../../entities/types';
import { pluralizeRu } from '../../../../../shared/lib/pluralizeRu';

export type StudentHomeworkCardKind = 'overdue' | 'new' | 'in_progress' | 'submitted' | 'completed';

export type StudentHomeworkDeadlineTone = 'danger' | 'warning' | 'normal' | 'success' | 'muted';

export type StudentHomeworkInfoTone = 'amber' | 'blue' | 'green';

export type StudentHomeworkInfoNote = {
  title: string;
  text: string;
  tone: StudentHomeworkInfoTone;
};

export type StudentHomeworkProgress = {
  completed: number;
  total: number;
  percent: number;
};

export type StudentHomeworkResponseTraits = {
  hasTest: boolean;
  hasVoice: boolean;
  hasText: boolean;
  hasAttachment: boolean;
  mediaAttachments: number;
  totalQuestions: number;
};

const MONTH_LABELS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

const DAY_MS = 24 * 60 * 60 * 1000;

const toValidDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim();

const trimText = (value: string, max = 160) => {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
};

const startOfDay = (date: Date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const isSameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const formatTime = (date: Date) =>
  date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });

const formatShortDate = (date: Date) => `${date.getDate()} ${MONTH_LABELS[date.getMonth()] ?? ''}`.trim();

const formatShortDateTime = (date: Date) => `${formatShortDate(date)}, ${formatTime(date)}`;

const formatDuration = (deltaMs: number, mode: 'past' | 'future') => {
  const absolute = Math.max(0, Math.floor(Math.abs(deltaMs)));
  const totalMinutes = Math.floor(absolute / 60_000);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);

  if (totalDays > 0) {
    const label = pluralizeRu(totalDays, {
      one: 'день',
      few: 'дня',
      many: 'дней',
    });
    return mode === 'past' ? `Прошло ${label}` : `Осталось ${label}`;
  }

  if (totalHours > 0) {
    const label = pluralizeRu(totalHours, {
      one: 'час',
      few: 'часа',
      many: 'часов',
    });
    return mode === 'past' ? `Прошло ${label}` : `Осталось ${label}`;
  }

  const minutes = Math.max(1, totalMinutes);
  const label = pluralizeRu(minutes, {
    one: 'минута',
    few: 'минуты',
    many: 'минут',
  });
  return mode === 'past' ? `Прошло ${label}` : `Осталось ${label}`;
};

const formatRelativeDateTime = (date: Date, now: Date) => {
  const today = startOfDay(now);
  const yesterday = new Date(today.getTime() - DAY_MS);
  const tomorrow = new Date(today.getTime() + DAY_MS);

  if (isSameDay(date, today)) return `Сегодня, ${formatTime(date)}`;
  if (isSameDay(date, yesterday)) return `Вчера, ${formatTime(date)}`;
  if (isSameDay(date, tomorrow)) return `Завтра, ${formatTime(date)}`;
  return formatShortDateTime(date);
};

const resolveEffectiveStatus = (assignment: HomeworkAssignment, now: Date) => {
  if (assignment.status === 'OVERDUE' || assignment.isOverdue) return 'OVERDUE';
  if ((assignment.status === 'SENT' || assignment.status === 'RETURNED') && assignment.deadlineAt) {
    const deadline = toValidDate(assignment.deadlineAt);
    if (deadline && deadline.getTime() < now.getTime()) return 'OVERDUE';
  }
  return assignment.status;
};

const collectTextBlocks = (blocks: HomeworkBlock[]) =>
  blocks
    .filter((block): block is Extract<HomeworkBlock, { type: 'TEXT' }> => block.type === 'TEXT')
    .map((block) => normalizeText(block.content))
    .filter(Boolean);

export const resolveStudentHomeworkCardKind = (
  assignment: HomeworkAssignment,
  now = new Date(),
): StudentHomeworkCardKind => {
  const effectiveStatus = resolveEffectiveStatus(assignment, now);
  if (effectiveStatus === 'REVIEWED') return 'completed';
  if (effectiveStatus === 'SUBMITTED') return 'submitted';
  if (effectiveStatus === 'OVERDUE') return 'overdue';
  if (assignment.latestSubmissionStatus === 'DRAFT' || effectiveStatus === 'RETURNED') return 'in_progress';
  return 'new';
};

export const resolveStudentHomeworkStatusLabel = (kind: StudentHomeworkCardKind) => {
  if (kind === 'overdue') return 'Просрочено';
  if (kind === 'new') return 'Новое';
  if (kind === 'in_progress') return 'В работе';
  if (kind === 'submitted') return 'На проверке';
  return 'Проверено';
};

export const resolveStudentHomeworkSubjectLabel = (assignment: HomeworkAssignment) => {
  const preview = collectTextBlocks(assignment.contentSnapshot).join(' ');
  const source = `${assignment.title} ${assignment.templateTitle ?? ''} ${preview}`.toLowerCase();

  if (/(grammar|граммат|present|past|tense|verb|врем[ея])/.test(source)) return 'Грамматика';
  if (/(vocabulary|lexic|лексик|word|travel|tourism)/.test(source)) return 'Лексика';
  if (/(reading|чтени|article|text)/.test(source)) return 'Чтение';
  if (/(speaking|говор|voice|audio|microphone)/.test(source)) return 'Speaking';
  if (/(essay|writing|email|письм)/.test(source)) return 'Writing';
  return 'Домашка';
};

export const resolveStudentHomeworkDescription = (assignment: HomeworkAssignment) => {
  const text = collectTextBlocks(assignment.contentSnapshot)[0];
  if (text) return trimText(text, 170);
  if (assignment.templateTitle) return `Задание по шаблону «${assignment.templateTitle}»`;
  return 'Откройте домашнее задание, чтобы посмотреть полные требования.';
};

export const resolveStudentHomeworkDeadlineMeta = (
  assignment: HomeworkAssignment,
  now = new Date(),
): { primary: string; secondary: string; tone: StudentHomeworkDeadlineTone } => {
  const deadline = toValidDate(assignment.deadlineAt);
  const kind = resolveStudentHomeworkCardKind(assignment, now);

  if (!deadline) {
    return {
      primary: 'Без дедлайна',
      secondary: kind === 'completed' ? 'Домашка проверена' : 'Срок не ограничен',
      tone: 'muted',
    };
  }

  const primary = formatRelativeDateTime(deadline, now);
  if (kind === 'overdue') {
    return {
      primary,
      secondary: formatDuration(now.getTime() - deadline.getTime(), 'past'),
      tone: 'danger',
    };
  }

  if (kind === 'submitted') {
    const submittedAt = toValidDate(assignment.latestSubmissionSubmittedAt);
    if (submittedAt) {
      return {
        primary,
        secondary: submittedAt.getTime() <= deadline.getTime() ? 'Сдано вовремя' : 'Сдано после срока',
        tone: submittedAt.getTime() <= deadline.getTime() ? 'success' : 'warning',
      };
    }
    return {
      primary,
      secondary: 'Ожидает проверку',
      tone: 'warning',
    };
  }

  if (kind === 'completed') {
    const reviewedAt = toValidDate(assignment.reviewedAt);
    return {
      primary,
      secondary: reviewedAt ? `Проверено ${formatShortDate(reviewedAt)}` : 'Домашка проверена',
      tone: 'normal',
    };
  }

  return {
    primary,
    secondary: formatDuration(deadline.getTime() - now.getTime(), 'future'),
    tone: now.getTime() + DAY_MS > deadline.getTime() ? 'warning' : 'normal',
  };
};

export const resolveStudentHomeworkScoreValue = (assignment: HomeworkAssignment) => {
  const raw = assignment.score?.finalScore ?? assignment.score?.manualScore ?? assignment.score?.autoScore;
  if (!Number.isFinite(raw)) return null;
  const normalized = Number(raw);
  return Math.max(0, Math.min(10, normalized));
};

export const formatStudentHomeworkScore = (score: number) =>
  Number.isInteger(score) ? `${score}/10` : `${score.toFixed(1)}/10`;

export const resolveStudentHomeworkResponseTraits = (
  assignment: HomeworkAssignment,
): StudentHomeworkResponseTraits => {
  const traits: StudentHomeworkResponseTraits = {
    hasTest: false,
    hasVoice: false,
    hasText: false,
    hasAttachment: false,
    mediaAttachments: 0,
    totalQuestions: 0,
  };

  assignment.contentSnapshot.forEach((block) => {
    if (block.type === 'TEST') {
      traits.hasTest = true;
      traits.totalQuestions += block.questions.length;
    }
    if (block.type === 'MEDIA') {
      traits.mediaAttachments += block.attachments.length;
    }
    if (block.type === 'STUDENT_RESPONSE') {
      traits.hasText = block.allowText || traits.hasText;
      traits.hasVoice = block.allowVoice || block.allowAudio || traits.hasVoice;
      traits.hasAttachment =
        block.allowFiles ||
        block.allowPhotos ||
        block.allowDocuments ||
        block.allowVideo ||
        block.allowAudio ||
        block.allowVoice ||
        traits.hasAttachment;
    }
  });

  return traits;
};

export const resolveStudentHomeworkDurationMinutes = (assignment: HomeworkAssignment) => {
  let minutes = 0;

  assignment.contentSnapshot.forEach((block) => {
    if (block.type === 'TEXT') {
      const words = normalizeText(block.content).split(' ').filter(Boolean).length;
      minutes += Math.max(4, Math.ceil(words / 16));
    }
    if (block.type === 'TEST') {
      minutes += Math.max(8, block.questions.length * 2);
    }
    if (block.type === 'MEDIA') {
      minutes += Math.max(3, block.attachments.length * 2);
    }
    if (block.type === 'STUDENT_RESPONSE') {
      minutes += 6;
    }
  });

  if (minutes <= 0) return 20;
  return Math.max(5, Math.min(120, minutes));
};

export const resolveStudentHomeworkDurationLabel = (assignment: HomeworkAssignment) =>
  `~${resolveStudentHomeworkDurationMinutes(assignment)} мин`;

export const resolveStudentHomeworkResponseLabel = (assignment: HomeworkAssignment) => {
  const traits = resolveStudentHomeworkResponseTraits(assignment);
  if (traits.hasTest) return 'Тест';
  if (traits.hasVoice) return 'Голосовое';
  if (traits.hasText) return 'Текст';
  if (traits.mediaAttachments > 0) return 'Статья + вопросы';
  return 'Практика';
};

export const resolveStudentHomeworkAttachmentLabel = (assignment: HomeworkAssignment) => {
  const traits = resolveStudentHomeworkResponseTraits(assignment);
  if (traits.hasAttachment) return 'Прикрепить файл';
  if (traits.mediaAttachments <= 0) return null;
  return pluralizeRu(traits.mediaAttachments, {
    one: 'файл',
    few: 'файла',
    many: 'файлов',
  });
};

export const resolveStudentHomeworkHasAutoCheck = (assignment: HomeworkAssignment) =>
  resolveStudentHomeworkResponseTraits(assignment).hasTest;

export const resolveStudentHomeworkProgress = (assignment: HomeworkAssignment): StudentHomeworkProgress | null => {
  const traits = resolveStudentHomeworkResponseTraits(assignment);
  if (!traits.hasTest || traits.totalQuestions <= 0) return null;

  const kind = resolveStudentHomeworkCardKind(assignment);
  let completed = 0;
  if (kind === 'submitted' || kind === 'completed') {
    completed = traits.totalQuestions;
  } else if (kind === 'in_progress') {
    completed = Math.max(1, Math.floor(traits.totalQuestions * 0.45));
  }

  const percent = Math.round((completed / traits.totalQuestions) * 100);
  return {
    completed,
    total: traits.totalQuestions,
    percent,
  };
};

export const resolveStudentHomeworkActionLabel = (assignment: HomeworkAssignment) => {
  const kind = resolveStudentHomeworkCardKind(assignment);
  if (kind === 'overdue') return 'Выполнить срочно';
  if (kind === 'new') return 'Начать';
  if (kind === 'in_progress') return 'Продолжить';
  if (kind === 'submitted') return 'Просмотреть ответ';
  return 'Посмотреть детали';
};

export const resolveStudentHomeworkInfoNote = (assignment: HomeworkAssignment): StudentHomeworkInfoNote | null => {
  const kind = resolveStudentHomeworkCardKind(assignment);

  if (kind === 'submitted') {
    const submittedAt = toValidDate(assignment.latestSubmissionSubmittedAt);
    return {
      title: 'Отправлено на проверку',
      text: submittedAt
        ? `Сдано ${formatRelativeDateTime(submittedAt, new Date())}. Обычно проверка занимает 1-2 дня.`
        : 'Работа отправлена преподавателю и ждёт проверки.',
      tone: 'amber',
    };
  }

  if (kind === 'completed' && assignment.teacherComment?.trim()) {
    return {
      title: 'Комментарий преподавателя',
      text: trimText(normalizeText(assignment.teacherComment), 150),
      tone: 'green',
    };
  }

  if (kind === 'new') {
    const description = resolveStudentHomeworkDescription(assignment);
    if (!description) return null;
    return {
      title: 'Совет от преподавателя',
      text: trimText(description, 120),
      tone: 'blue',
    };
  }

  if (kind === 'in_progress' && assignment.latestSubmissionStatus === 'DRAFT') {
    return {
      title: 'Черновик сохранён',
      text: 'Откройте домашку, чтобы завершить и отправить решение на проверку.',
      tone: 'blue',
    };
  }

  return null;
};

export const resolveStudentHomeworkDisplayDate = (assignment: HomeworkAssignment) => {
  const candidate =
    toValidDate(assignment.reviewedAt) ??
    toValidDate(assignment.latestSubmissionSubmittedAt) ??
    toValidDate(assignment.deadlineAt) ??
    toValidDate(assignment.createdAt);
  if (!candidate) return 'Без даты';
  return formatShortDate(candidate);
};

export const resolveStudentHomeworkSearchVector = (assignment: HomeworkAssignment) =>
  `${assignment.title} ${assignment.templateTitle ?? ''} ${resolveStudentHomeworkDescription(assignment)} ${resolveStudentHomeworkSubjectLabel(assignment)}`.toLowerCase();

export const matchesStudentHomeworkFilter = (
  assignment: HomeworkAssignment,
  filter: 'all' | 'new' | 'in_progress' | 'submitted' | 'reviewed',
) => {
  if (filter === 'all') return true;
  const kind = resolveStudentHomeworkCardKind(assignment);
  if (filter === 'new') return kind === 'new' || kind === 'overdue';
  if (filter === 'in_progress') return kind === 'in_progress';
  if (filter === 'submitted') return kind === 'submitted';
  return kind === 'completed';
};

export const resolveStudentHomeworkStatusSortOrder = (assignment: HomeworkAssignment) => {
  const kind = resolveStudentHomeworkCardKind(assignment);
  if (kind === 'overdue') return 0;
  if (kind === 'new') return 1;
  if (kind === 'in_progress') return 2;
  if (kind === 'submitted') return 3;
  return 4;
};

export const calculateStudentHomeworkCompletedThisWeek = (assignments: HomeworkAssignment[], now = new Date()) => {
  const day = now.getDay();
  const mondayShift = (day + 6) % 7;
  const weekStart = startOfDay(new Date(now.getTime() - mondayShift * DAY_MS));
  return assignments.filter((assignment) => {
    const kind = resolveStudentHomeworkCardKind(assignment, now);
    if (kind !== 'completed') return false;
    const reviewedAt = toValidDate(assignment.reviewedAt) ?? toValidDate(assignment.updatedAt);
    return reviewedAt ? reviewedAt.getTime() >= weekStart.getTime() : false;
  }).length;
};

export const calculateStudentHomeworkCurrentStreak = (assignments: HomeworkAssignment[], now = new Date()) => {
  const activeDays = new Set<string>();
  assignments.forEach((assignment) => {
    const date =
      toValidDate(assignment.latestSubmissionSubmittedAt) ??
      toValidDate(assignment.reviewedAt) ??
      toValidDate(assignment.updatedAt);
    if (!date) return;
    activeDays.add(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`);
  });

  if (activeDays.size === 0) return 0;

  let cursor = startOfDay(now);
  const todayKey = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
  if (!activeDays.has(todayKey)) {
    cursor = new Date(cursor.getTime() - DAY_MS);
  }

  let streak = 0;
  while (streak < 365) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
    if (!activeDays.has(key)) break;
    streak += 1;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }

  return streak;
};

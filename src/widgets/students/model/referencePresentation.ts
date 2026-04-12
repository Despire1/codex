import { addDays, addMonths, format, isSameDay, startOfMonth } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Homework, HomeworkAssignment, Lesson, PaymentEvent, StudentListItem } from '../../../entities/types';
import { formatInTimeZone, toZonedDate } from '../../../shared/lib/timezoneDates';
import {
  DEFAULT_STUDENT_UI_COLOR,
  STUDENT_UI_COLOR_PALETTE,
  isStudentUiColor,
  normalizeStudentUiColor,
} from '../../../shared/lib/studentUiColors';

export type StudentLifecycleStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED';
export type NextLessonTone = 'today' | 'future' | 'none';
export type StudentCardAlertTone = 'danger' | 'warning' | 'inactive' | 'muted' | 'success';
export type StudentCardAlertKind = 'debt' | 'overdue' | 'inactive' | 'paused' | 'completed' | 'balance';

export type StudentCardPresentation = {
  lessonsTotal: number;
  lessonsConducted: number;
  attendanceRate: number;
  averageScore: number;
  completedHomeworks: number;
  totalHomeworks: number;
  progressPercent: number;
  levelLabel: string;
  status: StudentLifecycleStatus;
  nextLessonLabel: string;
  nextLessonShortLabel: string;
  nextLessonAt: string | null;
  nextLessonTone: NextLessonTone;
  uiColor: string;
};

export type StudentCardAlert = {
  kind: StudentCardAlertKind;
  label: string;
  tone: StudentCardAlertTone;
};

export type StudentCompactCardPresentation = {
  levelLabel: string;
  nextLessonShortLabel: string;
  nextLessonTone: NextLessonTone;
  lessonsLabel: string;
  homeworkLabel: string;
  uiColor: string;
  alerts: StudentCardAlert[];
};

export type StudentCompactTableStatusTone = 'active' | 'paused' | 'completed' | 'inactive';
export type StudentCompactTableAttendanceTone = 'success' | 'warning' | 'danger' | 'neutral';

export type StudentCompactTablePresentation = {
  levelLabel: string;
  lessonsCount: number;
  attendanceLabel: string;
  attendanceTone: StudentCompactTableAttendanceTone;
  averageScoreLabel: string;
  averageScoreValue: number | null;
  nextLessonLabel: string;
  nextLessonTone: NextLessonTone;
  statusLabel: string;
  statusTone: StudentCompactTableStatusTone;
  uiColor: string;
};

export type StudentProfileStats = {
  lessonsConducted: number;
  attendanceRate: number;
  averageScore: number;
  completedHomeworks: number;
  totalHomeworks: number;
  courseProgress: number;
  missedLessons: number;
  totalPlatformHours: number;
  nextPaymentDateLabel: string;
};

export const getStudentDisplayName = (item: StudentListItem) => item.link.customName || item.student.username || 'Ученик';

export const getStudentInitials = (item: StudentListItem) => {
  const name = getStudentDisplayName(item).trim();
  if (!name) return 'У';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]?.slice(0, 1).toUpperCase() ?? 'У';
  return `${parts[0]?.slice(0, 1) ?? ''}${parts[1]?.slice(0, 1) ?? ''}`.toUpperCase();
};

export const formatLessonCountLabel = (count: number) => {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} занятий`;
  if (last === 1) return `${count} занятие`;
  if (last >= 2 && last <= 4) return `${count} занятия`;
  return `${count} занятий`;
};

const resolveLevelLabel = (item: StudentListItem) => {
  const customLevel = item.link.studentLevel?.trim();
  if (customLevel) {
    return customLevel;
  }
  return '';
};

const resolveStatus = (item: StudentListItem): StudentLifecycleStatus => {
  const status = item.stats.lifecycleStatus;
  if (status === 'ACTIVE' || status === 'PAUSED' || status === 'COMPLETED') return status;
  if (item.stats.nextLessonAt) return 'ACTIVE';
  if (item.stats.totalLessons && item.stats.totalLessons > 0) return 'PAUSED';
  return 'ACTIVE';
};

const resolveAttendanceRate = (item: StudentListItem) => {
  const attendanceRate = item.stats.attendanceRate;
  if (typeof attendanceRate !== 'number') return 0;
  return Math.max(0, Math.min(100, attendanceRate));
};

const resolveAverageScore = (item: StudentListItem) => {
  const score = typeof item.stats.averageScore === 'number' ? item.stats.averageScore : 0;
  return Math.max(0, Math.min(10, Number(score.toFixed(1))));
};

const resolveNextLessonPresentation = (nextLessonAt: string | null | undefined, timeZone: string) => {
  if (!nextLessonAt) {
    return {
      label: 'Следующее занятие: Нет занятий',
      shortLabel: 'Без занятий',
      tone: 'none' as NextLessonTone,
    };
  }
  const lessonDate = toZonedDate(nextLessonAt, timeZone);
  const now = toZonedDate(new Date(), timeZone);
  const timeLabel = format(lessonDate, 'HH:mm', { locale: ru });

  if (isSameDay(lessonDate, now)) {
    return {
      label: `Следующее занятие: Сегодня ${timeLabel}`,
      shortLabel: `Сегодня ${timeLabel}`,
      tone: 'today' as NextLessonTone,
    };
  }

  if (isSameDay(lessonDate, addDays(now, 1))) {
    return {
      label: `Следующее занятие: Завтра ${timeLabel}`,
      shortLabel: `Завтра ${timeLabel}`,
      tone: 'future' as NextLessonTone,
    };
  }

  const shortDateLabel = format(lessonDate, 'd MMM', { locale: ru }).replace('.', '');

  return {
    label: `Следующее занятие: ${format(lessonDate, 'd MMM HH:mm', { locale: ru })}`,
    shortLabel: `${shortDateLabel}, ${timeLabel}`,
    tone: 'future' as NextLessonTone,
  };
};

export const resolveStudentUiColor = (item: StudentListItem) => {
  if (isStudentUiColor(item.link.uiColor)) {
    return normalizeStudentUiColor(item.link.uiColor);
  }
  const fallbackSeed = Number.isFinite(item.student.id) ? item.student.id : item.link.id;
  const fallbackIndex = Math.abs(fallbackSeed) % STUDENT_UI_COLOR_PALETTE.length;
  return STUDENT_UI_COLOR_PALETTE[fallbackIndex] ?? DEFAULT_STUDENT_UI_COLOR;
};

export const buildStudentCardPresentation = (item: StudentListItem, timeZone: string): StudentCardPresentation => {
  const lessonsTotal = item.stats.totalLessons ?? 0;
  const lessonsConducted = item.stats.completedLessons ?? 0;
  const completedHomeworks = item.stats.doneHomeworkCount ?? 0;
  const totalHomeworks = item.stats.totalHomeworkCount ?? 0;
  const nextLesson = resolveNextLessonPresentation(item.stats.nextLessonAt, timeZone);
  const homeworkCompletionRate = item.stats.homeworkCompletionRate ?? 0;

  const progressPercent = Math.max(0, Math.min(100, homeworkCompletionRate));
  const status = resolveStatus(item);

  return {
    lessonsTotal,
    lessonsConducted,
    attendanceRate: resolveAttendanceRate(item),
    averageScore: resolveAverageScore(item),
    completedHomeworks,
    totalHomeworks,
    progressPercent,
    levelLabel: resolveLevelLabel(item),
    status,
    nextLessonLabel: nextLesson.label,
    nextLessonShortLabel: nextLesson.shortLabel,
    nextLessonAt: item.stats.nextLessonAt ?? null,
    nextLessonTone: nextLesson.tone,
    uiColor: resolveStudentUiColor(item),
  };
};

const resolveDebtAlertLabel = (item: StudentListItem) => {
  const debtRub = item.debtRub ?? null;
  const debtLessonCount = item.debtLessonCount ?? 0;
  const hasDebt = (typeof debtRub === 'number' && debtRub > 0) || debtLessonCount > 0;
  if (!hasDebt) return null;
  if (typeof debtRub === 'number' && debtRub > 0) {
    return `Долг ${debtRub.toLocaleString('ru-RU')} ₽`;
  }
  return `Долг ${formatLessonCountLabel(debtLessonCount)}`;
};

export const buildCompactStudentCardPresentation = (
  item: StudentListItem,
  timeZone: string,
): StudentCompactCardPresentation => {
  const presentation = buildStudentCardPresentation(item, timeZone);
  const alerts: StudentCardAlert[] = [];
  const debtAlertLabel = resolveDebtAlertLabel(item);
  const overdueHomeworkCount = item.stats.overdueHomeworkCount ?? 0;

  if (debtAlertLabel) {
    alerts.push({ kind: 'debt', label: debtAlertLabel, tone: 'danger' });
  }

  if (overdueHomeworkCount > 0) {
    alerts.push({
      kind: 'overdue',
      label: overdueHomeworkCount > 1 ? `Просрочено ДЗ ${overdueHomeworkCount}` : 'Просрочено ДЗ',
      tone: 'warning',
    });
  }

  if (item.student.isActivated === false) {
    alerts.push({ kind: 'inactive', label: 'Не активирован', tone: 'inactive' });
  }

  if (presentation.status === 'PAUSED') {
    alerts.push({ kind: 'paused', label: 'Пауза', tone: 'muted' });
  } else if (presentation.status === 'COMPLETED') {
    alerts.push({ kind: 'completed', label: 'Завершил', tone: 'muted' });
  }

  if (alerts.length === 0 && item.link.balanceLessons > 0) {
    alerts.push({
      kind: 'balance',
      label: `Баланс +${item.link.balanceLessons}`,
      tone: 'success',
    });
  }

  return {
    levelLabel: presentation.levelLabel,
    nextLessonShortLabel: presentation.nextLessonShortLabel,
    nextLessonTone: presentation.nextLessonTone,
    lessonsLabel: formatLessonCountLabel(presentation.lessonsConducted),
    homeworkLabel:
      presentation.totalHomeworks > 0
        ? `ДЗ ${presentation.completedHomeworks}/${presentation.totalHomeworks}`
        : 'Без ДЗ',
    uiColor: presentation.uiColor,
    alerts,
  };
};

const resolveCompactAttendanceTone = (attendanceRate: number | null | undefined): StudentCompactTableAttendanceTone => {
  if (typeof attendanceRate !== 'number' || Number.isNaN(attendanceRate)) return 'neutral';
  if (attendanceRate >= 85) return 'success';
  if (attendanceRate >= 70) return 'warning';
  return 'danger';
};

export const buildCompactStudentTablePresentation = (
  item: StudentListItem,
  timeZone: string,
): StudentCompactTablePresentation => {
  const presentation = buildStudentCardPresentation(item, timeZone);
  const lessonsCount = presentation.lessonsConducted > 0 ? presentation.lessonsConducted : presentation.lessonsTotal;
  const attendanceValue = typeof item.stats.attendanceRate === 'number' ? resolveAttendanceRate(item) : null;
  const averageScoreValue =
    typeof item.stats.averageScore === 'number' && item.stats.averageScore > 0 ? resolveAverageScore(item) : null;
  const nextLessonLabel =
    item.student.isActivated === false
      ? presentation.nextLessonShortLabel
      : presentation.status === 'PAUSED' && !presentation.nextLessonAt
        ? 'Пауза'
        : presentation.status === 'COMPLETED' && !presentation.nextLessonAt
          ? 'Завершил'
          : presentation.nextLessonShortLabel;

  if (item.student.isActivated === false) {
    return {
      levelLabel: presentation.levelLabel,
      lessonsCount,
      attendanceLabel: attendanceValue === null ? '—' : `${attendanceValue}%`,
      attendanceTone: resolveCompactAttendanceTone(attendanceValue),
      averageScoreLabel: averageScoreValue === null ? '—' : averageScoreValue.toFixed(1),
      averageScoreValue,
      nextLessonLabel,
      nextLessonTone: presentation.nextLessonTone,
      statusLabel: 'Не активирован',
      statusTone: 'inactive',
      uiColor: presentation.uiColor,
    };
  }

  const statusMeta = getStatusUiMeta(presentation.status);

  return {
    levelLabel: presentation.levelLabel,
    lessonsCount,
    attendanceLabel: attendanceValue === null ? '—' : `${attendanceValue}%`,
    attendanceTone: resolveCompactAttendanceTone(attendanceValue),
    averageScoreLabel: averageScoreValue === null ? '—' : averageScoreValue.toFixed(1),
    averageScoreValue,
    nextLessonLabel,
    nextLessonTone: presentation.nextLessonTone,
    statusLabel: statusMeta.label,
    statusTone: statusMeta.tone,
    uiColor: presentation.uiColor,
  };
};

export const getStatusUiMeta = (status: StudentLifecycleStatus) => {
  if (status === 'ACTIVE') {
    return { label: 'Активен', tone: 'active' as const };
  }
  if (status === 'PAUSED') {
    return { label: 'Пауза', tone: 'paused' as const };
  }
  return { label: 'Завершили', tone: 'completed' as const };
};

export const buildProfileStats = (
  studentEntry: StudentListItem,
  lessonsSummary: Lesson[],
  _homeworks: Array<Homework | HomeworkAssignment>,
  debtLessons: { startAt: string }[],
): StudentProfileStats => {
  const lessonsConducted = studentEntry.stats.completedLessons ?? 0;
  const totalLessons = studentEntry.stats.totalLessons ?? 0;
  const attendanceRate = typeof studentEntry.stats.attendanceRate === 'number' ? studentEntry.stats.attendanceRate : 0;
  const completedHomeworks = studentEntry.stats.doneHomeworkCount ?? 0;
  const totalHomeworks = studentEntry.stats.totalHomeworkCount ?? 0;
  const averageScore = Number((studentEntry.stats.averageScore ?? 0).toFixed(1));
  const courseProgress = studentEntry.stats.homeworkCompletionRate ?? 0;
  const missedLessons = Math.max(0, totalLessons - lessonsConducted);
  const totalPlatformHours = Math.round(
    ((studentEntry.stats.totalLessonMinutes ??
      lessonsSummary.reduce((sum, lesson) => sum + Math.max(0, lesson.durationMinutes || 0), 0)) /
      60),
  );
  const nextDebtLesson = debtLessons[0]?.startAt;
  const nextPaymentDateLabel = nextDebtLesson
    ? formatInTimeZone(nextDebtLesson, 'd MMM', { locale: ru, timeZone: studentEntry.student.timezone || 'UTC' })
    : '—';

  return {
    lessonsConducted,
    attendanceRate,
    averageScore,
    completedHomeworks,
    totalHomeworks,
    courseProgress,
    missedLessons,
    totalPlatformHours,
    nextPaymentDateLabel,
  };
};

export const buildProgressSeries = (lessons: Lesson[], timeZone: string) => {
  const now = toZonedDate(new Date(), timeZone);
  const startMonth = startOfMonth(addMonths(now, -5));
  const series = Array.from({ length: 6 }).map((_, index) => {
    const monthDate = addMonths(startMonth, index);
    const monthLabel = format(monthDate, 'LLL', { locale: ru });
    const value = lessons.filter((lesson) => {
      if (lesson.status === 'CANCELED') return false;
      const lessonDate = toZonedDate(lesson.startAt, timeZone);
      return lessonDate.getFullYear() === monthDate.getFullYear() && lessonDate.getMonth() === monthDate.getMonth();
    }).length;

    return {
      label: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
      value,
    };
  });

  const maxValue = Math.max(1, ...series.map((point) => point.value));
  return {
    maxValue,
    points: series,
  };
};

export const formatPaymentEventLabel = (event: PaymentEvent) => {
  if (event.type === 'TOP_UP') {
    return 'Пополнение';
  }
  if (event.type === 'AUTO_CHARGE') {
    return 'Автосписание';
  }
  if (event.type === 'MANUAL_PAID') {
    return 'Ручная оплата';
  }
  if (event.type === 'ADJUSTMENT') {
    return 'Корректировка';
  }
  return 'Платёж';
};

export const formatPaymentStatusLabel = (event: PaymentEvent) => {
  if (event.lessonsDelta > 0) return { label: 'Оплачено', tone: 'paid' as const };
  if (event.lessonsDelta < 0) return { label: 'Списано', tone: 'charge' as const };
  return { label: 'Изменение', tone: 'pending' as const };
};

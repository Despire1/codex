import { addDays, endOfWeek, format, isSameDay, startOfWeek } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Lesson, LinkedStudent, UnpaidLessonEntry } from '@/entities/types';
import type { DashboardSummary } from '@/shared/api/client';
import { formatInTimeZone, toUtcDateFromTimeZone, toUtcEndOfDay, toZonedDate } from '@/shared/lib/timezoneDates';

const capitalizeFirst = (value: string) => (value ? value[0].toUpperCase() + value.slice(1) : value);

const normalizeMoney = (value: number | null | undefined) => Math.max(0, Math.round(Number(value) || 0));

export const formatRubles = (value: number) => `${new Intl.NumberFormat('ru-RU').format(normalizeMoney(value))} ₽`;

export const formatDeltaPercent = (value: number) => {
  if (value > 0) return `+${value}% к ср.`;
  if (value < 0) return `${value}% к ср.`;
  return '0% к ср.';
};

const resolveStudentNameMap = (linkedStudents: LinkedStudent[]) =>
  new Map(
    linkedStudents.map((student) => [
      student.id,
      student.link.customName?.trim() || student.username?.trim() || 'Ученик',
    ]),
  );

export const resolveLessonAmountRub = (lesson: Lesson) => {
  if (lesson.participants && lesson.participants.length > 0) {
    return lesson.participants.reduce((sum, participant) => sum + normalizeMoney(participant.price), 0);
  }
  return normalizeMoney(lesson.price);
};

export const resolveLessonIsPaid = (lesson: Lesson) => {
  if (lesson.participants && lesson.participants.length > 0) {
    return lesson.participants.every((participant) => participant.isPaid);
  }
  return Boolean(lesson.isPaid);
};

export const resolveLessonPrimaryStudentId = (lesson: Lesson, options?: { preferUnpaid?: boolean }) => {
  if (lesson.participants && lesson.participants.length > 0) {
    const target =
      options?.preferUnpaid === true
        ? lesson.participants.find((participant) => !participant.isPaid) ?? lesson.participants[0]
        : lesson.participants[0];
    return target?.studentId ?? lesson.studentId;
  }
  return lesson.studentId;
};

const resolveLessonStudentLabel = (lesson: Lesson, studentNameMap: Map<number, string>) => {
  const resolveParticipantName = (studentId: number) => {
    const mappedName = studentNameMap.get(studentId);
    if (mappedName) return mappedName;
    const participant = lesson.participants?.find((item) => item.studentId === studentId);
    return participant?.student?.username?.trim() || 'Ученик';
  };

  if (lesson.participants && lesson.participants.length > 1) {
    const names = lesson.participants.map((participant) => resolveParticipantName(participant.studentId));
    if (names.length <= 2) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  }
  const studentId =
    lesson.participants && lesson.participants.length === 1 ? lesson.participants[0].studentId : lesson.studentId;
  return resolveParticipantName(studentId);
};

const resolveTimelineBadge = (lesson: Lesson, now: Date) => {
  if (lesson.status === 'COMPLETED') return { label: 'Завершен', tone: 'done' as const };
  const startMs = new Date(lesson.startAt).getTime();
  const endMs = startMs + lesson.durationMinutes * 60_000;
  if (endMs <= now.getTime()) return { label: 'Прошел', tone: 'muted' as const };
  if (startMs <= now.getTime()) return { label: 'Сейчас', tone: 'soon' as const };
  const deltaMinutes = Math.max(1, Math.round((startMs - now.getTime()) / 60_000));
  if (deltaMinutes < 60) {
    return { label: `Через ${deltaMinutes}м`, tone: 'soon' as const };
  }
  return { label: `Через ${Math.ceil(deltaMinutes / 60)}ч`, tone: 'soon' as const };
};

const resolveDayKey = (date: Date, timeZone: string) => formatInTimeZone(date, 'yyyy-MM-dd', { timeZone });

export type MobileDashboardDayTimelineItem = {
  lesson: Lesson;
  studentLabel: string;
  subtitle: string;
  startTimeLabel: string;
  endTimeLabel: string;
  timeLabel: string;
  badgeLabel: string;
  badgeTone: 'done' | 'soon' | 'muted';
  isCurrent: boolean;
  isPast: boolean;
};

export type MobileDashboardWeekDay = {
  key: string;
  label: string;
  isToday: boolean;
  items: MobileDashboardDayTimelineItem[];
};

export type MobileDashboardNextLesson = {
  lesson: Lesson;
  studentLabel: string;
  timeLabel: string;
  subjectLabel: string;
};

export type MobileDashboardCloseLesson = {
  lesson: Lesson;
  studentLabel: string;
  timeLabel: string;
  amountRub: number;
  isPaid: boolean;
  needsCompletion: boolean;
  primaryStudentId: number | null;
};

export type MobileDashboardPresentation = {
  headerDateLabel: string;
  todayPlanRub: number;
  todayPlanDeltaPercent: number;
  unpaidRub: number;
  unpaidStudentsCount: number;
  receivableWeekRub: number;
  nextLesson: MobileDashboardNextLesson | null;
  closeLesson: MobileDashboardCloseLesson | null;
  dayTimeline: MobileDashboardDayTimelineItem[];
  weekTimeline: MobileDashboardWeekDay[];
};

type BuildMobileDashboardPresentationParams = {
  lessons: Lesson[];
  linkedStudents: LinkedStudent[];
  unpaidEntries: UnpaidLessonEntry[];
  summary: DashboardSummary | null;
  timeZone: string;
  now?: Date;
};

export const buildMobileDashboardPresentation = ({
  lessons,
  linkedStudents,
  unpaidEntries,
  summary,
  timeZone,
  now = new Date(),
}: BuildMobileDashboardPresentationParams): MobileDashboardPresentation => {
  const studentNameMap = resolveStudentNameMap(linkedStudents);
  const todayZoned = toZonedDate(now, timeZone);
  const todayKey = format(todayZoned, 'yyyy-MM-dd');
  const dayStartUtc = toUtcDateFromTimeZone(todayKey, '00:00', timeZone);
  const dayEndUtc = toUtcEndOfDay(todayKey, timeZone);
  const weekStartZoned = startOfWeek(todayZoned, { weekStartsOn: 1 });
  const weekEndZoned = endOfWeek(todayZoned, { weekStartsOn: 1 });
  const weekEndKey = format(weekEndZoned, 'yyyy-MM-dd');
  const weekEndUtc = toUtcEndOfDay(weekEndKey, timeZone);

  const activeLessons = lessons.filter((lesson) => lesson.status !== 'CANCELED');
  const sortedByStart = [...activeLessons].sort(
    (left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime(),
  );

  const dayTimeline = sortedByStart
    .filter((lesson) => {
      const start = new Date(lesson.startAt);
      return start.getTime() >= dayStartUtc.getTime() && start.getTime() <= dayEndUtc.getTime();
    })
    .map((lesson) => {
      const startDate = new Date(lesson.startAt);
      const endDate = new Date(startDate.getTime() + lesson.durationMinutes * 60_000);
      const badge = resolveTimelineBadge(lesson, now);
      const startTimeLabel = formatInTimeZone(lesson.startAt, 'HH:mm', { timeZone });
      const endTimeLabel = formatInTimeZone(endDate, 'HH:mm', { timeZone });
      return {
        lesson,
        studentLabel: resolveLessonStudentLabel(lesson, studentNameMap),
        subtitle:
          lesson.participants && lesson.participants.length > 1
            ? `Группа • ${lesson.participants.length} учен.`
            : 'Индивидуально',
        startTimeLabel,
        endTimeLabel,
        timeLabel: `${startTimeLabel}–${endTimeLabel}`,
        badgeLabel: badge.label,
        badgeTone: badge.tone,
        isCurrent: startDate.getTime() <= now.getTime() && endDate.getTime() > now.getTime(),
        isPast: endDate.getTime() <= now.getTime(),
      };
    });

  const weekItemsByDay = new Map<string, MobileDashboardDayTimelineItem[]>();
  sortedByStart.forEach((lesson) => {
    const dayKey = resolveDayKey(new Date(lesson.startAt), timeZone);
    const startDate = new Date(lesson.startAt);
    const endDate = new Date(startDate.getTime() + lesson.durationMinutes * 60_000);
    const badge = resolveTimelineBadge(lesson, now);
    const startTimeLabel = formatInTimeZone(lesson.startAt, 'HH:mm', { timeZone });
    const endTimeLabel = formatInTimeZone(endDate, 'HH:mm', { timeZone });
    const nextItems = weekItemsByDay.get(dayKey) ?? [];
    nextItems.push(
      {
        lesson,
        studentLabel: resolveLessonStudentLabel(lesson, studentNameMap),
        subtitle:
          lesson.participants && lesson.participants.length > 1
            ? `Группа • ${lesson.participants.length} учен.`
            : 'Индивидуально',
        startTimeLabel,
        endTimeLabel,
        timeLabel: `${startTimeLabel}–${endTimeLabel}`,
        badgeLabel: badge.label,
        badgeTone: badge.tone,
        isCurrent: startDate.getTime() <= now.getTime() && endDate.getTime() > now.getTime(),
        isPast: endDate.getTime() <= now.getTime(),
      },
    );
    weekItemsByDay.set(dayKey, nextItems);
  });

  const weekTimeline = Array.from({ length: 7 }).map((_, index) => {
    const date = addDays(weekStartZoned, index);
    const key = format(date, 'yyyy-MM-dd');
    const weekdayLabel = capitalizeFirst(format(date, 'EEE', { locale: ru }).replace('.', ''));
    const dateLabel = format(date, 'd MMM', { locale: ru }).replace('.', '');
    return {
      key,
      label: `${weekdayLabel}, ${dateLabel}`,
      isToday: isSameDay(date, todayZoned),
      items: weekItemsByDay.get(key) ?? [],
    };
  });

  const nextLessonRaw =
    sortedByStart.find(
      (lesson) => lesson.status === 'SCHEDULED' && new Date(lesson.startAt).getTime() >= now.getTime(),
    ) ?? null;
  const nextLesson = nextLessonRaw
    ? {
        lesson: nextLessonRaw,
        studentLabel: resolveLessonStudentLabel(nextLessonRaw, studentNameMap),
        timeLabel: `${formatInTimeZone(nextLessonRaw.startAt, 'HH:mm', { timeZone })}–${formatInTimeZone(
          new Date(new Date(nextLessonRaw.startAt).getTime() + nextLessonRaw.durationMinutes * 60_000),
          'HH:mm',
          { timeZone },
        )} (${nextLessonRaw.durationMinutes} мин)`,
        subjectLabel:
          nextLessonRaw.participants && nextLessonRaw.participants.length > 1 ? 'Групповое занятие' : 'Индивидуально',
      }
    : null;

  const closeLessonRaw =
    [...sortedByStart]
      .filter((lesson) => {
        const endDate = new Date(new Date(lesson.startAt).getTime() + lesson.durationMinutes * 60_000);
        if (endDate.getTime() > now.getTime()) return false;
        const needsCompletion = lesson.status !== 'COMPLETED';
        const needsPayment = !resolveLessonIsPaid(lesson);
        return needsCompletion || needsPayment;
      })
      .sort((left, right) => {
        const leftEnd = new Date(left.startAt).getTime() + left.durationMinutes * 60_000;
        const rightEnd = new Date(right.startAt).getTime() + right.durationMinutes * 60_000;
        return rightEnd - leftEnd;
      })[0] ?? null;

  const closeLesson = closeLessonRaw
    ? {
        lesson: closeLessonRaw,
        studentLabel: resolveLessonStudentLabel(closeLessonRaw, studentNameMap),
        timeLabel: capitalizeFirst(
          formatInTimeZone(closeLessonRaw.startAt, "EEE, d MMM, HH:mm", { locale: ru, timeZone }).replace('.', ''),
        ),
        amountRub: resolveLessonAmountRub(closeLessonRaw),
        isPaid: resolveLessonIsPaid(closeLessonRaw),
        needsCompletion: closeLessonRaw.status !== 'COMPLETED',
        primaryStudentId: resolveLessonPrimaryStudentId(closeLessonRaw, { preferUnpaid: true }) ?? null,
      }
    : null;

  const unpaidRubFallback = unpaidEntries.reduce((sum, entry) => sum + normalizeMoney(entry.price), 0);
  const unpaidStudentsCountFallback = new Set(unpaidEntries.map((entry) => entry.studentId)).size;
  const todayPlanRubFallback = dayTimeline.reduce((sum, item) => sum + resolveLessonAmountRub(item.lesson), 0);
  const dailyTotals = new Map<string, number>();
  activeLessons.forEach((lesson) => {
    const key = resolveDayKey(new Date(lesson.startAt), timeZone);
    dailyTotals.set(key, (dailyTotals.get(key) ?? 0) + resolveLessonAmountRub(lesson));
  });
  const previousSevenDaysTotal = Array.from({ length: 7 }).reduce<number>((sum, _unused, index) => {
    const key = format(addDays(todayZoned, -(index + 1)), 'yyyy-MM-dd');
    return sum + (dailyTotals.get(key) ?? 0);
  }, 0);
  const previousSevenDaysAverage = previousSevenDaysTotal / 7;
  const todayPlanDeltaPercentFallback =
    previousSevenDaysAverage > 0
      ? Math.round(((todayPlanRubFallback - previousSevenDaysAverage) / previousSevenDaysAverage) * 100)
      : todayPlanRubFallback > 0
        ? 100
        : 0;
  const weekScheduledRubFallback = activeLessons.reduce((sum, lesson) => {
    if (lesson.status !== 'SCHEDULED') return sum;
    const startAt = new Date(lesson.startAt);
    if (startAt.getTime() < now.getTime() || startAt.getTime() > weekEndUtc.getTime()) return sum;
    return sum + resolveLessonAmountRub(lesson);
  }, 0);
  const receivableWeekRubFallback = unpaidRubFallback + weekScheduledRubFallback;

  return {
    headerDateLabel: capitalizeFirst(
      formatInTimeZone(now, 'EEE, d MMMM', { locale: ru, timeZone }).replace('.', ''),
    ),
    todayPlanRub: summary?.todayPlanRub ?? todayPlanRubFallback,
    todayPlanDeltaPercent: summary?.todayPlanDeltaPercent ?? todayPlanDeltaPercentFallback,
    unpaidRub: summary?.unpaidRub ?? unpaidRubFallback,
    unpaidStudentsCount: summary?.unpaidStudentsCount ?? unpaidStudentsCountFallback,
    receivableWeekRub: summary?.receivableWeekRub ?? receivableWeekRubFallback,
    nextLesson,
    closeLesson,
    dayTimeline,
    weekTimeline,
  };
};

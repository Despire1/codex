import { addDays, addMinutes, addMonths, endOfMonth, format, isSameDay, startOfMonth, startOfWeek } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AddOutlinedIcon,
  CalendarMonthIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CoffeeIcon,
  MeetingLinkIcon,
} from '../../icons/MaterialIcons';
import { DayPicker } from 'react-day-picker';
import { HomeworkAssignment, Lesson, LinkedStudent } from '../../entities/types';
import { getLessonColorVars } from '../../shared/lib/lessonColors';
import { useTimeZone } from '../../shared/lib/timezoneContext';
import { formatInTimeZone, toUtcDateFromDate, toZonedDate } from '../../shared/lib/timezoneDates';
import { Badge } from '../../shared/ui/Badge/Badge';
import { Ellipsis } from '../../shared/ui/Ellipsis/Ellipsis';
import { Tooltip } from '../../shared/ui/Tooltip/Tooltip';
import { useIsMobile } from '../../shared/lib/useIsMobile';
import { buildParticipants, getLessonLabel, isLessonInSeries } from '../../entities/lesson/lib/lessonDetails';
import { resolveLessonCancelActionCopy } from '../../entities/lesson/lib/lessonStatusPresentation';
import { useToast } from '../../shared/lib/toast';
import { api } from '../../shared/api/client';
import { isDateInWeekdayList, normalizeWeekdayList } from '../../shared/lib/weekdays';
import styles from './ScheduleSection.module.css';
import { useLessonActions } from '../../features/lessons/model/useLessonActions';
import type {
  LessonCancelRefundMode,
  LessonMutationPreview,
  LessonSeriesScope,
} from '../../features/lessons/model/types';
import { LessonCancelDialog } from '../../features/lessons/ui/LessonCancelDialog/LessonCancelDialog';
import { LessonRestoreDialog } from '../../features/lessons/ui/LessonRestoreDialog/LessonRestoreDialog';
import { SeriesScopeDialog } from '../../features/lessons/ui/SeriesScopeDialog/SeriesScopeDialog';
import { useScheduleState } from './model/useScheduleState';
import { MonthDayLessonCard } from './components/MonthDayLessonCard';
import { useScheduleNotesRangeInternal } from './model/useScheduleNotesRange';
import { ScheduleDayNotesPanel } from './components/ScheduleDayNotesPanel';

const DAY_START_MINUTE = 0;
const DAY_END_MINUTE = 24 * 60;
const HOURS_IN_DAY = 24;
const HOUR_BLOCK_HEIGHT = 72;
const DEFAULT_SCROLL_HOUR = 9;
const DEFAULT_SCROLL_TOP = DEFAULT_SCROLL_HOUR * HOUR_BLOCK_HEIGHT;
const LAST_MINUTE = DAY_END_MINUTE - 1;
const WEEK_STARTS_ON = 1;
const WEEK_LESSON_INSET = 8;
const DAY_LESSON_INSET = 12;

type PendingScopeAction =
  | {
      type: 'cancel';
      lesson: Lesson;
      refundMode?: LessonCancelRefundMode;
      previews?: Partial<Record<LessonSeriesScope, LessonMutationPreview>>;
    }
  | {
      type: 'restore';
      lesson: Lesson;
      previews?: Partial<Record<LessonSeriesScope, LessonMutationPreview>>;
    };

const resolveCancelDialogCopy = (lesson: Lesson | null) => {
  const copy = resolveLessonCancelActionCopy(lesson);
  return {
    title: copy.title.replace('?', ''),
    confirmText: copy.confirmText,
  };
};

const resolveLessonsLabel = (count: number) => {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} занятие`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} занятия`;
  }

  return `${count} занятий`;
};

const resolveNotesLabel = (count: number) => {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} заметка`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} заметки`;
  }

  return `${count} заметок`;
};

interface ScheduleSectionProps {
  lessons: Lesson[];
  linkedStudents: LinkedStudent[];
  autoConfirmLessons: boolean;
  weekendWeekdays: number[];
}

export const ScheduleSection: FC<ScheduleSectionProps> = ({
  lessons,
  linkedStudents,
  autoConfirmLessons,
  weekendWeekdays,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const timeZone = useTimeZone();
  const { showToast } = useToast();
  const {
    openLessonModal,
    startEditLesson,
    togglePaid,
    openRescheduleModal,
    requestDeleteLessonFromList,
    cancelLesson,
    restoreLesson,
  } = useLessonActions();
  const {
    scheduleView,
    setScheduleView,
    dayViewDate,
    setDayViewDate,
    monthAnchor,
    monthOffset,
    selectedMonthDay,
    setSelectedMonthDay,
    dayLabelKey,
    weekLabelKey,
    monthLabelKey,
    shiftDay,
    shiftWeek,
    shiftMonth,
    goToToday,
  } = useScheduleState();
  const todayZoned = useMemo(() => toZonedDate(new Date(), timeZone), [timeZone]);
  const [hoverIndicator, setHoverIndicator] = useState<{ dayIso: string; minutes: number } | null>(null);
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  const [dayPanelActionsLessonId, setDayPanelActionsLessonId] = useState<number | null>(null);
  const [cancelDialogLesson, setCancelDialogLesson] = useState<Lesson | null>(null);
  const [restoreDialogLesson, setRestoreDialogLesson] = useState<Lesson | null>(null);
  const [scopeDialog, setScopeDialog] = useState<PendingScopeAction | null>(null);
  const dayPickerRef = useRef<HTMLDivElement>(null);
  const weekScrollRef = useRef<HTMLDivElement>(null);
  const dayScrollRef = useRef<HTMLDivElement>(null);
  const isMobileViewport = useIsMobile(720);
  const normalizedWeekendWeekdays = useMemo(() => normalizeWeekdayList(weekendWeekdays), [weekendWeekdays]);
  const [activeDayPanelTab, setActiveDayPanelTab] = useState<'lessons' | 'notes'>('lessons');
  const [drawerMode, setDrawerMode] = useState<'half' | 'expanded'>('half');
  const [isDraggingDrawer, setIsDraggingDrawer] = useState(false);
  const [drawerDragOffset, setDrawerDragOffset] = useState(0);
  const drawerPointerStart = useRef<number | null>(null);
  const drawerModeAtDragStart = useRef<'half' | 'expanded'>('half');
  const drawerDragOffsetRef = useRef(0);
  const drawerDragRafRef = useRef<number | null>(null);
  const mobileWeekKeyRef = useRef<string | null>(null);
  const [selectedDayHomeworkAssignmentsByLessonId, setSelectedDayHomeworkAssignmentsByLessonId] = useState<
    Record<number, HomeworkAssignment[]>
  >({});
  const deepLinkLessonHandledRef = useRef<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const lessonIdParam = params.get('lessonId');
    if (!lessonIdParam) {
      deepLinkLessonHandledRef.current = null;
      return;
    }
    if (deepLinkLessonHandledRef.current === lessonIdParam) return;
    const found = lessons.find((lesson) => String(lesson.id) === lessonIdParam);
    if (!found) return;
    deepLinkLessonHandledRef.current = lessonIdParam;
    const zonedStart = toZonedDate(found.startAt, timeZone);
    const dayIso = format(zonedStart, 'yyyy-MM-dd');
    const timeLabel = format(zonedStart, 'HH:mm');
    openLessonModal(dayIso, timeLabel, found);
    navigate('/schedule', { replace: true });
  }, [location.search, lessons, timeZone, openLessonModal, navigate]);

  const lessonsByDay = useMemo(() => {
    return lessons.reduce<Record<string, Lesson[]>>((acc, lesson) => {
      const day = formatInTimeZone(lesson.startAt, 'yyyy-MM-dd', { timeZone });
      if (!acc[day]) acc[day] = [];
      acc[day].push(lesson);
      return acc;
    }, {});
  }, [lessons, timeZone]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(dayViewDate, { weekStartsOn: WEEK_STARTS_ON as 0 | 1 });
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      return {
        iso: format(date, 'yyyy-MM-dd'),
        date,
      };
    });
  }, [dayViewDate]);

  const hours = useMemo(() => Array.from({ length: HOURS_IN_DAY }, (_, i) => i), []);

  const dayHeight = useMemo(() => HOURS_IN_DAY * HOUR_BLOCK_HEIGHT, []);

  const selectedMonth = useMemo(() => addMonths(monthAnchor, monthOffset), [monthAnchor, monthOffset]);
  const {
    loading: loadingNotes,
    currentMonthRange,
    notesCountByDay,
    loadNotesForRange,
    getNotesForDay,
    createNote,
    updateNote,
    deleteNote,
  } = useScheduleNotesRangeInternal(selectedMonth);
  const [internalSelectedMonthDay, setInternalSelectedMonthDay] = useState<string | null>(null);
  const effectiveSelectedMonthDay = selectedMonthDay ?? internalSelectedMonthDay;

  useEffect(() => {
    if (selectedMonthDay === undefined) return;
    setInternalSelectedMonthDay(selectedMonthDay);
  }, [selectedMonthDay]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const targetDate = searchParams.get('date');
    if (!targetDate) return;
    const parsedDate = toUtcDateFromDate(targetDate, timeZone);
    if (Number.isNaN(parsedDate.getTime())) return;
    const zonedDate = toZonedDate(parsedDate, timeZone);
    setDayViewDate(zonedDate);
    setSelectedMonthDay(targetDate);
    if (searchParams.get('view') === 'day') {
      setScheduleView('day');
    }
  }, [location.search, setDayViewDate, setScheduleView, setSelectedMonthDay, timeZone]);

  const isMobileMonthView = scheduleView === 'month' && isMobileViewport;
  const isMobileWeekView = scheduleView === 'week' && isMobileViewport;

  const weekRangeLabel = useMemo(() => {
    const start = startOfWeek(dayViewDate, { weekStartsOn: WEEK_STARTS_ON as 0 | 1 });
    const end = addDays(start, 6);
    return `${format(start, 'dd.MM')} - ${format(end, 'dd.MM')}`;
  }, [dayViewDate]);

  const dayLabel = useMemo(() => format(dayViewDate, 'EEEE, d MMMM', { locale: ru }), [dayViewDate]);

  const monthWeekdays = useMemo(() => ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], []);
  const weekDayShortLabels = useMemo(() => ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'], []);

  const capitalizedDayLabel = useMemo(
    () => dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1),
    [dayLabel],
  );
  const daySwitchLabel = useMemo(() => {
    if (!isMobileViewport) {
      return capitalizedDayLabel;
    }

    const weekdayIndex = Number(format(dayViewDate, 'i')) - 1;
    const shortWeekday =
      weekDayShortLabels[weekdayIndex] ?? format(dayViewDate, 'EE', { locale: ru }).toUpperCase();

    return `${shortWeekday}, ${format(dayViewDate, 'd MMMM', { locale: ru })}`;
  }, [capitalizedDayLabel, dayViewDate, isMobileViewport, weekDayShortLabels]);

  useEffect(() => {
    if (!dayPickerOpen) return undefined;

    const handleClickOutside = (event: MouseEvent | globalThis.MouseEvent) => {
      if (dayPickerRef.current && !dayPickerRef.current.contains(event.target as Node)) {
        setDayPickerOpen(false);
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [dayPickerOpen]);

  useEffect(() => {
    const resolveScrollTopForDay = (): number => {
      const dayIso = format(dayViewDate, 'yyyy-MM-dd');
      const todayIso = formatInTimeZone(new Date(), 'yyyy-MM-dd', { timeZone });
      const dayLessons = lessons
        .filter((lesson) => formatInTimeZone(lesson.startAt, 'yyyy-MM-dd', { timeZone }) === dayIso)
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

      if (dayLessons.length > 0) {
        const earliestLessonTime = formatInTimeZone(dayLessons[0].startAt, 'HH:mm', { timeZone });
        const [hourStr] = earliestLessonTime.split(':');
        const lessonHour = Math.max(0, Number(hourStr) - 1);
        return lessonHour * HOUR_BLOCK_HEIGHT;
      }

      if (dayIso === todayIso) {
        const currentHour = Number(formatInTimeZone(new Date(), 'H', { timeZone }));
        return Math.max(0, currentHour - 1) * HOUR_BLOCK_HEIGHT;
      }

      return DEFAULT_SCROLL_TOP;
    };

    const applyScroll = () => {
      if (scheduleView === 'week' && weekScrollRef.current) {
        weekScrollRef.current.scrollTop = DEFAULT_SCROLL_TOP;
      }

      if ((scheduleView === 'day' || (scheduleView === 'week' && isMobileViewport)) && dayScrollRef.current) {
        dayScrollRef.current.scrollTop = resolveScrollTopForDay();
      }
    };

    applyScroll();
    // rAF повторно, чтобы дать DOM смонтироваться при первом переходе на вкладку
    const rafId = typeof window !== 'undefined' ? window.requestAnimationFrame(applyScroll) : null;
    return () => {
      if (rafId !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [scheduleView, dayViewDate, isMobileViewport, lessons, timeZone]);

  useEffect(() => {
    if (scheduleView !== 'month' || effectiveSelectedMonthDay) return;

    const daysInMonth = buildMonthDays(selectedMonth).filter((day) => day.inMonth);
    const todayIso = formatInTimeZone(new Date(), 'yyyy-MM-dd', { timeZone });

    const defaultDay =
      daysInMonth.find((day) => day.iso === todayIso) ||
      daysInMonth.find((day) => (lessonsByDay[day.iso] ?? []).length > 0) ||
      daysInMonth[0];

    if (defaultDay) {
      setDayViewDate(defaultDay.date);

      if (!isMobileViewport) {
        setInternalSelectedMonthDay(defaultDay.iso);
        setSelectedMonthDay(defaultDay.iso);
      }
    }
  }, [
    scheduleView,
    selectedMonth,
    effectiveSelectedMonthDay,
    lessonsByDay,
    setDayViewDate,
    isMobileViewport,
    timeZone,
    setSelectedMonthDay,
  ]);

  useEffect(() => {
    if (!isMobileWeekView) {
      mobileWeekKeyRef.current = null;
      return;
    }

    const weekStart = startOfWeek(dayViewDate, { weekStartsOn: WEEK_STARTS_ON as 0 | 1 });
    const weekEnd = addDays(weekStart, 6);
    const today = todayZoned;
    const todayIso = format(today, 'yyyy-MM-dd');
    const weekStartIso = format(weekStart, 'yyyy-MM-dd');
    const weekKey = weekStartIso;

    if (mobileWeekKeyRef.current === weekKey) {
      return;
    }

    mobileWeekKeyRef.current = weekKey;
    const targetIso = today >= weekStart && today <= weekEnd ? todayIso : weekStartIso;
    const currentIso = format(dayViewDate, 'yyyy-MM-dd');

    if (currentIso !== targetIso) {
      setDayViewDate(toZonedDate(toUtcDateFromDate(targetIso, timeZone), timeZone));
    }
  }, [isMobileWeekView, dayViewDate, setDayViewDate, timeZone, todayZoned]);

  useEffect(() => {
    if (effectiveSelectedMonthDay) {
      setDrawerMode('half');
    }
  }, [effectiveSelectedMonthDay]);

  useEffect(() => {
    if (scheduleView !== 'month') return;
    void loadNotesForRange(currentMonthRange);
  }, [currentMonthRange, loadNotesForRange, scheduleView]);

  const buildMonthDays = (monthDate: Date) => {
    const start = startOfWeek(startOfMonth(monthDate), { weekStartsOn: WEEK_STARTS_ON as 0 | 1 });
    const end = startOfWeek(addDays(endOfMonth(monthDate), 7), { weekStartsOn: WEEK_STARTS_ON as 0 | 1 });

    const days: { date: Date; iso: string; inMonth: boolean }[] = [];
    for (let cursor = start; cursor < end; cursor = addDays(cursor, 1)) {
      days.push({
        date: cursor,
        iso: format(cursor, 'yyyy-MM-dd'),
        inMonth: cursor.getMonth() === monthDate.getMonth(),
      });
    }

    return days;
  };

  const lessonPosition = (lesson: Lesson) => {
    const start = toZonedDate(lesson.startAt, timeZone);
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const top = Math.max(0, ((startMinutes - DAY_START_MINUTE) / 60) * HOUR_BLOCK_HEIGHT);
    const height = Math.max(36, (lesson.durationMinutes * HOUR_BLOCK_HEIGHT) / 60);
    return { top, height };
  };

  const buildLessonLayout = (dayLessons: Lesson[]) => {
    const sorted = dayLessons
      .map((lesson) => {
        const start = toZonedDate(lesson.startAt, timeZone);
        const startMinutes = start.getHours() * 60 + start.getMinutes();
        const endMinutes = startMinutes + lesson.durationMinutes;
        const position = lessonPosition(lesson);
        return { lesson, startMinutes, endMinutes, position };
      })
      .sort((a, b) => a.startMinutes - b.startMinutes);

    const clusters: Array<typeof sorted> = [];
    let currentCluster: typeof sorted = [];
    let clusterEnd = -Infinity;

    sorted.forEach((entry) => {
      if (currentCluster.length === 0 || entry.startMinutes < clusterEnd) {
        currentCluster.push(entry);
        clusterEnd = Math.max(clusterEnd, entry.endMinutes);
      } else {
        clusters.push(currentCluster);
        currentCluster = [entry];
        clusterEnd = entry.endMinutes;
      }
    });

    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }

    const layouts: Array<{
      lesson: Lesson;
      top: number;
      height: number;
      column: number;
      columns: number;
    }> = [];

    clusters.forEach((cluster) => {
      const columnEnds: number[] = [];
      const clusterLayouts = cluster.map((entry) => {
        const columnIndex = columnEnds.findIndex((end) => entry.startMinutes >= end);
        const resolvedColumn = columnIndex === -1 ? columnEnds.length : columnIndex;

        if (columnIndex === -1) {
          columnEnds.push(entry.endMinutes);
        } else {
          columnEnds[columnIndex] = entry.endMinutes;
        }

        return {
          lesson: entry.lesson,
          top: entry.position.top,
          height: entry.position.height,
          column: resolvedColumn,
        };
      });

      const columnsCount = columnEnds.length;
      clusterLayouts.forEach((layout) => {
        layouts.push({ ...layout, columns: columnsCount });
      });
    });

    return layouts;
  };

  const buildLessonStyle = (
    layout: { top: number; height: number; column: number; columns: number },
    inset: number,
  ): CSSProperties => {
    const widthPercent = 100 / layout.columns;
    return {
      top: layout.top,
      height: layout.height,
      left: `calc(${layout.column * widthPercent}% + ${inset}px)`,
      width: `calc(${widthPercent}% - ${inset * 2}px)`,
      right: 'auto',
    };
  };

  const buildLessonColorStyle = (lesson: Lesson): CSSProperties =>
    getLessonColorVars(lesson.color) as CSSProperties;

  const formatMinutesToTime = (minutes: number) => {
    const hoursValue = Math.floor(minutes / 60)
      .toString()
      .padStart(2, '0');
    const mins = (minutes % 60).toString().padStart(2, '0');
    return `${hoursValue}:${mins}`;
  };

  const renderHoverIndicator = (minutes: number) => {
    const top = Math.max(0, ((minutes - DAY_START_MINUTE) / 60) * HOUR_BLOCK_HEIGHT);
    return (
      <div className={styles.hoverIndicator} style={{ transform: `translateY(${top}px)` }}>
        <span className={styles.hoverTime}>{formatMinutesToTime(minutes)}</span>
      </div>
    );
  };

  const linkedStudentsById = useMemo(
    () => new Map(linkedStudents.map((student) => [student.id, student])),
    [linkedStudents],
  );
  const isWeekendDate = (date: Date) => isDateInWeekdayList(date, normalizedWeekendWeekdays);

  const isAwaitingConfirmation = (lesson: Lesson) => {
    if (autoConfirmLessons) return false;
    if (lesson.status !== 'SCHEDULED') return false;
    const lessonEnd = new Date(lesson.startAt).getTime() + lesson.durationMinutes * 60_000;
    return lessonEnd < Date.now();
  };

  const renderPaymentBadges = (lesson: Lesson, participants: any[], isGroupLesson: boolean) => {
    const paidCount = participants.filter((participant: any) => participant.isPaid).length;
    const unpaidCount = participants.length - paidCount;
    // Для будущих запланированных уроков оплата ещё не ожидается — скрываем плашку «Не оплачено».
    const isFutureScheduled =
      lesson.status === 'SCHEDULED' && new Date(lesson.startAt).getTime() > Date.now();

    if (isGroupLesson) {
      const badges = [] as Array<{ label: string; variant: 'groupPaid' | 'groupUnpaid' }>;
      if (paidCount > 0) badges.push({ label: `${paidCount} оплачено`, variant: 'groupPaid' });
      if (unpaidCount > 0 && !isFutureScheduled) {
        badges.push({ label: `${unpaidCount} не оплачено`, variant: 'groupUnpaid' });
      }

      return badges.map((badge) => (
        <Badge key={`${badge.variant}-${badge.label}`} label={badge.label} variant={badge.variant} withDot />
      ));
    }

    const participant = participants[0];
    const isPaid = !!participant?.isPaid;
    if (!isPaid && isFutureScheduled) {
      return null;
    }

    return (
      <Tooltip content={isPaid ? 'Оплачено' : 'Не оплачено'}>
        <button
          type="button"
          className={`${styles.paymentBadge} ${isPaid ? styles.paymentBadgePaid : styles.paymentBadgeUnpaid}`}
          onClick={(event) => {
            event.stopPropagation();
            togglePaid(lesson.id, participant?.studentId);
          }}
        >
          <span className={styles.paymentBadgeIcon} aria-hidden="true" />
          <span
              className={`${isPaid ? styles.paymentBadgePaid : styles.paymentBadgeUnpaidText}`}
          >
            {isPaid ? 'Оплачено' : 'Не оплачено'}
          </span>
        </button>
      </Tooltip>
    );
  };

  const handleOpenMeetingLink = (event: MouseEvent, meetingLink: string) => {
    event.stopPropagation();
    window.open(meetingLink, '_blank', 'noopener,noreferrer');
  };

  const handleCancelLesson = (lesson: Lesson) => {
    setDayPanelActionsLessonId(null);
    setCancelDialogLesson(lesson);
  };

  const handleRestoreLesson = (lesson: Lesson) => {
    setDayPanelActionsLessonId(null);
    setRestoreDialogLesson(lesson);
  };

  const handleConfirmCancel = (refundMode?: LessonCancelRefundMode) => {
    if (!cancelDialogLesson) return;
    const target = cancelDialogLesson;
    setCancelDialogLesson(null);

    if (isLessonInSeries(target)) {
      void Promise.all(
        (['SINGLE', 'FOLLOWING'] as LessonSeriesScope[]).map(async (scope) => {
          const data = await api.previewLessonMutation(target.id, { action: 'CANCEL', scope });
          return [scope, data.preview] as const;
        }),
      )
        .then((entries) => {
          setScopeDialog({
            type: 'cancel',
            lesson: target,
            refundMode,
            previews: Object.fromEntries(entries) as Partial<Record<LessonSeriesScope, LessonMutationPreview>>,
          });
        })
        .catch(() => {
          setScopeDialog({ type: 'cancel', lesson: target, refundMode });
        });
      return;
    }

    void cancelLesson(target, 'SINGLE', refundMode);
  };

  const handleConfirmRestore = () => {
    if (!restoreDialogLesson) return;
    const target = restoreDialogLesson;
    setRestoreDialogLesson(null);

    if (isLessonInSeries(target)) {
      void Promise.all(
        (['SINGLE', 'FOLLOWING'] as LessonSeriesScope[]).map(async (scope) => {
          const data = await api.previewLessonMutation(target.id, { action: 'RESTORE', scope });
          return [scope, data.preview] as const;
        }),
      )
        .then((entries) => {
          setScopeDialog({
            type: 'restore',
            lesson: target,
            previews: Object.fromEntries(entries) as Partial<Record<LessonSeriesScope, LessonMutationPreview>>,
          });
        })
        .catch(() => {
          setScopeDialog({ type: 'restore', lesson: target });
        });
      return;
    }

    void restoreLesson(target, 'SINGLE');
  };

  const handleScopeConfirm = (scope: LessonSeriesScope) => {
    if (!scopeDialog) return;
    const payload = scopeDialog;
    setScopeDialog(null);

    if (payload.type === 'cancel') {
      void cancelLesson(payload.lesson, scope, payload.refundMode);
      return;
    }

    void restoreLesson(payload.lesson, scope);
  };

  const renderMeetingLinkButton = (lesson: Lesson, className?: string) => {
    if (!lesson.meetingLink) return null;
    return (
      <button
        type="button"
        className={`${styles.meetingLinkButton} ${className ?? ''}`}
        onClick={(event) => handleOpenMeetingLink(event, lesson.meetingLink as string)}
        aria-label="Открыть ссылку на занятие"
        data-testid={`lesson-item-open-link-${lesson.id}`}
      >
        <MeetingLinkIcon className={styles.meetingLinkIcon} />
      </button>
    );
  };

  const renderLessonContent = (
    lesson: Lesson,
    layoutStyle: CSSProperties,
    className?: string,
  ) => {
    const participants = buildParticipants(lesson, linkedStudentsById);
    const isGroupLesson = participants.length > 1;
    const awaitingConfirmation = isAwaitingConfirmation(lesson);
    const startDate = toZonedDate(lesson.startAt, timeZone);
    const endDate = addMinutes(startDate, lesson.durationMinutes);
    const timeLabel = `${format(startDate, 'HH:mm')} - ${format(endDate, 'HH:mm')}`;
    const lessonLabel = getLessonLabel(participants, linkedStudentsById);
    const lessonMeta = isGroupLesson ? `${participants.length} ученик${participants.length === 1 ? '' : 'а'}` : '';

    return (
      <div
        key={lesson.id}
        className={`${styles.weekLesson} ${className ?? ''} ${
          lesson.status === 'CANCELED' ? styles.canceledLesson : ''
        }`}
        style={{ ...layoutStyle, ...buildLessonColorStyle(lesson) }}
        onClick={() => startEditLesson(lesson)}
        onMouseEnter={() => setHoverIndicator(null)}
      >
        {lesson.isRecurring && <span className={styles.recurringBadge}>↻</span>}
        <div className={styles.lessonCardHeader}>
          <div className={styles.lessonCardInfo}>
            <div className={styles.lessonTime}>{timeLabel}</div>
            <Ellipsis className={styles.lessonTitle} title={lessonLabel}>
              {lessonLabel}
            </Ellipsis>
          </div>
          {renderMeetingLinkButton(lesson)}
        </div>
        <div className={styles.statusBadges}>
          {awaitingConfirmation && <Badge label="Ожидает подтверждения" variant="pending" />}
          {renderPaymentBadges(lesson, participants, isGroupLesson)}
        </div>
        {lessonMeta && <div className={styles.weekLessonMeta}>{lessonMeta}</div>}
      </div>
    );
  };

  const handleTimeHover = (event: MouseEvent<HTMLDivElement>, dayIso: string) => {
    const target = event.target as HTMLElement;
    if (target.closest(`.${styles.weekLesson}`) || target.closest(`.${styles.dayLesson}`)) {
      return;
    }

    const container = event.currentTarget;
    const rect = container.getBoundingClientRect();
    const offsetY = event.clientY - rect.top + container.scrollTop;
    const minutesFromStart = DAY_START_MINUTE + (offsetY / HOUR_BLOCK_HEIGHT) * 60;
    const clampedMinutes = Math.min(Math.max(minutesFromStart, DAY_START_MINUTE), LAST_MINUTE);
    const roundedMinutes = Math.min(Math.round(clampedMinutes / 10) * 10, LAST_MINUTE);
    setHoverIndicator({ dayIso, minutes: roundedMinutes });
  };

  const handleGoToToday = () => {
    setDayPickerOpen(false);
    setInternalSelectedMonthDay(null);
    setSelectedMonthDay(null);
    goToToday();
  };

  const handleWeekSlotClick = (dayIso: string) => (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest(`.${styles.weekLesson}`)) return;

    const container = event.currentTarget;
    const rect = container.getBoundingClientRect();
    const offsetY = event.clientY - rect.top + container.scrollTop;
    const minutesFromStart = DAY_START_MINUTE + (offsetY / HOUR_BLOCK_HEIGHT) * 60;
    const clampedMinutes = Math.min(Math.max(minutesFromStart, DAY_START_MINUTE), LAST_MINUTE);
    const roundedMinutes = Math.min(Math.round(clampedMinutes / 30) * 30, LAST_MINUTE);
    const hoursValue = Math.floor(roundedMinutes / 60)
      .toString()
      .padStart(2, '0');
    const minutes = (roundedMinutes % 60).toString().padStart(2, '0');

    setDayViewDate(toZonedDate(toUtcDateFromDate(dayIso, timeZone), timeZone));
    openLessonModal(dayIso, `${hoursValue}:${minutes}`);
  };

  const renderWeekGrid = () => (
    <div className={styles.weekView}>
      <div className={styles.weekHeaderRow}>
        <div className={styles.timeColumnSpacer} />
        {weekDays.map((day) => (
          <div
            key={day.iso}
            className={`${styles.weekDayHeader} ${isSameDay(day.date, todayZoned) ? styles.todayHeader : ''}`}
          >
            <div className={styles.weekDayName}>{format(day.date, 'EEEE', { locale: ru })}</div>
            <div className={styles.weekDayDate}>{format(day.date, 'd MMM', { locale: ru })}</div>
          </div>
        ))}
      </div>

      <div className={styles.weekGridScroll} ref={weekScrollRef}>
        <div className={styles.weekGrid}>
          <div className={styles.timeColumn}>
            {hours.map((hour) => (
              <div key={hour} className={styles.timeSlot} style={{ height: HOUR_BLOCK_HEIGHT }}>
                {hour}:00
              </div>
            ))}
          </div>

          <div className={styles.weekColumns}>
            {weekDays.map((day) => {
              const dayLessons = lessons
                .filter((lesson) => formatInTimeZone(lesson.startAt, 'yyyy-MM-dd', { timeZone }) === day.iso)
                .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
              const dayLessonLayouts = buildLessonLayout(dayLessons);

              return (
                <div
                  key={day.iso}
                  className={styles.weekDayColumn}
                  onMouseLeave={() => setHoverIndicator(null)}
                >
                  <div
                    className={styles.weekDayBody}
                    style={{ height: dayHeight }}
                    onClick={handleWeekSlotClick(day.iso)}
                    onMouseMove={(event) => handleTimeHover(event, day.iso)}
                  >
                    {hoverIndicator?.dayIso === day.iso && renderHoverIndicator(hoverIndicator.minutes)}
                    {dayLessonLayouts.map((layout) =>
                      renderLessonContent(layout.lesson, buildLessonStyle(layout, WEEK_LESSON_INSET)),
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>

  );

  const renderMobileWeekView = () => {
    const selectedIso = format(dayViewDate, 'yyyy-MM-dd');
    const selectedDate = selectedIso
      ? toZonedDate(toUtcDateFromDate(selectedIso, timeZone), timeZone)
      : dayViewDate;
    const selectedLessons = selectedIso
      ? (lessonsByDay[selectedIso] ?? [])
          .slice()
          .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
      : [];
    const selectedLessonLayouts = buildLessonLayout(selectedLessons);
    const selectedDayIso = format(selectedDate, 'yyyy-MM-dd');

    return (
      <div className={styles.dayView}>
        <div className={styles.dayGridScroll} ref={dayScrollRef}>
          <div className={styles.dayGrid}>
            <div className={styles.timeColumn}>
              {hours.map((hour) => (
                <div key={hour} className={styles.timeSlot} style={{ height: HOUR_BLOCK_HEIGHT }}>
                  {hour}:00
                </div>
              ))}
            </div>
            <div
              className={styles.dayColumn}
              style={{ height: dayHeight }}
              onClick={handleWeekSlotClick(selectedDayIso)}
              onMouseMove={(event) => handleTimeHover(event, selectedDayIso)}
              onMouseLeave={() => setHoverIndicator(null)}
            >
              {hoverIndicator?.dayIso === selectedDayIso && renderHoverIndicator(hoverIndicator.minutes)}
              {selectedLessonLayouts.map((layout) =>
                renderLessonContent(layout.lesson, buildLessonStyle(layout, DAY_LESSON_INSET), styles.dayLesson),
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderDayView = () => {
    const dayIso = format(dayViewDate, 'yyyy-MM-dd');
    const dayLessons = lessons
      .filter((lesson) => formatInTimeZone(lesson.startAt, 'yyyy-MM-dd', { timeZone }) === dayIso)
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    const dayLessonLayouts = buildLessonLayout(dayLessons);

    return (
        <div className={styles.dayView}>
          <div key={dayLabelKey} className={styles.dayHeading}>
            <div className={styles.dayTitle}>{format(dayViewDate, 'EEEE, d MMMM yyyy', { locale: ru })}</div>
          </div>
        <div className={styles.dayGridScroll} ref={dayScrollRef}>
          <div className={styles.dayGrid}>
            <div className={styles.timeColumn}>
              {hours.map((hour) => (
                <div key={hour} className={styles.timeSlot} style={{ height: HOUR_BLOCK_HEIGHT }}>
                  {hour}:00
                </div>
              ))}
            </div>
            <div
              className={styles.dayColumn}
              style={{ height: dayHeight }}
              onClick={handleWeekSlotClick(dayIso)}
              onMouseMove={(event) => handleTimeHover(event, dayIso)}
              onMouseLeave={() => setHoverIndicator(null)}
            >
              {hoverIndicator?.dayIso === dayIso && renderHoverIndicator(hoverIndicator.minutes)}
              {dayLessonLayouts.map((layout) =>
                renderLessonContent(layout.lesson, buildLessonStyle(layout, DAY_LESSON_INSET), styles.dayLesson),
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const selectedDayLessons = useMemo(
    () =>
      effectiveSelectedMonthDay
        ? (lessonsByDay[effectiveSelectedMonthDay] ?? [])
            .slice()
            .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
        : [],
    [effectiveSelectedMonthDay, lessonsByDay],
  );

  const selectedDayLessonIdsKey = useMemo(
    () => selectedDayLessons.map((lesson) => lesson.id).join(','),
    [selectedDayLessons],
  );

  const selectedDayNotes = useMemo(
    () => getNotesForDay(effectiveSelectedMonthDay),
    [effectiveSelectedMonthDay, getNotesForDay],
  );

  const selectedDayDate = useMemo(
    () =>
      effectiveSelectedMonthDay
        ? toZonedDate(toUtcDateFromDate(effectiveSelectedMonthDay, timeZone), timeZone)
        : null,
    [effectiveSelectedMonthDay, timeZone],
  );

  useEffect(() => {
    if (scheduleView !== 'month' || activeDayPanelTab !== 'lessons') return;

    if (selectedDayLessons.length === 0) {
      setSelectedDayHomeworkAssignmentsByLessonId({});
      return;
    }

    let isCancelled = false;
    setSelectedDayHomeworkAssignmentsByLessonId({});

    const loadLessonAssignments = async (lessonId: number) => {
      try {
        const items: HomeworkAssignment[] = [];
        let nextOffset: number | null = 0;

        while (nextOffset !== null) {
          const response = await api.listHomeworkAssignmentsV2({
            lessonId,
            limit: 50,
            offset: nextOffset,
            sort: 'updated',
          });

          items.push(...response.items);
          nextOffset = response.nextOffset;
        }

        return { lessonId, items };
      } catch (error) {
         
        console.error('Failed to load homework assignments for lesson', error);
        return { lessonId, items: [] as HomeworkAssignment[] };
      }
    };

    void Promise.all(selectedDayLessons.map((lesson) => loadLessonAssignments(lesson.id))).then((results) => {
      if (isCancelled) return;

      setSelectedDayHomeworkAssignmentsByLessonId(
        Object.fromEntries(results.map(({ lessonId, items }) => [lessonId, items])),
      );
    });

    return () => {
      isCancelled = true;
    };
  }, [activeDayPanelTab, scheduleView, selectedDayLessonIdsKey, selectedDayLessons]);


  const renderMonthView = () => {
    const days = buildMonthDays(selectedMonth);
    const monthLabel = format(selectedMonth, 'LLLL yyyy', { locale: ru });
    const selectedDayIsWeekend = selectedDayDate ? isWeekendDate(selectedDayDate) : false;
    const selectedDayNotesCount = selectedDayNotes.length;

    const selectedDayTitle = selectedDayDate ? format(selectedDayDate, 'd MMMM', { locale: ru }) : 'Выберите день';
    const selectedDayMeta = selectedDayDate
      ? [
          format(selectedDayDate, 'EEEE', { locale: ru }),
          selectedDayIsWeekend ? 'выходной' : null,
          resolveLessonsLabel(selectedDayLessons.length),
          selectedDayNotesCount > 0 ? resolveNotesLabel(selectedDayNotesCount) : null,
        ]
          .filter(Boolean)
          .join(' • ')
      : 'Выберите день в календаре';
    const selectedDayMetaCapitalized = selectedDayMeta.charAt(0).toUpperCase() + selectedDayMeta.slice(1);

    const handleCreateLessonFromPanel = () => {
      if (!effectiveSelectedMonthDay) return;
      if (selectedDayIsWeekend) return;

      const targetDate = toZonedDate(toUtcDateFromDate(effectiveSelectedMonthDay, timeZone), timeZone);
      setDayViewDate(targetDate);
      if (isMobileMonthView) {
        setDrawerMode('half');
        setDrawerDragOffset(0);
        setInternalSelectedMonthDay(null);
        setSelectedMonthDay(null);
      }
      openLessonModal(effectiveSelectedMonthDay, undefined, undefined, {
        skipNavigation: true,
        variant: isMobileMonthView ? 'sheet' : 'modal',
      });
    };

    const startDrawerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isMobileMonthView || !effectiveSelectedMonthDay) return;

      event.preventDefault();
      event.stopPropagation();

      drawerPointerStart.current = event.clientY;
      drawerModeAtDragStart.current = drawerMode;
      setIsDraggingDrawer(true);

      const handleMove = (moveEvent: PointerEvent) => {
        if (drawerPointerStart.current === null) return;
        const delta = moveEvent.clientY - drawerPointerStart.current;

        const clampedDelta = Math.min(Math.max(delta, -220), 260);
        drawerDragOffsetRef.current = clampedDelta;

        if (drawerDragRafRef.current === null) {
          drawerDragRafRef.current = window.requestAnimationFrame(() => {
            setDrawerDragOffset(drawerDragOffsetRef.current);
            drawerDragRafRef.current = null;
          });
        }
      };

      const handleEnd = () => {
        const delta = drawerDragOffsetRef.current;

        drawerPointerStart.current = null;
        setIsDraggingDrawer(false);
        setDrawerDragOffset(0);
        drawerDragOffsetRef.current = 0;
        if (drawerDragRafRef.current !== null) {
          cancelAnimationFrame(drawerDragRafRef.current);
          drawerDragRafRef.current = null;
        }

        if (delta > 120) {
          setInternalSelectedMonthDay(null);
          setSelectedMonthDay(null);
        } else if (delta < -80) {
          setDrawerMode('expanded');
        } else if (drawerModeAtDragStart.current === 'expanded' && delta > 30) {
          setDrawerMode('half');
        } else {
          setDrawerMode(drawerModeAtDragStart.current);
        }

        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleEnd);
        window.removeEventListener('pointercancel', handleEnd);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleEnd);
      window.addEventListener('pointercancel', handleEnd);
    };

    const renderDayDetails = () => (
      <div className={styles.dayPanelContent}>
        <div className={styles.dayPanelHeader}>
          <h2 className={styles.dayPanelTitle}>{selectedDayTitle}</h2>
          <p className={styles.dayPanelSubtitle}>{selectedDayMetaCapitalized}</p>
        </div>

        <div className={styles.dayPanelTabs}>
          <button
            type="button"
            className={`${styles.dayPanelTab} ${activeDayPanelTab === 'lessons' ? styles.dayPanelTabActive : ''}`}
            onClick={() => setActiveDayPanelTab('lessons')}
          >
            {selectedDayLessons.length > 0 ? `Занятия (${selectedDayLessons.length})` : 'Занятия'}
          </button>
          <button
            type="button"
            className={`${styles.dayPanelTab} ${activeDayPanelTab === 'notes' ? styles.dayPanelTabActive : ''}`}
            onClick={() => setActiveDayPanelTab('notes')}
          >
            {selectedDayNotesCount > 0 ? `Заметки (${selectedDayNotesCount})` : 'Заметки'}
          </button>
        </div>

        {activeDayPanelTab === 'lessons' ? (
          <div className={styles.dayPanelTabContent}>
            <div className={styles.dayPanelScrollArea}>
              {selectedDayLessons.length === 0 ? (
                selectedDayIsWeekend ? (
                  <div className={styles.weekendDayState}>
                    <div className={styles.weekendDayIcon} aria-hidden>
                      <CoffeeIcon />
                    </div>
                    <p className={styles.weekendDayTitle}>Выходной</p>
                    <p className={styles.weekendDaySubtitle}>Отдыхайте! На этот день нельзя поставить урок.</p>
                  </div>
                ) : (
                  <div className={styles.emptyDayState}>На этот день занятий пока нет</div>
                )
              ) : (
                <div className={styles.dayPanelList}>
                  {selectedDayLessons.map((lesson) => {
                    return (
                      <MonthDayLessonCard
                        key={lesson.id}
                        lesson={lesson}
                        linkedStudentsById={linkedStudentsById}
                        homeworkAssignments={selectedDayHomeworkAssignmentsByLessonId[lesson.id] ?? []}
                        timeZone={timeZone}
                        isActionsOpen={dayPanelActionsLessonId === lesson.id}
                        onOpenActions={() => setDayPanelActionsLessonId(lesson.id)}
                        onCloseActions={() => setDayPanelActionsLessonId((current) => (current === lesson.id ? null : current))}
                        onOpenHomeworkAssignment={(assignment) => {
                          setDayPanelActionsLessonId(null);
                          navigate(`/homeworks/assignments/${assignment.id}/edit`);
                        }}
                        onEdit={() => {
                          setDayPanelActionsLessonId(null);
                          startEditLesson(lesson);
                        }}
                        onDelete={() => {
                          setDayPanelActionsLessonId(null);
                          requestDeleteLessonFromList(lesson);
                        }}
                        onReschedule={() => {
                          setDayPanelActionsLessonId(null);
                          openRescheduleModal(lesson);
                        }}
                        onCancel={() => {
                          setDayPanelActionsLessonId(null);
                          handleCancelLesson(lesson);
                        }}
                        onRestore={() => {
                          setDayPanelActionsLessonId(null);
                          handleRestoreLesson(lesson);
                        }}
                        onOpenMeetingLink={(event, meetingLink) => {
                          setDayPanelActionsLessonId(null);
                          handleOpenMeetingLink(event, meetingLink);
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
            <div className={styles.dayPanelFooter}>
              <button
                type="button"
                className={`${styles.dayPanelAddButton} ${selectedDayIsWeekend ? styles.dayPanelAddButtonDisabled : ''}`}
                onClick={handleCreateLessonFromPanel}
                disabled={selectedDayIsWeekend}
              >
                <AddOutlinedIcon className={styles.dayPanelAddButtonIcon} />
                {selectedDayIsWeekend ? 'Выходной день' : 'Создать урок'}
              </button>
            </div>
          </div>
        ) : effectiveSelectedMonthDay ? (
          <ScheduleDayNotesPanel
            dateKey={effectiveSelectedMonthDay}
            notes={selectedDayNotes}
            loading={loadingNotes}
            timeZone={timeZone}
            onCreate={async ({ content, noteType }) => {
              try {
                await createNote({ dateKey: effectiveSelectedMonthDay, content, noteType });
              } catch (error) {
                showToast({
                  message: 'Не удалось сохранить заметку',
                  variant: 'error',
                });
                throw error;
              }
            }}
            onUpdate={async (noteId, { content, noteType }) => {
              try {
                await updateNote(noteId, { content, noteType });
              } catch (error) {
                showToast({
                  message: 'Не удалось обновить заметку',
                  variant: 'error',
                });
                throw error;
              }
            }}
            onDelete={async (noteId) => {
              try {
                await deleteNote(noteId);
              } catch (error) {
                showToast({
                  message: 'Не удалось удалить заметку',
                  variant: 'error',
                });
                throw error;
              }
            }}
          />
        ) : null}
      </div>
    );

    const drawerStyle = {
      '--drawer-dh': `${-drawerDragOffset}px`,
      '--drawer-base-height': '80vh',
    } as CSSProperties;

    return (
      <div className={styles.monthScroller}>
        <div className={styles.monthLayout}>
          <section className={styles.monthSection}>
            <div className={styles.monthHeader}>
              <div className={styles.monthHeaderNav}>
                <button
                  className={styles.monthNavButton}
                  onClick={() => shiftMonth(-1)}
                  aria-label="Предыдущий месяц"
                  type="button"
                >
                  <ChevronLeftIcon className={styles.monthNavIcon} />
                </button>
                <div key={monthLabelKey} className={styles.monthTitle}>
                  {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
                </div>
                <button
                  className={styles.monthNavButton}
                  onClick={() => shiftMonth(1)}
                  aria-label="Следующий месяц"
                  type="button"
                >
                  <ChevronRightIcon className={styles.monthNavIcon} />
                </button>
              </div>
              <button type="button" className={styles.monthTodayButton} onClick={handleGoToToday}>
                <span className={styles.monthTodayIcon}>
                  <CalendarMonthIcon />
                </span>
                Сегодня
              </button>
            </div>

            <div className={styles.monthCalendar}>
              <div className={styles.monthWeekdaysGrid}>
                {monthWeekdays.map((weekday) => (
                  <div key={`${monthLabel}-${weekday}`} className={styles.monthWeekday}>
                    {weekday}
                  </div>
                ))}
              </div>
              <div className={styles.monthDaysScroller}>
                <div className={styles.monthDaysGrid}>
                {days.map((day) => {
                  const dayLessons = lessonsByDay[day.iso] ?? [];
                  const dayNotesCount = notesCountByDay[day.iso] ?? 0;
                  const isWeekendCell = isWeekendDate(day.date);
                  const handleDayClick = () => {
                    setInternalSelectedMonthDay(day.iso);
                    setSelectedMonthDay(day.iso);
                    setDayViewDate(day.date);

                    if (isMobileMonthView) {
                      setDrawerMode('expanded');
                      setDrawerDragOffset(0);
                    }
                  };
                  const isTodayCell = isSameDay(day.date, todayZoned);

                  return (
                    <div
                      key={`${monthLabel}-${day.iso}`}
                      className={`${styles.monthCell} ${day.inMonth ? '' : styles.mutedDay} ${
                        isTodayCell ? styles.todayCell : ''
                      } ${effectiveSelectedMonthDay === day.iso ? styles.activeDay : ''}`}
                      onClick={handleDayClick}
                    >
                      <div className={styles.monthDateRow}>
                        <span
                          className={`${styles.monthDateNumber} ${isTodayCell ? styles.todayDateNumber : ''}`}
                        >
                          {day.date.getDate()}
                        </span>
                        {isWeekendCell && (
                          <Tooltip content="Выходной день" align="center">
                            <span className={styles.monthWeekendBadge} aria-label="Выходной день">
                              <CoffeeIcon />
                            </span>
                          </Tooltip>
                        )}
                      </div>
                      <div className={styles.monthCounters}>
                        {dayLessons.length > 0 && (
                          <span className={`${styles.dayCounter} ${styles.lessonCounter}`}>{dayLessons.length}</span>
                        )}
                        {dayNotesCount > 0 && (
                          <span className={`${styles.dayCounter} ${styles.noteCounter}`}>{dayNotesCount}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            </div>
          </section>

          {!isMobileMonthView && <aside className={styles.dayPanel}>{renderDayDetails()}</aside>}
        </div>

        {isMobileMonthView && (
          <>
            <div
              className={`${styles.dayDrawerScrim} ${effectiveSelectedMonthDay ? styles.scrimVisible : ''}`}
              onClick={() => {
                setInternalSelectedMonthDay(null);
                setSelectedMonthDay(null);
              }}
            />
            <div
              className={`${styles.dayDrawer} ${effectiveSelectedMonthDay ? styles.dayDrawerOpen : ''} ${
                drawerMode === 'expanded' ? styles.dayDrawerExpanded : ''
              } ${isDraggingDrawer ? styles.dayDrawerDragging : ''}`}
              role="dialog"
              style={drawerStyle}
            >
              <div className={styles.drawerHandleArea} onPointerDown={startDrawerDrag}>
                <span className={styles.drawerHandle} />
              </div>
              {renderDayDetails()}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <section className={styles.viewGrid}>
      {scheduleView !== 'month' && (
        <div className={styles.sectionHeader}>
          <div className={styles.calendarControlsWrapper}>
            <div className={styles.periodSwitcher}>
              {scheduleView === 'week' && (
                <div className={styles.monthSwitcher}>
                  <button
                    className={styles.monthNavButton}
                    onClick={() => shiftWeek(-1)}
                    aria-label="Предыдущая неделя"
                    type="button"
                  >
                    <ChevronLeftIcon className={styles.monthNavIcon} />
                  </button>
                  <div key={weekLabelKey} className={styles.monthName}>
                    {weekRangeLabel}
                  </div>
                  <button
                    className={styles.monthNavButton}
                    onClick={() => shiftWeek(1)}
                    aria-label="Следующая неделя"
                    type="button"
                  >
                    <ChevronRightIcon className={styles.monthNavIcon} />
                  </button>
                </div>
              )}
              {isMobileWeekView && (
                <div className={styles.weekDayPicker}>
                  {weekDays.map((day, index) => {
                    const isSelected = format(dayViewDate, 'yyyy-MM-dd') === day.iso;
                    const isTodayCell = isSameDay(day.date, todayZoned);

                    return (
                      <button
                        key={day.iso}
                        type="button"
                        className={`${styles.weekDayButton} ${
                          isSelected ? styles.weekDayButtonActive : ''
                        } ${isTodayCell ? styles.weekDayButtonToday : ''}`}
                        onClick={() => setDayViewDate(day.date)}
                      >
                        <span className={styles.weekDayButtonName}>
                          {weekDayShortLabels[index] ?? format(day.date, 'EE', { locale: ru })}
                        </span>
                        <span className={styles.weekDayButtonDate}>{format(day.date, 'd')}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {scheduleView === 'day' && (
                <div className={styles.daySwitcherWrapper} ref={dayPickerRef}>
                  <div className={styles.monthSwitcher}>
                    <button
                      className={styles.monthNavButton}
                      onClick={() => shiftDay(-1)}
                      aria-label="Предыдущий день"
                      type="button"
                    >
                      <ChevronLeftIcon className={styles.monthNavIcon} />
                    </button>
                    <button
                      key={dayLabelKey}
                      className={`${styles.monthName} ${styles.dayLabelButton}`}
                      onClick={() => setDayPickerOpen((open) => !open)}
                      type="button"
                    >
                      {daySwitchLabel}
                    </button>
                    <button
                      className={styles.monthNavButton}
                      onClick={() => shiftDay(1)}
                      aria-label="Следующий день"
                      type="button"
                    >
                      <ChevronRightIcon className={styles.monthNavIcon} />
                    </button>
                  </div>
                  {dayPickerOpen && (
                    <div className={styles.dayPickerPopover}>
                      <div className={styles.dayPickerCard}>
                        <DayPicker
                          mode="single"
                          selected={dayViewDate}
                          weekStartsOn={WEEK_STARTS_ON as 0 | 1}
                          locale={ru}
                          onSelect={(date) => {
                            if (date) {
                              setDayViewDate(date);
                              setScheduleView('day');
                            }
                            setDayPickerOpen(false);
                          }}
                          classNames={{
                            root: styles.dayPickerSurface,
                            nav: styles.dayPickerNav,
                            nav_button: styles.dayPickerNavButton,
                            caption_label: styles.dayPickerCaption,
                            weekdays: styles.dayPickerWeekdays,
                            weekday: styles.dayPickerWeekday,
                            grid: styles.dayPickerGrid,
                            day: styles.dayPickerDay,
                            day_selected: styles.dayPickerSelected,
                            day_outside: styles.dayPickerOutside,
                            day_today: styles.dayPickerToday,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {scheduleView === 'week' && (isMobileWeekView ? renderMobileWeekView() : renderWeekGrid())}
      {scheduleView === 'month' && renderMonthView()}
      {scheduleView === 'day' && renderDayView()}

      {isMobileViewport ? (
        <button
          type="button"
          className={styles.mobileCreateFab}
          aria-label="Создать урок"
          onClick={() => {
            const defaultDayIso =
              scheduleView === 'month'
                ? effectiveSelectedMonthDay ?? format(todayZoned, 'yyyy-MM-dd')
                : format(dayViewDate, 'yyyy-MM-dd');
            openLessonModal(defaultDayIso, undefined, undefined, {
              skipNavigation: true,
              variant: 'sheet',
            });
          }}
        >
          <AddOutlinedIcon className={styles.mobileCreateFabIcon} />
        </button>
      ) : null}

      <LessonCancelDialog
        open={Boolean(cancelDialogLesson)}
        lesson={cancelDialogLesson}
        linkedStudentsById={linkedStudentsById}
        timeZone={timeZone}
        onClose={() => setCancelDialogLesson(null)}
        onConfirm={handleConfirmCancel}
      />

      <LessonRestoreDialog
        open={Boolean(restoreDialogLesson)}
        lesson={restoreDialogLesson}
        linkedStudentsById={linkedStudentsById}
        timeZone={timeZone}
        onClose={() => setRestoreDialogLesson(null)}
        onConfirm={handleConfirmRestore}
      />

      <SeriesScopeDialog
        open={Boolean(scopeDialog)}
        title={
          scopeDialog?.type === 'cancel'
            ? resolveCancelDialogCopy(scopeDialog.lesson).title
            : scopeDialog?.type === 'restore'
              ? 'Восстановить урок'
              : undefined
        }
        confirmText={
          scopeDialog?.type === 'cancel'
            ? resolveCancelDialogCopy(scopeDialog.lesson).confirmText
            : scopeDialog?.type === 'restore'
              ? 'Восстановить'
              : undefined
        }
        previews={scopeDialog?.previews}
        onClose={() => setScopeDialog(null)}
        onConfirm={handleScopeConfirm}
      />
    </section>
  );
};

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
import {
  AddOutlinedIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  HistoryOutlinedIcon,
  MeetingLinkIcon,
} from '../../icons/MaterialIcons';
import { DayPicker } from 'react-day-picker';
import { Lesson, LinkedStudent } from '../../entities/types';
import { getLessonColorVars } from '../../shared/lib/lessonColors';
import { useTimeZone } from '../../shared/lib/timezoneContext';
import { formatInTimeZone, toUtcDateFromDate, toZonedDate } from '../../shared/lib/timezoneDates';
import { Badge } from '../../shared/ui/Badge/Badge';
import { Ellipsis } from '../../shared/ui/Ellipsis/Ellipsis';
import controls from '../../shared/styles/controls.module.css';
import { useIsMobile } from '../../shared/lib/useIsMobile';
import { LessonDeleteConfirmModal } from '../students/components/LessonDeleteConfirmModal';
import { MonthDayLessonCard } from './components/MonthDayLessonCard';
import styles from './ScheduleSection.module.css';

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

interface ScheduleSectionProps {
  scheduleView: 'day' | 'week' | 'month';
  onScheduleViewChange: (view: 'day' | 'week' | 'month') => void;
  dayViewDate: Date;
  onDayShift: (delta: number) => void;
  onWeekShift: (delta: number) => void;
  onMonthShift: (delta: number) => void;
  dayLabelKey: number;
  weekLabelKey: number;
  monthLabelKey: number;
  lessons: Lesson[];
  linkedStudents: LinkedStudent[];
  monthAnchor: Date;
  monthOffset: number;
  onOpenLessonModal: (dateISO: string, time?: string, existing?: Lesson) => void;
  onStartEditLesson: (lesson: Lesson) => void;
  onTogglePaid: (lessonId: number, studentId?: number) => void;
  onDeleteLesson: (lessonId: number) => void;
  onDayViewDateChange: (date: Date) => void;
  onGoToToday: () => void;
  autoConfirmLessons: boolean;
}

export const ScheduleSection: FC<ScheduleSectionProps> = ({
  scheduleView,
  onScheduleViewChange,
  dayViewDate,
  onDayShift,
  onWeekShift,
  onMonthShift,
  dayLabelKey,
  weekLabelKey,
  monthLabelKey,
  lessons,
  linkedStudents,
  monthAnchor,
  monthOffset,
  onOpenLessonModal,
  onStartEditLesson,
  onTogglePaid,
  onDeleteLesson,
  onDayViewDateChange,
  onGoToToday,
  autoConfirmLessons,
}) => {
  const timeZone = useTimeZone();
  const todayZoned = useMemo(() => toZonedDate(new Date(), timeZone), [timeZone]);
  const [hoverIndicator, setHoverIndicator] = useState<{ dayIso: string; minutes: number } | null>(null);
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  const dayPickerRef = useRef<HTMLDivElement>(null);
  const weekScrollRef = useRef<HTMLDivElement>(null);
  const dayScrollRef = useRef<HTMLDivElement>(null);
  const isMobileViewport = useIsMobile(720);
  const [drawerMode, setDrawerMode] = useState<'half' | 'expanded'>('half');
  const [isDraggingDrawer, setIsDraggingDrawer] = useState(false);
  const [drawerDragOffset, setDrawerDragOffset] = useState(0);
  const [openLessonMenuId, setOpenLessonMenuId] = useState<number | null>(null);
  const [lessonToDelete, setLessonToDelete] = useState<Lesson | null>(null);
  const drawerPointerStart = useRef<number | null>(null);
  const drawerModeAtDragStart = useRef<'half' | 'expanded'>('half');
  const drawerDragOffsetRef = useRef(0);
  const drawerDragRafRef = useRef<number | null>(null);
  const mobileWeekKeyRef = useRef<string | null>(null);

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
  const [selectedMonthDay, setSelectedMonthDay] = useState<string | null>(null);
  const isMobileMonthView = scheduleView === 'month' && isMobileViewport;
  const isMobileWeekView = scheduleView === 'week' && isMobileViewport;

  const weekRangeLabel = useMemo(() => {
    const start = startOfWeek(dayViewDate, { weekStartsOn: WEEK_STARTS_ON as 0 | 1 });
    const end = addDays(start, 6);
    return `${format(start, 'dd.MM')} - ${format(end, 'dd.MM')}`;
  }, [dayViewDate]);

  const dayLabel = useMemo(() => format(dayViewDate, 'EE, d MMMM', { locale: ru }), [dayViewDate]);

  const monthWeekdays = useMemo(() => ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], []);
  const weekDayShortLabels = useMemo(() => ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'], []);

  const currentMonthLabel = useMemo(
    () => format(addMonths(monthAnchor, monthOffset), 'LLLL yyyy', { locale: ru }),
    [monthAnchor, monthOffset],
  );

  const defaultWeekDayIso = useMemo(() => {
    const todayIso = formatInTimeZone(new Date(), 'yyyy-MM-dd', { timeZone });
    return weekDays.find((day) => day.iso === todayIso)?.iso ?? weekDays[0]?.iso ?? todayIso;
  }, [timeZone, weekDays]);

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
    if (scheduleView === 'week' && weekScrollRef.current) {
      weekScrollRef.current.scrollTop = DEFAULT_SCROLL_TOP;
    }

    if ((scheduleView === 'day' || (scheduleView === 'week' && isMobileViewport)) && dayScrollRef.current) {
      dayScrollRef.current.scrollTop = DEFAULT_SCROLL_TOP;
    }
  }, [scheduleView, dayViewDate, isMobileViewport]);

  useEffect(() => {
    if (scheduleView !== 'month' || selectedMonthDay) return;

    const daysInMonth = buildMonthDays(selectedMonth).filter((day) => day.inMonth);
    const todayIso = formatInTimeZone(new Date(), 'yyyy-MM-dd', { timeZone });

    const defaultDay =
      daysInMonth.find((day) => day.iso === todayIso) ||
      daysInMonth.find((day) => (lessonsByDay[day.iso] ?? []).length > 0) ||
      daysInMonth[0];

    if (defaultDay) {
      onDayViewDateChange(defaultDay.date);

      if (!isMobileViewport) {
        setSelectedMonthDay(defaultDay.iso);
      }
    }
  }, [scheduleView, selectedMonth, selectedMonthDay, lessonsByDay, onDayViewDateChange, isMobileViewport, timeZone]);

  useEffect(() => {
    setOpenLessonMenuId(null);
  }, [selectedMonthDay]);

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
      onDayViewDateChange(toZonedDate(toUtcDateFromDate(targetIso, timeZone), timeZone));
    }
  }, [isMobileWeekView, dayViewDate, onDayViewDateChange, timeZone, todayZoned]);

  useEffect(() => {
    if (selectedMonthDay) {
      setDrawerMode('half');
    }
  }, [selectedMonthDay]);

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

  const buildParticipants = (lesson: Lesson) =>
    lesson.participants && lesson.participants.length > 0
      ? lesson.participants
      : [
          {
            studentId: lesson.studentId,
            isPaid: lesson.isPaid,
            student: linkedStudentsById.get(lesson.studentId),
          },
        ];

  const resolveLessonPrice = (lesson: Lesson, participants: any[]) => {
    const participant = participants[0];
    return participant?.price ?? participant?.student?.link?.pricePerLesson ?? lesson.price ?? null;
  };

  const resolveLessonPaid = (lesson: Lesson, participants: any[]) => {
    if (participants.length === 0) return !!lesson.isPaid;
    return participants.every((participant) => participant?.isPaid);
  };

  const getParticipantName = (participant: any) => {
    const linkedStudent = linkedStudentsById.get(participant?.studentId);
    return (
      linkedStudent?.link?.customName ??
      participant?.student?.username ??
      participant?.student?.name ??
      'Ученик'
    );
  };

  const getLessonLabel = (participants: any[]) => {
    const names = participants.map(getParticipantName).filter((name) => name);
    return names.length > 0 ? names.join(', ') : 'Урок';
  };

  const isAwaitingConfirmation = (lesson: Lesson) => {
    if (autoConfirmLessons) return false;
    if (lesson.status !== 'SCHEDULED') return false;
    const lessonEnd = new Date(lesson.startAt).getTime() + lesson.durationMinutes * 60_000;
    return lessonEnd < Date.now();
  };

  const renderPaymentBadges = (lessonId: number, participants: any[], isGroupLesson: boolean) => {
    const paidCount = participants.filter((participant: any) => participant.isPaid).length;
    const unpaidCount = participants.length - paidCount;

    if (isGroupLesson) {
      const badges = [] as Array<{ label: string; variant: 'groupPaid' | 'groupUnpaid' }>;
      if (paidCount > 0) badges.push({ label: `${paidCount} оплачено`, variant: 'groupPaid' });
      if (unpaidCount > 0) badges.push({ label: `${unpaidCount} не оплачено`, variant: 'groupUnpaid' });

      return badges.map((badge) => (
        <Badge key={`${badge.variant}-${badge.label}`} label={badge.label} variant={badge.variant} withDot />
      ));
    }

    const participant = participants[0];
    const isPaid = !!participant?.isPaid;

    return (
      <button
        type="button"
        className={`${styles.paymentBadge} ${isPaid ? styles.paymentBadgePaid : styles.paymentBadgeUnpaid}`}
        onClick={(event) => {
          event.stopPropagation();
          onTogglePaid(lessonId, participant?.studentId);
        }}
        title={isPaid ? 'Оплачено' : 'Не оплачено'}
      >
        <span className={styles.paymentBadgeIcon} aria-hidden="true" />
        <span
            className={`${isPaid ? styles.paymentBadgePaid : styles.paymentBadgeUnpaidText}`}
        >
          {isPaid ? 'Оплачено' : 'Не оплачено'}
        </span>
      </button>
    );
  };

  const handleOpenMeetingLink = (event: MouseEvent, meetingLink: string) => {
    event.stopPropagation();
    window.open(meetingLink, '_blank', 'noopener,noreferrer');
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
    const participants = buildParticipants(lesson);
    const isGroupLesson = participants.length > 1;
    const awaitingConfirmation = isAwaitingConfirmation(lesson);
    const startDate = toZonedDate(lesson.startAt, timeZone);
    const endDate = addMinutes(startDate, lesson.durationMinutes);
    const timeLabel = `${format(startDate, 'HH:mm')} - ${format(endDate, 'HH:mm')}`;
    const lessonLabel = getLessonLabel(participants);
    const lessonMeta = isGroupLesson ? `${participants.length} ученик${participants.length === 1 ? '' : 'а'}` : '';

    return (
      <div
        key={lesson.id}
        className={`${styles.weekLesson} ${className ?? ''} ${
          lesson.status === 'CANCELED' ? styles.canceledLesson : ''
        }`}
        style={{ ...layoutStyle, ...buildLessonColorStyle(lesson) }}
        onClick={() => onStartEditLesson(lesson)}
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
          {renderPaymentBadges(lesson.id, participants, isGroupLesson)}
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
    setSelectedMonthDay(null);
    onGoToToday();
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

    onDayViewDateChange(toZonedDate(toUtcDateFromDate(dayIso, timeZone), timeZone));
    onOpenLessonModal(dayIso, `${hoursValue}:${minutes}`);
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
            <div className={styles.dayTitle}>{format(dayViewDate, 'EEEE, d MMMM', { locale: ru })}</div>
            {!isMobileViewport && (
              <div className={styles.weekDayDate}>{format(dayViewDate, 'yyyy-MM-dd')}</div>
            )}
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


  const renderMonthView = () => {
    const days = buildMonthDays(selectedMonth);
    const monthLabel = format(selectedMonth, 'LLLL yyyy', { locale: ru });
    const selectedDayLessons = selectedMonthDay
      ? (lessonsByDay[selectedMonthDay] ?? []).slice().sort((a, b) => a.startAt.localeCompare(b.startAt))
      : [];
    const selectedDayDate = selectedMonthDay
      ? toZonedDate(toUtcDateFromDate(selectedMonthDay, timeZone), timeZone)
      : null;

    const startDrawerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isMobileMonthView || !selectedMonthDay) return;

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

    const renderDayDetails = (closeHandler: () => void) => (
      <div className={styles.dayPanelContent}>
        <div className={styles.dayPanelHeader}>
          <div>
            <div className={styles.dayPanelTitle}>
              {selectedDayDate ? format(selectedDayDate, 'd MMMM, EEEE', { locale: ru }) : 'Выберите день'}
            </div>
            {selectedDayLessons.length > 0 && (
              <div className={styles.dayPanelSubtitle}>
                {selectedDayLessons.length} занят{selectedDayLessons.length === 1 ? 'ие' : 'ия'} за день
              </div>
            )}
          </div>
          <button className={styles.closeButton} onClick={closeHandler} aria-label="Закрыть панель">
            ×
          </button>
        </div>

        {selectedDayLessons.length === 0 && <div className={styles.emptyDayState}>Создайте первый урок</div>}

        <div className={styles.dayPanelList}>
          {selectedDayLessons.map((lesson) => {
            const date = toZonedDate(lesson.startAt, timeZone);
            const participants = buildParticipants(lesson);
            const lessonLabel = getLessonLabel(participants);
            const endDate = addMinutes(date, lesson.durationMinutes);
            const isPaid = resolveLessonPaid(lesson, participants);
            const price = resolveLessonPrice(lesson, participants);

            return (
              <MonthDayLessonCard
                key={lesson.id}
                lessonId={lesson.id}
                lessonLabel={lessonLabel}
                startTime={format(date, 'HH:mm')}
                endTime={format(endDate, 'HH:mm')}
                isPaid={isPaid}
                price={price}
                meetingLink={lesson.meetingLink}
                style={buildLessonColorStyle(lesson)}
                isCanceled={lesson.status === 'CANCELED'}
                isActionsOpen={openLessonMenuId === lesson.id}
                onEdit={() => onStartEditLesson(lesson)}
                onTogglePaid={() => onTogglePaid(lesson.id, participants[0]?.studentId)}
                onOpenActions={() =>
                  setOpenLessonMenuId((prev) => (prev === lesson.id ? null : lesson.id))
                }
                onCloseActions={() => setOpenLessonMenuId(null)}
                onDelete={() => setLessonToDelete(lesson)}
                onReschedule={() => {}}
                onOpenMeetingLink={(event) => handleOpenMeetingLink(event, lesson.meetingLink as string)}
              />
            );
          })}
        </div>

        {selectedMonthDay && (
          <button
            className={`${controls.primaryButton} ${styles.panelAction}`}
            onClick={() => onOpenLessonModal(selectedMonthDay)}
          >
            Создать урок
          </button>
        )}
      </div>
    );

    const drawerStyle = {
      '--drawer-dh': `${-drawerDragOffset}px`,
      '--drawer-base-height': drawerMode === 'expanded' ? '66vh' : '50vh',
    } as CSSProperties;

    return (
      <div className={styles.monthScroller}>
        <div className={styles.monthSection}>
          <div className={styles.monthHeader}>
            <div>
              <div key={monthLabelKey} className={styles.monthTitle}>
                {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
              </div>
            </div>
          </div>

          <div className={`${styles.monthLayout} ${selectedMonthDay ? styles.panelOpen : ''}`}>
            <div className={styles.monthCalendar}>
              <div className={styles.monthGrid}>
                {monthWeekdays.map((weekday) => (
                  <div key={`${monthLabel}-${weekday}`} className={styles.monthWeekday}>
                    {weekday}
                  </div>
                ))}
                {days.map((day) => {
                  const dayLessons = lessonsByDay[day.iso] ?? [];
                  const handleDayClick = () => {
                    setSelectedMonthDay(day.iso);
                    onDayViewDateChange(day.date);
                  };
                  const isTodayCell = isSameDay(day.date, todayZoned);

                  return (
                    <div
                      key={`${monthLabel}-${day.iso}`}
                      className={`${styles.monthCell} ${day.inMonth ? '' : styles.mutedDay} ${
                        isTodayCell ? styles.todayCell : ''
                      } ${selectedMonthDay === day.iso ? styles.activeDay : ''}`}
                      onClick={handleDayClick}
                    >
                      <div className={styles.monthDateRow}>
                        <span
                          className={`${styles.monthDateNumber} ${isTodayCell ? styles.todayDateNumber : ''}`}
                        >
                          {day.date.getDate()}
                        </span>
                        {dayLessons.length > 0 && (
                          <span className={styles.lessonCountBadge}>{dayLessons.length}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={`${styles.dayPanel} ${selectedMonthDay ? styles.dayPanelOpen : ''}`}>
              {renderDayDetails(() => setSelectedMonthDay(null))}
            </div>
          </div>
        </div>

        {isMobileMonthView && (
          <>
            <div
              className={`${styles.dayDrawerScrim} ${selectedMonthDay ? styles.scrimVisible : ''}`}
              onClick={() => setSelectedMonthDay(null)}
            />
            <div
              className={`${styles.dayDrawer} ${selectedMonthDay ? styles.dayDrawerOpen : ''} ${
                drawerMode === 'expanded' ? styles.dayDrawerExpanded : ''
              } ${isDraggingDrawer ? styles.dayDrawerDragging : ''}`}
              role="dialog"
              style={drawerStyle}
            >
              <div className={styles.drawerHandleArea} onPointerDown={startDrawerDrag}>
                <span className={styles.drawerHandle} />
              </div>
              {renderDayDetails(() => setSelectedMonthDay(null))}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <section className={styles.viewGrid}>
      <div className={styles.sectionHeader}>
        <div className={styles.calendarControlsWrapper}>
          <div className={styles.viewToggleRow}>
            <button
              type="button"
              className={`${styles.viewToggleButton} ${styles.todayButton}`}
              onClick={handleGoToToday}
              aria-label="Вернуться к сегодняшней дате"
            >
              <span className={styles.viewToggleIcon}>
                <HistoryOutlinedIcon />
              </span>
            </button>
            <div
              className={styles.viewToggleGroup}
              style={{
                '--active-index':
                  scheduleView === 'month' ? 0 : scheduleView === 'week' ? 1 : 2,
              } as CSSProperties}
            >
              <span className={styles.viewToggleIndicator} aria-hidden />
              <button
                type="button"
                className={`${styles.viewToggleButton} ${scheduleView === 'month' ? styles.toggleActive : ''}`}
                onClick={() => onScheduleViewChange('month')}
                aria-label="Перейти в вид месяца"
                aria-pressed={scheduleView === 'month'}
              >
                <span className={styles.viewToggleText}>Месяц</span>
              </button>
              <button
                type="button"
                className={`${styles.viewToggleButton} ${scheduleView === 'week' ? styles.toggleActive : ''}`}
                onClick={() => onScheduleViewChange('week')}
                aria-label="Перейти в вид недели"
                aria-pressed={scheduleView === 'week'}
              >
                <span className={styles.viewToggleText}>Неделя</span>
              </button>
              <button
                type="button"
                className={`${styles.viewToggleButton} ${scheduleView === 'day' ? styles.toggleActive : ''}`}
                onClick={() => onScheduleViewChange('day')}
                aria-label="Перейти в вид дня"
                aria-pressed={scheduleView === 'day'}
              >
                <span className={styles.viewToggleText}>День</span>
              </button>
            </div>
            <button
              className={`${controls.primaryButton} ${styles.headerAction} ${styles.addLessonMobile}`}
              onClick={() => onOpenLessonModal(format(dayViewDate, 'yyyy-MM-dd'))}
              type="button"
              aria-label="Создать урок"
            >
              <AddOutlinedIcon className={styles.headerActionIcon} />
              <span className={styles.headerActionLabel}>Создать урок</span>
            </button>
          </div>

          <div className={styles.periodSwitcher}>
            {scheduleView === 'week' && (
                <div className={styles.monthSwitcher}>
                  <button
                    className={styles.monthNavButton}
                    onClick={() => onWeekShift(-1)}
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
                    onClick={() => onWeekShift(1)}
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
                      onClick={() => onDayViewDateChange(day.date)}
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
                    onClick={() => onDayShift(-1)}
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
                    onClick={() => onDayShift(1)}
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
                            onDayViewDateChange(date);
                            onScheduleViewChange('day');
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

            {scheduleView === 'month' && (
                <div className={styles.monthSwitcher}>
                  <button
                      className={styles.monthNavButton}
                      onClick={() => onMonthShift(-1)}
                      aria-label="Предыдущий месяц"
                      type="button"
                  >
                    <ChevronLeftIcon className={styles.monthNavIcon} />
                  </button>
                  <div key={monthLabelKey} className={styles.monthName}>
                    {currentMonthLabel.charAt(0).toUpperCase() + currentMonthLabel.slice(1)}
                  </div>
                  <button
                      className={styles.monthNavButton}
                      onClick={() => onMonthShift(1)}
                      aria-label="Следующий месяц"
                      type="button"
                  >
                    <ChevronRightIcon className={styles.monthNavIcon} />
                  </button>
                </div>
            )}
            <button
                className={`${controls.primaryButton} ${styles.headerAction} ${styles.addLessonComputer}`}
                onClick={() => onOpenLessonModal(format(dayViewDate, 'yyyy-MM-dd'))}
                type="button"
            >
              <AddOutlinedIcon className={styles.headerActionIcon}/>
              <span className={styles.headerActionLabel}>Создать урок</span>
            </button>
          </div>
        </div>
      </div>

      {scheduleView === 'week' && (isMobileWeekView ? renderMobileWeekView() : renderWeekGrid())}
      {scheduleView === 'month' && renderMonthView()}
      {scheduleView === 'day' && renderDayView()}
      <LessonDeleteConfirmModal
        open={Boolean(lessonToDelete)}
        lessonId={lessonToDelete?.id}
        onClose={() => setLessonToDelete(null)}
        onConfirm={() => {
          if (!lessonToDelete) return;
          onDeleteLesson(lessonToDelete.id);
          setLessonToDelete(null);
        }}
      />
    </section>
  );
};

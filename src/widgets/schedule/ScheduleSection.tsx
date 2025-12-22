import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
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
  CalendarMonthIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ViewDayIcon,
  ViewWeekIcon,
} from '../../icons/MaterialIcons';
import { DayPicker } from 'react-day-picker';
import { Lesson, LinkedStudent } from '../../entities/types';
import { Badge } from '../../shared/ui/Badge/Badge';
import controls from '../../shared/styles/controls.module.css';
import styles from './ScheduleSection.module.css';

const DAY_START_MINUTE = 0;
const DAY_END_MINUTE = 24 * 60;
const HOURS_IN_DAY = 24;
const HOUR_BLOCK_HEIGHT = 52;
const DEFAULT_SCROLL_HOUR = 9;
const DEFAULT_SCROLL_TOP = DEFAULT_SCROLL_HOUR * HOUR_BLOCK_HEIGHT;
const LAST_MINUTE = DAY_END_MINUTE - 1;
const WEEK_STARTS_ON = 1;

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
  onDayViewDateChange: (date: Date) => void;
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
  onDayViewDateChange,
}) => {
  const [hoverIndicator, setHoverIndicator] = useState<{ dayIso: string; minutes: number } | null>(null);
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  const dayPickerRef = useRef<HTMLDivElement>(null);
  const weekScrollRef = useRef<HTMLDivElement>(null);
  const dayScrollRef = useRef<HTMLDivElement>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 720 : false,
  );
  const [drawerMode, setDrawerMode] = useState<'half' | 'expanded'>('half');
  const [isDraggingDrawer, setIsDraggingDrawer] = useState(false);
  const [drawerDragOffset, setDrawerDragOffset] = useState(0);
  const drawerPointerStart = useRef<number | null>(null);
  const drawerModeAtDragStart = useRef<'half' | 'expanded'>('half');
  const drawerDragOffsetRef = useRef(0);

  const lessonsByDay = useMemo(() => {
    return lessons.reduce<Record<string, Lesson[]>>((acc, lesson) => {
      const day = lesson.startAt.slice(0, 10);
      if (!acc[day]) acc[day] = [];
      acc[day].push(lesson);
      return acc;
    }, {});
  }, [lessons]);

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

  const weekRangeLabel = useMemo(() => {
    const start = startOfWeek(dayViewDate, { weekStartsOn: WEEK_STARTS_ON as 0 | 1 });
    const end = addDays(start, 6);
    return `${format(start, 'dd.MM')} - ${format(end, 'dd.MM')}`;
  }, [dayViewDate]);

  const dayLabel = useMemo(() => format(dayViewDate, 'EE, d MMMM', { locale: ru }), [dayViewDate]);

  const monthWeekdays = useMemo(() => ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], []);

  const currentMonthLabel = useMemo(
    () => format(addMonths(monthAnchor, monthOffset), 'LLLL yyyy', { locale: ru }),
    [monthAnchor, monthOffset],
  );

  const capitalizedDayLabel = useMemo(
    () => dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1),
    [dayLabel],
  );

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

    if (scheduleView === 'day' && dayScrollRef.current) {
      dayScrollRef.current.scrollTop = DEFAULT_SCROLL_TOP;
    }
  }, [scheduleView, dayViewDate]);

  useEffect(() => {
    if (scheduleView !== 'month' || selectedMonthDay) return;

    const daysInMonth = buildMonthDays(selectedMonth).filter((day) => day.inMonth);
    const todayIso = format(new Date(), 'yyyy-MM-dd');

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
  }, [scheduleView, selectedMonth, selectedMonthDay, lessonsByDay, onDayViewDateChange, isMobileViewport]);

  useEffect(() => {
    const handleResize = () => setIsMobileViewport(window.innerWidth <= 720);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
    const start = parseISO(lesson.startAt);
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const top = Math.max(0, ((startMinutes - DAY_START_MINUTE) / 60) * HOUR_BLOCK_HEIGHT);
    const height = Math.max(36, (lesson.durationMinutes * HOUR_BLOCK_HEIGHT) / 60);
    return { top, height };
  };

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

  const buildParticipants = (lesson: Lesson) =>
    lesson.participants && lesson.participants.length > 0
      ? lesson.participants
      : [
          {
            studentId: lesson.studentId,
            isPaid: lesson.isPaid,
            student: linkedStudents.find((s) => s.id === lesson.studentId),
          },
        ];

  const renderPaymentBadges = (lessonId: number, participants: any[], isGroupLesson: boolean) => {
    const paidCount = participants.filter((participant: any) => participant.isPaid).length;
    const unpaidCount = participants.length - paidCount;

    if (isGroupLesson) {
      const badges = [] as Array<{ label: string; variant: 'groupPaid' | 'groupUnpaid' }>;
      if (paidCount > 0) badges.push({ label: `${paidCount} оплачено`, variant: 'groupPaid' });
      if (unpaidCount > 0) badges.push({ label: `${unpaidCount} не оплачено`, variant: 'groupUnpaid' });

      return (
        <div className={styles.statusBadges}>
          {badges.map((badge) => (
            <Badge key={`${badge.variant}-${badge.label}`} label={badge.label} variant={badge.variant} withDot />
          ))}
        </div>
      );
    }

    const participant = participants[0];
    const isPaid = !!participant?.isPaid;

    return (
      <div className={styles.statusBadges}>
        <Badge
          label={isPaid ? 'Оплачено' : 'Не оплачено'}
          variant={isPaid ? 'paid' : 'unpaid'}
          onClick={(event) => {
            event.stopPropagation();
            onTogglePaid(lessonId, participant?.studentId);
          }}
          title={isPaid ? 'Оплачено' : 'Не оплачено'}
        />
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

    onDayViewDateChange(new Date(dayIso));
    onOpenLessonModal(dayIso, `${hoursValue}:${minutes}`);
  };

  const renderWeekGrid = () => (
    <div className={styles.weekView}>
      <div className={styles.weekHeaderRow}>
        <div className={styles.timeColumnSpacer} />
        {weekDays.map((day) => (
          <div key={day.iso} className={`${styles.weekDayHeader} ${isToday(day.date) ? styles.todayHeader : ''}`}>
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
                .filter((lesson) => lesson.startAt.slice(0, 10) === day.iso)
                .sort((a, b) => parseISO(a.startAt).getTime() - parseISO(b.startAt).getTime());

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
                    {dayLessons.map((lesson) => {
                      const position = lessonPosition(lesson);
                      const startDate = parseISO(lesson.startAt);
                      const participants = buildParticipants(lesson);
                      const isGroupLesson = participants.length > 1;
                      const dateTimeLabel = `${format(startDate, 'dd.MM HH:mm')} · ${lesson.durationMinutes} мин${
                        isGroupLesson ? ` · ${participants.length} уч.` : ''
                      }`;
                      const lessonLabel = isGroupLesson ? 'Групповой урок' : 'Урок';

                      return (
                        <div
                          key={lesson.id}
                          className={`${styles.weekLesson} ${lesson.status === 'CANCELED' ? styles.canceledLesson : ''}`}
                          style={{ top: position.top, height: position.height }}
                          onClick={() => onStartEditLesson(lesson)}
                          onMouseEnter={() => setHoverIndicator(null)}
                        >
                          {lesson.isRecurring && <span className={styles.recurringBadge}>↻</span>}
                          <div className={styles.lessonHeader}>
                            <span className={styles.lessonLabel}>{lessonLabel}</span>
                            <span className={styles.lessonDate}>{dateTimeLabel}</span>
                          </div>
                          {renderPaymentBadges(lesson.id, participants, isGroupLesson)}
                          <div className={styles.weekLessonMeta}>
                            {isGroupLesson
                              ? `${participants.length} ученик${participants.length === 1 ? '' : 'а'}`
                              : (participants[0]?.student as any)?.link?.customName}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>

  );

  const renderDayView = () => {
    const dayIso = format(dayViewDate, 'yyyy-MM-dd');
    const dayLessons = lessons
      .filter((lesson) => lesson.startAt.slice(0, 10) === dayIso)
      .sort((a, b) => parseISO(a.startAt).getTime() - parseISO(b.startAt).getTime());

    return (
      <div className={styles.dayView}>
        <div key={dayLabelKey} className={styles.dayHeading}>
          <div className={styles.dayTitle}>{format(dayViewDate, 'EEEE, d MMMM', { locale: ru })}</div>
          <div className={styles.weekDayDate}>{format(dayViewDate, 'yyyy-MM-dd')}</div>
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
              {dayLessons.map((lesson) => {
                const position = lessonPosition(lesson);
                const participants = buildParticipants(lesson);
                const isGroupLesson = participants.length > 1;
                const date = parseISO(lesson.startAt);
                const dateTimeLabel = `${format(date, 'dd.MM HH:mm')} · ${lesson.durationMinutes} мин${
                  isGroupLesson ? ` · ${participants.length} уч.` : ''
                }`;
                const lessonLabel = isGroupLesson ? 'Групповой урок' : 'Урок';

                return (
                  <div
                    key={lesson.id}
                    className={`${styles.weekLesson} ${styles.dayLesson} ${
                      lesson.status === 'CANCELED' ? styles.canceledLesson : ''
                    }`}
                    style={{ top: position.top, height: position.height }}
                    onClick={() => onStartEditLesson(lesson)}
                    onMouseEnter={() => setHoverIndicator(null)}
                  >
                    {lesson.isRecurring && <span className={styles.recurringBadge}>↻</span>}
                    <div className={styles.lessonHeader}>
                      <span className={styles.lessonLabel}>{lessonLabel}</span>
                      <span className={styles.lessonDate}>{dateTimeLabel}</span>
                    </div>
                    {renderPaymentBadges(lesson.id, participants, isGroupLesson)}
                    <div className={styles.weekLessonMeta}>
                      {isGroupLesson
                        ? `${participants.length} ученик${participants.length === 1 ? '' : 'а'}`
                        : (participants[0]?.student as any)?.link?.customName}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };


  const renderMonthView = () => {
    const days = buildMonthDays(selectedMonth);
    const monthLabel = format(selectedMonth, 'LLLL yyyy', { locale: ru });
    const selectedDayLessons = selectedMonthDay ? lessonsByDay[selectedMonthDay] ?? [] : [];
    const selectedDayDate = selectedMonthDay ? parseISO(selectedMonthDay) : null;

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
        setDrawerDragOffset(clampedDelta);
      };

      const handleEnd = () => {
        const delta = drawerDragOffsetRef.current;

        drawerPointerStart.current = null;
        setIsDraggingDrawer(false);
        setDrawerDragOffset(0);
        drawerDragOffsetRef.current = 0;

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
            const date = parseISO(lesson.startAt);
            const participants = buildParticipants(lesson);
            const isGroupLesson = participants.length > 1;

            return (
              <div
                key={lesson.id}
                className={`${styles.monthLesson} ${lesson.status === 'CANCELED' ? styles.canceledLesson : ''}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onStartEditLesson(lesson);
                }}
              >
                {lesson.isRecurring && <span className={styles.recurringBadge}>↻</span>}
                <div className={styles.monthLessonInfo}>
                  <span className={styles.monthLessonTime}>{format(date, 'HH:mm')}</span>
                  <span className={styles.monthLessonName}>
                    {isGroupLesson
                      ? `Групповой (${participants.length})`
                      : ((participants[0]?.student as any)?.link?.customName ?? 'Урок')}
                  </span>
                </div>
                {renderPaymentBadges(lesson.id, participants, isGroupLesson)}
              </div>
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
              <div className={styles.monthSubtitle}>Нажмите на день, чтобы открыть расписание</div>
            </div>
            <div className={styles.monthLegend}>
              <span className={styles.legendDot} /> Уроки
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
                  const isTodayCell = isToday(day.date);

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
        <h2 className={styles.sectionTitle}>Расписание</h2>
        <div className={styles.calendarControlsWrapper}>
          <div className={styles.viewToggleRow}>
            <button
              type="button"
              className={`${styles.viewToggleButton} ${scheduleView === 'month' ? styles.toggleActive : ''}`}
              onClick={() => onScheduleViewChange('month')}
              aria-label="Перейти в вид месяца"
            >
              <span className={styles.viewToggleIcon}>
                <CalendarMonthIcon />
              </span>
              <span className={styles.viewToggleText}>Месяц</span>
            </button>
            <button
              type="button"
              className={`${styles.viewToggleButton} ${scheduleView === 'week' ? styles.toggleActive : ''}`}
              onClick={() => onScheduleViewChange('week')}
              aria-label="Перейти в вид недели"
            >
              <span className={styles.viewToggleIcon}>
                <ViewWeekIcon />
              </span>
              <span className={styles.viewToggleText}>Неделя</span>
            </button>
            <button
              type="button"
              className={`${styles.viewToggleButton} ${scheduleView === 'day' ? styles.toggleActive : ''}`}
              onClick={() => onScheduleViewChange('day')}
              aria-label="Перейти в вид дня"
            >
              <span className={styles.viewToggleIcon}>
                <ViewDayIcon />
              </span>
              <span className={styles.viewToggleText}>День</span>
            </button>
            <button
              className={`${controls.primaryButton} ${styles.headerAction}`}
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
                    {capitalizedDayLabel}
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
                className={`${controls.primaryButton} ${styles.headerAction}`}
                onClick={() => onOpenLessonModal(format(dayViewDate, 'yyyy-MM-dd'))}
                type="button"
            >
              <AddOutlinedIcon className={styles.headerActionIcon}/>
              <span className={styles.headerActionLabel}>Создать урок</span>
            </button>
          </div>
        </div>
      </div>

      {scheduleView === 'week' && renderWeekGrid()}
      {scheduleView === 'month' && renderMonthView()}
      {scheduleView === 'day' && renderDayView()}
    </section>
  );
};

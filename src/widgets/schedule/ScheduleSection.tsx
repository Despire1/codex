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
import { useMemo, useState, type FC, type MouseEvent } from 'react';
import { CalendarMonthIcon, CurrencyRubleIcon, ViewDayIcon, ViewWeekIcon } from '../../icons/MaterialIcons';
import { Lesson, LinkedStudent } from '../../entities/types';
import controls from '../../shared/styles/controls.module.css';
import styles from './ScheduleSection.module.css';

const DAY_START_MINUTE = 0;
const DAY_END_MINUTE = 24 * 60;
const HOURS_IN_DAY = 24;
const HOUR_BLOCK_HEIGHT = 52;
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
  onTogglePaid: (lessonId: number) => void;
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

  const weekRangeLabel = useMemo(() => {
    const start = startOfWeek(dayViewDate, { weekStartsOn: WEEK_STARTS_ON as 0 | 1 });
    const end = addDays(start, 6);
    return `${format(start, 'dd.MM')} - ${format(end, 'dd.MM')}`;
  }, [dayViewDate]);

  const dayLabel = useMemo(() => format(dayViewDate, 'EEEE, d MMMM', { locale: ru }), [dayViewDate]);

  const monthWeekdays = useMemo(() => ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], []);

  const currentMonthLabel = useMemo(
    () => format(addMonths(monthAnchor, monthOffset), 'LLLL yyyy', { locale: ru }),
    [monthAnchor, monthOffset],
  );

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

  const handleTimeHover = (event: MouseEvent<HTMLDivElement>, dayIso: string) => {
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
    if (target.closest(`.${styles.weekLesson}`) || target.closest(`.${styles.paymentBadge}`)) return;

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

      <div className={styles.weekGridScroll}>
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
                      const student = linkedStudents.find((s) => s.id === lesson.studentId);
                      const position = lessonPosition(lesson);
                      const startTime = format(parseISO(lesson.startAt), 'HH:mm');
                      return (
                        <div
                          key={lesson.id}
                          className={`${styles.weekLesson} ${lesson.status === 'CANCELED' ? styles.canceledLesson : ''}`}
                          style={{ top: position.top, height: position.height }}
                          onClick={() => onStartEditLesson(lesson)}
                          onMouseEnter={() => setHoverIndicator(null)}
                        >
                          {lesson.isRecurring && <span className={styles.recurringBadge}>↻</span>}
                          <div className={styles.weekLessonTitle}>{student?.link.customName ?? 'Урок'}</div>
                          <div className={styles.weekLessonMeta}>
                            {startTime} · {lesson.durationMinutes} мин
                          </div>
                          <button
                            className={`${styles.paymentBadge} ${lesson.isPaid ? styles.paid : styles.unpaid}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              onTogglePaid(lesson.id);
                            }}
                            aria-label={lesson.isPaid ? 'Отметить как неоплаченное' : 'Отметить как оплаченное'}
                          >
                            <CurrencyRubleIcon width={16} height={16} />
                          </button>
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
        <div className={styles.dayGridScroll}>
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
                const student = linkedStudents.find((s) => s.id === lesson.studentId);
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
                    <div className={styles.weekLessonTitle}>{student?.link.customName ?? 'Урок'}</div>
                    <div className={styles.weekLessonMeta}>
                      {format(parseISO(lesson.startAt), 'HH:mm')} · {lesson.durationMinutes} мин
                    </div>
                    <button
                      className={`${styles.paymentBadge} ${lesson.isPaid ? styles.paid : styles.unpaid}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onTogglePaid(lesson.id);
                      }}
                      aria-label={lesson.isPaid ? 'Отметить как неоплаченное' : 'Отметить как оплаченное'}
                    >
                      <CurrencyRubleIcon width={16} height={16} />
                    </button>
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

    return (
      <div className={styles.monthScroller}>
        <div className={styles.monthSection}>
          <div className={styles.monthHeader}>
            <div>
              <div key={monthLabelKey} className={styles.monthTitle}>
                {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
              </div>
              <div className={styles.monthSubtitle}>Нажмите на день, чтобы создать урок</div>
            </div>
            <div className={styles.monthLegend}>
              <span className={styles.legendDot} /> Уроки
            </div>
          </div>
          <div className={styles.monthGrid}>
            {monthWeekdays.map((weekday) => (
              <div key={`${monthLabel}-${weekday}`} className={styles.monthWeekday}>
                {weekday}
              </div>
            ))}
            {days.map((day) => {
              const dayLessons = lessonsByDay[day.iso] ?? [];
              const handleDayClick = () => {
                onDayViewDateChange(day.date);
                onOpenLessonModal(day.iso);
              };

              return (
                <div
                  key={`${monthLabel}-${day.iso}`}
                  className={`${styles.monthCell} ${day.inMonth ? '' : styles.mutedDay} ${
                    isToday(day.date) ? styles.todayCell : ''
                  }`}
                  onClick={handleDayClick}
                >
                  <div className={styles.monthDateRow}>
                    <span className={styles.monthDateNumber}>{day.date.getDate()}</span>
                    {isToday(day.date) && <span className={styles.todayPill}>Сегодня</span>}
                  </div>
                  <div className={styles.monthLessonList}>
                    {dayLessons.map((lesson) => {
                      const student = linkedStudents.find((s) => s.id === lesson.studentId);
                      const date = parseISO(lesson.startAt);
                      return (
                        <div
                          key={lesson.id}
                          className={`${styles.monthLesson} ${
                            lesson.status === 'CANCELED' ? styles.canceledLesson : ''
                          }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onStartEditLesson(lesson);
                          }}
                        >
                          {lesson.isRecurring && <span className={styles.recurringBadge}>↻</span>}
                          <div className={styles.monthLessonInfo}>
                            <span className={styles.monthLessonTime}>{format(date, 'HH:mm')}</span>
                            <span className={styles.monthLessonName}>{student?.link.customName ?? 'Урок'}</span>
                          </div>
                          <button
                            className={`${styles.paymentBadge} ${styles.compactBadge} ${
                              lesson.isPaid ? styles.paid : styles.unpaid
                            }`}
                            onClick={(event) => {
                              event.stopPropagation();
                              onTogglePaid(lesson.id);
                            }}
                            aria-label={lesson.isPaid ? 'Отметить как неоплаченное' : 'Отметить как оплаченное'}
                          >
                            <CurrencyRubleIcon width={14} height={14} />
                          </button>
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
    );
  };

  return (
    <section className={styles.viewGrid}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Расписание</h2>
        <div className={styles.calendarControlsWrapper}>
          <div className={styles.viewToggleRow}>
            <button
                className={`${styles.viewToggleButton} ${scheduleView === 'month' ? styles.toggleActive : ''}`}
                onClick={() => onScheduleViewChange('month')}
            >
            <span className={styles.viewToggleLabel}>
              <CalendarMonthIcon/> Месяц
            </span>
            </button>
            <button
                className={`${styles.viewToggleButton} ${scheduleView === 'week' ? styles.toggleActive : ''}`}
                onClick={() => onScheduleViewChange('week')}
            >
            <span className={styles.viewToggleLabel}>
              <ViewWeekIcon/> Неделя
            </span>
            </button>
            <button
                className={`${styles.viewToggleButton} ${scheduleView === 'day' ? styles.toggleActive : ''}`}
                onClick={() => onScheduleViewChange('day')}
            >
            <span className={styles.viewToggleLabel}>
              <ViewDayIcon/> День
            </span>
            </button>
          </div>

          <div className={styles.periodSwitcher}>
            {scheduleView === 'week' && (
                <div className={styles.monthSwitcher}>
                  <button className={styles.monthNavButton} onClick={() => onWeekShift(-1)}
                          aria-label="Предыдущая неделя">
                    ←
                  </button>
                  <div key={weekLabelKey} className={styles.monthName}>
                    {weekRangeLabel}
                  </div>
                  <button className={styles.monthNavButton} onClick={() => onWeekShift(1)}
                          aria-label="Следующая неделя">
                    →
                  </button>
                </div>
            )}

            {scheduleView === 'day' && (
                <div className={styles.daySwitcher}>
                  <button className={styles.monthNavButton} onClick={() => onDayShift(-1)} aria-label="Предыдущий день">
                    ←
                  </button>
                  <div key={dayLabelKey} className={styles.monthName}>
                    {dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1)}
                  </div>
                  <button className={styles.monthNavButton} onClick={() => onDayShift(1)} aria-label="Следующий день">
                    →
                  </button>
                </div>
            )}

            {scheduleView === 'month' && (
                <div className={styles.monthSwitcher}>
                  <button
                      className={styles.monthNavButton}
                      onClick={() => onMonthShift(-1)}
                      aria-label="Предыдущий месяц"
                  >
                    ←
                  </button>
                  <div key={monthLabelKey} className={styles.monthName}>
                    {currentMonthLabel.charAt(0).toUpperCase() + currentMonthLabel.slice(1)}
                  </div>
                  <button
                      className={styles.monthNavButton}
                      onClick={() => onMonthShift(1)}
                      aria-label="Следующий месяц"
                  >
                    →
                  </button>
                </div>
            )}
          </div>
          <button
              className={`${controls.primaryButton} ${styles.headerAction}`}
              onClick={() => onOpenLessonModal(format(dayViewDate, 'yyyy-MM-dd'))}
          >
            Создать урок
          </button>
        </div>
      </div>

      {scheduleView === 'week' && renderWeekGrid()}
      {scheduleView === 'month' && renderMonthView()}
      {scheduleView === 'day' && renderDayView()}
    </section>
  );
};

import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  isToday,
  isTomorrow,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import {
  CalendarMonthIcon,
  CurrencyRubleIcon,
  DashboardIcon,
  EditIcon,
  EventNoteIcon,
  PeopleIcon,
  SettingsIcon,
  ViewDayIcon,
  ViewWeekIcon,
} from '../icons/MaterialIcons';
import { Homework, Lesson, LessonStatus, LinkedStudent, Student, Teacher, TeacherStudent } from '../entities/types';
import { api } from '../shared/api/client';
import { normalizeHomework, normalizeLesson, todayISO } from '../shared/lib/normalizers';
import styles from './App.module.css';

const initialTeacher: Teacher = {
  chatId: 111222333,
  name: 'Елена',
  username: 'teacher_fox',
  defaultLessonDuration: 60,
  reminderMinutesBefore: 30,
};

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

const WEEK_START_HOUR = 8;
const WEEK_END_HOUR = 22;
const HOUR_BLOCK_HEIGHT = 52;
const WEEK_STARTS_ON = 1;

const tabs = [
  { id: 'dashboard', label: 'Главная', icon: DashboardIcon },
  { id: 'students', label: 'Ученики', icon: PeopleIcon },
  { id: 'schedule', label: 'Расписание', icon: EventNoteIcon },
  { id: 'settings', label: 'Настройки', icon: SettingsIcon },
] as const;

type TabId = (typeof tabs)[number]['id'];

export const App = () => {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [teacher, setTeacher] = useState<Teacher>(initialTeacher);
  const [students, setStudents] = useState<Student[]>([]);
  const [links, setLinks] = useState<TeacherStudent[]>([]);
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [editingLessonId, setEditingLessonId] = useState<number | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [newStudentDraft, setNewStudentDraft] = useState({ customName: '', username: '' });
  const [priceEditState, setPriceEditState] = useState<{ id: number | null; value: string }>({ id: null, value: '' });
  const [newLessonDraft, setNewLessonDraft] = useState({
    studentId: undefined as number | undefined,
    date: todayISO(),
    time: '18:00',
    durationMinutes: teacher.defaultLessonDuration,
  });
  const [newHomeworkDraft, setNewHomeworkDraft] = useState({ text: '', deadline: '' });
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [lessonModalOpen, setLessonModalOpen] = useState(false);
  const [scheduleView, setScheduleView] = useState<'day' | 'week' | 'month'>('week');
  const [monthAnchor] = useState<Date>(startOfMonth(new Date()));
  const [monthOffset, setMonthOffset] = useState(0);
  const [monthLabelKey, setMonthLabelKey] = useState(0);
  const [weekLabelKey, setWeekLabelKey] = useState(0);
  const [dayLabelKey, setDayLabelKey] = useState(0);
  const [dayViewDate, setDayViewDate] = useState<Date>(new Date());

  const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

  useEffect(() => {
    const loadInitial = async () => {
      try {
        const data = await api.bootstrap();

        setTeacher(data.teacher ?? initialTeacher);
        setStudents(data.students ?? []);
        setLinks(data.links ?? []);
        setHomeworks((data.homeworks ?? []).map(normalizeHomework));
        setLessons((data.lessons ?? []).map(normalizeLesson));

        const firstStudentId = data.students?.[0]?.id ?? null;
        setSelectedStudentId((prev) => prev ?? firstStudentId);
        setNewLessonDraft((draft) => ({
          ...draft,
          studentId: draft.studentId ?? firstStudentId ?? undefined,
          durationMinutes: data.teacher?.defaultLessonDuration ?? draft.durationMinutes,
        }));
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to bootstrap app', error);
      }
    };

    loadInitial();
  }, []);

  useEffect(() => {
    setNewLessonDraft((draft) => ({ ...draft, durationMinutes: teacher.defaultLessonDuration }));
  }, [teacher.defaultLessonDuration]);

  useEffect(() => {
    if (selectedStudentId) {
      setNewLessonDraft((draft) => ({ ...draft, studentId: selectedStudentId }));
    }
  }, [selectedStudentId]);

  const linkedStudents: LinkedStudent[] = useMemo(
    () =>
      links.map((link) => ({
        ...students.find((s) => s.id === link.studentId)!,
        link,
        homeworks: homeworks.filter((hw) => hw.studentId === link.studentId),
      })),
    [links, students, homeworks],
  );

  const selectedStudent = linkedStudents.find((s) => s.id === selectedStudentId);

  const upcomingLessons = useMemo(() => {
    return lessons
      .filter((lesson) => ['SCHEDULED'].includes(lesson.status))
      .sort((a, b) => parseISO(a.startAt).getTime() - parseISO(b.startAt).getTime())
      .slice(0, 3);
  }, [lessons]);

  const unpaidLessons = lessons.filter((lesson) => lesson.status === 'COMPLETED' && !lesson.isPaid).length;

  const handleAddStudent = async () => {
    if (!newStudentDraft.customName.trim()) return;

    try {
      const data = await api.addStudent({
        customName: newStudentDraft.customName,
        username: newStudentDraft.username || undefined,
      });

      const { student, link } = data;

      setStudents((prev) => {
        if (prev.find((s) => s.id === student.id)) return prev;
        return [...prev, student];
      });

      setLinks((prev) => {
        const exists = prev.find((l) => l.studentId === link.studentId && l.teacherId === link.teacherId);
        if (exists) {
          return prev.map((l) => (l.studentId === link.studentId && l.teacherId === link.teacherId ? link : l));
        }
        return [...prev, link];
      });

      setNewStudentDraft({ customName: '', username: '' });
      setSelectedStudentId(student.id);
      setActiveTab('students');
      setStudentModalOpen(false);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to add student', error);
    }
  };

  const toggleAutoReminder = async (studentId: number) => {
    const link = links.find((l) => l.studentId === studentId);
    if (!link) return;

    try {
      const data = await api.toggleAutoRemind(studentId, !link.autoRemindHomework);

      setLinks(links.map((l) => (l.studentId === studentId ? data.link : l)));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to toggle reminder', error);
    }
  };

  const adjustBalance = async (studentId: number, delta: number) => {
    try {
      const data = await api.adjustBalance(studentId, delta);
      setLinks(links.map((link) => (link.studentId === studentId ? data.link : link)));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to adjust balance', error);
    }
  };

  const startEditPrice = (student: Student) => {
    setPriceEditState({ id: student.id, value: String(student.pricePerLesson ?? '') });
  };

  const savePrice = async () => {
    if (!priceEditState.id) return;
    const numeric = Number(priceEditState.value);
    if (Number.isNaN(numeric) || numeric < 0) return;
    try {
      const data = await api.updatePrice(priceEditState.id, numeric);
      setStudents((prev) => prev.map((s) => (s.id === data.student.id ? data.student : s)));
      setPriceEditState({ id: null, value: '' });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to update price', error);
    }
  };

  const openLessonModal = (dateISO: string, time?: string, existing?: Lesson) => {
    setNewLessonDraft((draft) => ({
      ...draft,
      date: dateISO,
      time: time ?? draft.time,
      studentId: existing?.studentId ?? draft.studentId ?? selectedStudentId ?? undefined,
      durationMinutes: existing?.durationMinutes ?? draft.durationMinutes,
    }));
    setEditingLessonId(existing?.id ?? null);
    setLessonModalOpen(true);
    setActiveTab('schedule');
    setDayViewDate(new Date(dateISO));
  };

  const closeLessonModal = () => {
    setLessonModalOpen(false);
    setEditingLessonId(null);
  };

  const saveLesson = async () => {
    if (!newLessonDraft.studentId) return;
    const startAt = `${newLessonDraft.date}T${newLessonDraft.time}:00.000Z`;

    try {
      if (editingLessonId) {
        const data = await api.updateLesson(editingLessonId, {
          studentId: newLessonDraft.studentId,
          startAt,
          durationMinutes: Number(newLessonDraft.durationMinutes),
        });
        setLessons(lessons.map((lesson) => (lesson.id === editingLessonId ? normalizeLesson(data.lesson) : lesson)));
      } else {
        const data = await api.createLesson({
          studentId: newLessonDraft.studentId,
          startAt,
          durationMinutes: Number(newLessonDraft.durationMinutes),
        });

        setLessons([...lessons, normalizeLesson(data.lesson)]);
      }

      setLessonModalOpen(false);
      setEditingLessonId(null);
      setActiveTab('schedule');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to create lesson', error);
    }
  };

  const startEditLesson = (lesson: Lesson) => {
    const start = parseISO(lesson.startAt);
    const time = format(start, 'HH:mm');
    openLessonModal(format(start, 'yyyy-MM-dd'), time, lesson);
  };

  const markLessonCompleted = async (lessonId: number) => {
    try {
      const data = await api.markLessonCompleted(lessonId);
      setLessons(
        lessons.map((lesson) =>
          lesson.id === lessonId ? normalizeLesson({ ...lesson, ...data.lesson }) : lesson,
        ),
      );

      if (data.link) {
        setLinks(
          links.map((link) =>
            link.studentId === data.link.studentId && link.teacherId === data.link.teacherId ? data.link : link,
          ),
        );
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to complete lesson', error);
    }
  };

  const togglePaid = async (lessonId: number) => {
    try {
      const data = await api.togglePaid(lessonId);
      setLessons(lessons.map((lesson) => (lesson.id === lessonId ? normalizeLesson(data.lesson) : lesson)));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to toggle payment', error);
    }
  };

  const addHomework = async () => {
    if (!selectedStudentId || !newHomeworkDraft.text.trim()) return;

    try {
      const data = await api.createHomework({
        studentId: selectedStudentId,
        text: newHomeworkDraft.text,
        deadline: newHomeworkDraft.deadline || undefined,
      });

      setHomeworks([...homeworks, normalizeHomework(data.homework)]);
      setNewHomeworkDraft({ text: '', deadline: '' });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to add homework', error);
    }
  };

  const toggleHomeworkDone = async (homeworkId: number) => {
    try {
      const data = await api.toggleHomework(homeworkId);
      setHomeworks(homeworks.map((hw) => (hw.id === homeworkId ? normalizeHomework(data.homework) : hw)));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to toggle homework', error);
    }
  };

  const remindHomework = async (studentId: number) => {
    try {
      await api.remindHomework(studentId);
      alert('Напоминание отправлено ученику #' + studentId);
    } catch (error) {
      alert('Не удалось отправить напоминание');
      // eslint-disable-next-line no-console
      console.error('Failed to send reminder', error);
    }
  };

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

  const hours = useMemo(
    () => Array.from({ length: WEEK_END_HOUR - WEEK_START_HOUR + 1 }, (_, i) => WEEK_START_HOUR + i),
    [],
  );

  const dayHeight = useMemo(() => (WEEK_END_HOUR - WEEK_START_HOUR) * HOUR_BLOCK_HEIGHT, []);

  const selectedMonth = useMemo(() => addMonths(monthAnchor, monthOffset), [monthAnchor, monthOffset]);

  const weekRangeLabel = useMemo(() => {
    const start = startOfWeek(dayViewDate, { weekStartsOn: WEEK_STARTS_ON as 0 | 1 });
    const end = addDays(start, 6);
    return `${format(start, 'dd.MM')} - ${format(end, 'dd.MM')}`;
  }, [dayViewDate]);

  const dayLabel = useMemo(() => capitalize(format(dayViewDate, 'EEEE, d MMMM', { locale: ru })), [dayViewDate]);

  const monthWeekdays = useMemo(() => ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], []);

  const currentMonthLabel = useMemo(
    () => capitalize(format(addMonths(monthAnchor, monthOffset), 'LLLL yyyy', { locale: ru })),
    [monthAnchor, monthOffset],
  );

  const handleMonthShift = (delta: number) => {
    setMonthOffset((prev) => {
      const next = prev + delta;
      const targetMonth = addMonths(monthAnchor, next);
      if (scheduleView === 'month') {
        setDayViewDate((current) => {
          const day = Math.min(current.getDate(), endOfMonth(targetMonth).getDate());
          return new Date(targetMonth.getFullYear(), targetMonth.getMonth(), day);
        });
      }
      return next;
    });
    setMonthLabelKey((key) => key + 1);
  };

  const handleWeekShift = (delta: number) => {
    setDayViewDate((prev) => addDays(prev, delta * 7));
    setWeekLabelKey((key) => key + 1);
  };

  const handleDayShift = (delta: number) => {
    setDayViewDate((prev) => addDays(prev, delta));
    setDayLabelKey((key) => key + 1);
  };

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

  const renderLessonRow = (lesson: Lesson) => {
    const student = linkedStudents.find((s) => s.id === lesson.studentId);
    const date = parseISO(lesson.startAt);
    const label = isToday(date)
      ? 'Сегодня'
      : isTomorrow(date)
      ? 'Завтра'
      : format(date, 'd MMM', { locale: ru });

    return (
      <div key={lesson.id} className={styles.lessonRow}>
        <div>
          <div className={styles.lessonTime}>{label}</div>
          <div className={styles.lessonTitle}>
            {student?.link.customName || 'Ученик'} • {format(date, 'HH:mm')} ({lesson.durationMinutes} мин)
          </div>
          <div className={styles.lessonMeta}>
            {lesson.status === 'SCHEDULED' ? 'Запланировано' : lesson.status === 'COMPLETED' ? 'Завершено' : 'Отменено'} ·{' '}
            {lesson.isPaid ? 'Оплачено' : 'Не оплачено'}
          </div>
        </div>
        <div className={styles.lessonActions}>
          {lesson.status !== 'COMPLETED' && (
            <button className={styles.smallButton} onClick={() => markLessonCompleted(lesson.id)}>
              Завершить
            </button>
          )}
          <button className={styles.smallButton} onClick={() => togglePaid(lesson.id)}>
            {lesson.isPaid ? 'Не опл.' : 'Оплачено'}
          </button>
        </div>
      </div>
    );
  };

  const renderWeekGrid = () => {
    const lessonPosition = (lesson: Lesson) => {
      const start = parseISO(lesson.startAt);
      const startMinutes = start.getHours() * 60 + start.getMinutes();
      const baseMinutes = WEEK_START_HOUR * 60;
      const top = Math.max(0, (startMinutes - baseMinutes) * (HOUR_BLOCK_HEIGHT / 60));
      const height = Math.max(36, (lesson.durationMinutes * HOUR_BLOCK_HEIGHT) / 60);
      return { top, height };
    };

    const handleWeekSlotClick = (dayIso: string) => (event: MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (target.closest(`.${styles.weekLesson}`) || target.closest(`.${styles.paymentBadge}`)) return;

      const container = event.currentTarget;
      const rect = container.getBoundingClientRect();
      const offsetY = event.clientY - rect.top + container.scrollTop;
      const minutesFromStart = WEEK_START_HOUR * 60 + (offsetY / HOUR_BLOCK_HEIGHT) * 60;
      const clampedMinutes = Math.min(Math.max(minutesFromStart, WEEK_START_HOUR * 60), WEEK_END_HOUR * 60);
      const roundedMinutes = Math.round(clampedMinutes / 30) * 30;
      const hours = Math.floor(roundedMinutes / 60)
        .toString()
        .padStart(2, '0');
      const minutes = (roundedMinutes % 60).toString().padStart(2, '0');

      setDayViewDate(new Date(dayIso));
      openLessonModal(dayIso, `${hours}:${minutes}`);
    };

    return (
      <div className={styles.weekView}>
        <div className={styles.weekHeaderRow}>
          <div className={styles.timeColumnSpacer} />
          {weekDays.map((day) => (
            <div key={day.iso} className={`${styles.weekDayHeader} ${isToday(day.date) ? styles.todayHeader : ''}`}>
              <div className={styles.weekDayName}>{capitalize(format(day.date, 'EEEE', { locale: ru }))}</div>
              <div className={styles.weekDayDate}>{format(day.date, 'd MMM', { locale: ru })}</div>
            </div>
          ))}
        </div>

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
                <div key={day.iso} className={styles.weekDayColumn}>
                  <div
                    className={styles.weekDayBody}
                    style={{ height: dayHeight }}
                    onClick={handleWeekSlotClick(day.iso)}
                  >
                    {dayLessons.map((lesson) => {
                      const student = linkedStudents.find((s) => s.id === lesson.studentId);
                      const date = parseISO(lesson.startAt);
                      const { top, height } = lessonPosition(lesson);

                      return (
                        <div
                          key={lesson.id}
                          className={`${styles.weekLesson} ${lesson.status === 'CANCELED' ? styles.canceledLesson : ''}`}
                          style={{ top, height }}
                          onClick={() => startEditLesson(lesson)}
                        >
                          <div className={styles.weekLessonTitle}>{student?.link.customName ?? 'Урок'}</div>
                          <div className={styles.weekLessonMeta}>
                            {format(date, 'HH:mm')} • {lesson.durationMinutes} мин
                          </div>
                          <button
                            className={`${styles.paymentBadge} ${lesson.isPaid ? styles.paid : styles.unpaid}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              togglePaid(lesson.id);
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
    );
  };

  const renderDayView = () => {
    const dayIso = format(dayViewDate, 'yyyy-MM-dd');
    const dayLessons = (lessonsByDay[dayIso] ?? []).sort(
      (a, b) => parseISO(a.startAt).getTime() - parseISO(b.startAt).getTime(),
    );

    const handleDaySlotClick = (event: MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (target.closest(`.${styles.weekLesson}`) || target.closest(`.${styles.paymentBadge}`)) return;

      const container = event.currentTarget;
      const rect = container.getBoundingClientRect();
      const offsetY = event.clientY - rect.top + container.scrollTop;
      const minutesFromStart = WEEK_START_HOUR * 60 + (offsetY / HOUR_BLOCK_HEIGHT) * 60;
      const clampedMinutes = Math.min(Math.max(minutesFromStart, WEEK_START_HOUR * 60), WEEK_END_HOUR * 60);
      const roundedMinutes = Math.round(clampedMinutes / 30) * 30;
      const hours = Math.floor(roundedMinutes / 60)
        .toString()
        .padStart(2, '0');
      const minutes = (roundedMinutes % 60).toString().padStart(2, '0');

      openLessonModal(dayIso, `${hours}:${minutes}`);
    };

    const lessonPosition = (lesson: Lesson) => {
      const start = parseISO(lesson.startAt);
      const startMinutes = start.getHours() * 60 + start.getMinutes();
      const baseMinutes = WEEK_START_HOUR * 60;
      const top = Math.max(0, (startMinutes - baseMinutes) * (HOUR_BLOCK_HEIGHT / 60));
      const height = Math.max(36, (lesson.durationMinutes * HOUR_BLOCK_HEIGHT) / 60);
      return { top, height };
    };

    return (
      <div className={styles.dayView}>
        <div className={styles.dayHeading}>
          <div key={dayLabelKey} className={styles.dayTitle}>
            {dayLabel}
          </div>
          <div className={styles.muted}>Тапните по пустой ячейке, чтобы быстро создать урок</div>
        </div>
        <div className={styles.dayGrid}>
          <div className={styles.timeColumn}>
            {hours.map((hour) => (
              <div key={hour} className={styles.timeSlot} style={{ height: HOUR_BLOCK_HEIGHT }}>
                {hour}:00
              </div>
            ))}
          </div>
          <div className={styles.dayColumn} onClick={handleDaySlotClick} style={{ height: dayHeight }}>
            {dayLessons.map((lesson) => {
              const student = linkedStudents.find((s) => s.id === lesson.studentId);
              const date = parseISO(lesson.startAt);
              const { top, height } = lessonPosition(lesson);
              return (
                <div
                  key={lesson.id}
                  className={`${styles.weekLesson} ${styles.dayLesson} ${
                    lesson.status === 'CANCELED' ? styles.canceledLesson : ''
                  }`}
                  style={{ top, height }}
                  onClick={() => startEditLesson(lesson)}
                >
                  <div className={styles.weekLessonTitle}>{student?.link.customName ?? 'Урок'}</div>
                  <div className={styles.weekLessonMeta}>{format(date, 'HH:mm')} • {lesson.durationMinutes} мин</div>
                  <button
                    className={`${styles.paymentBadge} ${lesson.isPaid ? styles.paid : styles.unpaid}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      togglePaid(lesson.id);
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
    );
  };

  const renderMonthView = () => {
    const days = buildMonthDays(selectedMonth);
    const monthLabel = capitalize(format(selectedMonth, 'LLLL yyyy', { locale: ru }));

    return (
      <div className={styles.monthScroller}>
        <section key={monthLabel} className={styles.monthSection}>
          <div className={styles.monthHeader}>
            <div className={styles.monthTitle}>{monthLabel}</div>
            <div className={styles.monthSubtitle}>Текущий выбранный месяц</div>
          </div>
          <div className={styles.monthGrid}>
            {monthWeekdays.map((weekday) => (
              <div key={weekday} className={styles.monthWeekday}>
                {weekday}
              </div>
            ))}

            {days.map((day) => {
              const dayLessons = lessonsByDay[day.iso] ?? [];
              const handleDayClick = (event: MouseEvent<HTMLDivElement>) => {
                const target = event.target as HTMLElement;
                if (target.closest(`.${styles.monthLesson}`) || target.closest(`.${styles.paymentBadge}`)) return;
                setDayViewDate(day.date);
                openLessonModal(day.iso, '12:00');
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
                          onClick={() => startEditLesson(lesson)}
                        >
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
                              togglePaid(lesson.id);
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
        </section>
      </div>
    );
  };

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.topbarGreeting}>
          <div className={styles.subtitle}>Здравствуйте, {teacher.name}</div>
          <h1 className={styles.title}>TeacherBot Web</h1>
        </div>

        <div className={styles.topbarNav}>
          <nav className={styles.topNav}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`${styles.topNavButton} ${activeTab === tab.id ? styles.topNavActive : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className={styles.tabIcon} aria-hidden>
                  <tab.icon />
                </span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className={styles.quickActions}>
          <button
            className={styles.primaryButton}
            onClick={() => {
              setActiveTab('students');
              setStudentModalOpen(true);
            }}
          >
            + Ученик
          </button>
          <button
            className={styles.primaryGhost}
            onClick={() => {
              setActiveTab('schedule');
              setLessonModalOpen(true);
            }}
          >
            + Урок
          </button>
        </div>
      </header>

      <main className={styles.content}>
        {activeTab === 'dashboard' && (
          <section className={styles.grid}>
            <div className={styles.card}> 
              <div className={styles.cardHeader}>Ближайшие уроки</div>
              {upcomingLessons.length === 0 && <p className={styles.muted}>Нет запланированных уроков</p>}
              {upcomingLessons.map((lesson) => renderLessonRow(lesson))}
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>Быстрые действия</div>
              <div className={styles.actionsRow}>
                <button
                  className={styles.secondaryButton}
                  onClick={() => {
                    setActiveTab('students');
                    setStudentModalOpen(true);
                  }}
                >
                  Добавить ученика
                </button>
                <button
                  className={styles.secondaryButton}
                  onClick={() => {
                    setActiveTab('schedule');
                    setLessonModalOpen(true);
                  }}
                >
                  Создать урок
                </button>
                <button className={styles.secondaryButton} onClick={() => selectedStudentId && remindHomework(selectedStudentId)}>
                  Напомнить о ДЗ
                </button>
              </div>
              <div className={styles.statsRow}>
                <div className={styles.statCard}>
                  <div className={styles.statValue}>{linkedStudents.length}</div>
                  <div className={styles.statLabel}>Ученики</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statValue}>{unpaidLessons}</div>
                  <div className={styles.statLabel}>Неоплачено</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statValue}>{homeworks.filter((hw) => !hw.isDone).length}</div>
                  <div className={styles.statLabel}>Домашки</div>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'students' && (
          <section className={styles.card}>
            <div className={styles.sectionHeader}>
              <h2>Ученики</h2>
              <span className={styles.muted}>Связка Teacher ↔ Student</span>
              <button className={styles.secondaryButton} onClick={() => setStudentModalOpen(true)}>
                + Добавить ученика
              </button>
            </div>
            <div className={styles.studentList}>
              {linkedStudents.map((student) => (
                <button
                  key={student.id}
                  className={`${styles.studentCard} ${selectedStudentId === student.id ? styles.activeStudent : ''}`}
                  onClick={() => setSelectedStudentId(student.id)}
                >
                  <div className={styles.studentName}>{student.link.customName}</div>
                  <div className={styles.studentMeta}>
                    @{student.username || '—'} · Баланс: {student.link.balanceLessons} · Автонапоминания:{' '}
                    {student.link.autoRemindHomework ? 'вкл' : 'выкл'}
                  </div>
                </button>
              ))}
            </div>

            {selectedStudent && (
              <div className={styles.profile}>
                <div className={styles.profileHeader}>
                  <div>
                    <div className={styles.profileName}>{selectedStudent.link.customName}</div>
                    <div className={styles.studentMeta}>Telegram: @{selectedStudent.username || 'нет'}</div>
                  </div>
                  <button className={styles.secondaryButton} onClick={() => remindHomework(selectedStudent.id)}>
                    Напомнить о ДЗ
                  </button>
                </div>
                <div className={styles.toggleRow}>
                  <span>Автоматически напоминать о ДЗ</span>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={selectedStudent.link.autoRemindHomework}
                      onChange={() => toggleAutoReminder(selectedStudent.id)}
                    />
                    <span className={styles.slider} />
                  </label>
                </div>
                <div className={styles.priceRow}>
                  <div className={styles.priceLabel}>Цена за занятие</div>
                  {priceEditState.id === selectedStudent.id ? (
                    <div className={styles.priceEditor}>
                      <input
                        className={styles.input}
                        type="number"
                        value={priceEditState.value}
                        onChange={(e) => setPriceEditState({ ...priceEditState, value: e.target.value })}
                      />
                      <div className={styles.priceButtons}>
                        <button className={styles.primaryButton} onClick={savePrice}>
                          Сохранить
                        </button>
                        <button
                          className={styles.secondaryButton}
                          onClick={() => setPriceEditState({ id: null, value: '' })}
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.priceValueRow}>
                      <span className={styles.priceValue}>
                        {selectedStudent.pricePerLesson && selectedStudent.pricePerLesson > 0
                          ? `${selectedStudent.pricePerLesson} ₽`
                          : '—'}
                      </span>
                      <button
                        className={styles.iconButton}
                        aria-label="Изменить цену"
                        onClick={() => startEditPrice(selectedStudent)}
                      >
                        <EditIcon width={18} height={18} />
                      </button>
                    </div>
                  )}
                </div>
                <div className={styles.balanceRow}>
                  <span>Предоплаченные уроки: {selectedStudent.link.balanceLessons}</span>
                  <div className={styles.balanceActions}>
                    <button className={styles.smallButton} onClick={() => adjustBalance(selectedStudent.id, 1)}>
                      +1
                    </button>
                    <button className={styles.smallButton} onClick={() => adjustBalance(selectedStudent.id, -1)}>
                      -1
                    </button>
                  </div>
                </div>

                <div className={styles.homeworkBlock}>
                  <div className={styles.sectionHeader}>
                    <h3>Домашние задания</h3>
                    <span className={styles.muted}>Статус и дедлайны</span>
                  </div>
                  <div className={styles.homeworkList}>
                    {selectedStudent.homeworks.map((hw) => (
                      <div key={hw.id} className={styles.homeworkItem}>
                        <div>
                          <div className={styles.homeworkText}>{hw.text}</div>
                          <div className={styles.homeworkMeta}>
                            {hw.deadline ? `Дедлайн: ${format(parseISO(hw.deadline + 'T00:00:00.000Z'), 'd MMM')}` : 'Без срока'} ·{' '}
                            {hw.isDone ? 'Сделано' : 'Не сделано'}
                          </div>
                        </div>
                        <button className={styles.smallButton} onClick={() => toggleHomeworkDone(hw.id)}>
                          {hw.isDone ? 'Вернуть' : 'Готово'}
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className={styles.formRow}>
                    <input
                      className={styles.input}
                      placeholder="Новое задание"
                      value={newHomeworkDraft.text}
                      onChange={(e) => setNewHomeworkDraft({ ...newHomeworkDraft, text: e.target.value })}
                    />
                    <input
                      className={styles.input}
                      type="date"
                      value={newHomeworkDraft.deadline}
                      onChange={(e) => setNewHomeworkDraft({ ...newHomeworkDraft, deadline: e.target.value })}
                    />
                    <button className={styles.primaryButton} onClick={addHomework}>
                      Добавить
                    </button>
                  </div>
                </div>
              </div>
            )}

          </section>
        )}

        {activeTab === 'schedule' && (
          <section className={styles.card}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleRow}>
                <div>
                  <h2>Расписание</h2>
                  <span className={styles.muted}>Создание, завершение и оплата</span>
                </div>

                <div className={styles.periodSwitcherInline}>
                  {scheduleView === 'month' && (
                    <div className={styles.monthSwitcher}>
                      <button className={styles.monthNavButton} onClick={() => handleMonthShift(-1)} aria-label="Предыдущий месяц">
                        &lt;
                      </button>
                      <div key={monthLabelKey} className={styles.monthName}>
                        {currentMonthLabel}
                      </div>
                      <button className={styles.monthNavButton} onClick={() => handleMonthShift(1)} aria-label="Следующий месяц">
                        &gt;
                      </button>
                    </div>
                  )}

                  {scheduleView === 'week' && (
                    <div className={styles.monthSwitcher}>
                      <button className={styles.monthNavButton} onClick={() => handleWeekShift(-1)} aria-label="Предыдущая неделя">
                        &lt;
                      </button>
                      <div key={weekLabelKey} className={styles.monthName}>
                        {weekRangeLabel}
                      </div>
                      <button className={styles.monthNavButton} onClick={() => handleWeekShift(1)} aria-label="Следующая неделя">
                        &gt;
                      </button>
                    </div>
                  )}

                  {scheduleView === 'day' && (
                    <div className={styles.daySwitcher}>
                      <div className={styles.monthSwitcher}>
                        <button className={styles.monthNavButton} onClick={() => handleDayShift(-1)} aria-label="Предыдущий день">
                          &lt;
                        </button>
                        <div key={dayLabelKey} className={styles.monthName}>
                          {dayLabel}
                        </div>
                        <button className={styles.monthNavButton} onClick={() => handleDayShift(1)} aria-label="Следующий день">
                          &gt;
                        </button>
                      </div>
                      <input
                        className={styles.dateInput}
                        type="date"
                        value={format(dayViewDate, 'yyyy-MM-dd')}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value) setDayViewDate(new Date(`${value}T00:00:00`));
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.calendarToolbar}>
                <div className={styles.viewToggleRow}>
                  <button
                    className={`${styles.viewToggleButton} ${scheduleView === 'month' ? styles.toggleActive : ''}`}
                    onClick={() => setScheduleView('month')}
                  >
                    <CalendarMonthIcon width={20} height={20} />
                    <span className={styles.viewToggleLabel}>Месяц</span>
                  </button>
                  <button
                    className={`${styles.viewToggleButton} ${scheduleView === 'week' ? styles.toggleActive : ''}`}
                    onClick={() => setScheduleView('week')}
                  >
                    <ViewWeekIcon width={20} height={20} />
                    <span className={styles.viewToggleLabel}>Неделя</span>
                  </button>
                  <button
                    className={`${styles.viewToggleButton} ${scheduleView === 'day' ? styles.toggleActive : ''}`}
                    onClick={() => setScheduleView('day')}
                  >
                    <ViewDayIcon width={20} height={20} />
                    <span className={styles.viewToggleLabel}>День</span>
                  </button>
                </div>

                <div className={styles.calendarActions}>
                  <button
                    className={`${styles.secondaryButton} ${styles.calendarCreateButton}`}
                    onClick={() => {
                      setEditingLessonId(null);
                      openLessonModal(todayISO(), newLessonDraft.time);
                    }}
                  >
                    + Создать урок
                  </button>
                </div>
              </div>
            </div>

            {scheduleView === 'week' && renderWeekGrid()}

            {scheduleView === 'month' && renderMonthView()}

            {scheduleView === 'day' && renderDayView()}

          </section>
        )}

        {activeTab === 'settings' && (
          <section className={styles.card}>
            <div className={styles.sectionHeader}>
              <h2>Профиль и настройки</h2>
              <span className={styles.muted}>Email/пароль + Telegram chatId</span>
            </div>
            <div className={styles.settingsGrid}>
              <div>
                <div className={styles.label}>Имя</div>
                <div className={styles.settingValue}>{teacher.name}</div>
              </div>
              <div>
                <div className={styles.label}>Telegram</div>
                <div className={styles.settingValue}>@{teacher.username}</div>
              </div>
              <div>
                <div className={styles.label}>Chat ID</div>
                <div className={styles.settingValue}>{teacher.chatId}</div>
              </div>
              <div>
                <div className={styles.label}>Длительность урока по умолчанию</div>
                <input
                  className={styles.input}
                  type="number"
                  value={teacher.defaultLessonDuration}
                  onChange={(e) => setTeacher({ ...teacher, defaultLessonDuration: Number(e.target.value) })}
                />
              </div>
              <div>
                <div className={styles.label}>Напоминать за (мин)</div>
                <input
                  className={styles.input}
                  type="number"
                  value={teacher.reminderMinutesBefore}
                  onChange={(e) => setTeacher({ ...teacher, reminderMinutesBefore: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className={styles.helperBox}>
              Telegram-бот и сайт используют единую базу. Авторизация учителя хранится в таблице TeacherAuth, а все данные,
              связанные с учениками и уроками, проверяются по teacherId.
            </div>
          </section>
        )}
      </main>

      <nav className={styles.tabbar}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className={styles.tabIcon} aria-hidden>
              <tab.icon />
            </span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {studentModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setStudentModalOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.modalLabel}>Добавление ученика</div>
                <div className={styles.modalTitle}>Создать связь Teacher ↔ Student</div>
              </div>
              <button className={styles.closeButton} onClick={() => setStudentModalOpen(false)} aria-label="Закрыть модалку">
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.formRow}>
                <input
                  className={styles.input}
                  placeholder="Имя ученика"
                  value={newStudentDraft.customName}
                  onChange={(e) => setNewStudentDraft({ ...newStudentDraft, customName: e.target.value })}
                />
                <input
                  className={styles.input}
                  placeholder="Telegram username (опционально)"
                  value={newStudentDraft.username}
                  onChange={(e) => setNewStudentDraft({ ...newStudentDraft, username: e.target.value })}
                />
              </div>
            </div>
            <div className={styles.modalActions}>
              <button className={styles.secondaryButton} onClick={() => setStudentModalOpen(false)}>
                Отмена
              </button>
              <button className={styles.primaryButton} onClick={handleAddStudent}>
                Сохранить ученика
              </button>
            </div>
          </div>
        </div>
      )}

      {lessonModalOpen && (
        <div className={styles.modalOverlay} onClick={closeLessonModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.modalLabel}>{editingLessonId ? 'Редактирование урока' : 'Новый урок'}</div>
                <div className={styles.modalTitle}>По умолчанию {teacher.defaultLessonDuration} мин</div>
              </div>
              <button className={styles.closeButton} onClick={closeLessonModal} aria-label="Закрыть модалку">
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.formRow}>
                <select
                  className={styles.input}
                  value={newLessonDraft.studentId ?? ''}
                  onChange={(e) => setNewLessonDraft({ ...newLessonDraft, studentId: Number(e.target.value) })}
                >
                  {linkedStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.link.customName}
                    </option>
                  ))}
                </select>
                <input
                  className={styles.input}
                  type="date"
                  value={newLessonDraft.date}
                  onChange={(e) => setNewLessonDraft({ ...newLessonDraft, date: e.target.value })}
                />
                <input
                  className={styles.input}
                  type="time"
                  value={newLessonDraft.time}
                  onChange={(e) => setNewLessonDraft({ ...newLessonDraft, time: e.target.value })}
                />
                <input
                  className={styles.input}
                  type="number"
                  min={30}
                  value={newLessonDraft.durationMinutes}
                  onChange={(e) => setNewLessonDraft({ ...newLessonDraft, durationMinutes: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className={styles.modalActions}>
              <button className={styles.secondaryButton} onClick={() => setLessonModalOpen(false)}>
                Отмена
              </button>
              <button className={styles.primaryButton} onClick={saveLesson}>
                {editingLessonId ? 'Сохранить изменения' : 'Создать урок'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

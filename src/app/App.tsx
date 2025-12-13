import { addDays, addMonths, addYears, endOfMonth, format, parseISO, startOfMonth } from 'date-fns';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Homework, HomeworkStatus, Lesson, LinkedStudent, Student, Teacher, TeacherStudent } from '../entities/types';
import { api } from '../shared/api/client';
import { normalizeHomework, normalizeLesson, todayISO } from '../shared/lib/normalizers';
import { DialogModal } from '../shared/ui/Modal/DialogModal';
import { Modal } from '../shared/ui/Modal/Modal';
import modalStyles from '../shared/ui/Modal/Modal.module.css';
import controls from '../shared/styles/controls.module.css';
import layoutStyles from './styles/layout.module.css';
import { Topbar } from '../widgets/layout/Topbar';
import { Tabbar } from '../widgets/layout/Tabbar';
import { DashboardSection } from '../widgets/dashboard/DashboardSection';
import { StudentsSection } from '../widgets/students/StudentsSection';
import { ScheduleSection } from '../widgets/schedule/ScheduleSection';
import { SettingsSection } from '../widgets/settings/SettingsSection';
import { StudentModal } from '../features/modals/StudentModal/StudentModal';
import { LessonModal } from '../features/modals/LessonModal/LessonModal';
import { tabIdByPath, tabPathById, tabs, type TabId } from './tabs';

const initialTeacher: Teacher = {
  chatId: 111222333,
  name: 'Елена',
  username: 'teacher_fox',
  defaultLessonDuration: 60,
  reminderMinutesBefore: 30,
};

const LAST_VISITED_ROUTE_KEY = 'calendar_last_route';
type TabPath = (typeof tabs)[number]['path'];

export const App = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [teacher, setTeacher] = useState<Teacher>(initialTeacher);
  const [students, setStudents] = useState<Student[]>([]);
  const [links, setLinks] = useState<TeacherStudent[]>([]);
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [editingLessonId, setEditingLessonId] = useState<number | null>(null);
  const [editingLessonOriginal, setEditingLessonOriginal] = useState<Lesson | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [newStudentDraft, setNewStudentDraft] = useState({ customName: '', username: '' });
  const [priceEditState, setPriceEditState] = useState<{ id: number | null; value: string }>({ id: null, value: '' });
  const [newLessonDraft, setNewLessonDraft] = useState({
    studentId: undefined as number | undefined,
    studentIds: [] as number[],
    date: todayISO(),
    time: '18:00',
    durationMinutes: teacher.defaultLessonDuration,
    isRecurring: false,
    repeatWeekdays: [] as number[],
    repeatUntil: undefined as string | undefined,
  });
  const [newHomeworkDraft, setNewHomeworkDraft] = useState({
    text: '',
    deadline: '',
    status: 'IN_PROGRESS' as HomeworkStatus,
    sendToTelegram: true,
    remindBefore: true,
  });
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [lessonModalOpen, setLessonModalOpen] = useState(false);
  const [scheduleView, setScheduleView] = useState<'day' | 'week' | 'month'>('month');
  const [monthAnchor] = useState<Date>(startOfMonth(new Date()));
  const [monthOffset, setMonthOffset] = useState(0);
  const [monthLabelKey, setMonthLabelKey] = useState(0);
  const [weekLabelKey, setWeekLabelKey] = useState(0);
  const [dayLabelKey, setDayLabelKey] = useState(0);
  const [dayViewDate, setDayViewDate] = useState<Date>(new Date());
  const [dialogState, setDialogState] = useState<
    | {
        type: 'info';
        title: string;
        message: string;
        confirmText?: string;
      }
    | {
        type: 'confirm';
        title: string;
        message: string;
        confirmText?: string;
        cancelText?: string;
        onConfirm: () => void;
        onCancel: () => void;
      }
    | {
        type: 'recurring-delete';
        title: string;
        message: string;
        applyToSeries: boolean;
        onConfirm: (applyToSeries: boolean) => void;
        onCancel: () => void;
      }
    | null
  >(null);

  const closeDialog = () => setDialogState(null);

  const showInfoDialog = (title: string, message: string, confirmText?: string) =>
    setDialogState({ type: 'info', title, message, confirmText });

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

  const knownPaths = useMemo(() => new Set<TabPath>(tabs.map((tab) => tab.path)), []);

  const activeTab = useMemo<TabId>(() => tabIdByPath[location.pathname] ?? 'dashboard', [location.pathname]);

  const resolveLastVisitedPath = useCallback(() => {
    const stored = localStorage.getItem(LAST_VISITED_ROUTE_KEY) as TabPath | null;
    if (stored && knownPaths.has(stored)) {
      return stored;
    }
    return tabPathById.dashboard;
  }, [knownPaths]);

  useEffect(() => {
    const currentPath = location.pathname as TabPath;
    if (knownPaths.has(currentPath)) {
      localStorage.setItem(LAST_VISITED_ROUTE_KEY, currentPath);
    }
  }, [knownPaths, location.pathname]);

  const linkedStudents: LinkedStudent[] = useMemo(
    () =>
      links.map((link) => ({
        ...students.find((s) => s.id === link.studentId)!,
        link,
        homeworks: homeworks.filter((hw) => hw.studentId === link.studentId),
      })),
    [links, students, homeworks],
  );
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
        navigate(tabPathById.students);
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
    const startDate = existing ? parseISO(existing.startAt) : undefined;
    const derivedDay = startDate ? startDate.getUTCDay() : undefined;
    const recurrenceWeekdays = existing?.recurrenceWeekdays && existing.recurrenceWeekdays.length > 0
      ? existing.recurrenceWeekdays
      : derivedDay !== undefined
        ? [derivedDay]
        : [];

    const existingStudentIds = existing?.participants && existing.participants.length > 0
      ? existing.participants.map((p) => p.studentId)
      : existing?.studentId
        ? [existing.studentId]
        : [];

    setNewLessonDraft((draft) => ({
      ...draft,
      date: dateISO,
      time: time ?? (startDate ? format(startDate, 'HH:mm') : draft.time),
      studentId: existing?.studentId ?? draft.studentId ?? selectedStudentId ?? undefined,
      studentIds: existingStudentIds.length > 0 ? existingStudentIds : draft.studentIds.length > 0 ? draft.studentIds : selectedStudentId ? [selectedStudentId] : [],
      durationMinutes: existing?.durationMinutes ?? draft.durationMinutes,
      isRecurring: existing ? Boolean(existing.isRecurring) : draft.isRecurring,
      repeatWeekdays: existing ? recurrenceWeekdays : draft.repeatWeekdays,
      repeatUntil: existing?.recurrenceUntil ? existing.recurrenceUntil.slice(0, 10) : draft.repeatUntil,
    }));
    setEditingLessonId(existing?.id ?? null);
    setEditingLessonOriginal(existing ?? null);
    setLessonModalOpen(true);
    navigate(tabPathById.schedule);
    setDayViewDate(new Date(dateISO));
  };

  const closeLessonModal = () => {
    setLessonModalOpen(false);
    setEditingLessonId(null);
    setEditingLessonOriginal(null);
    setNewLessonDraft((draft) => ({ ...draft, isRecurring: false, repeatWeekdays: [], repeatUntil: undefined }));
  };

  const performDeleteLesson = async (applyToSeries: boolean) => {
    if (!editingLessonId) return;
    const recurrenceGroupId = editingLessonOriginal?.recurrenceGroupId;

    try {
      await api.deleteLesson(editingLessonId, { applyToSeries });
      setLessons((prev) => {
        if (applyToSeries && recurrenceGroupId) {
          return prev.filter((lesson) => lesson.recurrenceGroupId !== recurrenceGroupId);
        }
        return prev.filter((lesson) => lesson.id !== editingLessonId);
      });
      closeLessonModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось удалить урок';
      showInfoDialog('Ошибка', message);
      // eslint-disable-next-line no-console
      console.error('Failed to delete lesson', error);
    }
  };

  const requestDeleteLesson = () => {
    if (!editingLessonId) return;
    const original = editingLessonOriginal;

    if (original?.isRecurring && original.recurrenceGroupId) {
      setDialogState({
        type: 'recurring-delete',
        title: 'Удалить урок?',
        message: 'Это повторяющийся урок. Выберите, удалить только выбранное занятие или всю серию.',
        applyToSeries: false,
        onConfirm: (applyToSeries) => {
          closeDialog();
          performDeleteLesson(applyToSeries);
        },
        onCancel: closeDialog,
      });
      return;
    }

    setDialogState({
      type: 'confirm',
      title: 'Удалить урок?',
      message: 'Удалённый урок нельзя будет вернуть. Продолжить?',
      confirmText: 'Удалить',
      cancelText: 'Отмена',
      onConfirm: () => {
        closeDialog();
        performDeleteLesson(false);
      },
      onCancel: closeDialog,
    });
  };

  const saveLesson = async (options?: { applyToSeriesOverride?: boolean; detachFromSeries?: boolean }) => {
    if (newLessonDraft.studentIds.length === 0 || !newLessonDraft.date || !newLessonDraft.time) {
      showInfoDialog('Заполните все поля', 'Выберите хотя бы одного ученика, дату и время');
      return;
    }
    const durationMinutes = Number(newLessonDraft.durationMinutes);
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return;

    if (newLessonDraft.isRecurring && newLessonDraft.repeatUntil && newLessonDraft.repeatUntil < newLessonDraft.date) {
      showInfoDialog('Проверьте даты', 'Дата окончания повторов должна быть не раньше даты начала');
      return;
    }

    const startAtDate = new Date(`${newLessonDraft.date}T${newLessonDraft.time}:00`);
    const startAt = startAtDate.toISOString();

    try {
      if (editingLessonId) {
        const original = editingLessonOriginal;
        const originalWeekdays = original?.recurrenceWeekdays ?? [];
        const originalUntil = original?.recurrenceUntil?.slice(0, 10) ?? '';
        const repeatChanged =
          (newLessonDraft.repeatUntil ?? '') !== originalUntil ||
          newLessonDraft.repeatWeekdays.length !== originalWeekdays.length ||
          newLessonDraft.repeatWeekdays.some((day) => !originalWeekdays.includes(day));

        if (original?.isRecurring && !repeatChanged && options?.applyToSeriesOverride === undefined) {
          setDialogState({
            type: 'confirm',
            title: 'Изменить только этот урок или всю серию?',
            message:
              'Это повторяющийся урок. Вы можете отредактировать только выбранное занятие или сразу всю серию.',
            confirmText: 'Изменить серию',
            cancelText: 'Только этот урок',
            onConfirm: () => {
              closeDialog();
              saveLesson({ applyToSeriesOverride: true });
            },
            onCancel: () => {
              closeDialog();
              saveLesson({ applyToSeriesOverride: false, detachFromSeries: true });
            },
          });
          return;
        }

        const applyToSeries =
          options?.applyToSeriesOverride ?? Boolean(original?.isRecurring && (repeatChanged || newLessonDraft.isRecurring));
        const shouldDetach = options?.detachFromSeries ?? (!applyToSeries && Boolean(original?.isRecurring));

        const data = await api.updateLesson(editingLessonId, {
          studentIds: newLessonDraft.studentIds,
          startAt,
          durationMinutes,
          applyToSeries,
          detachFromSeries: shouldDetach,
          repeatWeekdays:
            newLessonDraft.isRecurring ? newLessonDraft.repeatWeekdays : undefined,
          repeatUntil:
            newLessonDraft.isRecurring && newLessonDraft.repeatUntil
              ? `${newLessonDraft.repeatUntil}T23:59:59.999Z`
              : undefined,
        });

        if (shouldDetach) {
          setNewLessonDraft((draft) => ({ ...draft, isRecurring: false, repeatWeekdays: [], repeatUntil: undefined }));
        }

        if (data.lessons && data.lessons.length > 0) {
          const normalized = data.lessons.map(normalizeLesson);
          setLessons((prev) => {
            const groupId = normalized[0].recurrenceGroupId;
            const filtered = groupId
              ? prev.filter((lesson) => lesson.recurrenceGroupId !== groupId && lesson.id !== editingLessonId)
              : prev.filter((lesson) => lesson.id !== editingLessonId);
            return [...filtered, ...normalized];
          });
        } else if (data.lesson) {
          setLessons((prevLessons) =>
            prevLessons.map((lesson) => (lesson.id === editingLessonId ? normalizeLesson(data.lesson) : lesson)),
          );
        }
      } else if (newLessonDraft.isRecurring) {
        if (newLessonDraft.repeatWeekdays.length === 0) {
          showInfoDialog('Нужно выбрать дни недели', 'Выберите хотя бы один день недели для повтора');
          return;
        }
        const resolvedRepeatUntil = newLessonDraft.repeatUntil
          ? `${newLessonDraft.repeatUntil}T23:59:59.999Z`
          : `${addYears(new Date(startAt), 1).toISOString().slice(0, 10)}T23:59:59.999Z`;

        const data = await api.createRecurringLessons({
          studentIds: newLessonDraft.studentIds,
          startAt,
          durationMinutes,
          repeatWeekdays: newLessonDraft.repeatWeekdays,
          repeatUntil: resolvedRepeatUntil,
        });

        const normalized = data.lessons.map(normalizeLesson);
        setLessons((prev) => {
          const existingKeys = new Set(prev.map((lesson) => `${lesson.id}`));
          const next = [...prev];
          normalized.forEach((lesson) => {
            if (!existingKeys.has(`${lesson.id}`)) {
              next.push(lesson);
              existingKeys.add(`${lesson.id}`);
            }
          });
          return next;
        });
      } else {
        const data = await api.createLesson({
          studentIds: newLessonDraft.studentIds,
          startAt,
          durationMinutes,
        });

        setLessons([...lessons, normalizeLesson(data.lesson)]);
        }

        setLessonModalOpen(false);
        setEditingLessonId(null);
        navigate(tabPathById.schedule);
        setNewLessonDraft((draft) => ({ ...draft, isRecurring: false, repeatWeekdays: [], repeatUntil: undefined }));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось создать урок';
        showInfoDialog('Ошибка', message);
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

  const togglePaid = async (lessonId: number, studentId?: number) => {
    try {
      if (studentId !== undefined) {
        const data = await api.toggleParticipantPaid(lessonId, studentId);
        setLessons(lessons.map((lesson) => (lesson.id === lessonId ? normalizeLesson(data.lesson) : lesson)));
      } else {
        const data = await api.togglePaid(lessonId);
        setLessons(lessons.map((lesson) => (lesson.id === lessonId ? normalizeLesson(data.lesson) : lesson)));
      }
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
        status: newHomeworkDraft.status,
      });

      setHomeworks([...homeworks, normalizeHomework(data.homework)]);
      setNewHomeworkDraft({
        text: '',
        deadline: '',
        status: 'IN_PROGRESS',
        sendToTelegram: true,
        remindBefore: true,
      });
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

  const updateHomework = async (homeworkId: number, payload: Partial<Homework>) => {
    try {
      const data = await api.updateHomework(homeworkId, payload);
      setHomeworks(homeworks.map((hw) => (hw.id === homeworkId ? normalizeHomework(data.homework) : hw)));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to update homework', error);
    }
  };

  const deleteHomework = async (homeworkId: number) => {
    try {
      await api.deleteHomework(homeworkId);
      setHomeworks(homeworks.filter((hw) => hw.id !== homeworkId));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete homework', error);
    }
  };

  const remindHomework = async (studentId: number) => {
    try {
      await api.remindHomework(studentId);
      showInfoDialog('Напоминание отправлено', `Напоминание отправлено ученику #${studentId}`);
    } catch (error) {
      showInfoDialog('Не удалось отправить напоминание', 'Попробуйте ещё раз чуть позже.');
      // eslint-disable-next-line no-console
      console.error('Failed to send reminder', error);
    }
  };

  const remindHomeworkById = async (homeworkId: number) => {
    try {
      const result = await api.remindHomeworkById(homeworkId);
      setHomeworks(homeworks.map((hw) => (hw.id === homeworkId ? normalizeHomework(result.homework) : hw)));
      showInfoDialog('Напоминание отправлено', 'Мы отправим ученику напоминание.');
    } catch (error) {
      showInfoDialog('Не удалось отправить напоминание', 'Попробуйте ещё раз чуть позже.');
      // eslint-disable-next-line no-console
      console.error('Failed to send homework reminder', error);
    }
  };

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

  return (
    <div className={layoutStyles.page}>
      <Topbar
          teacher={teacher}
          activeTab={activeTab}
          onTabChange={(tab) => navigate(tabPathById[tab])}
          onOpenLessonModal={() => setLessonModalOpen(true)}
          onOpenStudentModal={() => setStudentModalOpen(true)}
        />

        <main className={layoutStyles.content}>
          <Routes>
            <Route path="/" element={<Navigate to={resolveLastVisitedPath()} replace />} />
            <Route
              path={tabPathById.dashboard}
              element={
                <DashboardSection
                  upcomingLessons={upcomingLessons}
                  linkedStudents={linkedStudents}
                  unpaidLessons={unpaidLessons}
                  pendingHomeworks={homeworks}
                  onAddStudent={() => {
                    navigate(tabPathById.students);
                    setStudentModalOpen(true);
                  }}
                  onCreateLesson={() => {
                    navigate(tabPathById.schedule);
                    setLessonModalOpen(true);
                  }}
                  onRemindHomework={() => selectedStudentId && remindHomework(selectedStudentId)}
                  onCompleteLesson={markLessonCompleted}
                  onTogglePaid={togglePaid}
                />
              }
            />
            <Route
              path={tabPathById.students}
              element={
                <StudentsSection
                  linkedStudents={linkedStudents}
                  selectedStudentId={selectedStudentId}
                  priceEditState={priceEditState}
                  newHomeworkDraft={newHomeworkDraft}
                  onSelectStudent={setSelectedStudentId}
                  onToggleAutoReminder={toggleAutoReminder}
                  onAdjustBalance={adjustBalance}
                  onStartEditPrice={startEditPrice}
                  onPriceChange={(value) => setPriceEditState((prev) => ({ ...prev, value }))}
                  onSavePrice={savePrice}
                  onCancelPriceEdit={() => setPriceEditState({ id: null, value: '' })}
                  onRemindHomework={remindHomework}
                  onAddHomework={addHomework}
                  onHomeworkDraftChange={setNewHomeworkDraft}
                  onToggleHomework={toggleHomeworkDone}
                  onOpenStudentModal={() => setStudentModalOpen(true)}
                  lessons={lessons}
                  onCompleteLesson={markLessonCompleted}
                  onTogglePaid={togglePaid}
                />
              }
            />
            <Route
              path={tabPathById.schedule}
              element={
                <ScheduleSection
                  scheduleView={scheduleView}
                  onScheduleViewChange={setScheduleView}
                  dayViewDate={dayViewDate}
                  onDayShift={handleDayShift}
                  onWeekShift={handleWeekShift}
                  onMonthShift={handleMonthShift}
                  dayLabelKey={dayLabelKey}
                  weekLabelKey={weekLabelKey}
                  monthLabelKey={monthLabelKey}
                  lessons={lessons}
                  linkedStudents={linkedStudents}
                  monthAnchor={monthAnchor}
                  monthOffset={monthOffset}
                  onOpenLessonModal={openLessonModal}
                  onStartEditLesson={startEditLesson}
                  onTogglePaid={togglePaid}
                  onDayViewDateChange={setDayViewDate}
                />
              }
            />
            <Route
              path={tabPathById.settings}
              element={<SettingsSection teacher={teacher} onTeacherChange={setTeacher} />}
            />
            <Route path="*" element={<Navigate to={resolveLastVisitedPath()} replace />} />
          </Routes>
        </main>

        <Tabbar activeTab={activeTab} onTabChange={(tab) => navigate(tabPathById[tab])} />

        <StudentModal
          open={studentModalOpen}
          onClose={() => setStudentModalOpen(false)}
          draft={newStudentDraft}
          onDraftChange={setNewStudentDraft}
          onSubmit={handleAddStudent}
        />

        <LessonModal
          open={lessonModalOpen}
          onClose={closeLessonModal}
          editingLessonId={editingLessonId}
          defaultDuration={teacher.defaultLessonDuration}
          linkedStudents={linkedStudents}
          draft={newLessonDraft}
          recurrenceLocked={Boolean(editingLessonOriginal?.isRecurring)}
          onDraftChange={setNewLessonDraft}
          onDelete={editingLessonId ? requestDeleteLesson : undefined}
          onSubmit={saveLesson}
        />
        {dialogState && dialogState.type !== 'recurring-delete' && (
          <DialogModal
            open
            title={dialogState.title}
            description={dialogState.message}
            confirmText={dialogState.confirmText}
            cancelText={dialogState.type === 'confirm' ? dialogState.cancelText : undefined}
            onClose={closeDialog}
            onConfirm={() => {
              if (dialogState.type === 'confirm') {
                dialogState.onConfirm();
              } else {
                closeDialog();
              }
            }}
            onCancel={dialogState.type === 'confirm' ? dialogState.onCancel : undefined}
          />
        )}
        {dialogState?.type === 'recurring-delete' && (
          <Modal open title={dialogState.title} onClose={closeDialog}>
            <p className={modalStyles.message}>{dialogState.message}</p>
            <div className={modalStyles.toggleRow}>
              <label className={controls.switch}>
                <input
                  type="checkbox"
                  checked={dialogState.applyToSeries}
                  onChange={(e) =>
                    setDialogState((state) =>
                      state?.type === 'recurring-delete'
                        ? { ...state, applyToSeries: e.target.checked }
                        : state,
                    )
                  }
                />
                <span className={controls.slider} />
              </label>
              <span className={modalStyles.toggleLabel}>
                {dialogState.applyToSeries ? 'Удалить все уроки серии' : 'Удалить только выбранный урок'}
              </span>
            </div>
            <div className={modalStyles.actions}>
              <button type="button" className={controls.secondaryButton} onClick={dialogState.onCancel}>
                Отмена
              </button>
              <button
                type="button"
                className={controls.dangerButton}
                onClick={() => dialogState.onConfirm(dialogState.applyToSeries)}
              >
                Удалить
              </button>
            </div>
          </Modal>
        )}
    </div>
  );
};

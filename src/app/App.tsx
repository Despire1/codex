import { addDays, addMonths, addYears, endOfMonth, format, parseISO, startOfMonth } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { AppProviders } from './providers';
import { Homework, Lesson, LinkedStudent, Student, Teacher, TeacherStudent } from '../entities/types';
import { api } from '../shared/api/client';
import { normalizeHomework, normalizeLesson, todayISO } from '../shared/lib/normalizers';
import layoutStyles from './styles/layout.module.css';
import { Topbar } from '../widgets/layout/Topbar';
import { Tabbar } from '../widgets/layout/Tabbar';
import { DashboardSection } from '../widgets/dashboard/DashboardSection';
import { StudentsSection } from '../widgets/students/StudentsSection';
import { ScheduleSection } from '../widgets/schedule/ScheduleSection';
import { SettingsSection } from '../widgets/settings/SettingsSection';
import { StudentModal } from '../features/modals/StudentModal/StudentModal';
import { LessonModal } from '../features/modals/LessonModal/LessonModal';
import type { TabId } from './tabs';

const initialTeacher: Teacher = {
  chatId: 111222333,
  name: 'Елена',
  username: 'teacher_fox',
  defaultLessonDuration: 60,
  reminderMinutesBefore: 30,
};

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
    isRecurring: false,
    repeatWeekdays: [] as number[],
    repeatUntil: undefined as string | undefined,
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
      isRecurring: existing ? false : draft.isRecurring,
      repeatWeekdays: existing ? [] : draft.repeatWeekdays,
    }));
    setEditingLessonId(existing?.id ?? null);
    setLessonModalOpen(true);
    setActiveTab('schedule');
    setDayViewDate(new Date(dateISO));
  };

  const closeLessonModal = () => {
    setLessonModalOpen(false);
    setEditingLessonId(null);
    setNewLessonDraft((draft) => ({ ...draft, isRecurring: false, repeatWeekdays: [], repeatUntil: undefined }));
  };

  const saveLesson = async () => {
    if (!newLessonDraft.studentId || !newLessonDraft.date || !newLessonDraft.time) return;
    const durationMinutes = Number(newLessonDraft.durationMinutes);
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return;

    if (newLessonDraft.isRecurring && newLessonDraft.repeatUntil && newLessonDraft.repeatUntil < newLessonDraft.date) {
      alert('Дата окончания повторов должна быть не раньше даты начала');
      return;
    }

    const startAt = `${newLessonDraft.date}T${newLessonDraft.time}:00.000Z`;

    try {
      if (editingLessonId) {
        const data = await api.updateLesson(editingLessonId, {
          studentId: newLessonDraft.studentId,
          startAt,
          durationMinutes,
        });
        setLessons(lessons.map((lesson) => (lesson.id === editingLessonId ? normalizeLesson(data.lesson) : lesson)));
      } else if (newLessonDraft.isRecurring) {
        if (newLessonDraft.repeatWeekdays.length === 0) {
          alert('Выберите хотя бы один день недели для повтора');
          return;
        }
        const resolvedRepeatUntil = newLessonDraft.repeatUntil
          ? `${newLessonDraft.repeatUntil}T23:59:59.999Z`
          : `${addYears(new Date(startAt), 1).toISOString().slice(0, 10)}T23:59:59.999Z`;

        const data = await api.createRecurringLessons({
          studentId: newLessonDraft.studentId,
          startAt,
          durationMinutes,
          repeatWeekdays: newLessonDraft.repeatWeekdays,
          repeatUntil: resolvedRepeatUntil,
        });

        const normalized = data.lessons.map(normalizeLesson);
        setLessons((prev) => {
          const existingKeys = new Set(prev.map((lesson) => `${lesson.studentId}-${lesson.startAt}`));
          const next = [...prev];
          normalized.forEach((lesson) => {
            const key = `${lesson.studentId}-${lesson.startAt}`;
            if (!existingKeys.has(key)) {
              next.push(lesson);
              existingKeys.add(key);
            }
          });
          return next;
        });
      } else {
        const data = await api.createLesson({
          studentId: newLessonDraft.studentId,
          startAt,
          durationMinutes,
        });

        setLessons([...lessons, normalizeLesson(data.lesson)]);
      }

      setLessonModalOpen(false);
      setEditingLessonId(null);
      setActiveTab('schedule');
      setNewLessonDraft((draft) => ({ ...draft, isRecurring: false, repeatWeekdays: [], repeatUntil: undefined }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось создать урок';
      alert(message);
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
      <AppProviders>
        <Topbar
          teacher={teacher}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onOpenLessonModal={() => setLessonModalOpen(true)}
          onOpenStudentModal={() => setStudentModalOpen(true)}
        />

        <main className={layoutStyles.content}>
          {activeTab === 'dashboard' && (
            <DashboardSection
              upcomingLessons={upcomingLessons}
              linkedStudents={linkedStudents}
              unpaidLessons={unpaidLessons}
              pendingHomeworks={homeworks}
              onAddStudent={() => {
                setActiveTab('students');
                setStudentModalOpen(true);
              }}
              onCreateLesson={() => {
                setActiveTab('schedule');
                setLessonModalOpen(true);
              }}
              onRemindHomework={() => selectedStudentId && remindHomework(selectedStudentId)}
              onCompleteLesson={markLessonCompleted}
              onTogglePaid={togglePaid}
            />
          )}

          {activeTab === 'students' && (
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
            />
          )}

          {activeTab === 'schedule' && (
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
          )}

          {activeTab === 'settings' && <SettingsSection teacher={teacher} onTeacherChange={setTeacher} />}
        </main>

        <Tabbar activeTab={activeTab} onTabChange={setActiveTab} />

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
          onDraftChange={setNewLessonDraft}
          onSubmit={saveLesson}
        />
      </AppProviders>
    </div>
  );
};

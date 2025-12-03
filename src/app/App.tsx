import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { useMemo, useState } from 'react';
import styles from './App.module.css';

// Domain types aligned with the Prisma schema from ARCHITECTURE.md
export type LessonStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELED';

export interface Teacher {
  chatId: number;
  name?: string;
  username?: string;
  defaultLessonDuration: number;
  reminderMinutesBefore: number;
}

export interface Student {
  id: number;
  username?: string;
  telegramId?: number;
}

export interface TeacherStudent {
  id: number;
  teacherId: number;
  studentId: number;
  customName: string;
  autoRemindHomework: boolean;
  balanceLessons: number;
}

export interface Homework {
  id: number;
  text: string;
  deadline?: string;
  isDone: boolean;
  studentId: number;
  teacherId: number;
}

export interface Lesson {
  id: number;
  teacherId: number;
  studentId: number;
  startAt: string; // ISO string
  durationMinutes: number;
  status: LessonStatus;
  isPaid: boolean;
}

interface LinkedStudent extends Student {
  link: TeacherStudent;
  homeworks: Homework[];
}

const initialTeacher: Teacher = {
  chatId: 111222333,
  name: 'Елена',
  username: 'teacher_fox',
  defaultLessonDuration: 60,
  reminderMinutesBefore: 30,
};

const initialStudents: Student[] = [
  { id: 1, username: 'math_kid', telegramId: 555001 },
  { id: 2, username: 'bio_star', telegramId: 555002 },
  { id: 3, username: 'exam_ready', telegramId: undefined },
];

const initialLinks: TeacherStudent[] = [
  { id: 1, teacherId: 111222333, studentId: 1, customName: 'Илья', autoRemindHomework: true, balanceLessons: 2 },
  { id: 2, teacherId: 111222333, studentId: 2, customName: 'София', autoRemindHomework: false, balanceLessons: 1 },
  { id: 3, teacherId: 111222333, studentId: 3, customName: 'Антон (ЕГЭ)', autoRemindHomework: true, balanceLessons: 0 },
];

const initialHomeworks: Homework[] = [
  { id: 1, text: 'Сдать тест №14 на решуегэ', deadline: '2024-04-20', isDone: false, studentId: 1, teacherId: 111222333 },
  { id: 2, text: 'Сочинение на тему "Экологические проблемы"', deadline: '2024-04-18', isDone: false, studentId: 2, teacherId: 111222333 },
  { id: 3, text: 'Повторить формулы стереометрии', isDone: true, studentId: 3, teacherId: 111222333 },
];

const initialLessons: Lesson[] = [
  {
    id: 1,
    teacherId: 111222333,
    studentId: 1,
    startAt: '2024-04-15T18:00:00.000Z',
    durationMinutes: 60,
    status: 'SCHEDULED',
    isPaid: false,
  },
  {
    id: 2,
    teacherId: 111222333,
    studentId: 2,
    startAt: '2024-04-16T08:00:00.000Z',
    durationMinutes: 60,
    status: 'COMPLETED',
    isPaid: false,
  },
  {
    id: 3,
    teacherId: 111222333,
    studentId: 3,
    startAt: '2024-04-17T15:00:00.000Z',
    durationMinutes: 90,
    status: 'SCHEDULED',
    isPaid: true,
  },
];

const tabs = [
  { id: 'dashboard', label: 'Главная', icon: '🏠' },
  { id: 'students', label: 'Ученики', icon: '👥' },
  { id: 'schedule', label: 'Расписание', icon: '📅' },
  { id: 'settings', label: 'Настройки', icon: '⚙️' },
] as const;

type TabId = (typeof tabs)[number]['id'];

export const App = () => {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [teacher, setTeacher] = useState<Teacher>(initialTeacher);
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [links, setLinks] = useState<TeacherStudent[]>(initialLinks);
  const [homeworks, setHomeworks] = useState<Homework[]>(initialHomeworks);
  const [lessons, setLessons] = useState<Lesson[]>(initialLessons);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(1);
  const [newStudentDraft, setNewStudentDraft] = useState({ customName: '', username: '' });
  const [newLessonDraft, setNewLessonDraft] = useState({
    studentId: 1,
    date: format(new Date(), 'yyyy-MM-dd'),
    time: '18:00',
    durationMinutes: teacher.defaultLessonDuration,
  });
  const [newHomeworkDraft, setNewHomeworkDraft] = useState({ text: '', deadline: '' });

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

  const handleAddStudent = () => {
    if (!newStudentDraft.customName.trim()) return;

    const existingByUsername =
      newStudentDraft.username && students.find((student) => student.username === newStudentDraft.username);

    const studentId = existingByUsername ? existingByUsername.id : Math.max(0, ...students.map((s) => s.id)) + 1;

    if (!existingByUsername) {
      setStudents([...students, { id: studentId, username: newStudentDraft.username || undefined }]);
    }

    const linkId = Math.max(0, ...links.map((l) => l.id)) + 1;
    setLinks([
      ...links,
      {
        id: linkId,
        teacherId: teacher.chatId,
        studentId,
        customName: newStudentDraft.customName,
        autoRemindHomework: true,
        balanceLessons: 0,
      },
    ]);

    setNewStudentDraft({ customName: '', username: '' });
    setSelectedStudentId(studentId);
    setActiveTab('students');
  };

  const toggleAutoReminder = (studentId: number) => {
    setLinks(
      links.map((link) =>
        link.studentId === studentId ? { ...link, autoRemindHomework: !link.autoRemindHomework } : link,
      ),
    );
  };

  const adjustBalance = (studentId: number, delta: number) => {
    setLinks(
      links.map((link) =>
        link.studentId === studentId ? { ...link, balanceLessons: Math.max(0, link.balanceLessons + delta) } : link,
      ),
    );
  };

  const addLesson = () => {
    const id = Math.max(0, ...lessons.map((l) => l.id)) + 1;
    const startAt = `${newLessonDraft.date}T${newLessonDraft.time}:00.000Z`;
    setLessons([
      ...lessons,
      {
        id,
        teacherId: teacher.chatId,
        studentId: Number(newLessonDraft.studentId),
        startAt,
        durationMinutes: Number(newLessonDraft.durationMinutes),
        status: 'SCHEDULED',
        isPaid: false,
      },
    ]);
  };

  const markLessonCompleted = (lessonId: number) => {
    setLessons(
      lessons.map((lesson) =>
        lesson.id === lessonId ? { ...lesson, status: 'COMPLETED', isPaid: lesson.isPaid || false } : lesson,
      ),
    );

    const lesson = lessons.find((l) => l.id === lessonId);
    if (lesson) {
      adjustBalance(lesson.studentId, -1);
    }
  };

  const togglePaid = (lessonId: number) => {
    setLessons(lessons.map((lesson) => (lesson.id === lessonId ? { ...lesson, isPaid: !lesson.isPaid } : lesson)));
  };

  const addHomework = () => {
    if (!selectedStudentId || !newHomeworkDraft.text.trim()) return;
    const id = Math.max(0, ...homeworks.map((hw) => hw.id)) + 1;
    setHomeworks([
      ...homeworks,
      {
        id,
        text: newHomeworkDraft.text,
        deadline: newHomeworkDraft.deadline || undefined,
        isDone: false,
        studentId: selectedStudentId,
        teacherId: teacher.chatId,
      },
    ]);
    setNewHomeworkDraft({ text: '', deadline: '' });
  };

  const toggleHomeworkDone = (homeworkId: number) => {
    setHomeworks(
      homeworks.map((hw) => (hw.id === homeworkId ? { ...hw, isDone: !hw.isDone } : hw)),
    );
  };

  const remindHomework = (studentId: number) => {
    alert('Имитация: напоминание отправлено через Telegram ученику #' + studentId);
  };

  const today = format(new Date(), 'yyyy-MM-dd');

  const lessonsByDay = useMemo(() => {
    return lessons.reduce<Record<string, Lesson[]>>((acc, lesson) => {
      const day = lesson.startAt.slice(0, 10);
      if (!acc[day]) acc[day] = [];
      acc[day].push(lesson);
      return acc;
    }, {});
  }, [lessons]);

  const renderLessonRow = (lesson: Lesson) => {
    const student = linkedStudents.find((s) => s.id === lesson.studentId);
    const date = parseISO(lesson.startAt);
    const label = isToday(date)
      ? 'Сегодня'
      : isTomorrow(date)
      ? 'Завтра'
      : format(date, 'd MMM');

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

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div>
          <div className={styles.subtitle}>Здравствуйте, {teacher.name}</div>
          <h1 className={styles.title}>TeacherBot Web</h1>
        </div>
        <div className={styles.quickActions}>
          <button className={styles.primaryButton} onClick={() => setActiveTab('students')}>
            + Ученик
          </button>
          <button className={styles.primaryGhost} onClick={() => setActiveTab('schedule')}>
            + Урок
          </button>
        </div>
      </header>

      <nav className={styles.topNav}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.topNavButton} ${activeTab === tab.id ? styles.topNavActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className={styles.tabIcon} aria-hidden>
              {tab.icon}
            </span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

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
                <button className={styles.secondaryButton} onClick={() => setActiveTab('students')}>
                  Добавить ученика
                </button>
                <button className={styles.secondaryButton} onClick={() => setActiveTab('schedule')}>
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

            <div className={styles.formCard}>
              <div className={styles.sectionHeader}>
                <h3>Добавить ученика</h3>
                <span className={styles.muted}>Создаст Student и связь TeacherStudent</span>
              </div>
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
                <button className={styles.primaryButton} onClick={handleAddStudent}>
                  Сохранить
                </button>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'schedule' && (
          <section className={styles.card}>
            <div className={styles.sectionHeader}>
              <h2>Расписание</h2>
              <span className={styles.muted}>Создание, завершение и оплата</span>
            </div>

            <div className={styles.daysGrid}>
              {Object.entries(lessonsByDay)
                .sort(([a], [b]) => (a > b ? 1 : -1))
                .map(([day, dayLessons]) => (
                  <div key={day} className={styles.dayCard}>
                    <div className={styles.dayHeader}>
                      <div>{day === today ? 'Сегодня' : format(parseISO(day + 'T00:00:00.000Z'), 'EEEE, d MMM')}</div>
                      <div className={styles.muted}>{dayLessons.length} урок(а)</div>
                    </div>
                    {dayLessons.map((lesson) => renderLessonRow(lesson))}
                  </div>
                ))}
            </div>

            <div className={styles.formCard}>
              <div className={styles.sectionHeader}>
                <h3>Создать урок</h3>
                <span className={styles.muted}>По умолчанию длительность {teacher.defaultLessonDuration} мин</span>
              </div>
              <div className={styles.formRow}>
                <select
                  className={styles.input}
                  value={newLessonDraft.studentId}
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
                <button className={styles.primaryButton} onClick={addLesson}>
                  Создать урок
                </button>
              </div>
            </div>
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
              {tab.icon}
            </span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

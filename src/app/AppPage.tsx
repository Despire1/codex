import { addDays, addMonths, addYears, endOfMonth, format, parseISO, startOfMonth } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Homework,
  HomeworkStatus,
  Lesson,
  LessonDateRange,
  LessonPaymentFilter,
  LessonSortOrder,
  LessonStatusFilter,
  LinkedStudent,
  PaymentCancelBehavior,
  PaymentEvent,
  Student,
  StudentListItem,
  Teacher,
  TeacherStudent,
} from '../entities/types';
import { api } from '../shared/api/client';
import { normalizeHomework, normalizeLesson, todayISO } from '../shared/lib/normalizers';
import { useToast } from '../shared/lib/toast';
import layoutStyles from './styles/layout.module.css';
import { Topbar } from '../widgets/layout/Topbar';
import { Tabbar } from '../widgets/layout/Tabbar';
import { tabIdByPath, tabPathById, tabs, type TabId } from './tabs';
import { AppRoutes } from './components/AppRoutes';
import { AppModals, DialogState } from './components/AppModals';
import { useTelegramWebAppAuth } from '../features/auth/telegram';
import { SessionFallback, useSessionStatus } from '../features/auth/session';

const initialTeacher: Teacher = {
  chatId: 111222333,
  name: 'Елена',
  username: 'teacher_fox',
  defaultLessonDuration: 60,
  reminderMinutesBefore: 30,
};

const LAST_VISITED_ROUTE_KEY = 'calendar_last_route';
const STUDENT_CARD_FILTERS_KEY = 'student_card_filters';
type TabPath = (typeof tabs)[number]['path'];

type StudentCardFiltersState = {
  homeworkFilter?: 'all' | HomeworkStatus | 'overdue';
  lessonPaymentFilter?: LessonPaymentFilter;
  lessonStatusFilter?: LessonStatusFilter;
  lessonDateRange?: LessonDateRange;
  lessonSortOrder?: LessonSortOrder;
  paymentFilter?: 'all' | 'topup' | 'charges' | 'manual';
  paymentDate?: string;
};

const DEFAULT_LESSON_DATE_RANGE: LessonDateRange = {
  from: '',
  to: '',
  fromTime: '00:00',
  toTime: '23:59',
};

const parseTimeSpentMinutes = (value: string): number | null => {
  if (!value.trim()) return null;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) return null;
  return Math.round(numericValue);
};

const isHomeworkFilter = (value: unknown): value is 'all' | HomeworkStatus | 'overdue' =>
  typeof value === 'string' &&
  (value === 'all' ||
    value === 'overdue' ||
    value === 'DRAFT' ||
    value === 'ASSIGNED' ||
    value === 'IN_PROGRESS' ||
    value === 'DONE');

const isLessonPaymentFilter = (value: unknown): value is LessonPaymentFilter =>
  value === 'all' || value === 'paid' || value === 'unpaid';

const isLessonStatusFilter = (value: unknown): value is LessonStatusFilter =>
  value === 'all' || value === 'completed' || value === 'not_completed';

const isLessonSortOrder = (value: unknown): value is LessonSortOrder => value === 'asc' || value === 'desc';

const isPaymentFilter = (value: unknown): value is 'all' | 'topup' | 'charges' | 'manual' =>
  value === 'all' || value === 'topup' || value === 'charges' || value === 'manual';

const parseLessonDateRange = (value: unknown): LessonDateRange | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.from !== 'string' ||
    typeof record.to !== 'string' ||
    typeof record.fromTime !== 'string' ||
    typeof record.toTime !== 'string'
  ) {
    return null;
  }
  return {
    from: record.from,
    to: record.to,
    fromTime: record.fromTime,
    toTime: record.toTime,
  };
};

const loadStudentCardFilters = (): StudentCardFiltersState => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STUDENT_CARD_FILTERS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: StudentCardFiltersState = {};
    if (isHomeworkFilter(parsed.homeworkFilter)) {
      result.homeworkFilter = parsed.homeworkFilter;
    }
    if (isLessonPaymentFilter(parsed.lessonPaymentFilter)) {
      result.lessonPaymentFilter = parsed.lessonPaymentFilter;
    }
    if (isLessonStatusFilter(parsed.lessonStatusFilter)) {
      result.lessonStatusFilter = parsed.lessonStatusFilter;
    }
    const parsedDateRange = parseLessonDateRange(parsed.lessonDateRange);
    if (parsedDateRange) {
      result.lessonDateRange = parsedDateRange;
    }
    if (isLessonSortOrder(parsed.lessonSortOrder)) {
      result.lessonSortOrder = parsed.lessonSortOrder;
    }
    if (isPaymentFilter(parsed.paymentFilter)) {
      result.paymentFilter = parsed.paymentFilter;
    }
    if (typeof parsed.paymentDate === 'string') {
      result.paymentDate = parsed.paymentDate;
    }
    return result;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load student card filters', error);
    return {};
  }
};

const saveStudentCardFilters = (state: StudentCardFiltersState) => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STUDENT_CARD_FILTERS_KEY, JSON.stringify(state));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to save student card filters', error);
  }
};

export const AppPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const { state: sessionState, refresh: refreshSession } = useSessionStatus();
  const { state: telegramState } = useTelegramWebAppAuth(refreshSession);
  const storedStudentCardFilters = useMemo(() => loadStudentCardFilters(), []);
  const [teacher, setTeacher] = useState<Teacher>(initialTeacher);
  const [students, setStudents] = useState<Student[]>([]);
  const [links, setLinks] = useState<TeacherStudent[]>([]);
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentQuery, setStudentQuery] = useState('');
  const [studentFilter, setStudentFilter] = useState<'all' | 'debt' | 'overdue'>('all');
  const [studentListItems, setStudentListItems] = useState<StudentListItem[]>([]);
  const [studentListCounts, setStudentListCounts] = useState({ withDebt: 0, overdue: 0 });
  const [studentListTotal, setStudentListTotal] = useState(0);
  const [studentListHasMore, setStudentListHasMore] = useState(false);
  const [studentListLoading, setStudentListLoading] = useState(false);
  const [studentHomeworks, setStudentHomeworks] = useState<Homework[]>([]);
  const [studentHomeworkFilter, setStudentHomeworkFilter] = useState<'all' | HomeworkStatus | 'overdue'>(
    storedStudentCardFilters.homeworkFilter ?? 'all',
  );
  const [studentHomeworkHasMore, setStudentHomeworkHasMore] = useState(false);
  const [studentHomeworkLoading, setStudentHomeworkLoading] = useState(false);
  const [studentLessons, setStudentLessons] = useState<Lesson[]>([]);
  const [studentLessonPaymentFilter, setStudentLessonPaymentFilter] = useState<LessonPaymentFilter>(
    storedStudentCardFilters.lessonPaymentFilter ?? 'all',
  );
  const [studentLessonStatusFilter, setStudentLessonStatusFilter] = useState<LessonStatusFilter>(
    storedStudentCardFilters.lessonStatusFilter ?? 'all',
  );
  const [studentLessonSortOrder, setStudentLessonSortOrder] = useState<LessonSortOrder>(
    storedStudentCardFilters.lessonSortOrder ?? 'asc',
  );
  const [studentLessonDateRange, setStudentLessonDateRange] = useState<LessonDateRange>(
    storedStudentCardFilters.lessonDateRange ?? DEFAULT_LESSON_DATE_RANGE,
  );
  const [studentLessonLoading, setStudentLessonLoading] = useState(false);
  const lessonLoadRequestId = useRef(0);
  const skipNextLessonLoadRef = useRef(false);
  const [paymentEventsByStudent, setPaymentEventsByStudent] = useState<Record<number, PaymentEvent[]>>({});
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'topup' | 'charges' | 'manual'>(
    storedStudentCardFilters.paymentFilter ?? 'all',
  );
  const [paymentDate, setPaymentDate] = useState(storedStudentCardFilters.paymentDate ?? '');
  const paymentFilterRef = useRef(paymentFilter);
  const paymentDateRef = useRef(paymentDate);
  const [editingLessonId, setEditingLessonId] = useState<number | null>(null);
  const [editingLessonOriginal, setEditingLessonOriginal] = useState<Lesson | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [newStudentDraft, setNewStudentDraft] = useState({ customName: '', username: '', pricePerLesson: '' });
  const [editingStudentId, setEditingStudentId] = useState<number | null>(null);
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
    status: 'DRAFT' as HomeworkStatus,
    baseStatus: 'DRAFT' as HomeworkStatus,
    sendNow: false,
    remindBefore: true,
    timeSpentMinutes: '',
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
  const [dialogState, setDialogState] = useState<DialogState>(null);

  const closeDialog = () => setDialogState(null);

  const showInfoDialog = (title: string, message: string, confirmText?: string) =>
    setDialogState({ type: 'info', title, message, confirmText });

  useEffect(() => {
    if (sessionState !== 'authenticated') return;
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
  }, [sessionState]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setStudentQuery(studentSearch.trim());
    }, 350);

    return () => clearTimeout(handler);
  }, [studentSearch]);

  useEffect(() => {
    setNewLessonDraft((draft) => ({ ...draft, durationMinutes: teacher.defaultLessonDuration }));
  }, [teacher.defaultLessonDuration]);

  useEffect(() => {
    if (selectedStudentId) {
      setNewLessonDraft((draft) => ({ ...draft, studentId: selectedStudentId }));
    }
  }, [selectedStudentId]);

  const loadStudentList = useCallback(
    async (options?: { offset?: number; append?: boolean }) => {
      if (sessionState !== 'authenticated') {
        setStudentListItems([]);
        setStudentListCounts({ withDebt: 0, overdue: 0 });
        setStudentListTotal(0);
        setStudentListHasMore(false);
        return;
      }
      const offset = options?.offset ?? 0;
      const append = options?.append ?? false;
      setStudentListLoading(true);
      try {
        const data = await api.listStudents({
          query: studentQuery || undefined,
          filter: studentFilter,
          limit: 15,
          offset,
        });
        setStudentListCounts(data.counts);
        setStudentListTotal(data.total);
        setStudentListHasMore(data.nextOffset !== null);
        setStudentListItems((prev) => (append ? [...prev, ...data.items] : data.items));
        if (!append) {
          setSelectedStudentId((prev) => {
            if (prev && data.items.some((item) => item.student.id === prev)) {
              return prev;
            }
            return data.items[0]?.student.id ?? null;
          });
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to load students list', error);
      } finally {
        setStudentListLoading(false);
      }
    },
    [sessionState, studentFilter, studentQuery],
  );

  const loadStudentHomeworks = useCallback(
    async (options?: { offset?: number; append?: boolean; studentIdOverride?: number | null }) => {
      if (sessionState !== 'authenticated') {
        setStudentHomeworks([]);
        setStudentHomeworkHasMore(false);
        return;
      }
      const targetStudentId = options?.studentIdOverride ?? selectedStudentId;
      if (!targetStudentId) {
        setStudentHomeworks([]);
        setStudentHomeworkHasMore(false);
        return;
      }
      const offset = options?.offset ?? 0;
      const append = options?.append ?? false;
      setStudentHomeworkLoading(true);
      try {
        const data = await api.listStudentHomeworks(targetStudentId, {
          filter: studentHomeworkFilter,
          limit: 15,
          offset,
        });
        setStudentHomeworkHasMore(data.nextOffset !== null);
        setStudentHomeworks((prev) =>
          append ? [...prev, ...data.items.map(normalizeHomework)] : data.items.map(normalizeHomework),
        );
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to load student homeworks', error);
      } finally {
        setStudentHomeworkLoading(false);
      }
    },
    [selectedStudentId, sessionState, studentHomeworkFilter],
  );

  const loadStudentLessons = useCallback(
    async (options?: { studentIdOverride?: number | null; sortOverride?: LessonSortOrder }) => {
      if (sessionState !== 'authenticated') {
        setStudentLessons([]);
        return;
      }
      const targetStudentId = options?.studentIdOverride ?? selectedStudentId;
      if (!targetStudentId) {
        setStudentLessons([]);
        return;
      }

      const requestId = lessonLoadRequestId.current + 1;
      lessonLoadRequestId.current = requestId;
      setStudentLessonLoading(true);
      try {
        const startFrom =
          studentLessonDateRange.from
            ? new Date(`${studentLessonDateRange.from}T${studentLessonDateRange.fromTime || '00:00'}`).toISOString()
            : undefined;
        const startTo =
          studentLessonDateRange.to
            ? new Date(`${studentLessonDateRange.to}T${studentLessonDateRange.toTime || '23:59'}`).toISOString()
            : undefined;
        const sortOrder = options?.sortOverride ?? studentLessonSortOrder;
        const data = await api.listStudentLessons(targetStudentId, {
          payment: studentLessonPaymentFilter,
          status: studentLessonStatusFilter,
          startFrom,
          startTo,
          sort: sortOrder,
        });
        if (lessonLoadRequestId.current !== requestId) return;
        setStudentLessons(data.items.map(normalizeLesson));
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to load student lessons', error);
      } finally {
        if (lessonLoadRequestId.current === requestId) {
          setStudentLessonLoading(false);
        }
      }
    },
    [
      selectedStudentId,
      sessionState,
      studentLessonDateRange.from,
      studentLessonDateRange.fromTime,
      studentLessonDateRange.to,
      studentLessonDateRange.toTime,
      studentLessonPaymentFilter,
      studentLessonStatusFilter,
      studentLessonSortOrder,
    ],
  );

  useEffect(() => {
    if (sessionState !== 'authenticated') return;
    loadStudentList();
  }, [loadStudentList, sessionState]);

  useEffect(() => {
    if (sessionState !== 'authenticated') return;
    loadStudentHomeworks();
  }, [loadStudentHomeworks, sessionState]);

  useEffect(() => {
    if (sessionState !== 'authenticated') return;
    if (skipNextLessonLoadRef.current) {
      skipNextLessonLoadRef.current = false;
    }
    loadStudentLessons();
  }, [loadStudentLessons, sessionState]);

  const handleLessonSortOrderChange = useCallback(
    (order: LessonSortOrder) => {
      if (order === studentLessonSortOrder) return;
      setStudentLessonSortOrder(order);
    },
    [studentLessonSortOrder],
  );

  const loadMoreStudents = useCallback(() => {
    if (studentListLoading || !studentListHasMore) return;
    loadStudentList({ offset: studentListItems.length, append: true });
  }, [loadStudentList, studentListHasMore, studentListItems.length, studentListLoading]);

  const loadMoreStudentHomeworks = useCallback(() => {
    if (studentHomeworkLoading || !studentHomeworkHasMore) return;
    loadStudentHomeworks({ offset: studentHomeworks.length, append: true });
  }, [loadStudentHomeworks, studentHomeworkHasMore, studentHomeworkLoading, studentHomeworks.length]);

  useEffect(() => {
    paymentFilterRef.current = paymentFilter;
  }, [paymentFilter]);

  useEffect(() => {
    paymentDateRef.current = paymentDate;
  }, [paymentDate]);

  useEffect(() => {
    saveStudentCardFilters({
      homeworkFilter: studentHomeworkFilter,
      lessonPaymentFilter: studentLessonPaymentFilter,
      lessonStatusFilter: studentLessonStatusFilter,
      lessonDateRange: studentLessonDateRange,
      lessonSortOrder: studentLessonSortOrder,
      paymentFilter,
      paymentDate,
    });
  }, [
    paymentDate,
    paymentFilter,
    studentHomeworkFilter,
    studentLessonDateRange,
    studentLessonPaymentFilter,
    studentLessonSortOrder,
    studentLessonStatusFilter,
  ]);

  const refreshPayments = useCallback(
    async (studentId: number, options?: { filter?: 'all' | 'topup' | 'charges' | 'manual'; date?: string }) => {
      if (sessionState !== 'authenticated') return;
      try {
        const filter = options?.filter ?? paymentFilterRef.current;
        const date = options?.date ?? paymentDateRef.current;
        const data = await api.getPaymentEvents(studentId, { filter, date: date || undefined });
        setPaymentEventsByStudent((prev) => ({ ...prev, [studentId]: data.events }));
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to load payment events', error);
      }
    },
    [sessionState],
  );

  useEffect(() => {
    if (sessionState !== 'authenticated') return;
    if (selectedStudentId) {
      refreshPayments(selectedStudentId);
    }
  }, [selectedStudentId, paymentDate, paymentFilter, refreshPayments, sessionState]);

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

  const paymentEvents = selectedStudentId ? paymentEventsByStudent[selectedStudentId] ?? [] : [];

  const handlePaymentFilterChange = (nextFilter: 'all' | 'topup' | 'charges' | 'manual') => {
    setPaymentFilter(nextFilter);
  };

  const handlePaymentDateChange = (nextDate: string) => {
    setPaymentDate(nextDate);
  };

  const resetStudentDraft = () => setNewStudentDraft({ customName: '', username: '', pricePerLesson: '' });

  const openCreateStudentModal = () => {
    resetStudentDraft();
    setEditingStudentId(null);
    setStudentModalOpen(true);
  };

  const openEditStudentModal = () => {
    if (!selectedStudentId) return;
    const student = students.find((entry) => entry.id === selectedStudentId);
    const link = links.find((entry) => entry.studentId === selectedStudentId && !entry.isArchived);
    if (!student || !link) return;
    setNewStudentDraft({
      customName: link.customName,
      username: student.username ?? '',
      pricePerLesson:
        typeof student.pricePerLesson === 'number' ? String(student.pricePerLesson) : '',
    });
    setEditingStudentId(selectedStudentId);
    setStudentModalOpen(true);
  };

  const closeStudentModal = () => {
    setStudentModalOpen(false);
    setEditingStudentId(null);
  };

  const parseStudentPrice = (value: string) => {
    if (!value.trim()) return null;
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue < 0) return null;
    return Math.round(numericValue);
  };

  const handleAddStudent = async () => {
    if (!newStudentDraft.customName.trim()) {
      showInfoDialog('Заполните все поля', 'Укажите имя ученика.');
      return;
    }
    const pricePerLesson = parseStudentPrice(newStudentDraft.pricePerLesson);
    if (pricePerLesson === null) {
      showInfoDialog('Заполните все поля', 'Укажите цену занятия для ученика.');
      return;
    }

    try {
      const data = await api.addStudent({
        customName: newStudentDraft.customName,
        username: newStudentDraft.username || undefined,
        pricePerLesson,
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

      resetStudentDraft();
      setSelectedStudentId(student.id);
      navigate(tabPathById.students);
      closeStudentModal();
      loadStudentList();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to add student', error);
    }
  };

  const handleUpdateStudent = async () => {
    if (!editingStudentId) return;
    if (!newStudentDraft.customName.trim()) {
      showInfoDialog('Заполните все поля', 'Укажите имя ученика.');
      return;
    }
    const pricePerLesson = parseStudentPrice(newStudentDraft.pricePerLesson);
    if (pricePerLesson === null) {
      showInfoDialog('Заполните все поля', 'Укажите цену занятия для ученика.');
      return;
    }
    try {
      const data = await api.updateStudent(editingStudentId, {
        customName: newStudentDraft.customName,
        username: newStudentDraft.username || undefined,
        pricePerLesson,
      });

      setStudents((prev) => prev.map((s) => (s.id === data.student.id ? data.student : s)));
      setLinks((prev) =>
        prev.map((l) =>
          l.studentId === data.link.studentId && l.teacherId === data.link.teacherId ? data.link : l,
        ),
      );
      setStudentListItems((prev) =>
        prev.map((item) =>
          item.student.id === data.student.id ? { ...item, student: data.student, link: data.link } : item,
        ),
      );
      resetStudentDraft();
      closeStudentModal();
      loadStudentList();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to update student', error);
    }
  };

  const handleSubmitStudent = () => {
    if (editingStudentId) {
      void handleUpdateStudent();
    } else {
      void handleAddStudent();
    }
  };

  const toggleAutoReminder = async (studentId: number) => {
    const link = links.find((l) => l.studentId === studentId);
    if (!link) return;

    try {
      const data = await api.toggleAutoRemind(studentId, !link.autoRemindHomework);

      setLinks(links.map((l) => (l.studentId === studentId ? data.link : l)));
      setStudentListItems((prev) =>
        prev.map((item) => (item.student.id === studentId ? { ...item, link: data.link } : item)),
      );
      showToast({
        message: data.link.autoRemindHomework ? 'Автонапоминания включены' : 'Автонапоминания выключены',
        variant: 'success',
      });
    } catch (error) {
      showToast({
        message: 'Не удалось обновить автонапоминания',
        variant: 'error',
      });
    }
  };

  const adjustBalance = async (studentId: number, delta: number) => {
    try {
      const data = await api.adjustBalance(studentId, { delta });
      setLinks(links.map((link) => (link.studentId === studentId ? data.link : link)));
      setStudentListItems((prev) =>
        prev.map((item) => (item.student.id === studentId ? { ...item, link: data.link } : item)),
      );
      await refreshPayments(studentId);
      loadStudentList();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to adjust balance', error);
    }
  };

  const topupBalance = async (
    studentId: number,
    payload: { delta: number; type: PaymentEvent['type']; comment?: string; createdAt?: string },
  ) => {
    try {
      const data = await api.adjustBalance(studentId, payload);
      setLinks(links.map((link) => (link.studentId === studentId ? data.link : link)));
      setStudentListItems((prev) =>
        prev.map((item) => (item.student.id === studentId ? { ...item, link: data.link } : item)),
      );
      await refreshPayments(studentId);
      loadStudentList();
      showToast({
        message:
          payload.delta > 0
            ? `Баланс пополнен на ${payload.delta} занятий`
            : `Списано ${Math.abs(payload.delta)} занятий`,
        variant: 'success',
      });
    } catch (error) {
      throw error instanceof Error ? error : new Error('Не удалось пополнить баланс.');
    }
  };

  const performDeleteStudent = useCallback(
    async (studentId: number) => {
      try {
        await api.deleteStudent(studentId);
        const remainingItems = studentListItems.filter((item) => item.student.id !== studentId);
        setLinks((prev) => prev.filter((link) => link.studentId !== studentId));
        setStudentListItems(remainingItems);
        setStudentListTotal((prev) => Math.max(prev - 1, 0));
        setPaymentEventsByStudent((prev) => {
          if (!prev[studentId]) return prev;
          const next = { ...prev };
          delete next[studentId];
          return next;
        });
        if (selectedStudentId === studentId) {
          setSelectedStudentId(remainingItems[0]?.student.id ?? null);
        }
        loadStudentList();
        showToast({ message: 'Ученик удалён из списка', variant: 'success' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось удалить ученика';
        showInfoDialog('Ошибка', message);
        // eslint-disable-next-line no-console
        console.error('Failed to delete student', error);
      }
    },
    [loadStudentList, selectedStudentId, showInfoDialog, showToast, studentListItems],
  );

  const requestDeleteStudent = useCallback(
    (studentId: number) => {
      const studentEntry = studentListItems.find((item) => item.student.id === studentId);
      const studentName = studentEntry?.link.customName ?? 'ученика';
      setDialogState({
        type: 'confirm',
        title: `Удалить ${studentName}?`,
        message:
          'Связь с учеником будет удалена из вашего списка. Данные ученика сохранятся и восстановятся при повторном добавлении.',
        confirmText: 'Удалить',
        cancelText: 'Отмена',
        onConfirm: () => {
          closeDialog();
          performDeleteStudent(studentId);
        },
        onCancel: closeDialog,
      });
    },
    [closeDialog, performDeleteStudent, studentListItems],
  );

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
      setStudentListItems((prev) =>
        prev.map((item) => (item.student.id === data.student.id ? { ...item, student: data.student } : item)),
      );
      setPriceEditState({ id: null, value: '' });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to update price', error);
    }
  };

  const openLessonModal = (dateISO: string, time?: string, existing?: Lesson) => {
    const startDate = existing ? parseISO(existing.startAt) : undefined;
    const derivedDay = startDate ? startDate.getUTCDay() : undefined;
    const recurrenceWeekdays =
      existing?.recurrenceWeekdays && existing.recurrenceWeekdays.length > 0
        ? existing.recurrenceWeekdays
        : derivedDay !== undefined
          ? [derivedDay]
          : [];

    const existingStudentIds =
      existing?.participants && existing.participants.length > 0
        ? existing.participants.map((p) => p.studentId)
        : existing?.studentId
          ? [existing.studentId]
          : [];

    setNewLessonDraft((draft) => ({
      ...draft,
      date: dateISO,
      time: time ?? (startDate ? format(startDate, 'HH:mm') : draft.time),
      studentId: existing?.studentId ?? draft.studentId ?? selectedStudentId ?? undefined,
      studentIds:
        existingStudentIds.length > 0
          ? existingStudentIds
          : draft.studentIds.length > 0
            ? draft.studentIds
            : selectedStudentId
              ? [selectedStudentId]
              : [],
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
      await loadStudentLessons();
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
          repeatWeekdays: newLessonDraft.isRecurring ? newLessonDraft.repeatWeekdays : undefined,
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

      await loadStudentLessons();
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
        lessons.map((lesson) => (lesson.id === lessonId ? normalizeLesson({ ...lesson, ...data.lesson }) : lesson)),
      );

      if (data.link) {
        setLinks(
          links.map((link) =>
            link.studentId === data.link.studentId && link.teacherId === data.link.teacherId ? data.link : link,
          ),
        );
      }

      await loadStudentLessons();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to complete lesson', error);
    }
  };

  const updateLessonStatus = async (lessonId: number, status: Lesson['status']) => {
    try {
      const data = await api.updateLessonStatus(lessonId, status);
      setLessons((prev) => prev.map((lesson) => (lesson.id === lessonId ? normalizeLesson(data.lesson) : lesson)));

      if (data.links && data.links.length > 0) {
        setLinks((prev) => {
          const map = new Map(prev.map((link) => [`${link.teacherId}_${link.studentId}`, link]));
          data.links!.forEach((link) => map.set(`${link.teacherId}_${link.studentId}`, link));
          return Array.from(map.values());
        });
      }

      await loadStudentLessons();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to update lesson status', error);
    }
  };

  const applyTogglePaid = async (
    lessonId: number,
    studentId?: number,
    cancelBehavior?: PaymentCancelBehavior,
  ) => {
    try {
      const payload = cancelBehavior ? { cancelBehavior } : undefined;
      if (studentId !== undefined) {
        const data = await api.toggleParticipantPaid(lessonId, studentId, payload);
        setLessons(lessons.map((lesson) => (lesson.id === lessonId ? normalizeLesson(data.lesson) : lesson)));

        if (data.link) {
          setLinks((prev) => {
            const exists = prev.some(
              (link) => link.studentId === data.link?.studentId && link.teacherId === data.link?.teacherId,
            );
            if (!exists) return [...prev, data.link!];
            return prev.map((link) =>
              link.studentId === data.link?.studentId && link.teacherId === data.link?.teacherId ? data.link! : link,
            );
          });
          setStudentListItems((prev) =>
            prev.map((item) => (item.student.id === studentId ? { ...item, link: data.link! } : item)),
          );
        }

        await refreshPayments(studentId);
        showToast({
          message: cancelBehavior ? 'Оплата отменена' : 'Оплата отмечена',
          variant: 'success',
        });
      } else {
        const data = await api.togglePaid(lessonId, payload);
        setLessons(lessons.map((lesson) => (lesson.id === lessonId ? normalizeLesson(data.lesson) : lesson)));

        if (data.link) {
          setLinks((prev) => {
            const exists = prev.some(
              (link) => link.studentId === data.link?.studentId && link.teacherId === data.link?.teacherId,
            );
            if (!exists) return [...prev, data.link!];
            return prev.map((link) =>
              link.studentId === data.link?.studentId && link.teacherId === data.link?.teacherId ? data.link! : link,
            );
          });
          setStudentListItems((prev) =>
            prev.map((item) => (item.student.id === data.link!.studentId ? { ...item, link: data.link! } : item)),
          );
        }

        const targetStudent = data.lesson.studentId;
        await refreshPayments(targetStudent);
        showToast({
          message: cancelBehavior ? 'Оплата отменена' : 'Оплата отмечена',
          variant: 'success',
        });
      }

      await loadStudentLessons();
    } catch (error) {
      showToast({
        message: 'Не удалось обновить оплату',
        variant: 'error',
      });
    }
  };

  const togglePaid = async (lessonId: number, studentId?: number) => {
    const targetLesson = lessons.find((lesson) => lesson.id === lessonId);
    const isCurrentlyPaid =
      studentId !== undefined
        ? targetLesson?.participants?.find((participant) => participant.studentId === studentId)?.isPaid ?? false
        : targetLesson?.isPaid ?? false;

    if (isCurrentlyPaid) {
      setDialogState({
        type: 'payment-cancel',
        title: 'Отмена оплаты',
        message: 'Вернуть оплаченный урок на баланс ученика?',
        onRefund: () => {
          closeDialog();
          void applyTogglePaid(lessonId, studentId, 'refund');
        },
        onWriteOff: () => {
          closeDialog();
          void applyTogglePaid(lessonId, studentId, 'writeoff');
        },
        onCancel: closeDialog,
      });
      return;
    }

    await applyTogglePaid(lessonId, studentId);
  };

  const openCreateLessonForStudent = (studentId?: number) => {
    const targetDate = newLessonDraft.date || todayISO();
    if (studentId) {
      setSelectedStudentId((prev) => prev ?? studentId);
      setNewLessonDraft((draft) => ({
        ...draft,
        studentId,
        studentIds: [studentId],
      }));
    }
    openLessonModal(targetDate, newLessonDraft.time);
  };

  const deleteLessonById = async (lessonId: number) => {
    try {
      await api.deleteLesson(lessonId);
      setLessons((prev) => prev.filter((lesson) => lesson.id !== lessonId));
      await loadStudentLessons();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete lesson', error);
    }
  };

  const sendHomeworkToStudent = async (homeworkId: number) => {
    try {
      const result = await api.sendHomework(homeworkId);
      setHomeworks((prev) => prev.map((hw) => (hw.id === homeworkId ? normalizeHomework(result.homework) : hw)));
      loadStudentHomeworks();
      loadStudentList();
      showInfoDialog('Отправлено ученику', 'Задание опубликовано и отправлено ученику.');
    } catch (error) {
      setDialogState({
        type: 'confirm',
        title: 'Не удалось отправить. Задание опубликовано.',
        message: 'Повторить отправку?',
        confirmText: 'Повторить',
        cancelText: 'Отмена',
        onConfirm: () => {
          closeDialog();
          sendHomeworkToStudent(homeworkId);
        },
        onCancel: closeDialog,
      });
      // eslint-disable-next-line no-console
      console.error('Failed to send homework to student', error);
    }
  };

  const addHomework = async () => {
    if (!selectedStudentId || !newHomeworkDraft.text.trim()) return;

    const targetStatus = newHomeworkDraft.sendNow ? 'ASSIGNED' : newHomeworkDraft.status;
    const parsedTimeSpent = parseTimeSpentMinutes(newHomeworkDraft.timeSpentMinutes);

    try {
      const data = await api.createHomework({
        studentId: selectedStudentId,
        text: newHomeworkDraft.text,
        deadline: newHomeworkDraft.deadline || undefined,
        status: targetStatus,
        timeSpentMinutes: parsedTimeSpent,
      });

      const normalized = normalizeHomework(data.homework);
      setHomeworks([...homeworks, normalized]);
      loadStudentHomeworks();
      loadStudentList();

      if (newHomeworkDraft.sendNow) {
        await sendHomeworkToStudent(normalized.id);
      } else {
        showInfoDialog('Домашнее задание создано', 'Черновик сохранён.');
      }
      setNewHomeworkDraft({
        text: '',
        deadline: '',
        status: 'DRAFT',
        baseStatus: 'DRAFT',
        sendNow: false,
        remindBefore: true,
        timeSpentMinutes: '',
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to add homework', error);
    }
  };

  const duplicateHomework = async (homeworkId: number) => {
    const original = homeworks.find((hw) => hw.id === homeworkId);
    if (!original) return;
    try {
      const data = await api.createHomework({
        studentId: original.studentId,
        text: original.text,
        deadline: original.deadline || undefined,
        status: 'DRAFT',
        attachments: original.attachments ?? [],
      });
      const normalized = normalizeHomework(data.homework);
      setHomeworks([...homeworks, normalized]);
      loadStudentHomeworks();
      loadStudentList();
      showInfoDialog('Черновик создан', 'Копия задания сохранена в черновики.');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to duplicate homework', error);
    }
  };

  const toggleHomeworkDone = async (homeworkId: number) => {
    try {
      const data = await api.toggleHomework(homeworkId);
      setHomeworks(homeworks.map((hw) => (hw.id === homeworkId ? normalizeHomework(data.homework) : hw)));
      loadStudentHomeworks();
      loadStudentList();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to toggle homework', error);
    }
  };

  const updateHomework = async (homeworkId: number, payload: Partial<Homework>) => {
    try {
      const data = await api.updateHomework(homeworkId, payload);
      setHomeworks(homeworks.map((hw) => (hw.id === homeworkId ? normalizeHomework(data.homework) : hw)));
      loadStudentHomeworks();
      loadStudentList();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to update homework', error);
    }
  };

  const deleteHomework = async (homeworkId: number) => {
    try {
      await api.deleteHomework(homeworkId);
      setHomeworks(homeworks.filter((hw) => hw.id !== homeworkId));
      loadStudentHomeworks();
      loadStudentList();
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

  const handleGoToToday = () => {
    const today = new Date();
    setDayViewDate(today);
    setMonthOffset(0);
    setDayLabelKey((key) => key + 1);
    setWeekLabelKey((key) => key + 1);
    setMonthLabelKey((key) => key + 1);
  };

  if (sessionState !== 'authenticated') {
    const fallbackState = sessionState === 'checking' || telegramState === 'pending' ? 'checking' : 'unauthenticated';
    return <SessionFallback state={fallbackState} />;
  }

  return (
    <div className={layoutStyles.page}>
      <div className={layoutStyles.pageInner}>
        <Topbar teacher={teacher} activeTab={activeTab} onTabChange={(tab) => navigate(tabPathById[tab])} />

        <main className={layoutStyles.content}>
          <AppRoutes
            resolveLastVisitedPath={resolveLastVisitedPath}
            dashboard={{
              upcomingLessons,
              linkedStudents,
              unpaidLessons,
              pendingHomeworks: homeworks,
              onAddStudent: () => {
                navigate(tabPathById.students);
                openCreateStudentModal();
              },
              onCreateLesson: () => {
                navigate(tabPathById.schedule);
                setLessonModalOpen(true);
              },
              onRemindHomework: () => selectedStudentId && remindHomework(selectedStudentId),
              onCompleteLesson: markLessonCompleted,
              onTogglePaid: togglePaid,
            }}
            students={{
              studentListItems,
              studentListCounts,
              studentListTotal,
              studentListLoading,
              studentListHasMore,
              studentSearch,
              studentFilter,
              selectedStudentId,
              priceEditState,
              studentHomeworks,
              homeworkFilter: studentHomeworkFilter,
              homeworkListLoading: studentHomeworkLoading,
              homeworkListHasMore: studentHomeworkHasMore,
              newHomeworkDraft,
              onSelectStudent: setSelectedStudentId,
              onStudentSearchChange: setStudentSearch,
              onStudentFilterChange: setStudentFilter,
              onLoadMoreStudents: loadMoreStudents,
              onHomeworkFilterChange: setStudentHomeworkFilter,
              onLoadMoreHomeworks: loadMoreStudentHomeworks,
              onToggleAutoReminder: toggleAutoReminder,
              onAdjustBalance: adjustBalance,
              onBalanceTopup: topupBalance,
              onStartEditPrice: startEditPrice,
              onPriceChange: (value) => setPriceEditState((prev) => ({ ...prev, value })),
              onSavePrice: savePrice,
              onCancelPriceEdit: () => setPriceEditState({ id: null, value: '' }),
              onRemindHomework: remindHomework,
              onRemindHomeworkById: remindHomeworkById,
              onSendHomework: sendHomeworkToStudent,
              onDuplicateHomework: duplicateHomework,
              onDeleteHomework: deleteHomework,
              onAddHomework: addHomework,
              onHomeworkDraftChange: (draft) =>
                setNewHomeworkDraft({
                  ...draft,
                  baseStatus: draft.baseStatus ?? draft.status ?? 'DRAFT',
                }),
              onToggleHomework: toggleHomeworkDone,
              onUpdateHomework: updateHomework,
              onAddStudent: openCreateStudentModal,
              onEditStudent: openEditStudentModal,
              onRequestDeleteStudent: requestDeleteStudent,
              studentLessons,
              lessonPaymentFilter: studentLessonPaymentFilter,
              lessonStatusFilter: studentLessonStatusFilter,
              lessonDateRange: studentLessonDateRange,
              lessonListLoading: studentLessonLoading,
              lessonSortOrder: studentLessonSortOrder,
              onLessonPaymentFilterChange: setStudentLessonPaymentFilter,
              onLessonStatusFilterChange: setStudentLessonStatusFilter,
              onLessonDateRangeChange: setStudentLessonDateRange,
              onLessonSortOrderChange: handleLessonSortOrderChange,
              payments: paymentEvents,
              paymentFilter,
              paymentDate,
              onPaymentFilterChange: handlePaymentFilterChange,
              onPaymentDateChange: handlePaymentDateChange,
              onCompleteLesson: markLessonCompleted,
              onChangeLessonStatus: updateLessonStatus,
              onTogglePaid: togglePaid,
              onCreateLesson: openCreateLessonForStudent,
              onEditLesson: startEditLesson,
              onDeleteLesson: deleteLessonById,
            }}
            schedule={{
              scheduleView,
              onScheduleViewChange: setScheduleView,
              dayViewDate,
              onDayShift: handleDayShift,
              onWeekShift: handleWeekShift,
              onMonthShift: handleMonthShift,
              dayLabelKey,
              weekLabelKey,
              monthLabelKey,
              lessons,
              linkedStudents,
              monthAnchor,
              monthOffset,
              onOpenLessonModal: openLessonModal,
              onStartEditLesson: startEditLesson,
              onTogglePaid: togglePaid,
              onDayViewDateChange: setDayViewDate,
              onGoToToday: handleGoToToday,
            }}
            settings={{ teacher, onTeacherChange: setTeacher }}
          />
        </main>
      </div>

      <Tabbar activeTab={activeTab} onTabChange={(tab) => navigate(tabPathById[tab])} />

      <AppModals
        studentModalOpen={studentModalOpen}
        onCloseStudentModal={closeStudentModal}
        newStudentDraft={newStudentDraft}
        isEditingStudent={Boolean(editingStudentId)}
        onStudentDraftChange={setNewStudentDraft}
        onSubmitStudent={handleSubmitStudent}
        lessonModalOpen={lessonModalOpen}
        onCloseLessonModal={closeLessonModal}
        editingLessonId={editingLessonId}
        defaultLessonDuration={teacher.defaultLessonDuration}
        linkedStudents={linkedStudents}
        lessonDraft={newLessonDraft}
        recurrenceLocked={Boolean(editingLessonOriginal?.isRecurring)}
        onLessonDraftChange={setNewLessonDraft}
        onDeleteLesson={editingLessonId ? requestDeleteLesson : undefined}
        onSubmitLesson={saveLesson}
        dialogState={dialogState}
        onCloseDialog={closeDialog}
        onDialogStateChange={setDialogState}
      />
    </div>
  );
};

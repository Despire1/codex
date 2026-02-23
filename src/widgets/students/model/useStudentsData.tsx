import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Homework,
  HomeworkStatus,
  Lesson,
  LessonDateRange,
  LessonPaymentFilter,
  LessonSortOrder,
  LessonStatusFilter,
  PaymentEvent,
  PaymentReminderLog,
  StudentDebtItem,
} from '../../../entities/types';
import { api } from '../../../shared/api/client';
import { normalizeHomework, normalizeLesson } from '../../../shared/lib/normalizers';
import { toUtcDateFromTimeZone } from '../../../shared/lib/timezoneDates';
import { StudentTabId } from '../types';

const PAYMENT_REMINDERS_PAGE_SIZE = 10;

const mergePaymentReminders = (current: PaymentReminderLog[], incoming: PaymentReminderLog[]) => {
  const seen = new Set<number>();
  const merged: PaymentReminderLog[] = [];
  for (const reminder of [...current, ...incoming]) {
    if (seen.has(reminder.id)) continue;
    seen.add(reminder.id);
    merged.push(reminder);
  }
  return merged;
};

export type StudentsDataConfig = {
  hasAccess: boolean;
  timeZone: string;
  selectedStudentId: number | null;
  studentActiveTab: StudentTabId;
  homeworkFilter: 'all' | HomeworkStatus | 'overdue';
  lessonPaymentFilter: LessonPaymentFilter;
  lessonStatusFilter: LessonStatusFilter;
  lessonDateRange: LessonDateRange;
  lessonSortOrder: LessonSortOrder;
  paymentFilter: 'all' | 'topup' | 'charges' | 'manual';
  paymentDate: string;
};

type LoadStudentHomeworksOptions = { offset?: number; append?: boolean; studentIdOverride?: number | null };
type LoadStudentLessonsOptions = { studentIdOverride?: number | null; sortOverride?: LessonSortOrder };
type LoadStudentLessonsSummaryOptions = { studentIdOverride?: number | null };
type LoadStudentUnpaidLessonsOptions = { studentIdOverride?: number | null; force?: boolean };

export type StudentsDataContextValue = {
  studentHomeworks: Homework[];
  studentHomeworkHasMore: boolean;
  studentHomeworkLoading: boolean;
  loadStudentHomeworks: (options?: LoadStudentHomeworksOptions) => Promise<void>;
  loadMoreStudentHomeworks: () => void;
  studentLessons: Lesson[];
  studentLessonsSummary: Lesson[];
  studentLessonLoading: boolean;
  loadStudentLessons: (options?: LoadStudentLessonsOptions) => Promise<void>;
  loadStudentLessonsSummary: (options?: LoadStudentLessonsSummaryOptions) => Promise<void>;
  loadStudentUnpaidLessons: (options?: LoadStudentUnpaidLessonsOptions) => Promise<void>;
  studentDebtItems: StudentDebtItem[];
  studentDebtTotal: number;
  payments: PaymentEvent[];
  paymentReminders: PaymentReminderLog[];
  paymentRemindersHasMore: boolean;
  paymentsLoading: boolean;
  paymentRemindersLoading: boolean;
  paymentRemindersLoadingMore: boolean;
  refreshPayments: (
    studentId: number,
    options?: { filter?: 'all' | 'topup' | 'charges' | 'manual'; date?: string },
  ) => Promise<void>;
  refreshPaymentReminders: (studentId: number) => Promise<void>;
  openPaymentReminders: () => void;
  loadMorePaymentReminders: () => void;
  clearStudentData: (studentId: number) => void;
};

const StudentsDataContext = createContext<StudentsDataContextValue | null>(null);

export const StudentsDataProvider = ({
  children,
  value,
}: PropsWithChildren<{ value: StudentsDataContextValue }>) => {
  return <StudentsDataContext.Provider value={value}>{children}</StudentsDataContext.Provider>;
};

export const useStudentsData = () => {
  const context = useContext(StudentsDataContext);
  if (!context) {
    throw new Error('useStudentsData must be used within StudentsDataProvider');
  }
  return context;
};

export const useStudentsDataInternal = ({
  hasAccess,
  timeZone,
  selectedStudentId,
  studentActiveTab,
  homeworkFilter,
  lessonPaymentFilter,
  lessonStatusFilter,
  lessonDateRange,
  lessonSortOrder,
  paymentFilter,
  paymentDate,
}: StudentsDataConfig): StudentsDataContextValue => {
  const [studentHomeworks, setStudentHomeworks] = useState<Homework[]>([]);
  const [studentHomeworkHasMore, setStudentHomeworkHasMore] = useState(false);
  const [studentHomeworkLoading, setStudentHomeworkLoading] = useState(false);
  const [studentLessons, setStudentLessons] = useState<Lesson[]>([]);
  const [studentLessonsSummary, setStudentLessonsSummary] = useState<Lesson[]>([]);
  const [studentLessonLoading, setStudentLessonLoading] = useState(false);
  const [studentUnpaidLessonsByStudent, setStudentUnpaidLessonsByStudent] = useState<Record<number, StudentDebtItem[]>>(
    {},
  );
  const [studentUnpaidTotalByStudent, setStudentUnpaidTotalByStudent] = useState<Record<number, number>>({});
  const [studentUnpaidLoadedByStudent, setStudentUnpaidLoadedByStudent] = useState<Record<number, boolean>>({});
  const [paymentEventsByStudent, setPaymentEventsByStudent] = useState<Record<number, PaymentEvent[]>>({});
  const [paymentRemindersByStudent, setPaymentRemindersByStudent] = useState<Record<number, PaymentReminderLog[]>>({});
  const [paymentEventsLoadingByStudent, setPaymentEventsLoadingByStudent] = useState<Record<number, boolean>>({});
  const [paymentRemindersLoadingByStudent, setPaymentRemindersLoadingByStudent] = useState<Record<number, boolean>>({});
  const [paymentRemindersLoadingMoreByStudent, setPaymentRemindersLoadingMoreByStudent] = useState<
    Record<number, boolean>
  >({});
  const [paymentRemindersNextOffsetByStudent, setPaymentRemindersNextOffsetByStudent] = useState<
    Record<number, number | null>
  >({});
  const lessonLoadRequestId = useRef(0);
  const lessonSummaryLoadRequestId = useRef(0);
  const paymentFilterRef = useRef(paymentFilter);
  const paymentDateRef = useRef(paymentDate);

  useEffect(() => {
    paymentFilterRef.current = paymentFilter;
  }, [paymentFilter]);

  useEffect(() => {
    paymentDateRef.current = paymentDate;
  }, [paymentDate]);

  useEffect(() => {
    setStudentHomeworks((prev) =>
      prev.map((homework) =>
        normalizeHomework({ ...homework, deadline: homework.deadlineAt ?? homework.deadline }, timeZone),
      ),
    );
  }, [timeZone]);

  const loadStudentHomeworks = useCallback(
    async (options?: LoadStudentHomeworksOptions) => {
      if (!hasAccess) {
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
          filter: homeworkFilter,
          limit: 15,
          offset,
        });
        setStudentHomeworkHasMore(data.nextOffset !== null);
        setStudentHomeworks((prev) =>
          append
            ? [...prev, ...data.items.map((homework) => normalizeHomework(homework, timeZone))]
            : data.items.map((homework) => normalizeHomework(homework, timeZone)),
        );
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to load student homeworks', error);
      } finally {
        setStudentHomeworkLoading(false);
      }
    },
    [hasAccess, homeworkFilter, selectedStudentId, timeZone],
  );

  const loadStudentLessons = useCallback(
    async (options?: LoadStudentLessonsOptions) => {
      if (!hasAccess) {
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
        const startFrom = lessonDateRange.from
          ? toUtcDateFromTimeZone(lessonDateRange.from, lessonDateRange.fromTime || '00:00', timeZone).toISOString()
          : undefined;
        const startTo = lessonDateRange.to
          ? toUtcDateFromTimeZone(lessonDateRange.to, lessonDateRange.toTime || '23:59', timeZone).toISOString()
          : undefined;
        const sortOrder = options?.sortOverride ?? lessonSortOrder;
        const data = await api.listStudentLessons(targetStudentId, {
          payment: lessonPaymentFilter,
          status: lessonStatusFilter,
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
      hasAccess,
      lessonDateRange.from,
      lessonDateRange.fromTime,
      lessonDateRange.to,
      lessonDateRange.toTime,
      lessonPaymentFilter,
      lessonSortOrder,
      lessonStatusFilter,
      selectedStudentId,
      timeZone,
    ],
  );

  const loadStudentLessonsSummary = useCallback(
    async (options?: LoadStudentLessonsSummaryOptions) => {
      if (!hasAccess) {
        setStudentLessonsSummary([]);
        return;
      }
      const targetStudentId = options?.studentIdOverride ?? selectedStudentId;
      if (!targetStudentId) {
        setStudentLessonsSummary([]);
        return;
      }

      const requestId = lessonSummaryLoadRequestId.current + 1;
      lessonSummaryLoadRequestId.current = requestId;
      try {
        const data = await api.listStudentLessons(targetStudentId, {
          payment: 'all',
          status: 'all',
          sort: 'asc',
        });
        if (lessonSummaryLoadRequestId.current !== requestId) return;
        setStudentLessonsSummary(data.items.map(normalizeLesson));
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to load student lessons summary', error);
        if (lessonSummaryLoadRequestId.current === requestId) {
          setStudentLessonsSummary([]);
        }
      }
    },
    [hasAccess, selectedStudentId],
  );

  const loadStudentUnpaidLessons = useCallback(
    async (options?: LoadStudentUnpaidLessonsOptions) => {
      if (!hasAccess) return;
      const targetStudentId = options?.studentIdOverride ?? selectedStudentId;
      if (!targetStudentId) return;
      if (!options?.force && studentUnpaidLoadedByStudent[targetStudentId]) return;
      try {
        const data = await api.listStudentUnpaidLessons(targetStudentId);
        setStudentUnpaidLessonsByStudent((prev) => ({ ...prev, [targetStudentId]: data.items }));
        setStudentUnpaidTotalByStudent((prev) => ({ ...prev, [targetStudentId]: data.total }));
        setStudentUnpaidLoadedByStudent((prev) => ({ ...prev, [targetStudentId]: true }));
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to load student unpaid lessons', error);
      }
    },
    [hasAccess, selectedStudentId, studentUnpaidLoadedByStudent],
  );

  const loadMoreStudentHomeworks = useCallback(() => {
    if (studentHomeworkLoading || !studentHomeworkHasMore) return;
    void loadStudentHomeworks({ offset: studentHomeworks.length, append: true });
  }, [loadStudentHomeworks, studentHomeworkHasMore, studentHomeworkLoading, studentHomeworks.length]);

  const refreshPayments = useCallback(
    async (studentId: number, options?: { filter?: 'all' | 'topup' | 'charges' | 'manual'; date?: string }) => {
      if (!hasAccess) return;
      setPaymentEventsLoadingByStudent((prev) => ({ ...prev, [studentId]: true }));
      try {
        const filter = options?.filter ?? paymentFilterRef.current;
        const date = options?.date ?? paymentDateRef.current;
        const data = await api.getPaymentEvents(studentId, { filter, date: date || undefined });
        setPaymentEventsByStudent((prev) => ({ ...prev, [studentId]: data.events }));
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to load payment events', error);
      } finally {
        setPaymentEventsLoadingByStudent((prev) => ({ ...prev, [studentId]: false }));
      }
    },
    [hasAccess],
  );

  const fetchPaymentRemindersPage = useCallback(
    async (studentId: number, options: { offset?: number; append?: boolean } = {}) => {
      if (!hasAccess) return;
      const offset = options.offset ?? 0;
      const append = Boolean(options.append);
      if (append) {
        setPaymentRemindersLoadingMoreByStudent((prev) => ({ ...prev, [studentId]: true }));
      } else {
        setPaymentRemindersLoadingByStudent((prev) => ({ ...prev, [studentId]: true }));
      }
      try {
        const data = await api.getPaymentReminders(studentId, { limit: PAYMENT_REMINDERS_PAGE_SIZE, offset });
        setPaymentRemindersByStudent((prev) => ({
          ...prev,
          [studentId]: append ? mergePaymentReminders(prev[studentId] ?? [], data.reminders) : data.reminders,
        }));
        setPaymentRemindersNextOffsetByStudent((prev) => ({ ...prev, [studentId]: data.nextOffset }));
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to load payment reminders', error);
      } finally {
        if (append) {
          setPaymentRemindersLoadingMoreByStudent((prev) => ({ ...prev, [studentId]: false }));
        } else {
          setPaymentRemindersLoadingByStudent((prev) => ({ ...prev, [studentId]: false }));
        }
      }
    },
    [hasAccess],
  );

  const refreshPaymentReminders = useCallback(
    async (studentId: number) => {
      await fetchPaymentRemindersPage(studentId, { offset: 0, append: false });
    },
    [fetchPaymentRemindersPage],
  );

  useEffect(() => {
    if (!hasAccess) return;
    if (studentActiveTab !== 'lessons') return;
    loadStudentLessons();
  }, [loadStudentLessons, hasAccess, studentActiveTab]);

  useEffect(() => {
    if (!hasAccess) return;
    if (!selectedStudentId) return;
    if (studentActiveTab !== 'payments') return;
    refreshPayments(selectedStudentId);
  }, [selectedStudentId, paymentDate, paymentFilter, refreshPayments, hasAccess, studentActiveTab]);

  useEffect(() => {
    if (!hasAccess) return;
    if (!selectedStudentId) return;
    if (studentActiveTab !== 'payments') return;
    refreshPaymentReminders(selectedStudentId);
  }, [selectedStudentId, refreshPaymentReminders, hasAccess, studentActiveTab]);

  const payments = selectedStudentId ? paymentEventsByStudent[selectedStudentId] ?? [] : [];
  const studentDebtItems = selectedStudentId ? studentUnpaidLessonsByStudent[selectedStudentId] ?? [] : [];
  const studentDebtTotal = selectedStudentId ? studentUnpaidTotalByStudent[selectedStudentId] ?? 0 : 0;
  const paymentsLoading = selectedStudentId ? paymentEventsLoadingByStudent[selectedStudentId] ?? false : false;
  const paymentRemindersLoading = selectedStudentId
    ? paymentRemindersLoadingByStudent[selectedStudentId] ?? false
    : false;
  const paymentRemindersLoadingMore = selectedStudentId
    ? paymentRemindersLoadingMoreByStudent[selectedStudentId] ?? false
    : false;
  const paymentRemindersHasMore = selectedStudentId
    ? paymentRemindersNextOffsetByStudent[selectedStudentId] != null
    : false;
  const paymentReminders = selectedStudentId ? paymentRemindersByStudent[selectedStudentId] ?? [] : [];

  const openPaymentReminders = useCallback(() => {
    if (!selectedStudentId) return;
    const hasRemindersLoaded = paymentRemindersByStudent[selectedStudentId] !== undefined;
    const isLoading = paymentRemindersLoadingByStudent[selectedStudentId] ?? false;
    if (hasRemindersLoaded || isLoading) return;
    refreshPaymentReminders(selectedStudentId);
  }, [paymentRemindersByStudent, paymentRemindersLoadingByStudent, refreshPaymentReminders, selectedStudentId]);

  const loadMorePaymentReminders = useCallback(() => {
    if (!selectedStudentId) return;
    const nextOffset = paymentRemindersNextOffsetByStudent[selectedStudentId];
    if (typeof nextOffset !== 'number') return;
    if (paymentRemindersLoadingMoreByStudent[selectedStudentId]) return;
    void fetchPaymentRemindersPage(selectedStudentId, { offset: nextOffset, append: true });
  }, [
    fetchPaymentRemindersPage,
    paymentRemindersLoadingMoreByStudent,
    paymentRemindersNextOffsetByStudent,
    selectedStudentId,
  ]);

  const clearStudentData = useCallback((studentId: number) => {
    setStudentUnpaidLessonsByStudent((prev) => {
      if (!prev[studentId]) return prev;
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
    setStudentUnpaidTotalByStudent((prev) => {
      if (!prev[studentId]) return prev;
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
    setStudentUnpaidLoadedByStudent((prev) => {
      if (!prev[studentId]) return prev;
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
    setPaymentEventsByStudent((prev) => {
      if (!prev[studentId]) return prev;
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
    setPaymentRemindersByStudent((prev) => {
      if (!prev[studentId]) return prev;
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
    setPaymentEventsLoadingByStudent((prev) => {
      if (!prev[studentId]) return prev;
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
    setPaymentRemindersLoadingByStudent((prev) => {
      if (!prev[studentId]) return prev;
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
    setPaymentRemindersLoadingMoreByStudent((prev) => {
      if (!prev[studentId]) return prev;
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
    setPaymentRemindersNextOffsetByStudent((prev) => {
      if (!prev[studentId]) return prev;
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
  }, []);

  return useMemo(
    () => ({
      studentHomeworks,
      studentHomeworkHasMore,
      studentHomeworkLoading,
      loadStudentHomeworks,
      loadMoreStudentHomeworks,
      studentLessons,
      studentLessonsSummary,
      studentLessonLoading,
      loadStudentLessons,
      loadStudentLessonsSummary,
      loadStudentUnpaidLessons,
      studentDebtItems,
      studentDebtTotal,
      payments,
      paymentReminders,
      paymentRemindersHasMore,
      paymentsLoading,
      paymentRemindersLoading,
      paymentRemindersLoadingMore,
      refreshPayments,
      refreshPaymentReminders,
      openPaymentReminders,
      loadMorePaymentReminders,
      clearStudentData,
    }),
    [
      clearStudentData,
      loadMorePaymentReminders,
      loadMoreStudentHomeworks,
      loadStudentHomeworks,
      loadStudentLessons,
      loadStudentLessonsSummary,
      loadStudentUnpaidLessons,
      openPaymentReminders,
      paymentReminders,
      paymentRemindersHasMore,
      paymentRemindersLoading,
      paymentRemindersLoadingMore,
      payments,
      paymentsLoading,
      refreshPaymentReminders,
      refreshPayments,
      studentDebtItems,
      studentDebtTotal,
      studentHomeworkHasMore,
      studentHomeworkLoading,
      studentHomeworks,
      studentLessonLoading,
      studentLessons,
      studentLessonsSummary,
    ],
  );
};

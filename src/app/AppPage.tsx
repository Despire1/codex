import { addDays, addMonths, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  HomeworkStatus,
  Lesson,
  LessonDateRange,
  LessonPaymentFilter,
  LessonSortOrder,
  LessonStatusFilter,
  LinkedStudent,
  Student,
  Teacher,
  TeacherStudent,
  UnpaidLessonEntry,
} from '../entities/types';
import { useSelectedStudent } from '../entities/student/model/selectedStudent';
import { api } from '../shared/api/client';
import { normalizeLesson } from '../shared/lib/normalizers';
import { useToast } from '../shared/lib/toast';
import { TimeZoneProvider } from '../shared/lib/timezoneContext';
import {
  formatInTimeZone,
  resolveTimeZone,
  toUtcEndOfDay,
  toUtcDateFromDate,
  toZonedDate,
} from '../shared/lib/timezoneDates';
import layoutStyles from './styles/layout.module.css';
import { Topbar } from '../widgets/layout/Topbar';
import { Tabbar } from '../widgets/layout/Tabbar';
import { tabIdByPath, tabPathById, tabs, type TabId } from './tabs';
import { AppRoutes } from './components/AppRoutes';
import { AppModals, DialogState } from './components/AppModals';
import { useTelegramWebAppAuth } from '../features/auth/telegram';
import { SessionFallback, useSessionStatus } from '../features/auth/session';
import { SubscriptionGate } from '../widgets/subscription/SubscriptionGate';
import { StudentRoleNotice } from '../widgets/student-role/StudentRoleNotice';
import { type StudentTabId } from '../widgets/students/types';
import { StudentsDataProvider, useStudentsDataInternal } from '../widgets/students/model/useStudentsData';
import { StudentsActionsProvider, useStudentsActionsInternal } from '../widgets/students/model/useStudentsActions';
import { StudentsHomeworkProvider, useStudentsHomeworkInternal } from '../widgets/students/model/useStudentsHomework';
import { LessonActionsProvider, useLessonActionsInternal } from '../features/lessons/model/useLessonActions';
import { ScheduleStateProvider, useScheduleStateInternal } from '../widgets/schedule/model/useScheduleState';

const initialTeacher: Teacher = {
  chatId: 111222333,
  name: 'Елена',
  username: 'teacher_fox',
  timezone: null,
  defaultLessonDuration: 60,
  reminderMinutesBefore: 30,
  lessonReminderEnabled: true,
  lessonReminderMinutes: 30,
  dailySummaryEnabled: true,
  dailySummaryTime: '09:00',
  tomorrowSummaryEnabled: false,
  tomorrowSummaryTime: '20:00',
  studentNotificationsEnabled: true,
  studentUpcomingLessonTemplate: null,
  studentPaymentDueTemplate: null,
  studentPaymentRemindersEnabled: true,
  autoConfirmLessons: true,
  globalPaymentRemindersEnabled: true,
  paymentReminderDelayHours: 24,
  paymentReminderRepeatHours: 48,
  paymentReminderMaxCount: 3,
  notifyTeacherOnAutoPaymentReminder: false,
  notifyTeacherOnManualPaymentReminder: true,
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
type LessonRange = {
  key: string;
  startAt: Date;
  endAt: Date;
  startIso: string;
  endIso: string;
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
  const { state: sessionState, refresh: refreshSession, hasSubscription, user: sessionUser } = useSessionStatus();
  const { state: telegramState, hasInitData: hasTelegramInitData } = useTelegramWebAppAuth(refreshSession, refreshSession);
  const hasTelegramAccess = !hasTelegramInitData || telegramState === 'authenticated';
  const hasAccess = sessionState === 'authenticated' && hasTelegramAccess;
  const storedStudentCardFilters = useMemo(() => loadStudentCardFilters(), []);
  const [teacher, setTeacher] = useState<Teacher>(initialTeacher);
  const resolvedTimeZone = useMemo(() => resolveTimeZone(teacher.timezone), [teacher.timezone]);
  const [students, setStudents] = useState<Student[]>([]);
  const [links, setLinks] = useState<TeacherStudent[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [unpaidLessonEntries, setUnpaidLessonEntries] = useState<UnpaidLessonEntry[]>([]);
  const [lessonsByRange, setLessonsByRange] = useState<Record<string, Lesson[]>>({});
  const lessonsByRangeRef = useRef(lessonsByRange);
  const lessonRangeRef = useRef<LessonRange | null>(null);
  const lessonRangeRequestId = useRef(0);
  const initialBootstrapDone = useRef(false);
  const [dashboardWeekRange, setDashboardWeekRange] = useState<{ start: Date; end: Date } | null>(() => {
    const nowZoned = toZonedDate(new Date(), resolvedTimeZone);
    const weekStart = startOfWeek(nowZoned, { weekStartsOn: 1 });
    return { start: weekStart, end: addDays(weekStart, 6) };
  });
  const [studentListReloadKey, setStudentListReloadKey] = useState(0);
  const [studentHomeworkFilter, setStudentHomeworkFilter] = useState<'all' | HomeworkStatus | 'overdue'>(
    storedStudentCardFilters.homeworkFilter ?? 'all',
  );
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
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'topup' | 'charges' | 'manual'>(
    storedStudentCardFilters.paymentFilter ?? 'all',
  );
  const [paymentDate, setPaymentDate] = useState(storedStudentCardFilters.paymentDate ?? '');
  const { selectedStudentId, setSelectedStudentId } = useSelectedStudent();
  const [studentActiveTab, setStudentActiveTab] = useState<StudentTabId>('overview');
  const [dialogState, setDialogState] = useState<DialogState>(null);
  const triggerStudentsListReload = useCallback(() => {
    setStudentListReloadKey((prev) => prev + 1);
  }, []);
  const scheduleState = useScheduleStateInternal({ timeZone: resolvedTimeZone });
  const {
    scheduleView,
    setScheduleView,
    dayViewDate,
    setDayViewDate,
    monthAnchor,
    setMonthAnchor,
    monthOffset,
    setMonthOffset,
    setSelectedMonthDay,
  } = scheduleState;

  const studentsData = useStudentsDataInternal({
    hasAccess,
    timeZone: resolvedTimeZone,
    selectedStudentId,
    studentActiveTab,
    homeworkFilter: studentHomeworkFilter,
    lessonPaymentFilter: studentLessonPaymentFilter,
    lessonStatusFilter: studentLessonStatusFilter,
    lessonDateRange: studentLessonDateRange,
    lessonSortOrder: studentLessonSortOrder,
    paymentFilter,
    paymentDate,
  });

  const {
    loadStudentHomeworks,
    loadStudentLessons,
    loadStudentLessonsSummary,
    loadStudentUnpaidLessons,
    studentDebtItems,
    refreshPayments,
    refreshPaymentReminders,
    clearStudentData,
  } = studentsData;

  useEffect(() => {
    lessonsByRangeRef.current = lessonsByRange;
  }, [lessonsByRange]);

  const closeDialog = () => setDialogState(null);

  const showInfoDialog = (title: string, message: string, confirmText?: string) =>
    setDialogState({ type: 'info', title, message, confirmText });

  const openConfirmDialog = useCallback(
    (options: {
      title: string;
      message: string;
      confirmText?: string;
      cancelText?: string;
      onConfirm: () => void;
      onCancel?: () => void;
    }) => {
      setDialogState({
        type: 'confirm',
        title: options.title,
        message: options.message,
        confirmText: options.confirmText,
        cancelText: options.cancelText,
        onConfirm: () => {
          closeDialog();
          options.onConfirm();
        },
        onCancel: () => {
          closeDialog();
          options.onCancel?.();
        },
      });
    },
    [closeDialog],
  );

  const openRecurringDeleteDialog = useCallback(
    (options: {
      title: string;
      message: string;
      applyToSeries?: boolean;
      onConfirm: (applyToSeries: boolean) => void;
      onCancel?: () => void;
    }) => {
      setDialogState({
        type: 'recurring-delete',
        title: options.title,
        message: options.message,
        applyToSeries: options.applyToSeries ?? false,
        onConfirm: (applyToSeries) => {
          closeDialog();
          options.onConfirm(applyToSeries);
        },
        onCancel: () => {
          closeDialog();
          options.onCancel?.();
        },
      });
    },
    [closeDialog],
  );

  const openPaymentCancelDialog = useCallback(
    (options: {
      title: string;
      message: string;
      onRefund: () => void;
      onWriteOff: () => void;
      onCancel?: () => void;
    }) => {
      setDialogState({
        type: 'payment-cancel',
        title: options.title,
        message: options.message,
        onRefund: () => {
          closeDialog();
          options.onRefund();
        },
        onWriteOff: () => {
          closeDialog();
          options.onWriteOff();
        },
        onCancel: () => {
          closeDialog();
          options.onCancel?.();
        },
      });
    },
    [closeDialog],
  );

  const openPaymentBalanceDialog = useCallback(
    (options: {
      title: string;
      message: string;
      onWriteOff: () => void;
      onSkip: () => void;
      onCancel?: () => void;
    }) => {
      setDialogState({
        type: 'payment-balance',
        title: options.title,
        message: options.message,
        onWriteOff: () => {
          closeDialog();
          options.onWriteOff();
        },
        onSkip: () => {
          closeDialog();
          options.onSkip();
        },
        onCancel: () => {
          closeDialog();
          options.onCancel?.();
        },
      });
    },
    [closeDialog],
  );

  const navigateToStudents = useCallback(() => {
    navigate(tabPathById.students);
  }, [navigate]);

  const navigateToSchedule = useCallback(() => {
    navigate(tabPathById.schedule);
  }, [navigate]);

  const studentsActions = useStudentsActionsInternal({
    students,
    links,
    setStudents,
    setLinks,
    selectedStudentId,
    setSelectedStudentId,
    showToast,
    showInfoDialog,
    openConfirmDialog,
    navigateToStudents,
    triggerStudentsListReload,
    refreshPayments,
    clearStudentData,
  });

  const studentsHomework = useStudentsHomeworkInternal({
    timeZone: resolvedTimeZone,
    selectedStudentId,
    loadStudentHomeworks,
    showInfoDialog,
    openConfirmDialog,
    triggerStudentsListReload,
  });
  const { homeworks } = studentsHomework;

  const buildLessonRange = useCallback(
    (startDate: Date, endDate: Date): LessonRange => {
      const startIso = formatInTimeZone(startDate, 'yyyy-MM-dd', { timeZone: resolvedTimeZone });
      const endIso = formatInTimeZone(endDate, 'yyyy-MM-dd', { timeZone: resolvedTimeZone });
      const startAt = toUtcDateFromDate(startIso, resolvedTimeZone);
      const endAt = toUtcEndOfDay(endIso, resolvedTimeZone);
      return {
        key: `${startIso}_${endIso}`,
        startAt,
        endAt,
        startIso,
        endIso,
      };
    },
    [resolvedTimeZone],
  );

  const buildWeekRange = useCallback(
    (date: Date) => {
      const zoned = toZonedDate(date, resolvedTimeZone);
      const weekStart = startOfWeek(zoned, { weekStartsOn: 1 });
      const weekEnd = addDays(weekStart, 6);
      return buildLessonRange(weekStart, weekEnd);
    },
    [buildLessonRange, resolvedTimeZone],
  );

  const buildDayRange = useCallback(
    (date: Date) => {
      const zoned = toZonedDate(date, resolvedTimeZone);
      return buildLessonRange(zoned, zoned);
    },
    [buildLessonRange, resolvedTimeZone],
  );

  const buildMonthRange = useCallback(() => {
    const targetMonth = addMonths(monthAnchor, monthOffset);
    const monthStart = startOfWeek(startOfMonth(targetMonth), { weekStartsOn: 1 });
    const monthEnd = endOfWeek(endOfMonth(targetMonth), { weekStartsOn: 1 });
    return buildLessonRange(monthStart, monthEnd);
  }, [buildLessonRange, monthAnchor, monthOffset]);

  const isLessonInRange = useCallback((lesson: Lesson, range: LessonRange) => {
    const startAt = new Date(lesson.startAt).getTime();
    return startAt >= range.startAt.getTime() && startAt <= range.endAt.getTime();
  }, []);

  const isLessonInCurrentRange = useCallback(
    (lesson: Lesson) => {
      const range = lessonRangeRef.current;
      if (!range) return true;
      return isLessonInRange(lesson, range);
    },
    [isLessonInRange],
  );

  const filterLessonsForCurrentRange = useCallback(
    (items: Lesson[]) => {
      const range = lessonRangeRef.current;
      if (!range) return items;
      return items.filter((lesson) => isLessonInRange(lesson, range));
    },
    [isLessonInRange],
  );

  const applyLessonsForRange = useCallback((range: LessonRange, items: Lesson[]) => {
    const normalized = items.map(normalizeLesson);
    setLessons(normalized);
    setLessonsByRange((prev) => ({ ...prev, [range.key]: normalized }));
    lessonRangeRef.current = range;
  }, []);

  const updateLessonsForCurrentRange = useCallback((updater: (prev: Lesson[]) => Lesson[]) => {
    const range = lessonRangeRef.current;
    setLessons((prev) => {
      const next = updater(prev);
      if (range) {
        setLessonsByRange((cache) => ({ ...cache, [range.key]: next }));
      }
      return next;
    });
  }, []);

  const loadLessonsForRange = useCallback(
    async (range: LessonRange) => {
      if (!hasAccess) return;
      lessonRangeRef.current = range;
      const cached = lessonsByRangeRef.current[range.key];
      if (cached) {
        setLessons(cached);
        return;
      }
      const requestId = (lessonRangeRequestId.current += 1);
      try {
        const data = await api.listLessonsForRange({
          start: range.startAt.toISOString(),
          end: range.endAt.toISOString(),
        });
        const normalized = (data.lessons ?? []).map(normalizeLesson);
        setLessonsByRange((prev) => ({ ...prev, [range.key]: normalized }));
        if (lessonRangeRequestId.current === requestId) {
          setLessons(normalized);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to load lessons for range', error);
      }
    },
    [hasAccess],
  );

  const handleDashboardWeekRangeChange = useCallback((start: Date, end: Date) => {
    setDashboardWeekRange({ start, end });
  }, []);

  const loadDashboardUnpaidLessons = useCallback(async () => {
    if (!hasAccess) return;
    try {
      const data = await api.listUnpaidLessons();
      setUnpaidLessonEntries(data.entries ?? []);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load unpaid lessons', error);
    }
  }, [hasAccess]);

  const lessonActions = useLessonActionsInternal({
    timeZone: resolvedTimeZone,
    teacherDefaultLessonDuration: teacher.defaultLessonDuration,
    selectedStudentId,
    setSelectedStudentId,
    lessons,
    links,
    setLinks,
    showInfoDialog,
    showToast,
    openConfirmDialog,
    openRecurringDeleteDialog,
    openPaymentCancelDialog,
    openPaymentBalanceDialog,
    navigateToSchedule,
    setDayViewDate,
    filterLessonsForCurrentRange,
    updateLessonsForCurrentRange,
    isLessonInCurrentRange,
    loadStudentLessons,
    loadStudentLessonsSummary,
    loadStudentUnpaidLessons,
    loadDashboardUnpaidLessons,
    refreshPayments,
    refreshPaymentReminders,
    triggerStudentsListReload,
    studentDebtItems,
  });

  const knownPaths = useMemo(() => new Set<TabPath>(tabs.map((tab) => tab.path)), []);

  const activeTab = useMemo<TabId>(() => {
    const directMatch = tabIdByPath[location.pathname];
    if (directMatch) return directMatch;
    const matchedTab = tabs.find((tab) => location.pathname.startsWith(`${tab.path}/`));
    return matchedTab?.id ?? 'dashboard';
  }, [location.pathname]);

  useEffect(() => {
    if (!hasAccess) return;
    if (initialBootstrapDone.current) return;
    const loadInitial = async () => {
      try {
        const initialRange =
          activeTab === 'schedule'
            ? scheduleView === 'month'
              ? buildMonthRange()
              : scheduleView === 'week'
                ? buildWeekRange(dayViewDate)
                : buildDayRange(dayViewDate)
            : activeTab === 'dashboard' && dashboardWeekRange
              ? buildLessonRange(dashboardWeekRange.start, dashboardWeekRange.end)
              : buildWeekRange(new Date());
        initialBootstrapDone.current = true;
        const data = await api.bootstrap({
          lessonsStart: initialRange.startAt.toISOString(),
          lessonsEnd: initialRange.endAt.toISOString(),
        });

        setTeacher(data.teacher ?? initialTeacher);
        setStudents(data.students ?? []);
        setLinks(data.links ?? []);
        studentsHomework.replaceHomeworks(data.homeworks ?? []);
        applyLessonsForRange(initialRange, data.lessons ?? []);

        const firstStudentId = data.students?.[0]?.id ?? null;
        setSelectedStudentId((prev) => prev ?? firstStudentId);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to bootstrap app', error);
      }
    };

    loadInitial();
  }, [
    activeTab,
    applyLessonsForRange,
    buildDayRange,
    buildLessonRange,
    buildMonthRange,
    buildWeekRange,
    dashboardWeekRange,
    dayViewDate,
    hasAccess,
    resolvedTimeZone,
    scheduleView,
    studentsHomework.replaceHomeworks,
  ]);

  const handleLessonSortOrderChange = useCallback(
    (order: LessonSortOrder) => {
      if (order === studentLessonSortOrder) return;
      setStudentLessonSortOrder(order);
    },
    [studentLessonSortOrder],
  );

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

  useEffect(() => {
    if (!hasAccess) return;
    if (activeTab === 'dashboard') {
      if (!dashboardWeekRange) return;
      loadLessonsForRange(buildLessonRange(dashboardWeekRange.start, dashboardWeekRange.end));
      return;
    }
    if (activeTab === 'schedule') {
      const range =
        scheduleView === 'month'
          ? buildMonthRange()
          : scheduleView === 'week'
            ? buildWeekRange(dayViewDate)
            : buildDayRange(dayViewDate);
      loadLessonsForRange(range);
    }
  }, [
    activeTab,
    buildDayRange,
    buildLessonRange,
    buildMonthRange,
    buildWeekRange,
    dashboardWeekRange,
    dayViewDate,
    hasAccess,
    loadLessonsForRange,
    scheduleView,
  ]);

  useEffect(() => {
    if (!hasAccess) return;
    if (activeTab !== 'dashboard') return;
    loadDashboardUnpaidLessons();
  }, [activeTab, hasAccess, loadDashboardUnpaidLessons]);

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

  const handlePaymentFilterChange = (nextFilter: 'all' | 'topup' | 'charges' | 'manual') => {
    setPaymentFilter(nextFilter);
  };

  const handlePaymentDateChange = (nextDate: string) => {
    setPaymentDate(nextDate);
  };

  if (sessionState !== 'authenticated' || !hasTelegramAccess) {
    const fallbackState =
      sessionState === 'checking' || (hasTelegramInitData && telegramState === 'pending') ? 'checking' : 'unauthenticated';
    return <SessionFallback state={fallbackState} />;
  }

  const isStudentRole = sessionUser?.role?.toUpperCase() === 'STUDENT';

  if (isStudentRole) {
    return (
      <div className={layoutStyles.page}>
        <div className={layoutStyles.pageInner}>
          <main className={layoutStyles.content}>
            <StudentRoleNotice />
          </main>
        </div>
      </div>
    );
  }

  const showSubscriptionGate = !hasSubscription && !isStudentRole;

  return (
    <StudentsDataProvider value={studentsData}>
      <StudentsActionsProvider value={studentsActions}>
        <StudentsHomeworkProvider value={studentsHomework}>
          <LessonActionsProvider value={lessonActions}>
            <ScheduleStateProvider value={scheduleState}>
              <TimeZoneProvider timeZone={resolvedTimeZone}>
                <div className={layoutStyles.page}>
                  <div className={layoutStyles.pageInner}>
                    <Topbar
                      teacher={teacher}
                      activeTab={activeTab}
                      onTabChange={(tab) => navigate(tabPathById[tab])}
                      profilePhotoUrl={sessionUser?.photoUrl ?? null}
                    />

                    <main className={layoutStyles.content}>
                      <AppRoutes
                        resolveLastVisitedPath={resolveLastVisitedPath}
                        dashboard={{
                          teacher,
                          lessons,
                          linkedStudents,
                          unpaidEntries: unpaidLessonEntries,
                          onWeekRangeChange: handleDashboardWeekRangeChange,
                          onAddStudent: () => {
                            navigate(tabPathById.students);
                            studentsActions.openCreateStudentModal();
                          },
                          onCreateLesson: (date) => {
                            const lessonDate = date ?? new Date();
                            const lessonIso = formatInTimeZone(lessonDate, 'yyyy-MM-dd', { timeZone: resolvedTimeZone });

                            if (date) {
                              setScheduleView('month');
                              setDayViewDate(lessonDate);
                              setMonthAnchor(startOfMonth(lessonDate));
                              setMonthOffset(0);
                              setSelectedMonthDay(lessonIso);
                              navigate(tabPathById.schedule);
                            }

                            lessonActions.openLessonModal(
                              lessonIso,
                              date ? undefined : formatInTimeZone(new Date(), 'HH:mm', { timeZone: resolvedTimeZone }),
                            );
                          },
                          onOpenSchedule: () => navigate(tabPathById.schedule),
                          onOpenLesson: (lesson) =>
                            lessonActions.openLessonModal(
                              formatInTimeZone(lesson.startAt, 'yyyy-MM-dd', { timeZone: resolvedTimeZone }),
                              undefined,
                              lesson,
                            ),
                          onOpenLessonDay: (lesson) => {
                            const lessonDate = toZonedDate(lesson.startAt, resolvedTimeZone);
                            const lessonIso = formatInTimeZone(lesson.startAt, 'yyyy-MM-dd', {
                              timeZone: resolvedTimeZone,
                            });
                            setScheduleView('month');
                            setDayViewDate(lessonDate);
                            setMonthAnchor(startOfMonth(lessonDate));
                            setMonthOffset(0);
                            setSelectedMonthDay(lessonIso);
                            navigate(tabPathById.schedule);
                          },
                          onOpenStudent: (studentId) => {
                            setSelectedStudentId(studentId);
                            navigate(tabPathById.students);
                          },
                        }}
                        students={{
                          hasAccess,
                          teacher,
                          lessons,
                          homeworkFilter: studentHomeworkFilter,
                          onHomeworkFilterChange: setStudentHomeworkFilter,
                          lessonPaymentFilter: studentLessonPaymentFilter,
                          lessonStatusFilter: studentLessonStatusFilter,
                          lessonDateRange: studentLessonDateRange,
                          lessonSortOrder: studentLessonSortOrder,
                          onLessonPaymentFilterChange: setStudentLessonPaymentFilter,
                          onLessonStatusFilterChange: setStudentLessonStatusFilter,
                          onLessonDateRangeChange: setStudentLessonDateRange,
                          onLessonSortOrderChange: handleLessonSortOrderChange,
                          paymentFilter,
                          paymentDate,
                          onPaymentFilterChange: handlePaymentFilterChange,
                          onPaymentDateChange: handlePaymentDateChange,
                          onActiveTabChange: setStudentActiveTab,
                          studentListReloadKey,
                        }}
                        schedule={{
                          lessons,
                          linkedStudents,
                          autoConfirmLessons: teacher.autoConfirmLessons,
                        }}
                        settings={{ teacher, onTeacherChange: setTeacher }}
                      />
                    </main>
                  </div>

                  <Tabbar activeTab={activeTab} onTabChange={(tab) => navigate(tabPathById[tab])} />

                  <AppModals
                    linkedStudents={linkedStudents}
                    dialogState={dialogState}
                    onCloseDialog={closeDialog}
                    onDialogStateChange={setDialogState}
                  />
                </div>
                {showSubscriptionGate ? <SubscriptionGate /> : null}
              </TimeZoneProvider>
            </ScheduleStateProvider>
          </LessonActionsProvider>
        </StudentsHomeworkProvider>
      </StudentsActionsProvider>
    </StudentsDataProvider>
  );
};

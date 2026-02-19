import { startOfMonth } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Lesson, Student, Teacher, TeacherStudent } from '../entities/types';
import { useSelectedStudent } from '../entities/student/model/selectedStudent';
import { api, type StudentContextLink } from '../shared/api/client';
import { useToast } from '../shared/lib/toast';
import { TimeZoneProvider } from '../shared/lib/timezoneContext';
import { formatInTimeZone, resolveTimeZone, toZonedDate } from '../shared/lib/timezoneDates';
import { useIsMobile } from '../shared/lib/useIsMobile';
import { useIsDesktop } from '../shared/lib/useIsDesktop';
import { trackEvent } from '../shared/lib/analytics';
import layoutStyles from './styles/layout.module.css';
import { Topbar } from '../widgets/layout/Topbar';
import { Tabbar } from '../widgets/layout/Tabbar';
import { Sidebar } from '../widgets/layout/Sidebar';
import { buildSidebarNavItems, type SidebarNavItem } from '../widgets/layout/model/navigation';
import { getTabsByRole, tabPathById, type TabId } from './tabs';
import { AppRoutes } from './components/AppRoutes';
import { AppModals } from './components/AppModals';
import { useTelegramWebAppAuth } from '../features/auth/telegram';
import { SessionFallback, useSessionStatus } from '../features/auth/session';
import { SubscriptionGate } from '../widgets/subscription/SubscriptionGate';
import { type StudentTabId } from '../widgets/students/types';
import { StudentsDataProvider, useStudentsDataInternal } from '../widgets/students/model/useStudentsData';
import { StudentsActionsProvider, useStudentsActionsInternal } from '../widgets/students/model/useStudentsActions';
import { StudentsHomeworkProvider, useStudentsHomeworkInternal } from '../widgets/students/model/useStudentsHomework';
import { LessonActionsProvider, useLessonActionsInternal } from '../features/lessons/model/useLessonActions';
import { ScheduleStateProvider, useScheduleStateInternal } from '../widgets/schedule/model/useScheduleState';
import { DashboardStateProvider, useDashboardStateInternal } from '../widgets/dashboard/model/useDashboardState';
import { useDashboardSummaryInternal } from '../widgets/dashboard/model/useDashboardSummary';
import { OnboardingStateProvider, useOnboardingStateInternal } from '../features/onboarding/model/useOnboardingState';
import {
  StudentsCardFiltersProvider,
  useStudentCardFiltersInternal,
} from '../widgets/students/model/useStudentCardFilters';
import { useScheduleLessonsLoaderInternal } from '../widgets/schedule/model/useScheduleLessonsLoader';
import { useScheduleLessonsRangeInternal } from '../widgets/schedule/model/useScheduleLessonsRange';
import { UnsavedChangesProvider, useUnsavedChanges } from '../shared/lib/unsavedChanges';
import { useAppDialogs } from './model/useAppDialogs';
import { useLinkedStudents } from './model/useLinkedStudents';
import {
  dispatchHomeworkTemplateCreateTopbarCommand,
  type HomeworkTemplateCreateTopbarState,
  subscribeHomeworkTemplateCreateTopbarState,
} from '../features/homework-template-editor/model/lib/createTemplateTopbarBridge';

const resolveAnalyticsSource = (source: string) => {
  if (source === 'onboarding_hero') return 'hero_cta';
  if (source === 'onboarding_stepper') return 'stepper';
  if (source === 'onboarding_quick_action') return 'quick_action';
  return source;
};

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
  homeworkNotifyOnAssign: true,
  homeworkReminder24hEnabled: true,
  homeworkReminderMorningEnabled: true,
  homeworkReminderMorningTime: '10:00',
  homeworkReminder3hEnabled: false,
  homeworkOverdueRemindersEnabled: true,
  homeworkOverdueReminderTime: '10:00',
  homeworkOverdueReminderMaxCount: 3,
};

const LAST_VISITED_ROUTE_KEY = 'calendar_last_route';

const desktopTitleByTab: Record<TabId, string> = {
  dashboard: 'Обзор',
  students: 'Ученики',
  schedule: 'Расписание',
  homeworks: 'Домашки',
  analytics: 'Аналитика',
  settings: 'Настройки',
};

const AppPageContent = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const { getActiveEntry, clearEntry } = useUnsavedChanges();
  const { state: sessionState, refresh: refreshSession, hasSubscription, user: sessionUser } = useSessionStatus();
  const { state: telegramState, hasInitData: hasTelegramInitData } = useTelegramWebAppAuth(refreshSession, refreshSession);
  const hasTelegramAccess = !hasTelegramInitData || telegramState === 'authenticated';
  const hasAccess = sessionState === 'authenticated' && hasTelegramAccess;
  const isStudentRole = sessionUser?.role?.toUpperCase() === 'STUDENT';
  const hasTeacherAccess = hasAccess && !isStudentRole;
  const [teacher, setTeacher] = useState<Teacher>(initialTeacher);
  const resolvedTimeZone = useMemo(() => resolveTimeZone(teacher.timezone), [teacher.timezone]);
  const [students, setStudents] = useState<Student[]>([]);
  const [links, setLinks] = useState<TeacherStudent[]>([]);
  const initialBootstrapDone = useRef(false);
  const [studentListReloadKey, setStudentListReloadKey] = useState(0);
  const { selectedStudentId, setSelectedStudentId } = useSelectedStudent();
  const [studentActiveTab, setStudentActiveTab] = useState<StudentTabId>('overview');
  const [studentContexts, setStudentContexts] = useState<StudentContextLink[]>([]);
  const [activeStudentContext, setActiveStudentContext] = useState<StudentContextLink | null>(null);
  const [studentContextLoading, setStudentContextLoading] = useState(false);
  const [studentContextRevision, setStudentContextRevision] = useState(0);
  const isMobile = useIsMobile(767);
  const isDesktop = useIsDesktop();
  const [templateCreateTopbarState, setTemplateCreateTopbarState] = useState<HomeworkTemplateCreateTopbarState>({
    submitting: false,
    hasValidationErrors: false,
    draftSavedAtLabel: null,
  });
  const device = isMobile ? 'mobile' : 'desktop';
  const {
    dialogState,
    setDialogState,
    closeDialog,
    showInfoDialog,
    openConfirmDialog,
    openRecurringDeleteDialog,
    openPaymentCancelDialog,
    openPaymentBalanceDialog,
  } = useAppDialogs();
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

  const studentCardFilters = useStudentCardFiltersInternal();

  const studentsData = useStudentsDataInternal({
    hasAccess: hasTeacherAccess,
    timeZone: resolvedTimeZone,
    selectedStudentId,
    studentActiveTab,
    homeworkFilter: studentCardFilters.homeworkFilter,
    lessonPaymentFilter: studentCardFilters.lessonPaymentFilter,
    lessonStatusFilter: studentCardFilters.lessonStatusFilter,
    lessonDateRange: studentCardFilters.lessonDateRange,
    lessonSortOrder: studentCardFilters.lessonSortOrder,
    paymentFilter: studentCardFilters.paymentFilter,
    paymentDate: studentCardFilters.paymentDate,
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

  const guardedNavigate = useCallback(
    (to: string, options?: { replace?: boolean; state?: unknown }) => {
      const active = getActiveEntry();
      if (!active || !active.entry.isDirty) {
        navigate(to, options);
        return;
      }

      openConfirmDialog({
        title: 'Несохранённые изменения',
        message: active.entry.message ?? 'Вы изменили тексты уведомлений. Сохранить перед выходом?',
        confirmText: 'Сохранить',
        cancelText: 'Выйти без сохранения',
        onConfirm: () => {
          active.entry
            .onSave()
            .then((ok) => {
              if (!ok) return;
              clearEntry(active.key);
              navigate(to, options);
            })
            .catch(() => {
              showToast({ message: 'Не удалось сохранить изменения', variant: 'error' });
            });
        },
        onCancel: () => {
          active.entry.onDiscard?.();
          clearEntry(active.key);
          navigate(to, options);
        },
      });
    },
    [clearEntry, getActiveEntry, navigate, openConfirmDialog, showToast],
  );

  const navigateToStudents = useCallback(() => {
    guardedNavigate(tabPathById.students);
  }, [guardedNavigate]);

  const navigateToSchedule = useCallback(() => {
    guardedNavigate(tabPathById.schedule);
  }, [guardedNavigate]);

  const studentsHomework = useStudentsHomeworkInternal({
    timeZone: resolvedTimeZone,
    selectedStudentId,
    loadStudentHomeworks,
    showInfoDialog,
    openConfirmDialog,
    triggerStudentsListReload,
  });
  const { homeworks } = studentsHomework;

  const scheduleLessons = useScheduleLessonsRangeInternal({
    hasAccess: hasTeacherAccess,
    timeZone: resolvedTimeZone,
    monthAnchor,
    monthOffset,
  });

  const {
    lessons,
    buildLessonRange,
    buildWeekRange,
    buildDayRange,
    buildMonthRange,
    loadLessonsForRange,
    applyLessonsForRange,
    filterLessonsForCurrentRange,
    syncLessonsInRanges,
    removeLessonsFromRanges,
  } = scheduleLessons;

  const availableTabs = useMemo(
    () => getTabsByRole(isStudentRole ? 'STUDENT' : 'TEACHER'),
    [isStudentRole],
  );

  const activeTab = useMemo<TabId>(() => {
    const matchedTab = availableTabs.find(
      (tab) => location.pathname === tab.path || location.pathname.startsWith(`${tab.path}/`),
    );
    return matchedTab?.id ?? 'dashboard';
  }, [availableTabs, location.pathname]);

  const isTeacherTemplateCreateRoute = !isStudentRole && /^\/homeworks\/templates\/new\/?$/.test(location.pathname);
  const isTeacherTemplateEditRoute = !isStudentRole && /^\/homeworks\/templates\/\d+\/edit\/?$/.test(location.pathname);
  const isTeacherTemplateEditorRoute = isTeacherTemplateCreateRoute || isTeacherTemplateEditRoute;

  const desktopTopbarTitle = desktopTitleByTab[activeTab];
  const desktopTopbarResolvedTitle = isTeacherTemplateEditorRoute
    ? isTeacherTemplateEditRoute
      ? 'Редактирование шаблона'
      : 'Создание шаблона'
    : desktopTopbarTitle;
  const desktopDateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('ru-RU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date()),
    [],
  );
  const desktopTopbarResolvedSubtitle = isTeacherTemplateEditorRoute
    ? templateCreateTopbarState.draftSavedAtLabel
      ? `Черновик сохранен: ${templateCreateTopbarState.draftSavedAtLabel}`
      : isTeacherTemplateEditRoute
        ? 'Обновите настройки и вопросы шаблона'
        : 'Новое домашнее задание'
    : desktopDateLabel;
  const templateCreateActionLabel = isTeacherTemplateEditRoute ? 'Сохранить шаблон' : 'Создать шаблон';
  const templateCreateSubmittingLabel = isTeacherTemplateEditRoute ? 'Сохраняю…' : 'Создаю…';

  useEffect(() => {
    return subscribeHomeworkTemplateCreateTopbarState((state) => {
      setTemplateCreateTopbarState(state);
    });
  }, []);

  const dashboardState = useDashboardStateInternal({
    hasAccess: hasTeacherAccess,
    timeZone: resolvedTimeZone,
    isActive: activeTab === 'dashboard',
    buildLessonRange,
    loadLessonsForRange,
  });

  const dashboardSummary = useDashboardSummaryInternal({
    hasAccess: hasTeacherAccess,
    isActive: hasTeacherAccess && activeTab === 'dashboard',
  });
  const { summary: dashboardSummaryData } = dashboardSummary;
  const isZeroSummary =
    dashboardSummaryData?.studentsCount === 0 && dashboardSummaryData?.lessonsCount === 0;
  const onboardingState = useOnboardingStateInternal({
    teacherId: dashboardSummaryData?.teacherId ?? null,
    isZero: Boolean(isZeroSummary),
    students,
    links,
    lessons,
    studentsCount: dashboardSummaryData?.studentsCount ?? null,
    lessonsCount: dashboardSummaryData?.lessonsCount ?? null,
  });

  const track = useCallback(
    (event: string, payload: Record<string, unknown> = {}) => {
      trackEvent(event, {
        userId: onboardingState.teacherId,
        device,
        ...payload,
      });
    },
    [device, onboardingState.teacherId],
  );

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
    onStudentCreateStarted: (source) => {
      track('student_create_started', { source: resolveAnalyticsSource(source) });
    },
    onStudentCreated: ({ student, link, source }) => {
      if (source.startsWith('onboarding')) {
        onboardingState.setCreatedStudent({ student, link });
      }
      dashboardSummary.refresh();
      track('student_create_success', { source: resolveAnalyticsSource(source) });
    },
    onStudentCreateError: (error, source) => {
      track('student_create_error', {
        source: resolveAnalyticsSource(source),
        error: error instanceof Error ? error.message : String(error),
      });
    },
  });

  useScheduleLessonsLoaderInternal({
    hasAccess: hasTeacherAccess,
    isActive: hasTeacherAccess && activeTab === 'schedule',
    scheduleView,
    dayViewDate,
    buildDayRange,
    buildWeekRange,
    buildMonthRange,
    loadLessonsForRange,
  });

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
    syncLessonsInRanges,
    removeLessonsFromRanges,
    loadStudentLessons,
    loadStudentLessonsSummary,
    loadStudentUnpaidLessons,
    loadDashboardUnpaidLessons: dashboardState.loadUnpaidLessons,
    refreshPayments,
    refreshPaymentReminders,
    triggerStudentsListReload,
    studentDebtItems,
    onLessonCreateStarted: (source) => {
      track('lesson_create_started', { source: resolveAnalyticsSource(source) });
    },
    onLessonCreated: ({ lesson, source }) => {
      if (source.startsWith('onboarding')) {
        onboardingState.setCreatedLesson(lesson);
      }
      dashboardSummary.refresh();
      track('lesson_create_success', { source: resolveAnalyticsSource(source) });
    },
    onLessonCreateError: (error, source) => {
      track('lesson_create_error', {
        source: resolveAnalyticsSource(source),
        error: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const { openCreateStudentModal } = studentsActions;
  const { openLessonModal } = lessonActions;
  const knownPaths = useMemo(() => new Set<string>(availableTabs.map((tab) => tab.path)), [availableTabs]);

  const openCreateLesson = useCallback(
    (date?: Date) => {
      const lessonDate = date ?? new Date();
      const lessonIso = formatInTimeZone(lessonDate, 'yyyy-MM-dd', { timeZone: resolvedTimeZone });

      if (date) {
        setScheduleView('month');
        setDayViewDate(lessonDate);
        setMonthAnchor(startOfMonth(lessonDate));
        setMonthOffset(0);
        setSelectedMonthDay(lessonIso);
      }

      openLessonModal(
        lessonIso,
        date ? undefined : formatInTimeZone(new Date(), 'HH:mm', { timeZone: resolvedTimeZone }),
        undefined,
        { skipNavigation: true, variant: isMobile ? 'sheet' : 'modal' },
      );
    },
    [
      isMobile,
      openLessonModal,
      resolvedTimeZone,
      setDayViewDate,
      setMonthAnchor,
      setMonthOffset,
      setScheduleView,
      setSelectedMonthDay,
    ],
  );

  const onSidebarNavigate = useCallback(
    (item: SidebarNavItem) => {
      track('nav_click', { item: item.id, placement: 'sidebar' });
      guardedNavigate(item.href);
    },
    [guardedNavigate, track],
  );

  const onTabbarNavigate = useCallback(
    (tab: TabId) => {
      track('nav_click', { item: tab, placement: 'top_tabs' });
      guardedNavigate(tabPathById[tab]);
    },
    [guardedNavigate, track],
  );

  const onSidebarToggle = useCallback(
    (collapsed: boolean) => {
      track('sidebar_toggle', { collapsed });
    },
    [track],
  );

  const onOpenNotifications = useCallback(() => {
    guardedNavigate('/settings/notifications');
  }, [guardedNavigate]);

  const sidebarItems = useMemo(() => buildSidebarNavItems(availableTabs), [availableTabs]);

  const applyStudentContext = useCallback((context: StudentContextLink | null) => {
    if (!context) {
      setActiveStudentContext(null);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('student_active_teacher_id');
        window.localStorage.removeItem('student_active_student_id');
      }
      return;
    }

    setActiveStudentContext(context);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('student_active_teacher_id', String(context.teacherId));
      window.localStorage.setItem('student_active_student_id', String(context.studentId));
    }
    setStudentContextRevision((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!hasAccess || !isStudentRole) return;

    let cancelled = false;
    setStudentContextLoading(true);
    api
      .getStudentContext()
      .then((data) => {
        if (cancelled) return;
        setStudentContexts(data.contexts);

        const storedTeacherIdRaw =
          typeof window !== 'undefined' ? window.localStorage.getItem('student_active_teacher_id') : null;
        const storedTeacherId = storedTeacherIdRaw ? Number(storedTeacherIdRaw) : Number.NaN;

        const byStorage = Number.isFinite(storedTeacherId)
          ? data.contexts.find((context) => context.teacherId === storedTeacherId)
          : null;
        const byBackend = data.activeTeacherId
          ? data.contexts.find((context) => context.teacherId === data.activeTeacherId)
          : null;

        const fallbackContext = data.contexts.length === 1 ? data.contexts[0] : null;
        applyStudentContext(byStorage ?? byBackend ?? fallbackContext);
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load student context', error);
        if (cancelled) return;
        setStudentContexts([]);
        applyStudentContext(null);
      })
      .finally(() => {
        if (cancelled) return;
        setStudentContextLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [applyStudentContext, hasAccess, isStudentRole]);

  useEffect(() => {
    if (!hasTeacherAccess) return;
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
            : activeTab === 'dashboard' && dashboardState.weekRange
              ? buildLessonRange(dashboardState.weekRange.start, dashboardState.weekRange.end)
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
    dashboardState.weekRange,
    dayViewDate,
    hasTeacherAccess,
    scheduleView,
    studentsHomework.replaceHomeworks,
  ]);



  const resolveLastVisitedPath = useCallback(() => {
    const stored = localStorage.getItem(LAST_VISITED_ROUTE_KEY);
    if (stored && knownPaths.has(stored)) {
      return stored;
    }
    return tabPathById.dashboard;
  }, [knownPaths]);

  useEffect(() => {
    const currentPath = location.pathname;
    if (knownPaths.has(currentPath)) {
      localStorage.setItem(LAST_VISITED_ROUTE_KEY, currentPath);
    }
  }, [knownPaths, location.pathname]);

  const linkedStudents = useLinkedStudents({ students, links, homeworks });

  const onTopbarCreateLesson = useCallback(() => {
    openCreateLesson();
  }, [openCreateLesson]);

  const onDashboardAddStudent = useCallback(() => {
    openCreateStudentModal({ variant: isMobile ? 'sheet' : 'modal' });
  }, [isMobile, openCreateStudentModal]);

  const onDashboardOpenSchedule = useCallback(() => {
    guardedNavigate(tabPathById.schedule);
  }, [guardedNavigate]);

  const onDashboardOpenLesson = useCallback(
    (lesson: Lesson) => {
      openLessonModal(
        formatInTimeZone(lesson.startAt, 'yyyy-MM-dd', { timeZone: resolvedTimeZone }),
        undefined,
        lesson,
        { skipNavigation: true },
      );
    },
    [openLessonModal, resolvedTimeZone],
  );

  const onDashboardOpenLessonDay = useCallback(
    (lesson: Lesson) => {
      const lessonDate = toZonedDate(lesson.startAt, resolvedTimeZone);
      const lessonIso = formatInTimeZone(lesson.startAt, 'yyyy-MM-dd', {
        timeZone: resolvedTimeZone,
      });
      setScheduleView('month');
      setDayViewDate(lessonDate);
      setMonthAnchor(startOfMonth(lessonDate));
      setMonthOffset(0);
      setSelectedMonthDay(lessonIso);
      guardedNavigate(tabPathById.schedule);
    },
    [guardedNavigate, resolvedTimeZone, setDayViewDate, setMonthAnchor, setMonthOffset, setScheduleView, setSelectedMonthDay],
  );

  const onDashboardOpenStudent = useCallback(
    (studentId: number) => {
      setSelectedStudentId(studentId);
      guardedNavigate(tabPathById.students);
    },
    [guardedNavigate, setSelectedStudentId],
  );

  const onDashboardOpenHomeworkAssign = useCallback(
    (studentId?: number | null, lessonId?: number | null) => {
      guardedNavigate(tabPathById.homeworks, {
        state: {
          openAssignModal: true,
          studentId: typeof studentId === 'number' ? studentId : null,
          lessonId: typeof lessonId === 'number' ? lessonId : null,
        },
      });
    },
    [guardedNavigate],
  );

  const dashboardRouteProps = useMemo(
    () => ({
      teacher,
      lessons,
      linkedStudents,
      onAddStudent: onDashboardAddStudent,
      onCreateLesson: openCreateLesson,
      onOpenSchedule: onDashboardOpenSchedule,
      onOpenLesson: onDashboardOpenLesson,
      onOpenLessonDay: onDashboardOpenLessonDay,
      onOpenStudent: onDashboardOpenStudent,
      onOpenHomeworkAssign: onDashboardOpenHomeworkAssign,
    }),
    [
      linkedStudents,
      lessons,
      onDashboardAddStudent,
      onDashboardOpenLesson,
      onDashboardOpenLessonDay,
      onDashboardOpenHomeworkAssign,
      onDashboardOpenSchedule,
      onDashboardOpenStudent,
      openCreateLesson,
      teacher,
    ],
  );

  const studentsRouteProps = useMemo(
    () => ({
      hasAccess: hasTeacherAccess,
      teacher,
      lessons,
      onActiveTabChange: setStudentActiveTab,
      studentListReloadKey,
    }),
    [hasTeacherAccess, lessons, setStudentActiveTab, studentListReloadKey, teacher],
  );

  const scheduleRouteProps = useMemo(
    () => ({
      lessons,
      linkedStudents,
      autoConfirmLessons: teacher.autoConfirmLessons,
    }),
    [lessons, linkedStudents, teacher.autoConfirmLessons],
  );

  const settingsRouteProps = useMemo(
    () => ({
      teacher,
      onTeacherChange: setTeacher,
      onNavigate: guardedNavigate,
    }),
    [guardedNavigate, teacher],
  );

  const homeworksRouteProps = useMemo<{ mode: 'teacher' | 'student' }>(
    () => ({
      mode: isStudentRole ? 'student' : 'teacher',
    }),
    [isStudentRole],
  );

  const studentDashboardRouteProps = useMemo(
    () => ({
      activeTeacherName: activeStudentContext?.teacherName ?? null,
    }),
    [activeStudentContext?.teacherName],
  );

  const studentSettingsRouteProps = useMemo(
    () => ({
      activeTeacherName: activeStudentContext?.teacherName ?? null,
    }),
    [activeStudentContext?.teacherName],
  );

  const dashboardSummaryRouteProps = useMemo(
    () => ({
      summary: dashboardSummaryData,
      isLoading: dashboardSummary.isLoading,
      refresh: dashboardSummary.refresh,
    }),
    [dashboardSummary.isLoading, dashboardSummary.refresh, dashboardSummaryData],
  );

  if (sessionState !== 'authenticated' || !hasTelegramAccess) {
    const fallbackState =
      sessionState === 'checking' || (hasTelegramInitData && telegramState === 'pending') ? 'checking' : 'unauthenticated';
    return <SessionFallback state={fallbackState} />;
  }

  if (isStudentRole && studentContextLoading) {
    return (
      <div id="app" className={`${layoutStyles.page} app-content`}>
        <div className="app-surface">
          <div className={layoutStyles.pageInner}>
            <main className={layoutStyles.content}>
              <div className={layoutStyles.content}>Загружаем контекст ученика…</div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  if (isStudentRole && studentContexts.length === 0) {
    return (
      <div id="app" className={`${layoutStyles.page} app-content`}>
        <div className="app-surface">
          <div className={layoutStyles.pageInner}>
            <main className={layoutStyles.content}>
              <div className={layoutStyles.content}>
                Вы не привязаны ни к одному преподавателю. Попросите преподавателя добавить ваш Telegram username.
              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  if (isStudentRole && studentContexts.length > 1 && !activeStudentContext) {
    return (
      <div id="app" className={`${layoutStyles.page} app-content`}>
        <div className="app-surface">
          <div className={layoutStyles.pageInner}>
            <main className={layoutStyles.content}>
              <div className={layoutStyles.content}>
                <h2>Выберите преподавателя</h2>
                {studentContexts.map((context) => (
                  <button
                    key={`${context.teacherId}_${context.studentId}`}
                    type="button"
                    onClick={() => {
                      applyStudentContext(context);
                      guardedNavigate(tabPathById.dashboard);
                    }}
                  >
                    {context.teacherName} · {context.studentName}
                  </button>
                ))}
              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  const showSubscriptionGate = !hasSubscription && !isStudentRole;

  return (
    <StudentsCardFiltersProvider value={studentCardFilters}>
      <StudentsDataProvider value={studentsData}>
        <StudentsActionsProvider value={studentsActions}>
          <StudentsHomeworkProvider value={studentsHomework}>
            <LessonActionsProvider value={lessonActions}>
              <DashboardStateProvider value={dashboardState}>
                <OnboardingStateProvider value={onboardingState}>
                  <ScheduleStateProvider value={scheduleState}>
                    <TimeZoneProvider timeZone={resolvedTimeZone}>
                <div id="app" className={`${layoutStyles.page} app-content`}>
                  <div className="app-surface">
                    <div
                      className={`${layoutStyles.pageInner} ${isDesktop ? layoutStyles.pageInnerDesktop : ''}`}
                    >
                      {isDesktop ? (
                        <Sidebar
                          pathname={location.pathname}
                          onNavigate={onSidebarNavigate}
                          onToggleCollapsed={onSidebarToggle}
                          items={sidebarItems}
                        />
                      ) : null}

                      <div className={layoutStyles.mainColumn}>
                        {isDesktop && !isStudentRole ? (
                          <Topbar
                            teacher={teacher}
                            title={desktopTopbarResolvedTitle}
                            subtitle={desktopTopbarResolvedSubtitle}
                            showCreateLesson={activeTab === 'dashboard' && hasTeacherAccess && !isTeacherTemplateEditorRoute}
                            showTemplateCreateActions={isTeacherTemplateEditorRoute}
                            showTemplateSaveDraft={!isTeacherTemplateEditRoute}
                            showBackButton={isTeacherTemplateEditorRoute}
                            onBack={() => guardedNavigate(tabPathById.homeworks)}
                            onSaveDraft={() => dispatchHomeworkTemplateCreateTopbarCommand('save')}
                            onCreateTemplate={() => dispatchHomeworkTemplateCreateTopbarCommand('submit')}
                            templateCreateSubmitting={templateCreateTopbarState.submitting}
                            templateCreateSubmitDisabled={templateCreateTopbarState.hasValidationErrors}
                            templateCreateActionLabel={templateCreateActionLabel}
                            templateCreateSubmittingLabel={templateCreateSubmittingLabel}
                            onOpenNotifications={onOpenNotifications}
                            onCreateLesson={onTopbarCreateLesson}
                            profilePhotoUrl={sessionUser?.photoUrl ?? null}
                          />
                        ) : null}

                        <main
                          className={`${layoutStyles.content} ${isTeacherTemplateEditorRoute ? layoutStyles.contentNoScroll : ''}`}
                        >
                          <AppRoutes
                            key={isStudentRole ? `student-${activeStudentContext?.teacherId ?? 'none'}-${studentContextRevision}` : 'teacher'}
                            isStudentRole={isStudentRole}
                            resolveLastVisitedPath={resolveLastVisitedPath}
                            dashboard={dashboardRouteProps}
                            students={studentsRouteProps}
                            schedule={scheduleRouteProps}
                            settings={settingsRouteProps}
                            dashboardSummary={dashboardSummaryRouteProps}
                            homeworks={homeworksRouteProps}
                            studentDashboard={studentDashboardRouteProps}
                            studentSettings={studentSettingsRouteProps}
                          />
                        </main>

                        {!isDesktop ? (
                          <Tabbar activeTab={activeTab} onTabChange={onTabbarNavigate} tabsList={availableTabs} />
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {!isStudentRole ? (
                    <AppModals
                      linkedStudents={linkedStudents}
                      dialogState={dialogState}
                      onCloseDialog={closeDialog}
                      onDialogStateChange={setDialogState}
                    />
                  ) : null}
                </div>
                {showSubscriptionGate ? <SubscriptionGate /> : null}
                    </TimeZoneProvider>
                  </ScheduleStateProvider>
                </OnboardingStateProvider>
              </DashboardStateProvider>
            </LessonActionsProvider>
          </StudentsHomeworkProvider>
        </StudentsActionsProvider>
      </StudentsDataProvider>
    </StudentsCardFiltersProvider>
  );
};

export const AppPage = () => (
  <UnsavedChangesProvider>
    <AppPageContent />
  </UnsavedChangesProvider>
);

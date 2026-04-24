import { format, startOfMonth } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlockNavigation, useLocation, useNavigate } from 'react-router-dom';
import { HomeworkGroupListItem, HomeworkTemplate, Lesson, Student, Teacher, TeacherStudent } from '../entities/types';
import { useSelectedStudent } from '../entities/student/model/selectedStudent';
import { api, type StudentContextLink } from '../shared/api/client';
import { useToast } from '../shared/lib/toast';
import { TimeZoneProvider } from '../shared/lib/timezoneContext';
import { formatInTimeZone, resolveTimeZone, toZonedDate } from '../shared/lib/timezoneDates';
import { useIsMobile } from '../shared/lib/useIsMobile';
import { useIsDesktop } from '../shared/lib/useIsDesktop';
import { trackEvent } from '../shared/lib/analytics';
import {
  getPwaNotificationPermission,
  markPwaNotificationPromptSeen,
  requestPwaNotificationPermission,
  sendPwaTestNotification,
  shouldPromptForPwaNotifications,
  syncPwaPushSubscription,
} from '../shared/lib/pwaNotifications';
import layoutStyles from './styles/layout.module.css';
import { Topbar, type TopbarCreateMenuItem } from '../widgets/layout/Topbar';
import { NotificationsBellButton } from '../features/notifications/bellDropdown/NotificationsBellButton';
import { Sidebar } from '../widgets/layout/Sidebar';
import { buildSidebarNavItems, type SidebarNavItem } from '../widgets/layout/model/navigation';
import { MobileBottomTabs } from '../widgets/layout/mobile/MobileBottomTabs';
import { MobileSidebarDrawer } from '../widgets/layout/mobile/MobileSidebarDrawer';
import { MobileTopbar } from '../widgets/layout/mobile/MobileTopbar';
import { buildMobileNavigation, type MobileNavItem } from '../widgets/layout/mobile/model/mobileNavigation';
import { SETTINGS_TABS } from '../widgets/settings/constants';
import { getTabsByRole, tabPathById, type TabId } from './tabs';
import { AppRoutes } from './components/AppRoutes';
import { AppModals } from './components/AppModals';
import { useTelegramWebAppAuth } from '../features/auth/telegram';
import { SessionFallback, useSessionStatus } from '../features/auth/session';
import { SubscriptionGate } from '../widgets/subscription/SubscriptionGate';
import { HomeworkAssignModal } from '../features/homework-assign/ui/HomeworkAssignModal';
import { type TeacherAssignmentEditorPrefill, type TeacherHomeworkStudentOption } from '../widgets/homeworks/types';
import { type StudentTabId } from '../widgets/students/types';
import { StudentsDataProvider, useStudentsDataInternal } from '../widgets/students/model/useStudentsData';
import { StudentsActionsProvider, useStudentsActionsInternal } from '../widgets/students/model/useStudentsActions';
import { StudentsHomeworkProvider, useStudentsHomeworkInternal } from '../widgets/students/model/useStudentsHomework';
import {
  HomeworkFileLinesIcon,
  HomeworkFolderIcon,
  HomeworkLinkIcon,
} from '../shared/ui/icons/HomeworkFaIcons';
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
import { ActiveUnsavedEntry, UnsavedChangesProvider, useUnsavedChanges } from '../shared/lib/unsavedChanges';
import { useAppDialogs } from './model/useAppDialogs';
import { useLinkedStudents } from './model/useLinkedStudents';
import { PASSWORD_LOGIN_ROUTE, PasswordLoginScreen } from '../features/auth/password';
import {
  dispatchHomeworkTemplateCreateTopbarCommand,
  type HomeworkTemplateCreateTopbarState,
  subscribeHomeworkTemplateCreateTopbarState,
} from '../features/homework-template-editor/model/lib/createTemplateTopbarBridge';
import {
  type HomeworkTemplateDetailTopbarState,
  subscribeHomeworkTemplateDetailTopbarState,
} from '../features/homework-template-view/model/lib/homeworkTemplateDetailTopbarBridge';

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
  weekendWeekdays: [],
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
  homeworks: 'Задания',
  analytics: 'Аналитика',
  settings: 'Настройки',
};

type NavigationBlockTx = {
  retry: () => void;
};

const mapStudentListItemsToHomeworkStudents = (
  items: Awaited<ReturnType<typeof api.listStudents>>['items'],
): TeacherHomeworkStudentOption[] =>
  items.map((item) => ({
    id: item.student.id,
    name: item.link.customName || item.student.username || `Ученик #${item.student.id}`,
    level: item.link.studentLevel ?? null,
    uiColor: item.link.uiColor ?? null,
  }));

const loadHomeworkAssignStudents = async (): Promise<TeacherHomeworkStudentOption[]> => {
  const result: TeacherHomeworkStudentOption[] = [];
  const visitedOffsets = new Set<number>();
  let offset = 0;

  while (!visitedOffsets.has(offset)) {
    visitedOffsets.add(offset);
    const response = await api.listStudents({ filter: 'all', limit: 100, offset });
    result.push(...mapStudentListItemsToHomeworkStudents(response.items));
    if (response.nextOffset === null) break;
    offset = response.nextOffset;
  }

  return result;
};

const AppPageContent = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const blockNavigation = useBlockNavigation();
  const { showToast } = useToast();
  const { getActiveEntry, clearEntry, requestNavigationBypass, consumeNavigationBypass } = useUnsavedChanges();
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
  const rosterLoadedRef = useRef(false);
  const rosterBootstrapInFlightRef = useRef(false);
  const dashboardHomeworksBootstrapInFlightRef = useRef(false);
  const dashboardHomeworksLoadedRef = useRef(false);
  const [studentListReloadKey, setStudentListReloadKey] = useState(0);
  const { selectedStudentId, setSelectedStudentId } = useSelectedStudent();
  const [studentActiveTab, setStudentActiveTab] = useState<StudentTabId>('overview');
  const [studentContexts, setStudentContexts] = useState<StudentContextLink[]>([]);
  const [activeStudentContext, setActiveStudentContext] = useState<StudentContextLink | null>(null);
  const [studentContextLoading, setStudentContextLoading] = useState(false);
  const [studentContextRevision, setStudentContextRevision] = useState(0);
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const isMobile = useIsMobile(767);
  const isDesktop = useIsDesktop();
  const [templateCreateTopbarState, setTemplateCreateTopbarState] = useState<HomeworkTemplateCreateTopbarState>({
    submitting: false,
    hasValidationErrors: false,
    primaryActionDisabled: false,
    draftSavedAtLabel: null,
    subtitleOverride: null,
    showSecondaryAction: false,
    showPrimaryAction: true,
    secondaryActionLabel: '',
    primaryActionLabel: '',
    primarySubmittingLabel: '',
  });
  const [homeworkDetailTopbarState, setHomeworkDetailTopbarState] = useState<HomeworkTemplateDetailTopbarState | null>(null);
  const [homeworkAssignModalOpen, setHomeworkAssignModalOpen] = useState(false);
  const [homeworkAssignSubmitting, setHomeworkAssignSubmitting] = useState(false);
  const [homeworkAssignLoading, setHomeworkAssignLoading] = useState(false);
  const [homeworkAssignTemplates, setHomeworkAssignTemplates] = useState<HomeworkTemplate[]>([]);
  const [homeworkAssignGroups, setHomeworkAssignGroups] = useState<HomeworkGroupListItem[]>([]);
  const [homeworkAssignStudents, setHomeworkAssignStudents] = useState<TeacherHomeworkStudentOption[]>([]);
  const [homeworkAssignDefaults, setHomeworkAssignDefaults] = useState<{ studentId: number | null; lessonId: number | null }>({
    studentId: null,
    lessonId: null,
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
    openLessonEditPaymentResetDialog,
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
  const isStudentProfileRoute = !isStudentRole && /^\/students\/\d+\/?$/.test(location.pathname);
  const effectiveStudentHomeworkFilter = isStudentProfileRoute ? 'all' : studentCardFilters.homeworkFilter;
  const effectiveStudentLessonPaymentFilter = isStudentProfileRoute ? 'all' : studentCardFilters.lessonPaymentFilter;
  const effectiveStudentLessonStatusFilter = isStudentProfileRoute ? 'all' : studentCardFilters.lessonStatusFilter;
  const effectiveStudentLessonSortOrder = isStudentProfileRoute ? 'asc' : studentCardFilters.lessonSortOrder;
  const effectiveStudentLessonDateRange = isStudentProfileRoute
    ? { from: '', to: '', fromTime: '00:00', toTime: '23:59' }
    : studentCardFilters.lessonDateRange;

  const studentsData = useStudentsDataInternal({
    hasAccess: hasTeacherAccess,
    timeZone: resolvedTimeZone,
    selectedStudentId,
    studentActiveTab,
    homeworkFilter: effectiveStudentHomeworkFilter,
    lessonPaymentFilter: effectiveStudentLessonPaymentFilter,
    lessonStatusFilter: effectiveStudentLessonStatusFilter,
    lessonDateRange: effectiveStudentLessonDateRange,
    lessonSortOrder: effectiveStudentLessonSortOrder,
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

  const showUnsavedChangesDialog = useCallback(
    (active: ActiveUnsavedEntry, handlers: { onProceed: () => void; onStay?: () => void }) => {
      const cancelKeepsEditing = Boolean(active.entry.cancelKeepsEditing);

      openConfirmDialog({
        title: active.entry.title ?? 'Несохранённые изменения',
        message: active.entry.message ?? 'Вы изменили данные. Сохранить перед выходом?',
        confirmText: active.entry.confirmText ?? 'Сохранить',
        cancelText:
          active.entry.cancelText ?? (cancelKeepsEditing ? 'Остаться' : 'Выйти без сохранения'),
        onConfirm: () => {
          active.entry
            .onSave()
            .then((ok) => {
              if (!ok) return;
              clearEntry(active.key);
              handlers.onProceed();
            })
            .catch(() => {
              showToast({
                message: active.entry.onSaveErrorMessage ?? 'Не удалось сохранить изменения',
                variant: 'error',
              });
            });
        },
        onCancel: () => {
          if (cancelKeepsEditing) {
            handlers.onStay?.();
            return;
          }
          active.entry.onDiscard?.();
          clearEntry(active.key);
          handlers.onProceed();
        },
      });
    },
    [clearEntry, openConfirmDialog, showToast],
  );

  const guardedNavigate = useCallback(
    (to: string, options?: { replace?: boolean; state?: unknown }) => {
      const active = getActiveEntry();
      if (!active || !active.entry.isDirty) {
        navigate(to, options);
        return;
      }

      showUnsavedChangesDialog(active, {
        onProceed: () => {
          requestNavigationBypass();
          navigate(to, options);
        },
      });
    },
    [getActiveEntry, navigate, requestNavigationBypass, showUnsavedChangesDialog],
  );
  const blockDialogOpenRef = useRef(false);
  const skipNextBlockRef = useRef(false);
  const activeUnsavedEntry = getActiveEntry();
  const hasUnsavedChanges = Boolean(activeUnsavedEntry?.entry.isDirty);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;

    const unblock = blockNavigation((tx: NavigationBlockTx) => {
      if (skipNextBlockRef.current || consumeNavigationBypass()) {
        skipNextBlockRef.current = false;
        tx.retry();
        return;
      }
      if (blockDialogOpenRef.current) return;

      const active = getActiveEntry();
      if (!active || !active.entry.isDirty) {
        tx.retry();
        return;
      }

      blockDialogOpenRef.current = true;
      showUnsavedChangesDialog(active, {
        onProceed: () => {
          blockDialogOpenRef.current = false;
          tx.retry();
        },
        onStay: () => {
          blockDialogOpenRef.current = false;
        },
      });
    });

    return () => {
      blockDialogOpenRef.current = false;
      unblock();
    };
  }, [blockNavigation, consumeNavigationBypass, getActiveEntry, hasUnsavedChanges, showUnsavedChangesDialog]);

  const navigateToStudents = useCallback(() => {
    guardedNavigate(tabPathById.students);
  }, [guardedNavigate]);

  const navigateToStudentProfile = useCallback((studentId: number) => {
    guardedNavigate(`${tabPathById.students}/${studentId}`);
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

  const activeTabByPath = useMemo<TabId | null>(() => {
    const matchedTab = availableTabs.find(
      (tab) => location.pathname === tab.path || location.pathname.startsWith(`${tab.path}/`),
    );
    return matchedTab?.id ?? null;
  }, [availableTabs, location.pathname]);

  const activeTab = useMemo<TabId>(() => {
    if (activeTabByPath) return activeTabByPath;

    if (location.pathname === '/') {
      const storedPath = typeof window !== 'undefined' ? window.localStorage.getItem(LAST_VISITED_ROUTE_KEY) : null;
      if (storedPath) {
        const storedTab = availableTabs.find((tab) => tab.path === storedPath);
        if (storedTab) return storedTab.id;
      }
    }

    return 'dashboard';
  }, [activeTabByPath, availableTabs, location.pathname]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!hasAccess) return;
    if (!location.search) return;
    const params = new URLSearchParams(location.search);
    const assignmentId = params.get('assignmentId');
    const lessonId = params.get('lessonId');
    if (assignmentId && /^\d+$/.test(assignmentId)) {
      const target = isStudentRole
        ? `/homeworks/${assignmentId}`
        : `/homeworks/assignments/${assignmentId}`;
      navigate(target, { replace: true });
      return;
    }
    if (lessonId && /^\d+$/.test(lessonId) && location.pathname !== tabPathById.schedule) {
      if (isStudentRole) {
        navigate(tabPathById.dashboard, { replace: true });
        return;
      }
      navigate(`${tabPathById.schedule}?lessonId=${encodeURIComponent(lessonId)}`, { replace: true });
    }
  }, [hasAccess, isStudentRole, location.pathname, location.search, navigate]);

  const activeTabNeedsRoster =
    activeTabByPath === 'dashboard' || activeTabByPath === 'schedule' || activeTabByPath === 'students';
  const activeTabNeedsDashboardHomeworks = activeTabByPath === 'dashboard';

  const isTeacherAssignmentCreateRoute = !isStudentRole && /^\/homeworks\/new\/?$/.test(location.pathname);
  const isTeacherAssignmentEditRoute = !isStudentRole && /^\/homeworks\/assignments\/\d+\/edit\/?$/.test(location.pathname);
  const isTeacherAssignmentDetailRoute = !isStudentRole && /^\/homeworks\/assignments\/\d+\/?$/.test(location.pathname);
  const isTeacherTemplateCreateRoute = !isStudentRole && /^\/homeworks\/templates\/new\/?$/.test(location.pathname);
  const isTeacherTemplateEditRoute = !isStudentRole && /^\/homeworks\/\d+\/edit\/?$/.test(location.pathname);
  const isTeacherHomeworksRootRoute = !isStudentRole && location.pathname === tabPathById.homeworks;
  const isTeacherHomeworkSourceDetailRoute = !isStudentRole && /^\/homeworks\/\d+\/?$/.test(location.pathname);
  const isTeacherHomeworkReviewRoute = !isStudentRole && /^\/homeworks\/review\/\d+\/?$/.test(location.pathname);
  const isTeacherTemplateEditorRoute = isTeacherTemplateCreateRoute || isTeacherTemplateEditRoute;
  const isTeacherHomeworkEditorRoute = isTeacherAssignmentCreateRoute || isTeacherAssignmentEditRoute;
  const isTeacherAnyHomeworkEditorRoute = isTeacherTemplateEditorRoute || isTeacherHomeworkEditorRoute;
  const mobileSettingsDetail = useMemo(() => {
    if (activeTab !== 'settings') return null;

    const pathSegments = location.pathname.split('/').filter(Boolean);
    const queryTab = new URLSearchParams(location.search).get('tab');
    const candidate = pathSegments[0] === 'settings' && pathSegments[1] ? pathSegments[1] : queryTab;

    return SETTINGS_TABS.find((tab) => tab.id === candidate) ?? null;
  }, [activeTab, location.pathname, location.search]);
  const isMobileSettingsRootRoute = !isDesktop && activeTab === 'settings' && !mobileSettingsDetail;
  const isMobileSettingsDetailRoute = !isDesktop && activeTab === 'settings' && Boolean(mobileSettingsDetail);
  const teacherHomeworkEditorBackPath = isTeacherTemplateEditorRoute
    ? tabPathById.homeworks
    : tabPathById.homeworks;

  const desktopTopbarTitle = desktopTitleByTab[activeTab];
  const desktopTopbarResolvedTitle = isTeacherHomeworkEditorRoute
    ? isTeacherAssignmentEditRoute
      ? 'Редактирование домашнего задания'
      : 'Создание домашнего задания'
    : isTeacherTemplateEditorRoute
      ? isTeacherTemplateEditRoute
        ? 'Редактирование домашнего задания'
        : 'Создание домашнего задания'
      : isTeacherHomeworkSourceDetailRoute
        ? 'Домашнее задание'
      : desktopTopbarTitle;
  const desktopTopbarTitleWithOverrides = homeworkDetailTopbarState?.title ?? desktopTopbarResolvedTitle;
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
  const desktopTopbarResolvedSubtitle = isTeacherHomeworkEditorRoute
    ? templateCreateTopbarState.subtitleOverride ??
      (isTeacherAssignmentEditRoute
      ? 'Обновите контент и параметры выдачи'
      : 'Соберите домашку и подготовьте её к отправке'
      )
    : isTeacherTemplateEditorRoute
      ? templateCreateTopbarState.draftSavedAtLabel
        ? `Черновик сохранен: ${templateCreateTopbarState.draftSavedAtLabel}`
        : isTeacherTemplateEditRoute
          ? 'Обновите структуру и материалы домашнего задания'
          : 'Новая домашка, которую можно будет выдавать ученикам'
      : isTeacherHomeworkSourceDetailRoute
        ? 'Карточка домашнего задания и история выдач по ученикам'
      : desktopDateLabel;
  const isHomeworkDetailTopbarVisible = Boolean(homeworkDetailTopbarState);
  const hasDesktopHomeworkDetailChrome =
    isTeacherHomeworkSourceDetailRoute || isTeacherAssignmentDetailRoute || isHomeworkDetailTopbarVisible;
  const desktopTopbarSubtitleWithOverrides = homeworkDetailTopbarState?.subtitle ?? desktopTopbarResolvedSubtitle;
  const isDesktopHomeworksLibraryChrome =
    activeTab === 'homeworks' && !hasDesktopHomeworkDetailChrome && !isTeacherAnyHomeworkEditorRoute;
  const editorPrimaryActionLabel = templateCreateTopbarState.primaryActionLabel || (
    isTeacherHomeworkEditorRoute
      ? (isTeacherAssignmentEditRoute ? 'Выдать' : 'Создать')
      : 'Сохранить'
  );
  const editorSecondaryActionLabel = templateCreateTopbarState.secondaryActionLabel || 'Сохранить черновик';
  const showEditorSecondaryAction =
    templateCreateTopbarState.showSecondaryAction || isTeacherTemplateCreateRoute;
  const editorPrimarySubmittingLabel =
    templateCreateTopbarState.primarySubmittingLabel || (
      isTeacherHomeworkEditorRoute
        ? (isTeacherAssignmentEditRoute ? 'Выдаю…' : 'Создаю…')
        : 'Сохраняю…'
    );
  const editorPrimaryDisabled =
    templateCreateTopbarState.hasValidationErrors || templateCreateTopbarState.primaryActionDisabled;

  useEffect(() => {
    return subscribeHomeworkTemplateCreateTopbarState((state) => {
      setTemplateCreateTopbarState(state);
    });
  }, []);

  useEffect(() => {
    return subscribeHomeworkTemplateDetailTopbarState((state) => {
      setHomeworkDetailTopbarState(state);
    });
  }, []);

  const dashboardState = useDashboardStateInternal({
    hasAccess: hasTeacherAccess,
    timeZone: resolvedTimeZone,
    isActive: hasTeacherAccess && activeTabByPath === 'dashboard',
    buildLessonRange,
    loadLessonsForRange,
  });

  const dashboardSummary = useDashboardSummaryInternal({
    hasAccess: hasTeacherAccess,
    isActive: hasTeacherAccess && activeTabByPath === 'dashboard',
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

  const refreshDashboardSummaryIfActive = useCallback(() => {
    if (activeTabByPath !== 'dashboard') return;
    dashboardSummary.refresh();
    // dashboardSummary — объект-результат хука, пересоздаётся каждый рендер; стабильна именно .refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabByPath, dashboardSummary.refresh]);

  const openDashboardHomeworkAssignModal = useCallback(
    (studentId?: number | null, lessonId?: number | null) => {
      setHomeworkAssignDefaults({
        studentId: typeof studentId === 'number' && Number.isFinite(studentId) ? studentId : null,
        lessonId: typeof lessonId === 'number' && Number.isFinite(lessonId) ? lessonId : null,
      });
      setHomeworkAssignModalOpen(true);
    },
    [],
  );

  const closeDashboardHomeworkAssignModal = useCallback(() => {
    if (homeworkAssignSubmitting) return;
    setHomeworkAssignModalOpen(false);
  }, [homeworkAssignSubmitting]);

  const handleDashboardHomeworkAssignSubmit = useCallback(
    async (payload: TeacherAssignmentEditorPrefill) => {
      if (!payload.studentId || !payload.templateId) {
        showToast({ message: 'Выберите ученика и домашнее задание', variant: 'error' });
        return false;
      }

      setHomeworkAssignSubmitting(true);
      try {
        let assignmentResponse = await api.createHomeworkAssignmentV2({
          studentId: payload.studentId,
          lessonId: payload.lessonId ?? undefined,
          templateId: payload.templateId,
          groupId: payload.groupId ?? undefined,
          sendMode: payload.sendMode,
          scheduledFor: payload.scheduledFor ?? null,
          deadlineAt: payload.deadlineAt,
        });

        if (
          payload.sendMode === 'MANUAL' &&
          (assignmentResponse.assignment.status === 'DRAFT' || assignmentResponse.assignment.status === 'SCHEDULED')
        ) {
          assignmentResponse = await api.sendHomeworkAssignmentV2(assignmentResponse.assignment.id);
        }

        void refreshDashboardSummaryIfActive();
        showToast({
          message:
            payload.sendMode === 'MANUAL'
              ? 'Домашнее задание выдано'
              : payload.sendMode === 'AUTO_AFTER_LESSON_DONE'
                ? 'Выдача домашнего задания запланирована после урока'
                : 'Выдача домашнего задания запланирована на дату',
          variant: 'success',
        });
        return true;
      } catch (error) {
         
        console.error('Failed to create homework assignment from dashboard sheet', error);
        showToast({ message: 'Не удалось выдать домашнее задание', variant: 'error' });
        return false;
      } finally {
        setHomeworkAssignSubmitting(false);
      }
    },
    [refreshDashboardSummaryIfActive, showToast],
  );

  useEffect(() => {
    if (!homeworkAssignModalOpen || !hasTeacherAccess) return undefined;

    let isCancelled = false;
    setHomeworkAssignLoading(true);

    void Promise.all([
      api.listHomeworkTemplatesV2({ includeArchived: false }),
      api.listHomeworkGroupsV2(),
      loadHomeworkAssignStudents(),
    ])
      .then(([templatesResponse, groupsResponse, studentsResponse]) => {
        if (isCancelled) return;
        setHomeworkAssignTemplates(templatesResponse.items);
        setHomeworkAssignGroups(groupsResponse.items);
        setHomeworkAssignStudents(studentsResponse);
      })
      .catch((error) => {
         
        console.error('Failed to preload homework assign modal data', error);
        if (isCancelled) return;
        showToast({ message: 'Не удалось загрузить данные для домашки', variant: 'error' });
      })
      .finally(() => {
        if (isCancelled) return;
        setHomeworkAssignLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [hasTeacherAccess, homeworkAssignModalOpen, showToast]);

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
    navigateToStudentProfile,
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
      refreshDashboardSummaryIfActive();
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
    isActive: hasTeacherAccess && activeTabByPath === 'schedule',
    scheduleView,
    dayViewDate,
    buildDayRange,
    buildWeekRange,
    buildMonthRange,
    loadLessonsForRange,
  });

  const loadStudentLessonsIfStudentsTab = useCallback(async () => {
    if (activeTabByPath !== 'students') return;
    await loadStudentLessons();
  }, [activeTabByPath, loadStudentLessons]);

  const loadStudentLessonsSummaryIfStudentsTab = useCallback(async () => {
    if (activeTabByPath !== 'students') return;
    await loadStudentLessonsSummary();
  }, [activeTabByPath, loadStudentLessonsSummary]);

  const loadStudentUnpaidLessonsIfStudentsTab = useCallback(
    async (options?: { studentIdOverride?: number | null; force?: boolean }) => {
      if (activeTabByPath !== 'students') return;
      await loadStudentUnpaidLessons(options);
    },
    [activeTabByPath, loadStudentUnpaidLessons],
  );

  const loadDashboardUnpaidLessonsIfDashboardTab = useCallback(async () => {
    if (activeTabByPath !== 'dashboard') return;
    await dashboardState.loadUnpaidLessons();
    // dashboardState — объект-результат хука, пересоздаётся каждый рендер; стабильна именно .loadUnpaidLessons.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabByPath, dashboardState.loadUnpaidLessons]);

  const refreshPaymentsIfStudentsTab = useCallback(
    async (studentId: number) => {
      if (activeTabByPath !== 'students') return;
      await refreshPayments(studentId);
    },
    [activeTabByPath, refreshPayments],
  );

  const refreshPaymentRemindersIfStudentsTab = useCallback(
    async (studentId: number) => {
      if (activeTabByPath !== 'students') return;
      await refreshPaymentReminders(studentId);
    },
    [activeTabByPath, refreshPaymentReminders],
  );

  const lessonActions = useLessonActionsInternal({
    timeZone: resolvedTimeZone,
    teacherDefaultLessonDuration: teacher.defaultLessonDuration,
    teacherWeekendWeekdays: teacher.weekendWeekdays,
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
    openLessonEditPaymentResetDialog,
    navigateToSchedule,
    setDayViewDate,
    filterLessonsForCurrentRange,
    syncLessonsInRanges,
    removeLessonsFromRanges,
    loadStudentLessons: loadStudentLessonsIfStudentsTab,
    loadStudentLessonsSummary: loadStudentLessonsSummaryIfStudentsTab,
    loadStudentUnpaidLessons: loadStudentUnpaidLessonsIfStudentsTab,
    loadDashboardUnpaidLessons: loadDashboardUnpaidLessonsIfDashboardTab,
    refreshPayments: refreshPaymentsIfStudentsTab,
    refreshPaymentReminders: refreshPaymentRemindersIfStudentsTab,
    triggerStudentsListReload,
    studentDebtItems,
    onLessonCreateStarted: (source) => {
      track('lesson_create_started', { source: resolveAnalyticsSource(source) });
    },
    onLessonCreated: ({ lesson, source }) => {
      if (source.startsWith('onboarding')) {
        onboardingState.setCreatedLesson(lesson);
      }
      refreshDashboardSummaryIfActive();
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
      let lessonIso = date
        ? format(lessonDate, 'yyyy-MM-dd')
        : formatInTimeZone(lessonDate, 'yyyy-MM-dd', { timeZone: resolvedTimeZone });

      if (date) {
        setScheduleView('month');
        setDayViewDate(lessonDate);
        setMonthAnchor(startOfMonth(lessonDate));
        setMonthOffset(0);
        setSelectedMonthDay(lessonIso);
      }

      const durationForDefault =
        typeof teacher.defaultLessonDuration === 'number' && teacher.defaultLessonDuration > 0
          ? teacher.defaultLessonDuration
          : 60;

      const roundedStartTime = (() => {
        if (date) return undefined;
        const now = new Date();
        const currentMinutes = Number(formatInTimeZone(now, 'm', { timeZone: resolvedTimeZone }));
        const currentHours = Number(formatInTimeZone(now, 'H', { timeZone: resolvedTimeZone }));
        let slotHours = currentHours;
        let slotMinutes = currentMinutes < 30 ? 30 : 0;
        if (currentMinutes >= 30) {
          slotHours = currentHours + 1;
        }
        // Если слот не вмещает урок полной длительности до полуночи — переносим на 9:00 следующего дня.
        const slotStartMinutes = slotHours * 60 + slotMinutes;
        if (slotStartMinutes + durationForDefault > 24 * 60) {
          slotHours = 9;
          slotMinutes = 0;
          const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          lessonIso = formatInTimeZone(tomorrow, 'yyyy-MM-dd', { timeZone: resolvedTimeZone });
        }
        return `${String(slotHours).padStart(2, '0')}:${String(slotMinutes).padStart(2, '0')}`;
      })();

      openLessonModal(
        lessonIso,
        roundedStartTime,
        undefined,
        { skipNavigation: true, variant: isDesktop ? 'modal' : 'sheet' },
      );
    },
    [
      isDesktop,
      openLessonModal,
      resolvedTimeZone,
      setDayViewDate,
      setMonthAnchor,
      setMonthOffset,
      setScheduleView,
      setSelectedMonthDay,
      teacher.defaultLessonDuration,
    ],
  );

  const onSidebarNavigate = useCallback(
    (item: SidebarNavItem) => {
      track('nav_click', { item: item.id, placement: 'sidebar' });
      guardedNavigate(item.href);
    },
    [guardedNavigate, track],
  );

  const onSidebarToggle = useCallback(
    (collapsed: boolean) => {
      track('sidebar_toggle', { collapsed });
    },
    [track],
  );

  const requestPwaNotifications = useCallback(
    async (source: 'launch' | 'bell') => {
      const permission = getPwaNotificationPermission();

      if (permission === 'unsupported') {
        showToast({
          message: 'На этом устройстве браузерные уведомления пока не поддерживаются.',
          variant: 'error',
        });
        return false;
      }

      let nextPermission: ReturnType<typeof getPwaNotificationPermission> = permission;
      if (nextPermission === 'default') {
        nextPermission = await requestPwaNotificationPermission();
      }

      if (nextPermission === 'denied') {
        showToast({
          message: 'Уведомления отключены в Safari. Разрешите их в настройках сайта.',
          variant: 'error',
        });
        return false;
      }

      if (nextPermission !== 'granted') {
        showToast({
          message: 'Не удалось включить уведомления на этом устройстве.',
          variant: 'error',
        });
        return false;
      }

      const result = await sendPwaTestNotification();
      const failureReason = 'reason' in result ? result.reason : null;
      if (!result.ok) {
        showToast({
          message:
            failureReason === 'permission'
              ? 'Сначала разрешите уведомления для TeacherBot.'
              : failureReason === 'subscription'
                ? 'Не удалось подключить это устройство к push-уведомлениям.'
                : failureReason === 'unsupported'
                  ? 'На этом устройстве push-уведомления пока не поддерживаются.'
                  : 'Не удалось отправить тестовое уведомление.',
          variant: 'error',
        });
        return false;
      }

      showToast({
        message:
          result.transport === 'push'
            ? source === 'bell'
              ? 'Тестовый push отправлен на это устройство.'
              : 'Уведомления включены. Отправили тестовый push.'
            : source === 'bell'
              ? 'Локальное уведомление отправлено. Серверный push пока не настроен.'
              : 'Разрешение включено. Локальное уведомление работает, серверный push ещё не настроен.',
        variant: 'success',
      });
      return true;
    },
    [showToast],
  );

  const hasOpenedPwaNotificationsPromptRef = useRef(false);
  const hasSyncedPwaSubscriptionRef = useRef(false);

  useEffect(() => {
    if (!hasAccess || !isMobile) return;
    if (hasOpenedPwaNotificationsPromptRef.current) return;
    if (!shouldPromptForPwaNotifications()) return;

    hasOpenedPwaNotificationsPromptRef.current = true;
    markPwaNotificationPromptSeen();

    openConfirmDialog({
      title: 'Включить уведомления?',
      message:
        'TeacherBot сможет присылать напоминания и важные события прямо на телефон. Разрешить уведомления для этого приложения?',
      confirmText: 'Включить',
      cancelText: 'Позже',
      onConfirm: async () => {
        await requestPwaNotifications('launch');
      },
    });
  }, [hasAccess, isMobile, openConfirmDialog, requestPwaNotifications]);

  useEffect(() => {
    if (!hasAccess || !isMobile) return;
    if (hasSyncedPwaSubscriptionRef.current) return;
    if (getPwaNotificationPermission() !== 'granted') return;

    hasSyncedPwaSubscriptionRef.current = true;
    void syncPwaPushSubscription().catch(() => undefined);
  }, [hasAccess, isMobile]);

  const onOpenNotifications = useCallback(() => {
    if (isMobile && activeTabByPath === 'dashboard') {
      void requestPwaNotifications('bell');
      return;
    }

    guardedNavigate('/settings/notifications');
  }, [activeTabByPath, guardedNavigate, isMobile, requestPwaNotifications]);

  const renderNotificationBell = useCallback(
    (triggerClassName: string) => (
      <NotificationsBellButton
        timeZone={resolvedTimeZone}
        triggerClassName={triggerClassName}
        enabled={hasAccess}
        onOpen={() => {
          if (isMobile && activeTabByPath === 'dashboard') {
            void requestPwaNotifications('bell');
          }
        }}
        onNavigateAll={() => guardedNavigate('/dashboard')}
        onNavigateSettings={() => guardedNavigate('/settings/notifications')}
      />
    ),
    [activeTabByPath, guardedNavigate, hasAccess, isMobile, requestPwaNotifications, resolvedTimeZone],
  );

  const sidebarItems = useMemo(() => buildSidebarNavItems(availableTabs), [availableTabs]);
  const homeworksBadgeCount = useMemo(() => {
    if (!hasTeacherAccess) return undefined;
    if (homeworks.length === 0) return undefined;
    const count = homeworks.filter((homework) => homework.status !== 'DONE' && !homework.isDone).length;
    return count > 0 ? count : undefined;
  }, [hasTeacherAccess, homeworks]);
  const mobileNavItems = useMemo(
    () =>
      buildMobileNavigation({
        tabs: availableTabs,
        isStudentRole,
        homeworksBadgeCount,
      }),
    [availableTabs, homeworksBadgeCount, isStudentRole],
  );
  const mobileDrawerItems = useMemo(
    () => mobileNavItems.filter((item) => item.placement === 'drawer'),
    [mobileNavItems],
  );
  const mobileTabbarItems = useMemo(
    () => mobileNavItems.filter((item) => item.placement === 'tabbar'),
    [mobileNavItems],
  );
  const onMobileNavigate = useCallback(
    (item: MobileNavItem) => {
      track('nav_click', {
        item: item.id,
        placement: item.placement === 'tabbar' ? 'bottom_tabs' : 'mobile_sidebar',
      });
      guardedNavigate(item.href);
      setMobileSidebarOpen(false);
    },
    [guardedNavigate, track],
  );
  const onMobileOpenProfileSettings = useCallback(() => {
    guardedNavigate('/settings/profile');
    setMobileSidebarOpen(false);
  }, [guardedNavigate]);
  const mobileProfileName = useMemo(() => {
    if (activeStudentContext?.teacherName) return activeStudentContext.teacherName;
    return teacher.name ?? teacher.username ?? 'TeacherBot';
  }, [activeStudentContext?.teacherName, teacher.name, teacher.username]);
  const mobilePlanLabel = hasSubscription ? 'Pro Plan' : 'Free Plan';

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
    if (!activeTabByPath) return;
    const loadInitial = async () => {
      try {
        const initialRange =
          activeTabByPath === 'schedule'
            ? scheduleView === 'month'
              ? buildMonthRange()
              : scheduleView === 'week'
                ? buildWeekRange(dayViewDate)
                : buildDayRange(dayViewDate)
            : activeTabByPath === 'dashboard' && dashboardState.weekRange
              ? buildLessonRange(dashboardState.weekRange.start, dashboardState.weekRange.end)
              : null;
        initialBootstrapDone.current = true;
        const data = await api.bootstrap(
          initialRange
            ? {
                lessonsStart: initialRange.startAt.toISOString(),
                lessonsEnd: initialRange.endAt.toISOString(),
                includeHomeworks: activeTabNeedsDashboardHomeworks,
                includeStudents: activeTabNeedsRoster,
                includeLinks: activeTabNeedsRoster,
              }
            : {
                includeHomeworks: activeTabNeedsDashboardHomeworks,
                includeStudents: activeTabNeedsRoster,
                includeLinks: activeTabNeedsRoster,
              },
        );

        setTeacher(data.teacher ?? initialTeacher);
        setStudents(data.students ?? []);
        setLinks(data.links ?? []);
        rosterLoadedRef.current = activeTabNeedsRoster;
        if (activeTabNeedsDashboardHomeworks) {
          dashboardHomeworksLoadedRef.current = true;
          studentsHomework.replaceHomeworks(data.homeworks ?? []);
        }
        if (initialRange) {
          applyLessonsForRange(initialRange, data.lessons ?? []);
        }

      } catch (error) {
         
        console.error('Failed to bootstrap app', error);
      }
    };

    loadInitial();
    // studentsHomework — объект-результат хука; зависим от конкретного .replaceHomeworks, сам объект не нужен.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeTabByPath,
    activeTabNeedsDashboardHomeworks,
    activeTabNeedsRoster,
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

  useEffect(() => {
    if (!hasTeacherAccess) return;
    if (!initialBootstrapDone.current) return;
    if (!activeTabNeedsRoster) return;
    if (!activeTabByPath) return;
    if (rosterLoadedRef.current) return;
    if (rosterBootstrapInFlightRef.current) return;

    rosterBootstrapInFlightRef.current = true;
    void api
      .bootstrap({
        includeStudents: true,
        includeLinks: true,
        includeHomeworks: activeTabNeedsDashboardHomeworks,
      })
      .then((data) => {
        setStudents(data.students ?? []);
        setLinks(data.links ?? []);
        rosterLoadedRef.current = true;
        if (activeTabNeedsDashboardHomeworks) {
          dashboardHomeworksLoadedRef.current = true;
          studentsHomework.replaceHomeworks(data.homeworks ?? []);
        }
      })
      .catch((error) => {
         
        console.error('Failed to bootstrap roster', error);
      })
      .finally(() => {
        rosterBootstrapInFlightRef.current = false;
      });
    // studentsHomework — объект-результат хука; зависим от конкретного .replaceHomeworks, сам объект не нужен.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeTabByPath,
    activeTabNeedsDashboardHomeworks,
    activeTabNeedsRoster,
    hasTeacherAccess,
    studentsHomework.replaceHomeworks,
  ]);

  useEffect(() => {
    if (!hasTeacherAccess) return;
    if (!initialBootstrapDone.current) return;
    if (!activeTabNeedsDashboardHomeworks) return;
    if (dashboardHomeworksLoadedRef.current) return;
    if (dashboardHomeworksBootstrapInFlightRef.current) return;

    dashboardHomeworksBootstrapInFlightRef.current = true;
    void api
      .bootstrap({
        includeHomeworks: true,
        includeStudents: false,
        includeLinks: false,
      })
      .then((data) => {
        dashboardHomeworksLoadedRef.current = true;
        studentsHomework.replaceHomeworks(data.homeworks ?? []);
      })
      .catch((error) => {
         
        console.error('Failed to bootstrap dashboard homeworks', error);
      })
      .finally(() => {
        dashboardHomeworksBootstrapInFlightRef.current = false;
      });
    // studentsHomework — объект-результат хука; зависим от конкретного .replaceHomeworks, сам объект не нужен.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabNeedsDashboardHomeworks, hasTeacherAccess, studentsHomework.replaceHomeworks]);

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
    openCreateStudentModal({ variant: isDesktop ? 'modal' : 'sheet' });
  }, [isDesktop, openCreateStudentModal]);

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
      guardedNavigate(`${tabPathById.students}/${studentId}`);
    },
    [guardedNavigate, setSelectedStudentId],
  );

  const onDashboardOpenHomeworkAssign = useCallback(
    (studentId?: number | null, lessonId?: number | null) => {
      if (!isDesktop) {
        openDashboardHomeworkAssignModal(studentId, lessonId);
        return;
      }

      guardedNavigate(tabPathById.homeworks, {
        state: {
          openAssignModal: true,
          studentId: typeof studentId === 'number' ? studentId : null,
          lessonId: typeof lessonId === 'number' ? lessonId : null,
        },
      });
    },
    [guardedNavigate, isDesktop, openDashboardHomeworkAssignModal],
  );

  const onTopbarCreateAction = useCallback(() => {
    if (activeTab === 'homeworks') {
      guardedNavigate(`${tabPathById.homeworks}/new`);
      return;
    }
    if (activeTab === 'students') {
      onDashboardAddStudent();
      return;
    }
    onTopbarCreateLesson();
  }, [activeTab, guardedNavigate, onDashboardAddStudent, onTopbarCreateLesson]);

  const homeworkTopbarCreateMenuItems = useMemo<TopbarCreateMenuItem[]>(
    () => [
      {
        id: 'create_homework',
        label: 'Создать домашнее задание',
        description: 'Открыть экран создания и сразу настроить выдачу домашнего задания ученику.',
        onSelect: () => guardedNavigate(`${tabPathById.homeworks}/new`),
        icon: <HomeworkFileLinesIcon size={12} />,
        iconTone: 'dark',
      },
      {
        id: 'assign_homework',
        label: 'Отправить домашнее задание',
        description: 'Выдать уже готовую домашку ученику или группе учеников.',
        onSelect: () => openDashboardHomeworkAssignModal(),
        icon: <HomeworkLinkIcon size={12} />,
        iconTone: 'lime',
      },
      {
        id: 'create_collection',
        label: 'Создать коллекцию',
        description: 'Собрать тематическую подборку домашних заданий.',
        onSelect: () => guardedNavigate(`${tabPathById.homeworks}?createCollection=1`),
        icon: <HomeworkFolderIcon size={12} />,
        iconTone: 'blue',
      },
    ],
    [guardedNavigate, openDashboardHomeworkAssignModal],
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
      onOpenHomeworkAssign: onDashboardOpenHomeworkAssign,
      studentListReloadKey,
    }),
    [
      hasTeacherAccess,
      lessons,
      onDashboardOpenHomeworkAssign,
      setStudentActiveTab,
      studentListReloadKey,
      teacher,
    ],
  );

  const scheduleRouteProps = useMemo(
    () => ({
      lessons,
      linkedStudents,
      autoConfirmLessons: teacher.autoConfirmLessons,
      weekendWeekdays: teacher.weekendWeekdays,
    }),
    [lessons, linkedStudents, teacher.autoConfirmLessons, teacher.weekendWeekdays],
  );

  const handleSettingsLinksPatched = useCallback((patchedLinks: TeacherStudent[]) => {
    if (patchedLinks.length === 0) return;
    setLinks((prev) => {
      const nextById = new Map(prev.map((link) => [link.id, link]));
      patchedLinks.forEach((link) => {
        nextById.set(link.id, link);
      });
      return Array.from(nextById.values());
    });
  }, []);

  const handleSettingsLessonsRemoved = useCallback(
    (lessonIds: number[]) => {
      if (lessonIds.length === 0) return;
      removeLessonsFromRanges({ ids: lessonIds });
      dashboardSummary.refresh();
    },
    // dashboardSummary — объект-результат хука, пересоздаётся каждый рендер; стабильна именно .refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dashboardSummary.refresh, removeLessonsFromRanges],
  );

  const settingsRouteProps = useMemo(
    () => ({
      teacher,
      onTeacherChange: setTeacher,
      onLinksPatched: handleSettingsLinksPatched,
      onLessonsRemoved: handleSettingsLessonsRemoved,
      onNavigate: guardedNavigate,
    }),
    [guardedNavigate, handleSettingsLessonsRemoved, handleSettingsLinksPatched, teacher],
  );

  const homeworksRouteProps = useMemo<{ mode: 'teacher' | 'student'; onOpenMobileSidebar?: () => void }>(
    () => ({
      mode: isStudentRole ? 'student' : 'teacher',
      onOpenMobileSidebar: !isStudentRole ? () => setMobileSidebarOpen(true) : undefined,
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
                      className={`${layoutStyles.pageInner} ${
                        isDesktop ? layoutStyles.pageInnerDesktop : layoutStyles.pageInnerMobile
                      }`}
                    >
                      {!isDesktop ? (
                        <MobileSidebarDrawer
                          isOpen={isMobileSidebarOpen}
                          activeTab={activeTab}
                          items={mobileDrawerItems}
                          profileName={mobileProfileName}
                          profilePlanLabel={mobilePlanLabel}
                          profilePhotoUrl={sessionUser?.photoUrl ?? null}
                          onClose={() => setMobileSidebarOpen(false)}
                          onNavigate={onMobileNavigate}
                          onOpenSettings={onMobileOpenProfileSettings}
                        />
                      ) : null}

                      {isDesktop ? (
                        <Sidebar
                          pathname={location.pathname}
                          onNavigate={onSidebarNavigate}
                          onToggleCollapsed={onSidebarToggle}
                          items={sidebarItems}
                        />
                      ) : null}

                      <div className={`${layoutStyles.mainColumn} ${!isDesktop ? layoutStyles.mainColumnMobile : ''}`}>
                        {!isDesktop &&
                        !isTeacherHomeworkEditorRoute &&
                        !isTeacherTemplateEditRoute &&
                        !isTeacherHomeworkSourceDetailRoute &&
                        !isTeacherAssignmentDetailRoute &&
                        !isTeacherHomeworksRootRoute ? (
                          <MobileTopbar
                            profileName={mobileProfileName}
                            profilePhotoUrl={sessionUser?.photoUrl ?? null}
                            variant={isMobileSettingsDetailRoute ? 'back' : isMobileSettingsRootRoute ? 'title' : 'default'}
                            title={isMobileSettingsDetailRoute ? mobileSettingsDetail?.label ?? 'Настройки' : 'Настройки'}
                            onOpenSidebar={() => setMobileSidebarOpen(true)}
                            onOpenNotifications={onOpenNotifications}
                            renderNotificationBell={renderNotificationBell}
                            onBack={isMobileSettingsDetailRoute ? () => guardedNavigate(tabPathById.settings) : undefined}
                          />
                        ) : null}

                        {isDesktop &&
                        !isStudentRole &&
                        !isTeacherHomeworkReviewRoute &&
                        !isTeacherHomeworkEditorRoute &&
                        !isTeacherTemplateEditRoute &&
                        !isTeacherHomeworkSourceDetailRoute &&
                        !isTeacherAssignmentDetailRoute &&
                        !isTeacherHomeworksRootRoute ? (
                          <Topbar
                            teacher={teacher}
                            title={desktopTopbarTitleWithOverrides}
                            subtitle={desktopTopbarSubtitleWithOverrides}
                            variant={isDesktopHomeworksLibraryChrome ? 'homeworks' : 'default'}
                            showCreateLesson={
                              hasTeacherAccess &&
                              !hasDesktopHomeworkDetailChrome &&
                              !isTeacherAnyHomeworkEditorRoute &&
                              (
                                activeTab === 'dashboard' ||
                                activeTab === 'homeworks' ||
                                activeTab === 'students' ||
                                activeTab === 'schedule'
                              )
                            }
                            createButtonLabel={
                              activeTab === 'homeworks'
                                ? 'Добавить'
                                : activeTab === 'students'
                                  ? 'Добавить ученика'
                                  : 'Новый урок'
                            }
                            createButtonIconAccent={
                              activeTab === 'homeworks' || activeTab === 'students' || activeTab === 'schedule'
                            }
                            reserveCreateButtonSpace={!hasDesktopHomeworkDetailChrome}
                            createMenuItems={activeTab === 'homeworks' ? homeworkTopbarCreateMenuItems : undefined}
                            showEditorActions={isTeacherAnyHomeworkEditorRoute && !isHomeworkDetailTopbarVisible}
                            showEditorSecondaryAction={showEditorSecondaryAction}
                            showEditorPrimaryAction={templateCreateTopbarState.showPrimaryAction}
                            showBackButton={hasDesktopHomeworkDetailChrome || isTeacherAnyHomeworkEditorRoute || isStudentProfileRoute}
                            onBack={() =>
                              guardedNavigate(
                                hasDesktopHomeworkDetailChrome
                                  ? tabPathById.homeworks
                                  : isTeacherAnyHomeworkEditorRoute
                                    ? teacherHomeworkEditorBackPath
                                    : tabPathById.students,
                              )
                            }
                            backButtonTooltip={isStudentProfileRoute ? 'Вернуться к списку' : 'Назад'}
                            onEditorSecondaryAction={() => dispatchHomeworkTemplateCreateTopbarCommand('save')}
                            onEditorPrimaryAction={() => dispatchHomeworkTemplateCreateTopbarCommand('submit')}
                            editorSubmitting={templateCreateTopbarState.submitting}
                            editorPrimaryDisabled={editorPrimaryDisabled}
                            editorSecondaryActionLabel={editorSecondaryActionLabel}
                            editorPrimaryActionLabel={editorPrimaryActionLabel}
                            editorPrimarySubmittingLabel={editorPrimarySubmittingLabel}
                            onOpenNotifications={onOpenNotifications}
                            renderNotificationBell={renderNotificationBell}
                            onCreateLesson={onTopbarCreateAction}
                            profilePhotoUrl={sessionUser?.photoUrl ?? null}
                            showScheduleViewToggle={activeTab === 'schedule'}
                            scheduleView={scheduleView}
                            onScheduleViewChange={setScheduleView}
                            statusBadgeLabel={homeworkDetailTopbarState?.statusLabel ?? null}
                            statusBadgeTone={homeworkDetailTopbarState?.statusTone}
                            showPrintAction={Boolean(homeworkDetailTopbarState)}
                            onPrintAction={() => {
                              if (typeof window !== 'undefined') {
                                window.print();
                              }
                            }}
                            notificationDotVisible={homeworkDetailTopbarState?.hasAttentionDot ?? true}
                            showProfile={!isDesktopHomeworksLibraryChrome}
                          />
                        ) : null}

                        <main
                          className={`${layoutStyles.content} ${!isDesktop ? layoutStyles.contentMobile : ''} ${
                            !isDesktop && isTeacherHomeworksRootRoute ? layoutStyles.contentMobileHomeworks : ''
                          } ${
                            !isDesktop && isTeacherAnyHomeworkEditorRoute ? layoutStyles.contentMobileHomeworkEditor : ''
                          } ${
                            isTeacherAnyHomeworkEditorRoute ||
                            isTeacherHomeworkSourceDetailRoute ||
                            isTeacherAssignmentDetailRoute
                              ? layoutStyles.contentNoScroll
                              : ''
                          }`}
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
                          <MobileBottomTabs
                            activeTab={activeTab}
                            items={mobileTabbarItems}
                            onNavigate={onMobileNavigate}
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {!isStudentRole ? (
                    <>
                      <HomeworkAssignModal
                        open={homeworkAssignModalOpen}
                        variant={isDesktop ? 'side-sheet' : 'sheet'}
                        templates={homeworkAssignTemplates}
                        groups={homeworkAssignGroups}
                        students={homeworkAssignStudents}
                        loading={homeworkAssignLoading}
                        submitting={homeworkAssignSubmitting}
                        defaultStudentId={homeworkAssignDefaults.studentId}
                        defaultLessonId={homeworkAssignDefaults.lessonId}
                        onSubmit={handleDashboardHomeworkAssignSubmit}
                        onClose={closeDashboardHomeworkAssignModal}
                      />

                      <AppModals
                        linkedStudents={linkedStudents}
                        weekendWeekdays={teacher.weekendWeekdays}
                        dialogState={dialogState}
                        onCloseDialog={closeDialog}
                        onDialogStateChange={setDialogState}
                      />
                    </>
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

const AppPageRouter = () => {
  const location = useLocation();

  if (location.pathname === PASSWORD_LOGIN_ROUTE) {
    return <PasswordLoginScreen />;
  }

  return <AppPageContent />;
};

export const AppPage = () => (
  <UnsavedChangesProvider>
    <AppPageRouter />
  </UnsavedChangesProvider>
);

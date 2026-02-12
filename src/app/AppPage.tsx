import { startOfMonth } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Lesson, Student, Teacher, TeacherStudent } from '../entities/types';
import { useSelectedStudent } from '../entities/student/model/selectedStudent';
import { api } from '../shared/api/client';
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
import { type SidebarNavItem } from '../widgets/layout/model/navigation';
import { tabIdByPath, tabPathById, tabs, type TabId } from './tabs';
import { AppRoutes } from './components/AppRoutes';
import { AppModals } from './components/AppModals';
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
};

const LAST_VISITED_ROUTE_KEY = 'calendar_last_route';
type TabPath = (typeof tabs)[number]['path'];

const desktopTitleByTab: Record<TabId, string> = {
  dashboard: 'Обзор',
  students: 'Ученики',
  schedule: 'Расписание',
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
  const [teacher, setTeacher] = useState<Teacher>(initialTeacher);
  const resolvedTimeZone = useMemo(() => resolveTimeZone(teacher.timezone), [teacher.timezone]);
  const [students, setStudents] = useState<Student[]>([]);
  const [links, setLinks] = useState<TeacherStudent[]>([]);
  const initialBootstrapDone = useRef(false);
  const [studentListReloadKey, setStudentListReloadKey] = useState(0);
  const { selectedStudentId, setSelectedStudentId } = useSelectedStudent();
  const [studentActiveTab, setStudentActiveTab] = useState<StudentTabId>('overview');
  const isMobile = useIsMobile(767);
  const isDesktop = useIsDesktop();
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
    hasAccess,
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
    (to: string) => {
      const active = getActiveEntry();
      if (!active || !active.entry.isDirty) {
        navigate(to);
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
              navigate(to);
            })
            .catch(() => {
              showToast({ message: 'Не удалось сохранить изменения', variant: 'error' });
            });
        },
        onCancel: () => {
          active.entry.onDiscard?.();
          clearEntry(active.key);
          navigate(to);
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
    hasAccess,
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

  const activeTab = useMemo<TabId>(() => {
    const directMatch = tabIdByPath[location.pathname];
    if (directMatch) return directMatch;
    const matchedTab = tabs.find((tab) => location.pathname.startsWith(`${tab.path}/`));
    return matchedTab?.id ?? 'dashboard';
  }, [location.pathname]);

  const desktopTopbarTitle = desktopTitleByTab[activeTab];
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

  const dashboardState = useDashboardStateInternal({
    hasAccess,
    timeZone: resolvedTimeZone,
    isActive: activeTab === 'dashboard',
    buildLessonRange,
    loadLessonsForRange,
  });

  const dashboardSummary = useDashboardSummaryInternal({
    hasAccess,
    isActive: activeTab === 'dashboard',
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
    hasAccess,
    isActive: activeTab === 'schedule',
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
  const knownPaths = useMemo(() => new Set<TabPath>(tabs.map((tab) => tab.path)), []);

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
        { skipNavigation: true },
      );
    },
    [
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
    hasAccess,
    scheduleView,
    studentsHomework.replaceHomeworks,
  ]);



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

  const linkedStudents = useLinkedStudents({ students, links, homeworks });

  const onTopbarCreateLesson = useCallback(() => {
    openCreateLesson();
  }, [openCreateLesson]);

  const onDashboardAddStudent = useCallback(() => {
    guardedNavigate(tabPathById.students);
    openCreateStudentModal();
  }, [guardedNavigate, openCreateStudentModal]);

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
    }),
    [
      linkedStudents,
      lessons,
      onDashboardAddStudent,
      onDashboardOpenLesson,
      onDashboardOpenLessonDay,
      onDashboardOpenSchedule,
      onDashboardOpenStudent,
      openCreateLesson,
      teacher,
    ],
  );

  const studentsRouteProps = useMemo(
    () => ({
      hasAccess,
      teacher,
      lessons,
      onActiveTabChange: setStudentActiveTab,
      studentListReloadKey,
    }),
    [hasAccess, lessons, setStudentActiveTab, studentListReloadKey, teacher],
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

  const isStudentRole = sessionUser?.role?.toUpperCase() === 'STUDENT';

  if (isStudentRole) {
    return (
      <div id="app" className={`${layoutStyles.page} app-content`}>
        <div className="app-surface">
          <div className={layoutStyles.pageInner}>
            <main className={layoutStyles.content}>
              <StudentRoleNotice />
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
                        />
                      ) : null}

                      <div className={layoutStyles.mainColumn}>
                        {isDesktop ? (
                          <Topbar
                            teacher={teacher}
                            title={desktopTopbarTitle}
                            subtitle={desktopDateLabel}
                            showCreateLesson={activeTab === 'dashboard'}
                            onOpenNotifications={onOpenNotifications}
                            onCreateLesson={onTopbarCreateLesson}
                            profilePhotoUrl={sessionUser?.photoUrl ?? null}
                          />
                        ) : null}

                        <main className={layoutStyles.content}>
                          <AppRoutes
                            resolveLastVisitedPath={resolveLastVisitedPath}
                            dashboard={dashboardRouteProps}
                            students={studentsRouteProps}
                            schedule={scheduleRouteProps}
                            settings={settingsRouteProps}
                            dashboardSummary={dashboardSummaryRouteProps}
                          />
                        </main>

                        {!isDesktop ? <Tabbar activeTab={activeTab} onTabChange={onTabbarNavigate} /> : null}
                      </div>
                    </div>
                  </div>

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

import { startOfMonth } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LinkedStudent, Student, Teacher, TeacherStudent } from '../entities/types';
import { useSelectedStudent } from '../entities/student/model/selectedStudent';
import { api } from '../shared/api/client';
import { useToast } from '../shared/lib/toast';
import { TimeZoneProvider } from '../shared/lib/timezoneContext';
import { formatInTimeZone, resolveTimeZone, toZonedDate } from '../shared/lib/timezoneDates';
import { useIsMobile } from '../shared/lib/useIsMobile';
import { trackEvent } from '../shared/lib/analytics';
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
import { DashboardStateProvider, useDashboardStateInternal } from '../widgets/dashboard/model/useDashboardState';
import { useDashboardSummaryInternal } from '../widgets/dashboard/model/useDashboardSummary';
import { OnboardingStateProvider, useOnboardingStateInternal } from '../features/onboarding/model/useOnboardingState';
import {
  StudentsCardFiltersProvider,
  useStudentCardFiltersInternal,
} from '../widgets/students/model/useStudentCardFilters';
import { useScheduleLessonsLoaderInternal } from '../widgets/schedule/model/useScheduleLessonsLoader';
import { useScheduleLessonsRangeInternal } from '../widgets/schedule/model/useScheduleLessonsRange';

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

export const AppPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
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
  const [dialogState, setDialogState] = useState<DialogState>(null);
  const isMobile = useIsMobile(767);
  const device = isMobile ? 'mobile' : 'desktop';
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
    onStudentCreateStarted: (source) => {
      track('student_create_started', { source: resolveAnalyticsSource(source) });
    },
    onStudentCreated: ({ student, link, source }) => {
      if (source.startsWith('onboarding')) {
        onboardingState.setCreatedStudent({ student, link });
        onboardingState.setDismissed(false);
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
    updateLessonsForCurrentRange,
    isLessonInCurrentRange,
    filterLessonsForCurrentRange,
  } = scheduleLessons;

  const activeTab = useMemo<TabId>(() => {
    const directMatch = tabIdByPath[location.pathname];
    if (directMatch) return directMatch;
    const matchedTab = tabs.find((tab) => location.pathname.startsWith(`${tab.path}/`));
    return matchedTab?.id ?? 'dashboard';
  }, [location.pathname]);

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
    updateLessonsForCurrentRange,
    isLessonInCurrentRange,
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
        onboardingState.setDismissed(false);
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

  const knownPaths = useMemo(() => new Set<TabPath>(tabs.map((tab) => tab.path)), []);

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
    resolvedTimeZone,
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

  const linkedStudents: LinkedStudent[] = useMemo(
    () =>
      links.map((link) => ({
        ...students.find((s) => s.id === link.studentId)!,
        link,
        homeworks: homeworks.filter((hw) => hw.studentId === link.studentId),
      })),
    [links, students, homeworks],
  );

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
    <StudentsCardFiltersProvider value={studentCardFilters}>
      <StudentsDataProvider value={studentsData}>
        <StudentsActionsProvider value={studentsActions}>
          <StudentsHomeworkProvider value={studentsHomework}>
            <LessonActionsProvider value={lessonActions}>
              <DashboardStateProvider value={dashboardState}>
                <OnboardingStateProvider value={onboardingState}>
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
                          onActiveTabChange: setStudentActiveTab,
                          studentListReloadKey,
                        }}
                        schedule={{
                          lessons,
                          linkedStudents,
                          autoConfirmLessons: teacher.autoConfirmLessons,
                        }}
                        settings={{ teacher, onTeacherChange: setTeacher }}
                        dashboardSummary={{
                          summary: dashboardSummaryData,
                          isLoading: dashboardSummary.isLoading,
                          refresh: dashboardSummary.refresh,
                        }}
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
                </OnboardingStateProvider>
              </DashboardStateProvider>
            </LessonActionsProvider>
          </StudentsHomeworkProvider>
        </StudentsActionsProvider>
      </StudentsDataProvider>
    </StudentsCardFiltersProvider>
  );
};

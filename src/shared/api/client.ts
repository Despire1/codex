import {
  ActivityCategory,
  ActivityFeedListResponse,
  ActivityFeedUnreadStatus,
  Homework,
  HomeworkAssignment,
  HomeworkAttachment,
  HomeworkBlock,
  HomeworkGroup,
  HomeworkGroupListItem,
  HomeworkReviewDraft,
  HomeworkSubmission,
  HomeworkStatus,
  HomeworkTemplate,
  Lesson,
  LessonPaymentFilter,
  LessonSortOrder,
  LessonStatusFilter,
  LessonColor,
  PaymentCancelBehavior,
  PaymentEvent,
  PaymentReminderLog,
  Student,
  StudentDebtSummary,
  StudentListItem,
  Teacher,
  TeacherStudent,
  UnpaidLessonEntry,
} from '../../entities/types';
import { FormValidationIssue } from '../lib/form-validation/types';
import { type OnboardingReminderTemplate } from '../lib/onboardingReminder';

type SettingsPayload = Pick<
  Teacher,
  | 'timezone'
  | 'receiptEmail'
  | 'defaultLessonDuration'
  | 'lessonReminderEnabled'
  | 'lessonReminderMinutes'
  | 'dailySummaryEnabled'
  | 'dailySummaryTime'
  | 'tomorrowSummaryEnabled'
  | 'tomorrowSummaryTime'
  | 'studentNotificationsEnabled'
  | 'studentUpcomingLessonTemplate'
  | 'studentPaymentDueTemplate'
  | 'autoConfirmLessons'
  | 'globalPaymentRemindersEnabled'
  | 'paymentReminderDelayHours'
  | 'paymentReminderRepeatHours'
  | 'paymentReminderMaxCount'
  | 'notifyTeacherOnAutoPaymentReminder'
  | 'notifyTeacherOnManualPaymentReminder'
  | 'homeworkNotifyOnAssign'
  | 'homeworkReminder24hEnabled'
  | 'homeworkReminderMorningEnabled'
  | 'homeworkReminderMorningTime'
  | 'homeworkReminder3hEnabled'
  | 'homeworkOverdueRemindersEnabled'
  | 'homeworkOverdueReminderTime'
  | 'homeworkOverdueReminderMaxCount'
>;

export type SessionSummary = {
  id: number;
  createdAt: string;
  ip: string | null;
  userAgent: string | null;
  isCurrent: boolean;
};

export type SessionUser = {
  subscriptionStartAt?: string | null;
  subscriptionEndAt?: string | null;
  role?: string;
  photoUrl?: string | null;
};

export type DashboardSummary = {
  studentsCount: number;
  lessonsCount: number;
  todayPlanRub: number;
  todayPlanDeltaPercent: number;
  unpaidRub: number;
  unpaidStudentsCount: number;
  receivableWeekRub: number;
  telegramConnected: boolean;
  timezone: string | null;
  teacherId: number;
};

export type NotificationChannelStatus = {
  channel: string;
  configured: boolean;
  reason?: string;
};

export type NotificationTestRecipient = {
  id: number;
  name: string;
};

export type NotificationTestSendPayload = {
  type: 'LESSON_REMINDER' | 'PAYMENT_REMINDER';
  template_text: string;
  recipient_mode: 'SELF' | 'STUDENTS';
  student_ids?: number[];
  data_source: 'PREVIEW_EXAMPLE_A' | 'PREVIEW_EXAMPLE_B';
  text_version: 'DRAFT' | 'SAVED';
};

export type NotificationTestSendResponse = {
  status: 'ok' | 'partial' | 'error';
  rendered_text: string;
  missing_data: string[];
  results?: Array<{ student_id: number; status: 'ok' | 'error'; error_code?: string }>;
  channel?: string;
};

export type StudentContextLink = {
  teacherId: number;
  studentId: number;
  teacherName: string;
  teacherUsername?: string | null;
  studentName: string;
  studentUsername?: string | null;
};

export type StudentContextResponse = {
  contexts: StudentContextLink[];
  activeTeacherId: number | null;
  activeStudentId: number | null;
};

export type HomeworkAssignmentBucket = 'all' | 'draft' | 'sent' | 'review' | 'reviewed' | 'overdue';
export type HomeworkAssignmentsTab =
  | 'all'
  | 'inbox'
  | 'draft'
  | 'scheduled'
  | 'in_progress'
  | 'review'
  | 'closed'
  | 'overdue';
export type HomeworkAssignmentsSort = 'urgency' | 'deadline' | 'student' | 'updated' | 'created';
export type HomeworkAssignmentProblemFilter = 'overdue' | 'returned' | 'config_error';

export type HomeworkAssignmentsSummary = {
  totalCount: number;
  draftCount: number;
  sentCount: number;
  reviewCount: number;
  reviewedCount: number;
  overdueCount: number;
  inboxCount: number;
  scheduledCount: number;
  inProgressCount: number;
  closedCount: number;
  configErrorCount: number;
  returnedCount: number;
  reviewedThisMonthCount: number;
  sentTodayCount: number;
  dueTodayCount: number;
  reviewedWeekDeltaPercent: number;
  averageScore30d: number | null;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

const parseValidationIssues = (value: unknown): FormValidationIssue[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((rawIssue): FormValidationIssue | null => {
      if (typeof rawIssue !== 'object' || rawIssue === null || Array.isArray(rawIssue)) return null;
      const issue = rawIssue as Record<string, unknown>;
      const rawPath = issue.path;
      const path = Array.isArray(rawPath)
        ? rawPath.filter((segment): segment is string | number => {
            if (typeof segment === 'string') return true;
            return typeof segment === 'number' && Number.isFinite(segment);
          })
        : [];
      if (path.length === 0) return null;
      const code = typeof issue.code === 'string' && issue.code.trim().length > 0 ? issue.code : 'validation_error';
      const message = typeof issue.message === 'string' && issue.message.trim().length > 0 ? issue.message : 'Некорректное значение поля';
      const severity = issue.severity === 'warning' ? 'warning' : 'error';
      return { path, code, message, severity };
    })
    .filter((issue): issue is FormValidationIssue => Boolean(issue));
};

export class ApiRequestError extends Error {
  status: number;
  issues: FormValidationIssue[] | null;
  body: unknown;

  constructor(payload: { status: number; message: string; issues?: FormValidationIssue[] | null; body?: unknown }) {
    super(payload.message);
    this.name = 'ApiRequestError';
    this.status = payload.status;
    this.issues = payload.issues ?? null;
    this.body = payload.body ?? null;
  }
}

export const isApiRequestError = (error: unknown): error is ApiRequestError => error instanceof ApiRequestError;

const apiFetch = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const roleHeader = typeof window !== 'undefined' ? window.localStorage.getItem('userRole') ?? undefined : undefined;
  const activeTeacherHeader =
    typeof window !== 'undefined' ? window.localStorage.getItem('student_active_teacher_id') ?? undefined : undefined;
  const activeStudentHeader =
    typeof window !== 'undefined' ? window.localStorage.getItem('student_active_student_id') ?? undefined : undefined;
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(roleHeader ? { 'X-User-Role': roleHeader } : {}),
      ...(activeTeacherHeader ? { 'X-Teacher-Id': activeTeacherHeader } : {}),
      ...(activeStudentHeader ? { 'X-Student-Id': activeStudentHeader } : {}),
      ...(options?.headers ?? {}),
    },
    cache: 'no-store',
    credentials: 'include',
    ...options,
  });

  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? '';
    let body: unknown = null;
    let message = 'Запрос не выполнен';
    let issues: FormValidationIssue[] | null = null;

    if (contentType.includes('application/json')) {
      try {
        body = await response.json();
        if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
          const payload = body as Record<string, unknown>;
          if (typeof payload.message === 'string' && payload.message.trim()) {
            message = payload.message;
          }
          const parsedIssues = parseValidationIssues(payload.issues);
          if (parsedIssues.length > 0) {
            issues = parsedIssues;
          }
        }
      } catch {
        // Ignore invalid error payload and fallback to default message.
      }
    } else {
      const text = await response.text();
      if (text.trim()) {
        message = text;
      }
    }

    throw new ApiRequestError({
      status: response.status,
      message,
      issues,
      body,
    });
  }

  return response.json() as Promise<T>;
};

export const api = {
  telegramWebappAuth: (payload: { initData: string }) =>
    apiFetch<{ user: unknown; session?: { expiresAt: string }; isNewUser?: boolean }>('/auth/telegram/webapp', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createTransferLink: () =>
    apiFetch<{ url: string; expires_in: number }>('/auth/transfer/create', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  consumeTransferToken: (token: string) =>
    apiFetch<{ redirect_url: string }>('/auth/transfer/consume', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  getSession: () => apiFetch<{ user: SessionUser }>('/auth/session'),
  logout: () =>
    apiFetch<{ status: string }>('/auth/logout', {
      method: 'POST',
    }),
  bootstrap: (params?: { lessonsStart?: string; lessonsEnd?: string }) => {
    const search = new URLSearchParams();
    if (params?.lessonsStart) search.set('lessonsStart', params.lessonsStart);
    if (params?.lessonsEnd) search.set('lessonsEnd', params.lessonsEnd);
    const suffix = search.toString();
    const path = suffix ? `/api/bootstrap?${suffix}` : '/api/bootstrap';
    return apiFetch<{
      teacher: Teacher;
      students: Student[];
      links: TeacherStudent[];
      homeworks: Homework[];
      lessons: Lesson[];
    }>(path);
  },
  getDashboardSummary: () => apiFetch<DashboardSummary>('/api/dashboard/summary'),
  listLessonsForRange: (payload: { start: string; end: string }) => {
    const search = new URLSearchParams({
      start: payload.start,
      end: payload.end,
    });
    return apiFetch<{ lessons: Lesson[] }>(`/api/lessons?${search.toString()}`);
  },
  listUnpaidLessons: () => apiFetch<{ entries: UnpaidLessonEntry[] }>('/api/lessons/unpaid'),
  listActivityFeed: (params?: {
    limit?: number;
    cursor?: string | null;
    categories?: ActivityCategory[];
    studentId?: number;
    from?: string;
    to?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.categories && params.categories.length > 0) {
      query.set('categories', params.categories.join(','));
    }
    if (typeof params?.studentId === 'number') query.set('studentId', String(params.studentId));
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    const suffix = query.toString();
    return apiFetch<ActivityFeedListResponse>(`/api/activity-feed${suffix ? `?${suffix}` : ''}`);
  },
  getActivityFeedUnreadStatus: () => apiFetch<ActivityFeedUnreadStatus>('/api/activity-feed/unread-status'),
  markActivityFeedSeen: (payload?: { seenThrough?: string }) =>
    apiFetch<ActivityFeedUnreadStatus>('/api/activity-feed/mark-seen', {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    }),
  getSettings: () => apiFetch<{ settings: SettingsPayload }>('/api/settings'),
  updateSettings: (payload: Partial<SettingsPayload>) =>
    apiFetch<{ settings: SettingsPayload }>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  getNotificationChannelStatus: () => apiFetch<NotificationChannelStatus>('/api/notifications/channel-status'),
  listNotificationTestRecipients: (type: NotificationTestSendPayload['type']) => {
    const params = new URLSearchParams({ type });
    return apiFetch<{ students: NotificationTestRecipient[] }>(
      `/api/notifications/test-recipients?${params.toString()}`,
    );
  },
  sendNotificationTest: (payload: NotificationTestSendPayload) =>
    apiFetch<NotificationTestSendResponse>('/api/notifications/send-test', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listSessions: () => apiFetch<{ sessions: SessionSummary[] }>('/api/sessions'),
  revokeSession: (id: number) =>
    apiFetch<{ status: string; sessionId: number }>(`/api/sessions/${id}/revoke`, { method: 'POST' }),
  revokeOtherSessions: () =>
    apiFetch<{ status: string; revoked: number }>(`/api/sessions/revoke-others`, { method: 'POST' }),
  addStudent: (payload: {
    customName: string;
    username?: string;
    pricePerLesson: number;
    email?: string;
    phone?: string;
    studentLevel?: string;
    learningGoal?: string;
    notes?: string;
  }) =>
    apiFetch<{ student: Student; link: TeacherStudent }>('/api/students', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateStudent: (
    studentId: number,
    payload: {
      customName: string;
      username?: string;
      pricePerLesson: number;
      email?: string;
      phone?: string;
      studentLevel?: string;
      learningGoal?: string;
      notes?: string;
    },
  ) =>
    apiFetch<{ student: Student; link: TeacherStudent }>(`/api/students/${studentId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  updateStudentPaymentReminders: (studentId: number, enabled: boolean) =>
    apiFetch<{ student: Student }>(`/api/students/${studentId}/payment-reminders`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),
  deleteStudent: (studentId: number) =>
    apiFetch<{ link: TeacherStudent }>(`/api/students/${studentId}`, {
      method: 'DELETE',
    }),
  toggleAutoRemind: (studentId: number, value: boolean) =>
    apiFetch<{ link: TeacherStudent }>(`/api/students/${studentId}/auto-remind`, {
      method: 'POST',
      body: JSON.stringify({ value }),
    }),
  adjustBalance: (
    studentId: number,
    payload: { delta: number; type?: string; comment?: string; createdAt?: string },
  ) =>
    apiFetch<{ link: TeacherStudent }>(`/api/students/${studentId}/balance`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updatePrice: (studentId: number, value: number) =>
    apiFetch<{ link: TeacherStudent }>(`/api/students/${studentId}/price`, {
      method: 'POST',
      body: JSON.stringify({ value }),
    }),
  createLesson: (payload: {
    studentId?: number;
    studentIds?: number[];
    startAt: string;
    durationMinutes: number;
    color?: LessonColor;
    meetingLink?: string | null;
  }) =>
    apiFetch<{ lesson: Lesson }>('/api/lessons', { method: 'POST', body: JSON.stringify(payload) }),
  createRecurringLessons: (payload: {
    studentId?: number;
    studentIds?: number[];
    startAt: string;
    durationMinutes: number;
    color?: LessonColor;
    repeatWeekdays: number[];
    repeatUntil?: string;
    meetingLink?: string | null;
  }) => apiFetch<{ lessons: Lesson[] }>('/api/lessons/recurring', { method: 'POST', body: JSON.stringify(payload) }),
  updateLesson: (
    id: number,
    payload: {
      studentId?: number;
      studentIds?: number[];
      startAt: string;
      durationMinutes: number;
      color?: LessonColor;
      meetingLink?: string | null;
      applyToSeries?: boolean;
      detachFromSeries?: boolean;
      repeatWeekdays?: number[];
      repeatUntil?: string;
    },
  ) => apiFetch<{ lesson?: Lesson; lessons?: Lesson[] }>(`/api/lessons/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  updateLessonStatus: (id: number, status: Lesson['status']) =>
    apiFetch<{ lesson: Lesson; links?: TeacherStudent[] }>(`/api/lessons/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  cancelLesson: (
    id: number,
    payload: { scope: 'SINGLE' | 'SERIES'; refundMode?: 'RETURN_TO_BALANCE' | 'KEEP_AS_PAID' },
  ) =>
    apiFetch<{ lesson?: Lesson; lessons?: Lesson[]; links?: TeacherStudent[] }>(`/api/lessons/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  restoreLesson: (id: number, payload: { scope: 'SINGLE' | 'SERIES' }) =>
    apiFetch<{ lesson?: Lesson; lessons?: Lesson[]; links?: TeacherStudent[] }>(`/api/lessons/${id}/restore`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteLesson: (id: number, payload?: { applyToSeries?: boolean }) =>
    apiFetch<{ deletedIds?: number[] }>(`/api/lessons/${id}`, { method: 'DELETE', body: JSON.stringify(payload ?? {}) }),
  markLessonCompleted: (lessonId: number) =>
    apiFetch<{ lesson: Lesson; link?: TeacherStudent }>(`/api/lessons/${lessonId}/complete`, {
      method: 'POST',
    }),
  togglePaid: (lessonId: number, payload?: { cancelBehavior?: PaymentCancelBehavior; writeOffBalance?: boolean }) =>
    apiFetch<{ lesson: Lesson; link?: TeacherStudent }>(`/api/lessons/${lessonId}/toggle-paid`, {
      method: 'POST',
      body: payload ? JSON.stringify(payload) : undefined,
    }),
  remindLessonPayment: (lessonId: number, studentId?: number, force = false) =>
    apiFetch<{ status: 'sent' }>(`/api/lessons/${lessonId}/remind-payment`, {
      method: 'POST',
      body: JSON.stringify({
        ...(force ? { force } : {}),
        ...(typeof studentId === 'number' ? { studentId } : {}),
      }),
    }),
  toggleParticipantPaid: (
    lessonId: number,
    studentId: number,
    payload?: { cancelBehavior?: PaymentCancelBehavior; writeOffBalance?: boolean },
  ) =>
    apiFetch<{ participant: any; lesson: Lesson; link?: TeacherStudent }>(
      `/api/lessons/${lessonId}/participants/${studentId}/toggle-paid`,
      {
        method: 'POST',
        body: payload ? JSON.stringify(payload) : undefined,
      },
    ),
  getPaymentEvents: (studentId: number, params?: { filter?: string; date?: string }) => {
    const query = new URLSearchParams();
    if (params?.filter) query.set('filter', params.filter);
    if (params?.date) query.set('date', params.date);
    const suffix = query.toString();
    return apiFetch<{ events: PaymentEvent[] }>(
      `/api/students/${studentId}/payments${suffix ? `?${suffix}` : ''}`,
    );
  },
  getPaymentReminders: (studentId: number, params?: { limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    const suffix = query.toString();
    return apiFetch<{ reminders: PaymentReminderLog[]; nextOffset: number | null }>(
      `/api/students/${studentId}/payment-reminders${suffix ? `?${suffix}` : ''}`,
    );
  },
  createHomework: (payload: {
    studentId: number;
    text: string;
    deadline?: string;
    status?: HomeworkStatus;
    attachments?: HomeworkAttachment[];
    timeSpentMinutes?: number | null;
  }) =>
    apiFetch<{ homework: Homework }>('/api/homeworks', { method: 'POST', body: JSON.stringify(payload) }),
  toggleHomework: (homeworkId: number) =>
    apiFetch<{ homework: Homework }>(`/api/homeworks/${homeworkId}/toggle`, { method: 'PATCH' }),
  updateHomework: (homeworkId: number, payload: Partial<Homework>) =>
    apiFetch<{ homework: Homework }>(`/api/homeworks/${homeworkId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteHomework: (homeworkId: number) => apiFetch<{ id: number }>(`/api/homeworks/${homeworkId}`, { method: 'DELETE' }),
  sendHomework: (homeworkId: number) =>
    apiFetch<{ status: string; homework: Homework }>(`/api/homeworks/${homeworkId}/send`, { method: 'POST' }),
  remindHomeworkById: (homeworkId: number) =>
    apiFetch<{ status: string; homework: Homework }>(`/api/homeworks/${homeworkId}/remind`, { method: 'POST' }),
  remindHomework: (studentId: number) =>
    apiFetch<{ status: string; studentId: number; teacherId: number }>('/api/reminders/homework', {
      method: 'POST',
      body: JSON.stringify({ studentId }),
    }),
  sendLessonReminder: (payload: { lessonId: number; template: OnboardingReminderTemplate }) =>
    apiFetch<{ status: 'sent' }>('/api/reminders/lesson', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  searchStudents: (params: { query?: string; filter?: 'all' | 'pendingHomework' | 'noReminder' }) => {
    const query = new URLSearchParams();
    if (params.query) query.set('query', params.query);
    if (params.filter) query.set('filter', params.filter);

    const suffix = query.toString();
    const path = suffix ? `/api/students/search?${suffix}` : '/api/students/search';

    return apiFetch<{ students: Student[]; links: TeacherStudent[]; homeworks: Homework[] }>(path);
  },
  listStudents: (params: { query?: string; filter?: 'all' | 'debt' | 'overdue'; limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params.query) query.set('query', params.query);
    if (params.filter) query.set('filter', params.filter);
    if (params.limit) query.set('limit', String(params.limit));
    if (params.offset) query.set('offset', String(params.offset));

    const suffix = query.toString();
    const path = suffix ? `/api/students?${suffix}` : '/api/students';

    return apiFetch<{
      items: StudentListItem[];
      total: number;
      nextOffset: number | null;
      counts: {
        withDebt: number;
        overdue: number;
        active?: number;
        paused?: number;
        completed?: number;
      };
      summary?: {
        active: number;
        paused: number;
        completed: number;
        lessonsThisWeek: number;
        lessonsToday: number;
        averageAttendance: number | null;
        averageScore: number;
      };
    }>(path);
  },
  listStudentHomeworks: (
    studentId: number,
    params: { filter?: 'all' | HomeworkStatus | 'overdue'; limit?: number; offset?: number },
  ) => {
    const query = new URLSearchParams();
    if (params.filter) query.set('filter', params.filter);
    if (params.limit) query.set('limit', String(params.limit));
    if (params.offset) query.set('offset', String(params.offset));

    const suffix = query.toString();
    const path = suffix ? `/api/students/${studentId}/homeworks?${suffix}` : `/api/students/${studentId}/homeworks`;

    return apiFetch<{ items: Homework[]; total: number; nextOffset: number | null }>(path);
  },
  listStudentLessons: (
    studentId: number,
    params: {
      payment?: LessonPaymentFilter;
      status?: LessonStatusFilter;
      startFrom?: string;
      startTo?: string;
      sort?: LessonSortOrder;
    },
  ) => {
    const query = new URLSearchParams();
    if (params.payment) query.set('payment', params.payment);
    if (params.status) query.set('status', params.status);
    if (params.startFrom) query.set('startFrom', params.startFrom);
    if (params.startTo) query.set('startTo', params.startTo);
    if (params.sort) query.set('sort', params.sort);

    const suffix = query.toString();
    const path = suffix ? `/api/students/${studentId}/lessons?${suffix}` : `/api/students/${studentId}/lessons`;

    return apiFetch<{ items: Lesson[]; debt: StudentDebtSummary }>(path);
  },
  listStudentUnpaidLessons: (studentId: number) =>
    apiFetch<StudentDebtSummary>(`/api/students/${studentId}/unpaid-lessons`),
  getStudentContext: () => apiFetch<StudentContextResponse>('/api/v2/student/context'),
  listHomeworkTemplatesV2: (params?: { query?: string; includeArchived?: boolean }) => {
    const search = new URLSearchParams();
    if (params?.query) search.set('query', params.query);
    if (params?.includeArchived) search.set('includeArchived', '1');
    const suffix = search.toString();
    return apiFetch<{ items: HomeworkTemplate[] }>(`/api/v2/homework/templates${suffix ? `?${suffix}` : ''}`);
  },
  listHomeworkGroupsV2: (params?: { includeArchived?: boolean }) => {
    const search = new URLSearchParams();
    if (params?.includeArchived) search.set('includeArchived', '1');
    const suffix = search.toString();
    return apiFetch<{ items: HomeworkGroupListItem[] }>(`/api/v2/homework/groups${suffix ? `?${suffix}` : ''}`);
  },
  createHomeworkGroupV2: (payload: {
    title: string;
    description?: string | null;
    iconKey?: string;
    bgColor?: string;
    sortOrder?: number;
  }) =>
    apiFetch<{ group: HomeworkGroup }>('/api/v2/homework/groups', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateHomeworkGroupV2: (
    groupId: number,
    payload: Partial<{
      title: string;
      description: string | null;
      iconKey: string;
      bgColor: string;
      sortOrder: number;
      isArchived: boolean;
    }>,
  ) =>
    apiFetch<{ group: HomeworkGroup }>(`/api/v2/homework/groups/${groupId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteHomeworkGroupV2: (groupId: number) =>
    apiFetch<{ deletedId: number }>(`/api/v2/homework/groups/${groupId}`, {
      method: 'DELETE',
    }),
  createHomeworkTemplateV2: (payload: {
    title: string;
    tags?: string[];
    subject?: string | null;
    level?: string | null;
    blocks: HomeworkBlock[];
  }) =>
    apiFetch<{ template: HomeworkTemplate }>('/api/v2/homework/templates', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateHomeworkTemplateV2: (
    templateId: number,
    payload: Partial<Pick<HomeworkTemplate, 'title' | 'subject' | 'level' | 'isArchived'>> & {
      tags?: string[];
      blocks?: HomeworkBlock[];
    },
  ) =>
    apiFetch<{ template: HomeworkTemplate }>(`/api/v2/homework/templates/${templateId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  listHomeworkAssignmentsV2: (params?: {
    studentId?: number;
    lessonId?: number;
    groupId?: number;
    ungrouped?: boolean;
    status?: string;
    bucket?: HomeworkAssignmentBucket;
    tab?: HomeworkAssignmentsTab;
    q?: string;
    sort?: HomeworkAssignmentsSort;
    problemFilters?: HomeworkAssignmentProblemFilter[];
    limit?: number;
    offset?: number;
  }) => {
    const search = new URLSearchParams();
    if (typeof params?.studentId === 'number') search.set('studentId', String(params.studentId));
    if (typeof params?.lessonId === 'number') search.set('lessonId', String(params.lessonId));
    if (typeof params?.groupId === 'number') search.set('groupId', String(params.groupId));
    if (params?.ungrouped) search.set('ungrouped', '1');
    if (params?.status) search.set('status', params.status);
    if (params?.bucket) search.set('bucket', params.bucket);
    if (params?.tab) search.set('tab', params.tab);
    if (params?.q) search.set('q', params.q);
    if (params?.sort) search.set('sort', params.sort);
    if (params?.problemFilters?.length) {
      search.set('problemFilters', params.problemFilters.join(','));
    }
    if (typeof params?.limit === 'number') search.set('limit', String(params.limit));
    if (typeof params?.offset === 'number') search.set('offset', String(params.offset));
    const suffix = search.toString();
    return apiFetch<{ items: HomeworkAssignment[]; total: number; nextOffset: number | null }>(
      `/api/v2/homework/assignments${suffix ? `?${suffix}` : ''}`,
    );
  },
  getHomeworkAssignmentsSummaryV2: (params?: { studentId?: number; lessonId?: number }) => {
    const search = new URLSearchParams();
    if (typeof params?.studentId === 'number') search.set('studentId', String(params.studentId));
    if (typeof params?.lessonId === 'number') search.set('lessonId', String(params.lessonId));
    const suffix = search.toString();
    return apiFetch<HomeworkAssignmentsSummary>(
      `/api/v2/homework/assignments/summary${suffix ? `?${suffix}` : ''}`,
    );
  },
  createHomeworkAssignmentV2: (payload: {
    studentId: number;
    lessonId?: number | null;
    templateId?: number | null;
    groupId?: number | null;
    title?: string;
    status?: HomeworkAssignment['status'];
    sendMode?: HomeworkAssignment['sendMode'];
    deadlineAt?: string | null;
    contentSnapshot?: HomeworkBlock[];
    legacyHomeworkId?: number | null;
  }) =>
    apiFetch<{ assignment: HomeworkAssignment }>('/api/v2/homework/assignments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getHomeworkAssignmentV2: (assignmentId: number) =>
    apiFetch<{ assignment: HomeworkAssignment }>(`/api/v2/homework/assignments/${assignmentId}`),
  updateHomeworkAssignmentV2: (
    assignmentId: number,
    payload: Partial<{
      title: string;
      status: HomeworkAssignment['status'];
      sendMode: HomeworkAssignment['sendMode'];
      lessonId: number | null;
      templateId: number | null;
      groupId: number | null;
      deadlineAt: string | null;
      sentAt: string | null;
      contentSnapshot: HomeworkBlock[];
      teacherComment: string | null;
      autoScore: number | null;
      manualScore: number | null;
      finalScore: number | null;
    }>,
  ) =>
    apiFetch<{ assignment: HomeworkAssignment }>(`/api/v2/homework/assignments/${assignmentId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  remindHomeworkAssignmentV2: (assignmentId: number) =>
    apiFetch<{ status: 'sent' | 'skipped' | 'failed'; assignment: HomeworkAssignment }>(
      `/api/v2/homework/assignments/${assignmentId}/remind`,
      { method: 'POST' },
    ),
  deleteHomeworkAssignmentV2: (assignmentId: number) =>
    apiFetch<{ deletedId: number }>(`/api/v2/homework/assignments/${assignmentId}`, {
      method: 'DELETE',
    }),
  bulkHomeworkAssignmentsV2: (payload: {
    ids: number[];
    action: 'SEND_NOW' | 'REMIND' | 'MOVE_TO_DRAFT' | 'DELETE';
  }) =>
    apiFetch<{
      action: 'SEND_NOW' | 'REMIND' | 'MOVE_TO_DRAFT' | 'DELETE';
      total: number;
      successCount: number;
      errorCount: number;
      results: Array<{
        id: number;
        ok: boolean;
        message?: string;
      }>;
    }>('/api/v2/homework/assignments/bulk', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listHomeworkSubmissionsV2: (assignmentId: number) =>
    apiFetch<{ items: HomeworkSubmission[] }>(`/api/v2/homework/assignments/${assignmentId}/submissions`),
  startHomeworkReviewSessionV2: (assignmentId: number) =>
    apiFetch<{ assignment: HomeworkAssignment; submissions: HomeworkSubmission[] }>(
      `/api/v2/homework/assignments/${assignmentId}/review-session`,
      {
        method: 'POST',
      },
    ),
  saveHomeworkReviewDraftV2: (
    assignmentId: number,
    payload: {
      submissionId?: number;
      draft: HomeworkReviewDraft | null;
    },
  ) =>
    apiFetch<{ assignment: HomeworkAssignment; submission: HomeworkSubmission | null }>(
      `/api/v2/homework/assignments/${assignmentId}/review-draft`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),
  createHomeworkSubmissionV2: (
    assignmentId: number,
    payload: {
      answerText?: string | null;
      attachments?: HomeworkAttachment[];
      voice?: HomeworkAttachment[];
      testAnswers?: Record<string, unknown> | null;
      submit?: boolean;
    },
  ) =>
    apiFetch<{ submission: HomeworkSubmission; assignment: HomeworkAssignment }>(
      `/api/v2/homework/assignments/${assignmentId}/submissions`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),
  reviewHomeworkAssignmentV2: (
    assignmentId: number,
    payload: {
      action: 'REVIEWED' | 'RETURNED';
      submissionId?: number;
      autoScore?: number | null;
      manualScore?: number | null;
      finalScore?: number | null;
      teacherComment?: string | null;
    },
  ) =>
    apiFetch<{ assignment: HomeworkAssignment; submission: HomeworkSubmission | null }>(
      `/api/v2/homework/assignments/${assignmentId}/review`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),
  listStudentHomeworkAssignmentsV2: (params?: {
    filter?: 'all' | 'active' | 'overdue' | 'submitted' | 'reviewed';
    limit?: number;
    offset?: number;
  }) => {
    const search = new URLSearchParams();
    if (params?.filter) search.set('filter', params.filter);
    if (typeof params?.limit === 'number') search.set('limit', String(params.limit));
    if (typeof params?.offset === 'number') search.set('offset', String(params.offset));
    const suffix = search.toString();
    return apiFetch<{ items: HomeworkAssignment[]; total: number; nextOffset: number | null }>(
      `/api/v2/student/homework/assignments${suffix ? `?${suffix}` : ''}`,
    );
  },
  getStudentHomeworkAssignmentDetailV2: (assignmentId: number) =>
    apiFetch<{ assignment: HomeworkAssignment; submissions: HomeworkSubmission[] }>(
      `/api/v2/student/homework/assignments/${assignmentId}`,
    ),
  getStudentHomeworkSummaryV2: () =>
    apiFetch<{
      activeCount: number;
      overdueCount: number;
      submittedCount: number;
      reviewedCount: number;
      dueTodayCount: number;
    }>('/api/v2/student/homework/summary'),
  updateStudentPreferencesV2: (payload: { timezone?: string | null }) =>
    apiFetch<{ student: Student }>('/api/v2/student/preferences', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  createFilePresignV2: (payload: { fileName: string; contentType: string; size: number; scope?: string }) =>
    apiFetch<{
      uploadUrl: string;
      method: 'PUT';
      headers: Record<string, string>;
      fileUrl: string;
      objectKey: string;
      expiresInSeconds: number;
    }>('/api/v2/files/presign-upload', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

export type ApiClient = typeof api;

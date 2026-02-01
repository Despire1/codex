import { FC } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import {
  Homework,
  HomeworkStatus,
  Lesson,
  LessonDateRange,
  LessonPaymentFilter,
  LessonSortOrder,
  LessonStatusFilter,
  LinkedStudent,
  PaymentEvent,
  PaymentReminderLog,
  Student,
  StudentDebtItem,
  StudentListItem,
  Teacher,
  TeacherStudent,
} from '../../entities/types';
import { DashboardSection } from '../../widgets/dashboard/DashboardSection';
import { ScheduleSection } from '../../widgets/schedule/ScheduleSection';
import { SettingsSection } from '../../widgets/settings/SettingsSection';
import { StudentsSection } from '../../widgets/students/StudentsSection';
import { type StudentTabId } from '../../widgets/students/types';
import { tabPathById } from '../tabs';

interface AppRoutesProps {
  resolveLastVisitedPath: () => string;
  dashboard: {
    lessons: Lesson[];
    linkedStudents: LinkedStudent[];
    teacher: Teacher;
    onAddStudent: () => void;
    onCreateLesson: () => void;
    onOpenSchedule: () => void;
    onOpenLesson: (lesson: Lesson) => void;
    onCompleteLesson: (lessonId: number) => void;
    onTogglePaid: (lessonId: number, studentId?: number) => void;
    onRemindLessonPayment: (
      lessonId: number,
      studentId?: number,
    ) => Promise<{ status: 'sent' | 'error' }> | { status: 'sent' | 'error' };
    onOpenStudent: (studentId: number) => void;
  };
  students: {
    teacher: Teacher;
    studentListItems: StudentListItem[];
    studentListCounts: { withDebt: number; overdue: number };
    studentListTotal: number;
    studentListLoading: boolean;
    studentListHasMore: boolean;
    studentSearch: string;
    studentFilter: 'all' | 'debt' | 'overdue';
    lessons: Lesson[];
    selectedStudentId: number | null;
    priceEditState: { id: number | null; value: string };
    studentHomeworks: Homework[];
    homeworkFilter: 'all' | HomeworkStatus | 'overdue';
    homeworkListLoading: boolean;
    homeworkListHasMore: boolean;
    newHomeworkDraft: {
      text: string;
      deadline: string;
      status: HomeworkStatus;
      baseStatus: HomeworkStatus;
      sendNow: boolean;
      remindBefore: boolean;
      timeSpentMinutes: string;
    };
    onSelectStudent: (id: number) => void;
    onStudentSearchChange: (value: string) => void;
    onStudentFilterChange: (value: 'all' | 'debt' | 'overdue') => void;
    onLoadMoreStudents: () => void;
    onHomeworkFilterChange: (filter: 'all' | HomeworkStatus | 'overdue') => void;
    onLoadMoreHomeworks: () => void;
    onToggleAutoReminder: (studentId: number) => void;
    onTogglePaymentReminders: (studentId: number, enabled: boolean) => void;
    onAdjustBalance: (studentId: number, delta: number) => void;
    onBalanceTopup: (
      studentId: number,
      payload: {
        delta: number;
        type: Extract<PaymentEvent['type'], 'TOP_UP' | 'MANUAL_PAID' | 'SUBSCRIPTION' | 'OTHER' | 'ADJUSTMENT'>;
        comment?: string;
        createdAt?: string;
      },
    ) => Promise<void>;
    onStartEditPrice: (student: Student & { link: TeacherStudent }) => void;
    onPriceChange: (value: string) => void;
    onSavePrice: () => void;
    onCancelPriceEdit: () => void;
    onRemindHomework: (studentId: number) => void;
    onRemindHomeworkById?: (homeworkId: number) => void;
    onSendHomework?: (homeworkId: number) => void;
    onDuplicateHomework?: (homeworkId: number) => void;
    onDeleteHomework?: (homeworkId: number) => void;
    onAddHomework: () => void;
    onHomeworkDraftChange: (draft: {
      text: string;
      deadline: string;
      status: HomeworkStatus;
      baseStatus: HomeworkStatus;
      sendNow: boolean;
      remindBefore: boolean;
      timeSpentMinutes: string;
    }) => void;
    onToggleHomework: (homeworkId: number) => void;
    onUpdateHomework?: (homeworkId: number, payload: Partial<Homework>) => void;
    onAddStudent: () => void;
    onEditStudent: () => void;
    onRequestDeleteStudent: (studentId: number) => void;
    onRemindLessonPayment: (
      lessonId: number,
      studentId?: number,
      options?: { force?: boolean },
    ) => Promise<{ status: 'sent' | 'error' }>;
    studentLessons: Lesson[];
    studentLessonsSummary: Lesson[];
    studentDebtItems: StudentDebtItem[];
    studentDebtTotal: number;
    lessonPaymentFilter: LessonPaymentFilter;
    lessonStatusFilter: LessonStatusFilter;
    lessonDateRange: LessonDateRange;
    lessonListLoading: boolean;
    lessonSortOrder: LessonSortOrder;
    onLessonPaymentFilterChange: (filter: LessonPaymentFilter) => void;
    onLessonStatusFilterChange: (filter: LessonStatusFilter) => void;
    onLessonDateRangeChange: (range: LessonDateRange) => void;
    onLessonSortOrderChange: (order: LessonSortOrder) => void;
    payments: PaymentEvent[];
    paymentReminders: PaymentReminderLog[];
    paymentFilter: 'all' | 'topup' | 'charges' | 'manual';
    paymentDate: string;
    onPaymentFilterChange: (filter: 'all' | 'topup' | 'charges' | 'manual') => void;
    onPaymentDateChange: (date: string) => void;
    onCompleteLesson: (lessonId: number) => void;
    onChangeLessonStatus: (lessonId: number, status: Lesson['status']) => void;
    onTogglePaid: (lessonId: number, studentId?: number) => void;
    onCreateLesson: (studentId?: number) => void;
    onEditLesson: (lesson: Lesson) => void;
    onDeleteLesson: (lessonId: number) => void;
    onActiveTabChange?: (tab: StudentTabId) => void;
    onOpenPaymentReminders?: () => void;
    onRequestDebtDetails?: () => void;
    paymentsLoading?: boolean;
    paymentRemindersLoading?: boolean;
  };
  schedule: {
    scheduleView: 'day' | 'week' | 'month';
    onScheduleViewChange: (view: 'day' | 'week' | 'month') => void;
    dayViewDate: Date;
    onDayShift: (delta: number) => void;
    onWeekShift: (delta: number) => void;
    onMonthShift: (delta: number) => void;
    dayLabelKey: number;
    weekLabelKey: number;
    monthLabelKey: number;
    lessons: Lesson[];
    linkedStudents: LinkedStudent[];
    monthAnchor: Date;
    monthOffset: number;
    onOpenLessonModal: (dateISO: string, time?: string, existing?: Lesson) => void;
    onStartEditLesson: (lesson: Lesson) => void;
    onTogglePaid: (lessonId: number, studentId?: number) => void;
    onDeleteLesson: (lessonId: number) => void;
    onDayViewDateChange: (date: Date) => void;
    onGoToToday: () => void;
    autoConfirmLessons: boolean;
  };
  settings: {
    teacher: Teacher;
    onTeacherChange: (teacher: Teacher) => void;
  };
}

export const AppRoutes: FC<AppRoutesProps> = ({
  resolveLastVisitedPath,
  dashboard,
  students,
  schedule,
  settings,
}) => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={resolveLastVisitedPath()} replace />} />
      <Route path={tabPathById.dashboard} element={<DashboardSection {...dashboard} />} />
      <Route path={tabPathById.students} element={<StudentsSection {...students} />} />
      <Route path={tabPathById.schedule} element={<ScheduleSection {...schedule} />} />
      <Route path={`${tabPathById.settings}/*`} element={<SettingsSection {...settings} />} />
      <Route path="*" element={<Navigate to={resolveLastVisitedPath()} replace />} />
    </Routes>
  );
};

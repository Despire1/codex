import { type FC } from 'react';
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
  Teacher,
  UnpaidLessonEntry,
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
    unpaidEntries: UnpaidLessonEntry[];
    onWeekRangeChange?: (start: Date, end: Date) => void;
    onAddStudent: () => void;
    onCreateLesson: (date?: Date) => void;
    onOpenSchedule: () => void;
    onOpenLesson: (lesson: Lesson) => void;
    onOpenLessonDay: (lesson: Lesson) => void;
    onCompleteLesson: (lessonId: number) => void;
    onTogglePaid: (lessonId: number, studentId?: number) => void;
    onRemindLessonPayment: (
      lessonId: number,
      studentId?: number,
    ) => Promise<{ status: 'sent' | 'error' }> | { status: 'sent' | 'error' };
    onOpenStudent: (studentId: number) => void;
  };
  students: {
    hasAccess: boolean;
    teacher: Teacher;
    lessons: Lesson[];
    homeworkFilter: 'all' | HomeworkStatus | 'overdue';
    newHomeworkDraft: {
      text: string;
      deadline: string;
      status: HomeworkStatus;
      baseStatus: HomeworkStatus;
      sendNow: boolean;
      remindBefore: boolean;
      timeSpentMinutes: string;
    };
    onHomeworkFilterChange: (filter: 'all' | HomeworkStatus | 'overdue') => void;
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
    onRemindLessonPayment: (
      lessonId: number,
      studentId?: number,
      options?: { force?: boolean },
    ) => Promise<{ status: 'sent' | 'error' }>;
    lessonPaymentFilter: LessonPaymentFilter;
    lessonStatusFilter: LessonStatusFilter;
    lessonDateRange: LessonDateRange;
    lessonSortOrder: LessonSortOrder;
    onLessonPaymentFilterChange: (filter: LessonPaymentFilter) => void;
    onLessonStatusFilterChange: (filter: LessonStatusFilter) => void;
    onLessonDateRangeChange: (range: LessonDateRange) => void;
    onLessonSortOrderChange: (order: LessonSortOrder) => void;
    paymentFilter: 'all' | 'topup' | 'charges' | 'manual';
    paymentDate: string;
    onPaymentFilterChange: (filter: 'all' | 'topup' | 'charges' | 'manual') => void;
    onPaymentDateChange: (date: string) => void;
    onCompleteLesson: (lessonId: number) => void;
    onChangeLessonStatus: (lessonId: number, status: Lesson['status']) => void;
    onTogglePaid: (lessonId: number, studentId?: number) => void;
    onCreateLesson: (studentId?: number) => void;
    onEditLesson: (lesson: Lesson) => void;
    onRequestDeleteLesson: (lesson: Lesson) => void;
    onActiveTabChange?: (tab: StudentTabId) => void;
    studentListReloadKey: number;
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
    selectedMonthDay?: string | null;
    onMonthDaySelect?: (dayIso: string | null) => void;
    onOpenLessonModal: (dateISO: string, time?: string, existing?: Lesson) => void;
    onStartEditLesson: (lesson: Lesson) => void;
    onTogglePaid: (lessonId: number, studentId?: number) => void;
    onDeleteLesson: (lesson: Lesson) => void;
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

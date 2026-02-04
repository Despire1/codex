import { type FC } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import {
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
    onOpenStudent: (studentId: number) => void;
  };
  students: {
    hasAccess: boolean;
    teacher: Teacher;
    lessons: Lesson[];
    homeworkFilter: 'all' | HomeworkStatus | 'overdue';
    onHomeworkFilterChange: (filter: 'all' | HomeworkStatus | 'overdue') => void;
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
    onActiveTabChange?: (tab: StudentTabId) => void;
    studentListReloadKey: number;
  };
  schedule: {
    lessons: Lesson[];
    linkedStudents: LinkedStudent[];
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

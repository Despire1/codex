import { type FC } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Lesson, LinkedStudent, Teacher } from '../../entities/types';
import { DashboardHome } from '../../widgets/dashboard/DashboardHome';
import { ScheduleSection } from '../../widgets/schedule/ScheduleSection';
import { SettingsSection } from '../../widgets/settings/SettingsSection';
import { StudentsSection } from '../../widgets/students/StudentsSection';
import { type StudentTabId } from '../../widgets/students/types';
import { tabPathById } from '../tabs';
import type { DashboardSummary } from '../../shared/api/client';

interface AppRoutesProps {
  resolveLastVisitedPath: () => string;
  dashboard: {
    lessons: Lesson[];
    linkedStudents: LinkedStudent[];
    teacher: Teacher;
    onAddStudent: () => void;
    onCreateLesson: (date?: Date) => void;
    onOpenSchedule: () => void;
    onOpenLesson: (lesson: Lesson) => void;
    onOpenLessonDay: (lesson: Lesson) => void;
    onOpenStudent: (studentId: number) => void;
  };
  dashboardSummary: {
    summary: DashboardSummary | null;
    isLoading: boolean;
    refresh: () => void;
  };
  students: {
    hasAccess: boolean;
    teacher: Teacher;
    lessons: Lesson[];
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
  dashboardSummary,
  students,
  schedule,
  settings,
}) => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={resolveLastVisitedPath()} replace />} />
      <Route
        path={tabPathById.dashboard}
        element={<DashboardHome {...dashboard} dashboardSummary={dashboardSummary} />}
      />
      <Route path={tabPathById.students} element={<StudentsSection {...students} />} />
      <Route path={tabPathById.schedule} element={<ScheduleSection {...schedule} />} />
      <Route path={`${tabPathById.settings}/*`} element={<SettingsSection {...settings} />} />
      <Route path="*" element={<Navigate to={resolveLastVisitedPath()} replace />} />
    </Routes>
  );
};

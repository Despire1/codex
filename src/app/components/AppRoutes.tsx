import { memo, type FC } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Lesson, LinkedStudent, Teacher } from '../../entities/types';
import { AnalyticsSection } from '../../widgets/analytics/AnalyticsSection';
import { DashboardHome } from '../../widgets/dashboard/DashboardHome';
import { HomeworksSection } from '../../widgets/homeworks/HomeworksSection';
import { ScheduleSection } from '../../widgets/schedule/ScheduleSection';
import { SettingsSection } from '../../widgets/settings/SettingsSection';
import { StudentDashboardSection } from '../../widgets/student-dashboard/StudentDashboardSection';
import { StudentSettingsSection } from '../../widgets/student-settings/StudentSettingsSection';
import { StudentsSection } from '../../widgets/students/StudentsSection';
import { type StudentTabId } from '../../widgets/students/types';
import { tabPathById } from '../tabs';
import type { DashboardSummary } from '../../shared/api/client';

interface AppRoutesProps {
  isStudentRole: boolean;
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
    onOpenHomeworkAssign: (studentId?: number | null, lessonId?: number | null) => void;
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
    onNavigate?: (to: string) => void;
  };
  homeworks: {
    mode: 'teacher' | 'student';
  };
  studentDashboard: {
    activeTeacherName?: string | null;
  };
  studentSettings: {
    activeTeacherName?: string | null;
  };
}

const AppRoutesComponent: FC<AppRoutesProps> = ({
  isStudentRole,
  resolveLastVisitedPath,
  dashboard,
  dashboardSummary,
  students,
  schedule,
  settings,
  homeworks,
  studentDashboard,
  studentSettings,
}) => {
  if (isStudentRole) {
    return (
      <Routes>
        <Route path="/" element={<Navigate to={resolveLastVisitedPath()} replace />} />
        <Route path={tabPathById.dashboard} element={<StudentDashboardSection {...studentDashboard} />} />
        <Route path={tabPathById.homeworks} element={<HomeworksSection {...homeworks} />} />
        <Route path={`${tabPathById.homeworks}/:assignmentId`} element={<HomeworksSection {...homeworks} />} />
        <Route path={tabPathById.settings} element={<StudentSettingsSection {...studentSettings} />} />
        <Route path={`${tabPathById.settings}/*`} element={<StudentSettingsSection {...studentSettings} />} />
        <Route path="*" element={<Navigate to={resolveLastVisitedPath()} replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to={resolveLastVisitedPath()} replace />} />
      <Route
        path={tabPathById.dashboard}
        element={<DashboardHome {...dashboard} dashboardSummary={dashboardSummary} />}
      />
      <Route path={tabPathById.students} element={<StudentsSection {...students} />} />
      <Route path={tabPathById.schedule} element={<ScheduleSection {...schedule} />} />
      <Route path={`${tabPathById.homeworks}/templates/new`} element={<HomeworksSection {...homeworks} />} />
      <Route path={tabPathById.homeworks} element={<HomeworksSection {...homeworks} />} />
      <Route path={tabPathById.analytics} element={<AnalyticsSection />} />
      <Route path={`${tabPathById.settings}/*`} element={<SettingsSection {...settings} />} />
      <Route path="*" element={<Navigate to={resolveLastVisitedPath()} replace />} />
    </Routes>
  );
};

AppRoutesComponent.displayName = 'AppRoutes';

export const AppRoutes = memo(AppRoutesComponent);

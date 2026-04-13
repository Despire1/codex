import { memo, type FC } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Lesson, LinkedStudent, Teacher, TeacherStudent } from '../../entities/types';
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
    weekendWeekdays: number[];
  };
  settings: {
    teacher: Teacher;
    onTeacherChange: (teacher: Teacher) => void;
    onLinksPatched?: (links: TeacherStudent[]) => void;
    onLessonsRemoved?: (lessonIds: number[]) => void;
    onNavigate?: (to: string) => void;
  };
  homeworks: {
    mode: 'teacher' | 'student';
    onOpenMobileSidebar?: () => void;
  };
  studentDashboard: {
    activeTeacherName?: string | null;
  };
  studentSettings: {
    activeTeacherName?: string | null;
  };
}

const LegacyHomeworkTemplateEditRedirect: FC = () => {
  const { templateId } = useParams<{ templateId?: string }>();
  return <Navigate to={`${tabPathById.homeworks}/${templateId ?? ''}/edit`} replace />;
};

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
      <Route path={`${tabPathById.students}/:studentId`} element={<StudentsSection {...students} />} />
      <Route path={tabPathById.schedule} element={<ScheduleSection {...schedule} />} />
      <Route path={`${tabPathById.homeworks}/new`} element={<HomeworksSection {...homeworks} />} />
      <Route path={`${tabPathById.homeworks}/assignments/:assignmentId/edit`} element={<HomeworksSection {...homeworks} />} />
      <Route path={`${tabPathById.homeworks}/templates/new`} element={<Navigate to={`${tabPathById.homeworks}/new`} replace />} />
      <Route path={`${tabPathById.homeworks}/templates/:templateId/edit`} element={<LegacyHomeworkTemplateEditRedirect />} />
      <Route path={`${tabPathById.homeworks}/:templateId/edit`} element={<HomeworksSection {...homeworks} />} />
      <Route path={`${tabPathById.homeworks}/review/:assignmentId`} element={<HomeworksSection {...homeworks} />} />
      <Route path={`${tabPathById.homeworks}/:templateId`} element={<HomeworksSection {...homeworks} />} />
      <Route path={tabPathById.homeworks} element={<HomeworksSection {...homeworks} />} />
      <Route path={tabPathById.analytics} element={<AnalyticsSection />} />
      <Route path={`${tabPathById.settings}/*`} element={<SettingsSection {...settings} />} />
      <Route path="*" element={<Navigate to={resolveLastVisitedPath()} replace />} />
    </Routes>
  );
};

AppRoutesComponent.displayName = 'AppRoutes';

export const AppRoutes = memo(AppRoutesComponent);

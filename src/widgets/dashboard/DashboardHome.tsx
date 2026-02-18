import { type FC } from 'react';
import type { Lesson, LinkedStudent, Teacher } from '../../entities/types';
import type { DashboardSummary } from '../../shared/api/client';
import { useOnboardingState } from '../../features/onboarding/model/useOnboardingState';
import { DashboardSection } from './DashboardSection';
import { OnboardingEmptyState } from '../onboarding/OnboardingEmptyState';
import styles from './DashboardHome.module.css';

interface DashboardHomeProps {
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
  dashboardSummary: {
    summary: DashboardSummary | null;
    isLoading: boolean;
    refresh: () => void;
  };
}

export const DashboardHome: FC<DashboardHomeProps> = ({ dashboardSummary, ...dashboardProps }) => {
  const onboarding = useOnboardingState();
  const isLoading = dashboardSummary.isLoading && !dashboardSummary.summary;

  if (isLoading) {
    return (
      <section className={styles.loadingGrid}>
        <div className={styles.loadingCard}>Загружаем данные…</div>
      </section>
    );
  }

  if (onboarding.isActive) {
    return <OnboardingEmptyState onRefreshSummary={dashboardSummary.refresh} />;
  }

  return <DashboardSection {...dashboardProps} dashboardSummary={dashboardSummary.summary} />;
};

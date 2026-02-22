import { FC, useMemo, useState } from 'react';
import { StudentHomeworksViewModel } from '../types';
import {
  matchesStudentHomeworkFilter,
  resolveStudentHomeworkCardKind,
  resolveStudentHomeworkStatusSortOrder,
  resolveStudentHomeworkSubjectLabel,
} from './model/lib/presentation';
import {
  resolveStudentHomeworkReferenceCompletedAt,
  resolveStudentHomeworkReferenceSortDate,
  StudentHomeworkSort,
} from './model/lib/referencePresentation';
import { StudentHomeworkFiltersSection } from './ui/StudentHomeworkFiltersSection';
import { StudentHomeworkRecentSection } from './ui/StudentHomeworkRecentSection';
import { StudentHomeworkStatsSection } from './ui/StudentHomeworkStatsSection';
import { StudentHomeworkTableSection } from './ui/StudentHomeworkTableSection';
import styles from './StudentHomeworksView.module.css';

const toDateMs = (value?: string | null, fallback = Number.POSITIVE_INFINITY) => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.getTime();
};

export const StudentHomeworksView: FC<StudentHomeworksViewModel> = ({
  assignments,
  summary,
  filter,
  loading,
  loadingMore,
  hasMore,
  onFilterChange,
  onRefresh,
  onLoadMore,
  onOpenAssignment,
}) => {
  const [sortBy, setSortBy] = useState<StudentHomeworkSort>('deadline');

  const preparedAssignments = useMemo(() => {
    const next = assignments.filter((assignment) => matchesStudentHomeworkFilter(assignment, filter)).slice();

    next.sort((left, right) => {
      if (sortBy === 'deadline') {
        const leftDeadline = resolveStudentHomeworkReferenceSortDate(left);
        const rightDeadline = resolveStudentHomeworkReferenceSortDate(right);
        if (leftDeadline !== rightDeadline) return leftDeadline - rightDeadline;
      }

      if (sortBy === 'subject') {
        const leftSubject = resolveStudentHomeworkSubjectLabel(left);
        const rightSubject = resolveStudentHomeworkSubjectLabel(right);
        const compared = leftSubject.localeCompare(rightSubject, 'ru-RU');
        if (compared !== 0) return compared;
      }

      if (sortBy === 'status') {
        const leftStatus = resolveStudentHomeworkStatusSortOrder(left);
        const rightStatus = resolveStudentHomeworkStatusSortOrder(right);
        if (leftStatus !== rightStatus) return leftStatus - rightStatus;
      }

      return toDateMs(right.createdAt, 0) - toDateMs(left.createdAt, 0);
    });

    return next;
  }, [assignments, filter, sortBy]);

  const recentCompleted = useMemo(
    () =>
      assignments
        .filter((assignment) => resolveStudentHomeworkCardKind(assignment) === 'completed')
        .slice()
        .sort((left, right) => resolveStudentHomeworkReferenceCompletedAt(right) - resolveStudentHomeworkReferenceCompletedAt(left))
        .slice(0, 3),
    [assignments],
  );

  const totalCount = summary.activeCount + summary.reviewedCount;

  return (
    <section className={styles.page}>
      <StudentHomeworkStatsSection assignments={assignments} summary={summary} loading={loading} />

      <StudentHomeworkFiltersSection
        filter={filter}
        sortBy={sortBy}
        totalCount={totalCount}
        loading={loading}
        onFilterChange={onFilterChange}
        onSortByChange={setSortBy}
      />

      <StudentHomeworkTableSection
        assignments={preparedAssignments}
        loading={loading}
        onRefresh={onRefresh}
        onOpenAssignment={onOpenAssignment}
      />

      {hasMore ? (
        <div className={styles.loadMoreWrap}>
          <button type="button" className={styles.loadMoreButton} onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? 'Загрузка…' : 'Показать ещё'}
          </button>
        </div>
      ) : null}

      <StudentHomeworkRecentSection
        assignments={recentCompleted}
        onOpenAssignment={onOpenAssignment}
        onOpenAll={() => onFilterChange('reviewed')}
      />
    </section>
  );
};

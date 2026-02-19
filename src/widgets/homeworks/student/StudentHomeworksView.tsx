import { FC, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell as farBell } from '@fortawesome/free-regular-svg-icons';
import {
  faArrowRight,
  faArrowUp,
  faBars,
  faCircle,
  faCircleCheck,
  faCircleQuestion,
  faClipboardList,
  faFire,
  faMagnifyingGlass,
  faStar,
} from '@fortawesome/free-solid-svg-icons';
import { HomeworkAssignment } from '../../../entities/types';
import { StudentHomeworksViewModel } from '../types';
import {
  calculateStudentHomeworkCompletedThisWeek,
  calculateStudentHomeworkCurrentStreak,
  formatStudentHomeworkScore,
  matchesStudentHomeworkFilter,
  resolveStudentHomeworkCardKind,
  resolveStudentHomeworkScoreValue,
  resolveStudentHomeworkSearchVector,
  resolveStudentHomeworkStatusSortOrder,
  resolveStudentHomeworkSubjectLabel,
} from './model/lib/presentation';
import { StudentHomeworkCard } from './ui/StudentHomeworkCard';
import { StudentHomeworkRecentCard } from './ui/StudentHomeworkRecentCard';
import styles from './StudentHomeworksView.module.css';

const MAIN_FILTERS: Array<{ id: StudentHomeworksViewModel['filter']; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'new', label: 'Новые' },
  { id: 'in_progress', label: 'В работе' },
  { id: 'submitted', label: 'На проверке' },
  { id: 'reviewed', label: 'Выполнено' },
];

type SortBy = 'deadline' | 'subject' | 'status';

const SORT_OPTIONS: Array<{ id: SortBy; label: string }> = [
  { id: 'deadline', label: 'По дедлайну' },
  { id: 'subject', label: 'По предмету' },
  { id: 'status', label: 'По статусу' },
];

const toDateMs = (value?: string | null, fallback = Number.POSITIVE_INFINITY) => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.getTime();
};

const resolveCompletedAt = (assignment: HomeworkAssignment) =>
  toDateMs(assignment.reviewedAt, toDateMs(assignment.updatedAt, 0));

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
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('deadline');

  const searchNeedle = searchQuery.trim().toLowerCase();

  const averageScore = useMemo(() => {
    const values = assignments
      .map((assignment) => resolveStudentHomeworkScoreValue(assignment))
      .filter((score): score is number => typeof score === 'number');
    if (!values.length) return null;
    const total = values.reduce((sum, value) => sum + value, 0);
    return total / values.length;
  }, [assignments]);

  const completedThisWeek = useMemo(() => calculateStudentHomeworkCompletedThisWeek(assignments), [assignments]);
  const streakDays = useMemo(() => calculateStudentHomeworkCurrentStreak(assignments), [assignments]);

  const preparedAssignments = useMemo(() => {
    const next = assignments
      .filter((assignment) => matchesStudentHomeworkFilter(assignment, filter))
      .filter((assignment) => {
        if (!searchNeedle) return true;
        return resolveStudentHomeworkSearchVector(assignment).includes(searchNeedle);
      })
      .slice();

    next.sort((left, right) => {
      if (sortBy === 'deadline') {
        const leftDeadline = toDateMs(left.deadlineAt);
        const rightDeadline = toDateMs(right.deadlineAt);
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
  }, [assignments, filter, searchNeedle, sortBy]);

  const recentCompleted = useMemo(
    () =>
      assignments
        .filter((assignment) => resolveStudentHomeworkCardKind(assignment) === 'completed')
        .slice()
        .sort((left, right) => resolveCompletedAt(right) - resolveCompletedAt(left))
        .slice(0, 3),
    [assignments],
  );

  const totalCount = summary.activeCount + summary.reviewedCount;
  const scorePercent = averageScore ? Math.min(100, Math.max(0, Math.round(averageScore * 10))) : 0;
  const unreadDotVisible = summary.overdueCount > 0 || summary.dueTodayCount > 0;

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button type="button" className={styles.menuButton} aria-label="Открыть меню">
            <FontAwesomeIcon icon={faBars} />
          </button>
          <h1 className={styles.title}>Мои домашние задания</h1>
        </div>

        <div className={styles.headerActions}>
          <label className={styles.searchField}>
            <FontAwesomeIcon icon={faMagnifyingGlass} className={styles.searchIcon} />
            <input
              type="search"
              placeholder="Поиск по заданиям..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>

          <button type="button" className={styles.iconButton} onClick={onRefresh} aria-label="Обновить список">
            <FontAwesomeIcon icon={farBell} />
            {unreadDotVisible ? <span className={styles.iconDot} aria-hidden /> : null}
          </button>

          <button type="button" className={styles.helpButton} onClick={onRefresh}>
            <FontAwesomeIcon icon={faCircleQuestion} className={styles.helpIcon} />
            <span>Помощь</span>
          </button>
        </div>
      </header>

      <section className={styles.statsGrid} aria-label="Статистика домашних заданий">
        <article className={`${styles.statCard} ${styles.statCard_primary}`}>
          <div className={styles.statIconWrap}>
            <FontAwesomeIcon icon={faClipboardList} />
          </div>
          <h3 className={styles.statValue}>{loading ? '—' : summary.activeCount}</h3>
          <p className={styles.statLabel}>Активных заданий</p>
          <div className={styles.statHintRow}>
            <span className={styles.statHintAccent}>
              <FontAwesomeIcon icon={faCircle} />
              {loading ? '—' : `${summary.overdueCount} срочное`}
            </span>
          </div>
        </article>

        <article className={styles.statCard}>
          <div className={`${styles.statIconWrap} ${styles.statIconWrap_green}`}>
            <FontAwesomeIcon icon={faCircleCheck} />
          </div>
          <h3 className={styles.statValue}>{loading ? '—' : summary.reviewedCount}</h3>
          <p className={styles.statLabel}>Выполнено</p>
          <div className={styles.statHintRow}>
            <span className={styles.statTrend}>
              <FontAwesomeIcon icon={faArrowUp} />
              {loading ? '—' : `+${completedThisWeek} эта неделя`}
            </span>
          </div>
        </article>

        <article className={styles.statCard}>
          <div className={`${styles.statIconWrap} ${styles.statIconWrap_blue}`}>
            <FontAwesomeIcon icon={faStar} />
          </div>
          <h3 className={styles.statValue}>{loading ? '—' : averageScore === null ? '—' : averageScore.toFixed(1)}</h3>
          <p className={styles.statLabel}>Средний балл</p>
          <div className={styles.scoreTrack}>
            <div className={styles.scoreBar} style={{ width: `${scorePercent}%` }} />
          </div>
        </article>

        <article className={styles.statCard}>
          <div className={`${styles.statIconWrap} ${styles.statIconWrap_purple}`}>
            <FontAwesomeIcon icon={faFire} />
          </div>
          <h3 className={styles.statValue}>{loading ? '—' : streakDays}</h3>
          <p className={styles.statLabel}>Дней без пропусков</p>
          <div className={styles.statHintRow}>
            <span className={styles.streakText}>
              {streakDays > 0 ? 'Продолжай в том же духе!' : 'Начни серию сегодня'}
            </span>
          </div>
        </article>
      </section>

      <section className={styles.filtersSection}>
        <div className={styles.filtersPanel}>
          <div className={styles.filtersRow}>
            <span className={styles.filtersLabel}>Показать:</span>
            {MAIN_FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.filterChip} ${filter === item.id ? styles.filterChipActive : ''}`}
                onClick={() => onFilterChange(item.id)}
              >
                {item.label}
                {item.id === 'all' ? <span className={styles.filterBadge}>{loading ? '—' : totalCount}</span> : null}
              </button>
            ))}

            <div className={styles.sortWrap}>
              <span className={styles.sortLabel}>Сортировка:</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortBy)}>
                {SORT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.listSection} aria-label="Список домашних заданий">
        {loading ? <div className={styles.emptyState}>Загрузка заданий…</div> : null}
        {!loading && preparedAssignments.length === 0 ? (
          <div className={styles.emptyState}>По выбранным фильтрам ничего не найдено.</div>
        ) : null}

        {!loading && preparedAssignments.length > 0 ? (
          <div className={styles.cardsList}>
            {preparedAssignments.map((assignment) => (
              <StudentHomeworkCard key={assignment.id} assignment={assignment} onOpen={onOpenAssignment} />
            ))}
          </div>
        ) : null}

        {hasMore ? (
          <button type="button" className={styles.loadMoreButton} onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? 'Загрузка…' : 'Показать ещё'}
          </button>
        ) : null}
      </section>

      {recentCompleted.length > 0 ? (
        <section className={styles.recentSection}>
          <div className={styles.recentHeader}>
            <h2>Недавно выполненные</h2>
            <button type="button" className={styles.recentLink} onClick={() => onFilterChange('reviewed')}>
              Все задания
              <FontAwesomeIcon icon={faArrowRight} />
            </button>
          </div>

          <div className={styles.recentGrid}>
            {recentCompleted.map((assignment) => (
              <StudentHomeworkRecentCard key={assignment.id} assignment={assignment} onOpen={onOpenAssignment} />
            ))}
          </div>
        </section>
      ) : null}

      {averageScore !== null ? (
        <div className={styles.visuallyHidden} aria-live="polite">
          Текущий средний балл: {formatStudentHomeworkScore(averageScore)}
        </div>
      ) : null}
    </section>
  );
};

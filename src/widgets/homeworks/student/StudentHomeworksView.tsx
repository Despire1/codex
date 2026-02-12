import { FC } from 'react';
import controls from '../../../shared/styles/controls.module.css';
import { ASSIGNMENT_STATUS_LABELS } from '../../../entities/homework-assignment/model/lib/assignmentBuckets';
import styles from '../HomeworksSection.module.css';
import { StudentHomeworksViewModel } from '../types';

const FILTERS: Array<{ id: StudentHomeworksViewModel['filter']; label: string }> = [
  { id: 'active', label: 'Активные' },
  { id: 'overdue', label: 'Просроченные' },
  { id: 'submitted', label: 'Сданные' },
  { id: 'reviewed', label: 'Проверенные' },
];

const formatDeadline = (deadlineAt?: string | null) => {
  if (!deadlineAt) return 'Без дедлайна';
  const date = new Date(deadlineAt);
  if (Number.isNaN(date.getTime())) return 'Без дедлайна';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const StudentHomeworksView: FC<StudentHomeworksViewModel> = ({
  assignments,
  summary,
  filter,
  loading,
  onFilterChange,
  onRefresh,
  onOpenAssignment,
}) => {
  return (
    <section className={styles.page}>
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Активные</div>
          <div className={styles.kpiValue}>{summary.activeCount}</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Дедлайн сегодня</div>
          <div className={styles.kpiValue}>{summary.dueTodayCount}</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Просроченные</div>
          <div className={styles.kpiValue}>{summary.overdueCount}</div>
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>Мои домашки</h3>
          <button type="button" className={controls.secondaryButton} onClick={onRefresh}>
            Обновить
          </button>
        </div>

        <div className={styles.filterRow}>
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.filterChip} ${filter === item.id ? styles.filterChipActive : ''}`}
              onClick={() => onFilterChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {loading ? <div className={styles.empty}>Загрузка…</div> : null}
        {!loading && assignments.length === 0 ? <div className={styles.empty}>По фильтру ничего не найдено</div> : null}

        {!loading && assignments.length > 0 ? (
          <div className={styles.list}>
            {assignments.map((assignment) => (
              <button
                key={assignment.id}
                type="button"
                className={`${styles.assignmentCard} ${styles.assignmentCardClickable}`}
                onClick={() => onOpenAssignment(assignment)}
              >
                <div className={styles.assignmentTitle}>{assignment.title}</div>
                <div className={styles.assignmentMeta}>Статус: {ASSIGNMENT_STATUS_LABELS[assignment.status]}</div>
                <div className={styles.assignmentMeta}>Дедлайн: {formatDeadline(assignment.deadlineAt)}</div>
                {assignment.latestSubmissionAttemptNo ? (
                  <div className={styles.assignmentMeta}>Попытка: #{assignment.latestSubmissionAttemptNo}</div>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
};


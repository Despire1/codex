import { FC } from 'react';
import { StudentHomeworkFilter } from '../../types';
import { StudentHomeworkSort } from '../model/lib/referencePresentation';
import styles from './StudentHomeworkFiltersSection.module.css';

const MAIN_FILTERS: Array<{ id: StudentHomeworkFilter; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'new', label: 'Новые' },
  { id: 'in_progress', label: 'В работе' },
  { id: 'submitted', label: 'На проверке' },
  { id: 'reviewed', label: 'Выполнено' },
];

const SORT_OPTIONS: Array<{ id: StudentHomeworkSort; label: string }> = [
  { id: 'deadline', label: 'По дедлайну' },
  { id: 'subject', label: 'По предмету' },
  { id: 'status', label: 'По статусу' },
];

type StudentHomeworkFiltersSectionProps = {
  filter: StudentHomeworkFilter;
  sortBy: StudentHomeworkSort;
  totalCount: number;
  loading: boolean;
  onFilterChange: (next: StudentHomeworkFilter) => void;
  onSortByChange: (next: StudentHomeworkSort) => void;
};

export const StudentHomeworkFiltersSection: FC<StudentHomeworkFiltersSectionProps> = ({
  filter,
  sortBy,
  totalCount,
  loading,
  onFilterChange,
  onSortByChange,
}) => {
  return (
    <section className={styles.section} aria-label="Фильтры домашки">
      <div className={styles.panel}>
        <div className={styles.topRow}>
          <div className={styles.summaryBlock}>
            <span className={styles.label}>Список</span>
            <p className={styles.summaryText}>{loading ? 'Загружаем домашние задания' : `${totalCount} заданий в списке`}</p>
          </div>

          <label className={styles.sortCard}>
            <span className={styles.sortLabel}>Сортировка</span>
            <select
              className={styles.sortSelect}
              value={sortBy}
              onChange={(event) => onSortByChange(event.target.value as StudentHomeworkSort)}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={styles.filtersRail}>
          <div className={styles.filtersRow}>
            {MAIN_FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.filterChip} ${filter === item.id ? styles.filterChipActive : ''}`}
                onClick={() => onFilterChange(item.id)}
              >
                {item.label}
                {item.id === 'all' ? <span className={styles.totalBadge}>{loading ? '—' : totalCount}</span> : null}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

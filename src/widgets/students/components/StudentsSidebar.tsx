import { FC, useState, type KeyboardEvent, type RefObject } from 'react';
import { StudentListItem } from '../../../entities/types';
import { FilterAltOutlinedIcon } from '../../../icons/MaterialIcons';
import controls from '../../../shared/styles/controls.module.css';
import { AdaptivePopover } from '../../../shared/ui/AdaptivePopover/AdaptivePopover';
import styles from '../StudentsSection.module.css';

interface StudentsSidebarProps {
  studentListItems: StudentListItem[];
  selectedStudentId: number | null;
  searchQuery: string;
  activeFilter: 'all' | 'debt' | 'overdue';
  counts: { withDebt: number; overdue: number };
  totalCount: number;
  isLoading: boolean;
  hasMore: boolean;
  listRef: RefObject<HTMLDivElement>;
  loadMoreRef: RefObject<HTMLDivElement>;
  onSelectStudent: (id: number) => void;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: 'all' | 'debt' | 'overdue') => void;
  onAddStudent: () => void;
}

export const StudentsSidebar: FC<StudentsSidebarProps> = ({
  studentListItems,
  selectedStudentId,
  searchQuery,
  activeFilter,
  counts,
  totalCount,
  isLoading,
  hasMore,
  listRef,
  loadMoreRef,
  onSelectStudent,
  onSearchChange,
  onFilterChange,
  onAddStudent,
}) => {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const isFilterActive = activeFilter !== 'all';

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarCard}>
        <div className={styles.headerRow}>
          <div>
            <div className={styles.titleRow}>
              <div>Ученики</div>
              <span className={styles.counter}>{totalCount}</span>
            </div>
          </div>
          <button className={controls.secondaryButton} onClick={onAddStudent}>
            + Добавить
          </button>
        </div>

        <div className={styles.searchBlock}>
          <div className={styles.searchRow}>
            <input
              className={`${controls.input} ${styles.searchInput}`}
              placeholder="Поиск"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            <AdaptivePopover
              isOpen={filtersOpen}
              onClose={() => setFiltersOpen(false)}
              trigger={
                <button
                  type="button"
                  className={controls.iconButton}
                  onClick={() => setFiltersOpen((prev) => !prev)}
                  aria-label="Фильтры списка учеников"
                >
                  <span className={styles.filterIconWrapper}>
                    <FilterAltOutlinedIcon width={18} height={18} />
                    {isFilterActive && <span className={styles.filterDot} aria-hidden />}
                  </span>
                </button>
              }
              className={styles.filtersPopoverContent}
            >
              <div className={`${styles.filters} ${styles.filtersPopoverList}`}>
                <button
                  className={`${styles.filterChip} ${activeFilter === 'all' ? styles.activeChip : ''}`}
                  onClick={() => {
                    onFilterChange('all');
                    setFiltersOpen(false);
                  }}
                >
                  Все
                </button>
                <button
                  className={`${styles.filterChip} ${activeFilter === 'debt' ? styles.activeChip : ''}`}
                  onClick={() => {
                    onFilterChange('debt');
                    setFiltersOpen(false);
                  }}
                >
                  С долгом ({counts.withDebt})
                </button>
                <button
                  className={`${styles.filterChip} ${activeFilter === 'overdue' ? styles.activeChip : ''}`}
                  onClick={() => {
                    onFilterChange('overdue');
                    setFiltersOpen(false);
                  }}
                >
                  Просрочено ДЗ ({counts.overdue})
                </button>
              </div>
            </AdaptivePopover>
          </div>
        </div>

        <div className={styles.studentList} ref={listRef}>
          {isLoading && studentListItems.length === 0 ? (
            <div className={styles.listLoader}>
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className={`${styles.skeletonCard} ${styles.skeletonStudentCard}`} />
              ))}
            </div>
          ) : (
            studentListItems.map((item) => {
              const { student, link, stats } = item;
              const status = link.balanceLessons < 0 ? 'debt' : link.balanceLessons > 0 ? 'prepaid' : 'neutral';
              const username = student.username?.trim();

              const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                onSelectStudent(student.id);
              };

              return (
                <div
                  key={student.id}
                  className={`${styles.studentCard} ${selectedStudentId === student.id ? styles.activeStudent : ''}`}
                  onClick={() => onSelectStudent(student.id)}
                  onKeyDown={handleCardKeyDown}
                  role="button"
                  tabIndex={0}
                >
                  <div className={styles.studentStripe} aria-hidden />
                  <div className={styles.studentCardBody}>
                    <div className={styles.studentCardHeader}>
                      <div className={styles.studentName}>{link.customName}</div>
                      <div className={styles.badgeRow}>
                        {status === 'debt' && <span className={`${styles.lozenge} ${styles.badgeDanger}`}>Долг</span>}
                        {stats.overdueHomeworkCount > 0 && (
                          <span className={`${styles.lozenge} ${styles.badgeWarning}`}>ДЗ: {stats.overdueHomeworkCount}</span>
                        )}
                        {stats.pendingHomeworkCount === 0 && stats.totalHomeworkCount > 0 && (
                          <span className={`${styles.lozenge} ${styles.badgeSuccess}`}>ДЗ сделано</span>
                        )}
                      </div>
                    </div>
                    <div className={styles.studentSecondaryRow}>
                      {username ? (
                        <span className={styles.studentMeta}>@{username}</span>
                      ) : (
                        <span className={styles.studentMeta}>@нет</span>
                      )}
                      <span className={styles.metaDivider}>•</span>
                      <span className={styles.studentMeta}>
                        автонапоминания: {link.autoRemindHomework ? 'вкл' : 'выкл'}
                      </span>
                      <span className={styles.metaDivider}>•</span>
                      <span className={styles.studentMeta}>баланс: {link.balanceLessons}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {!isLoading && studentListItems.length === 0 && <div className={styles.emptyState}>Ничего не найдено</div>}
          {hasMore && (
            <div ref={loadMoreRef} className={styles.loadMoreSentinel}>
              {isLoading && <div className={styles.loadingRow}>Загрузка…</div>}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

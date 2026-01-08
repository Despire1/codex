import { FC, useMemo, useState, type RefObject } from 'react';
import { addDays, format, isSameDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Lesson, StudentListItem } from '../../../entities/types';
import { FilterAltOutlinedIcon } from '../../../icons/MaterialIcons';
import controls from '../../../shared/styles/controls.module.css';
import { AdaptivePopover } from '../../../shared/ui/AdaptivePopover/AdaptivePopover';
import styles from '../StudentsSection.module.css';
import { StudentListCard } from './StudentListCard';
import { useTimeZone } from '../../../shared/lib/timezoneContext';
import { formatInTimeZone, toZonedDate } from '../../../shared/lib/timezoneDates';

interface StudentsSidebarProps {
  studentListItems: StudentListItem[];
  lessons: Lesson[];
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
  lessons,
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
  const timeZone = useTimeZone();
  const todayZoned = toZonedDate(new Date(), timeZone);

  const nextLessonByStudent = useMemo(() => {
    const now = new Date();
    const nextLessons = new Map<number, Date>();

    lessons.forEach((lesson) => {
      if (lesson.status !== 'SCHEDULED') return;
      const lessonDate = new Date(lesson.startAt);
      if (lessonDate < now) return;

      const studentIds = new Set<number>();
      if (lesson.studentId) {
        studentIds.add(lesson.studentId);
      }
      lesson.participants?.forEach((participant) => studentIds.add(participant.studentId));

      studentIds.forEach((studentId) => {
        const existing = nextLessons.get(studentId);
        if (!existing || lessonDate < existing) {
          nextLessons.set(studentId, lessonDate);
        }
      });
    });

    return nextLessons;
  }, [lessons]);

  const formatNextLessonLabel = (lessonDate?: Date) => {
    if (!lessonDate) {
      return { label: 'Нет занятий', variant: 'empty' as const };
    }
    const zonedLessonDate = toZonedDate(lessonDate, timeZone);
    const timeLabel = format(zonedLessonDate, 'HH:mm', { locale: ru });
    if (isSameDay(zonedLessonDate, todayZoned)) {
      return { label: `Сегодня, ${timeLabel}`, variant: 'today' as const };
    }
    if (isSameDay(zonedLessonDate, addDays(todayZoned, 1))) {
      return { label: `Завтра, ${timeLabel}`, variant: 'future' as const };
    }
    return { label: formatInTimeZone(lessonDate, 'd MMM, HH:mm', { locale: ru, timeZone }), variant: 'future' as const };
  };

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
              const nextLessonInfo = formatNextLessonLabel(nextLessonByStudent.get(item.student.id));

              return (
                <StudentListCard
                  key={item.student.id}
                  item={item}
                  isActive={selectedStudentId === item.student.id}
                  nextLessonLabel={nextLessonInfo.label}
                  nextLessonVariant={nextLessonInfo.variant}
                  onSelect={onSelectStudent}
                />
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

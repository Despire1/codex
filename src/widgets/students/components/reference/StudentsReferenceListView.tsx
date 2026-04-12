import { type FC, type RefObject, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChartLine,
  faClock,
  faFilter,
  faGrip,
  faList,
  faPlus,
  faUserCheck,
  faUsers,
} from '@fortawesome/free-solid-svg-icons';
import { StudentListItem } from '../../../../entities/types';
import { useIsMobile } from '@/shared/lib/useIsMobile';
import { buildStudentCardPresentation, getStudentDisplayName, type StudentLifecycleStatus } from '../../model/referencePresentation';
import { useStudentCardFilters } from '../../model/useStudentCardFilters';
import { type StudentListViewMode } from '../../types';
import { Tooltip } from '../../../../shared/ui/Tooltip/Tooltip';
import { StudentsReferenceFilterSelect } from './StudentsReferenceFilterSelect';
import { StudentReferenceCompactTableRow } from './StudentReferenceCompactTableRow';
import { StudentReferenceStandardCard } from './StudentReferenceStandardCard';
import styles from './StudentsReferenceListView.module.css';

type ListSummary = {
  active: number;
  paused: number;
  completed: number;
  lessonsThisWeek: number;
  lessonsToday: number;
  averageAttendance: number | null;
  averageScore: number;
};

interface StudentsReferenceListViewProps {
  students: StudentListItem[];
  totalStudents: number;
  summary: ListSummary;
  isLoading: boolean;
  hasMore: boolean;
  listRef: RefObject<HTMLDivElement>;
  loadMoreRef: RefObject<HTMLDivElement>;
  onOpenStudent: (studentId: number) => void;
  onAddStudent: () => void;
  onEditStudent: (studentId: number) => void;
  onDeleteStudent: (studentId: number) => void;
  timeZone: string;
}

const statusTabs: Array<{ id: 'all' | StudentLifecycleStatus; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'ACTIVE', label: 'Активные' },
  { id: 'PAUSED', label: 'На паузе' },
  { id: 'COMPLETED', label: 'Завершили' },
];

const sortOptions: Array<{ value: 'name' | 'created' | 'score' | 'activity'; label: string }> = [
  { value: 'name', label: 'Сортировка: По имени' },
  { value: 'created', label: 'По дате добавления' },
  { value: 'score', label: 'По успеваемости' },
  { value: 'activity', label: 'По активности' },
];

const viewModeOptions: Array<{
  value: StudentListViewMode;
  label: string;
  icon: typeof faGrip;
}> = [
  {
    value: 'compact',
    label: 'Компактный вид',
    icon: faList,
  },
  {
    value: 'standard',
    label: 'Подробный вид',
    icon: faGrip,
  },
];

export const StudentsReferenceListView: FC<StudentsReferenceListViewProps> = ({
  students,
  totalStudents,
  summary,
  isLoading,
  hasMore,
  listRef,
  loadMoreRef,
  onOpenStudent,
  onAddStudent,
  onEditStudent,
  onDeleteStudent,
  timeZone,
}) => {
  const isMobile = useIsMobile(900);
  const { studentsListViewMode, setStudentsListViewMode } = useStudentCardFilters();
  const [statusFilter, setStatusFilter] = useState<'all' | StudentLifecycleStatus>('all');
  const [levelFilter, setLevelFilter] = useState('Все уровни');
  const [sortBy, setSortBy] = useState<'name' | 'created' | 'score' | 'activity'>('name');
  const effectiveViewMode: StudentListViewMode = isMobile ? 'standard' : studentsListViewMode;

  const levelOptions = useMemo(() => {
    const uniqueLevels = Array.from(
      new Set(
        students
          .map((entry) => entry.link.studentLevel?.trim())
          .filter((level): level is string => Boolean(level)),
      ),
    ).sort((a, b) => a.localeCompare(b, 'ru'));

    return ['Все уровни', ...uniqueLevels];
  }, [students]);

  const levelFilterOptions = useMemo(
    () => levelOptions.map((option) => ({ value: option, label: option })),
    [levelOptions],
  );

  const preparedStudents = useMemo(() => {
    const withPresentation = students.map((entry) => ({
      entry,
      presentation: buildStudentCardPresentation(entry, timeZone),
    }));

    const byStatus = withPresentation.filter(({ presentation }) => {
      if (statusFilter === 'all') return true;
      return presentation.status === statusFilter;
    });

    const byLevel = byStatus.filter(({ presentation }) => {
      if (levelFilter === 'Все уровни') return true;
      return presentation.levelLabel === levelFilter;
    });

    return byLevel.sort((a, b) => {
      if (sortBy === 'name') {
        return getStudentDisplayName(a.entry).localeCompare(getStudentDisplayName(b.entry), 'ru');
      }

      if (sortBy === 'created') {
        const aTs = a.entry.student.createdAt ? new Date(a.entry.student.createdAt).getTime() : 0;
        const bTs = b.entry.student.createdAt ? new Date(b.entry.student.createdAt).getTime() : 0;
        return bTs - aTs;
      }

      if (sortBy === 'score') {
        return b.presentation.averageScore - a.presentation.averageScore;
      }

      const aNext = a.presentation.nextLessonAt ? new Date(a.presentation.nextLessonAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bNext = b.presentation.nextLessonAt ? new Date(b.presentation.nextLessonAt).getTime() : Number.MAX_SAFE_INTEGER;
      return aNext - bNext;
    });
  }, [levelFilter, sortBy, statusFilter, students, timeZone]);

  return (
    <div className={styles.screen}>
      <div className={styles.scrollArea} ref={listRef}>
        <div className={styles.inner}>
          <section className={styles.overviewGrid}>
            <article className={styles.statCard}>
              <div className={styles.statHeaderRow}>
                <span className={`${styles.statIconWrap} ${styles.statIconBlue}`}>
                  <FontAwesomeIcon icon={faUsers} />
                </span>
                <span className={styles.statBadgePositive}>+12%</span>
              </div>
              <div className={styles.statValue}>{totalStudents}</div>
              <div className={styles.statLabel}>Всего учеников</div>
            </article>

            <article className={styles.statCard}>
              <div className={styles.statHeaderRow}>
                <span className={`${styles.statIconWrap} ${styles.statIconGreen}`}>
                  <FontAwesomeIcon icon={faUserCheck} />
                </span>
                <span className={styles.statBadgePositive}>
                  {totalStudents > 0 ? `${Math.round((summary.active / totalStudents) * 100)}%` : '0%'}
                </span>
              </div>
              <div className={styles.statValue}>{summary.active}</div>
              <div className={styles.statLabel}>Активных</div>
            </article>

            <article className={styles.statCard}>
              <div className={styles.statHeaderRow}>
                <span className={`${styles.statIconWrap} ${styles.statIconViolet}`}>
                  <FontAwesomeIcon icon={faClock} />
                </span>
                <span className={styles.statBadgeNeutral}>{summary.lessonsToday} сегодня</span>
              </div>
              <div className={styles.statValue}>{summary.lessonsThisWeek}</div>
              <div className={styles.statLabel}>Занятий на неделе</div>
            </article>

            <article className={styles.statCard}>
              <div className={styles.statHeaderRow}>
                <span className={`${styles.statIconWrap} ${styles.statIconOrange}`}>
                  <FontAwesomeIcon icon={faChartLine} />
                </span>
                <span className={styles.statBadgePositive}>+8%</span>
              </div>
              <div className={styles.statValue}>{summary.averageAttendance ?? 0}%</div>
              <div className={styles.statLabel}>Средняя успеваемость</div>
            </article>
          </section>

          <section className={styles.filtersCard}>
            <div className={styles.filtersRow}>
              <div className={styles.tabRow}>
                {statusTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`${styles.tabButton} ${statusFilter === tab.id ? styles.tabButtonActive : ''}`}
                    onClick={() => setStatusFilter(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className={styles.controlsRow}>
                <StudentsReferenceFilterSelect
                  value={levelFilter}
                  onChange={setLevelFilter}
                  ariaLabel="Фильтр по уровню ученика"
                  className={styles.selectControl}
                  options={levelFilterOptions}
                />

                <StudentsReferenceFilterSelect
                  value={sortBy}
                  onChange={(nextValue) => setSortBy(nextValue as 'name' | 'created' | 'score' | 'activity')}
                  ariaLabel="Сортировка списка учеников"
                  className={styles.selectControl}
                  options={sortOptions}
                />

                <button type="button" className={styles.iconControlButton} aria-label="Дополнительные фильтры">
                  <FontAwesomeIcon icon={faFilter} />
                </button>

                <div className={styles.viewModeGroup} role="group" aria-label="Режим карточек учеников">
                  {viewModeOptions.map((option) => (
                    <Tooltip key={option.value} content={option.label} side="top" align="center">
                      <button
                        type="button"
                        className={`${styles.viewModeButton} ${
                          studentsListViewMode === option.value ? styles.viewModeButtonActive : ''
                        }`}
                        aria-label={option.label}
                        aria-pressed={studentsListViewMode === option.value}
                        onClick={() => setStudentsListViewMode(option.value)}
                      >
                        <FontAwesomeIcon icon={option.icon} />
                      </button>
                    </Tooltip>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {effectiveViewMode === 'compact' ? (
            <section className={styles.compactTable}>
              <div className={styles.compactTableHeader}>
                <div className={styles.compactTableGrid}>
                  <div>Ученик</div>
                  <div className={styles.compactHeaderCenter}>Занятий</div>
                  <div className={styles.compactHeaderCenter}>Посещаемость</div>
                  <div className={styles.compactHeaderCenter}>Средний балл</div>
                  <div>Следующее занятие</div>
                  <div className={styles.compactHeaderRight}>Статус</div>
                </div>
              </div>

              <div className={styles.compactTableBody}>
                {preparedStudents.map(({ entry }) => (
                  <StudentReferenceCompactTableRow
                    key={entry.student.id}
                    item={entry}
                    timeZone={timeZone}
                    onOpenStudent={onOpenStudent}
                    onEditStudent={onEditStudent}
                    onDeleteStudent={onDeleteStudent}
                  />
                ))}

                {!isLoading && preparedStudents.length === 0 ? (
                  <div className={styles.compactEmptyState}>По текущим фильтрам ученики не найдены</div>
                ) : null}

                {isLoading && preparedStudents.length === 0
                  ? Array.from({ length: 6 }).map((_, index) => <div key={index} className={styles.compactRowSkeleton} />)
                  : null}
              </div>
            </section>
          ) : (
            <section className={styles.studentGrid}>
              {preparedStudents.map(({ entry }) => (
                <StudentReferenceStandardCard
                  key={entry.student.id}
                  item={entry}
                  timeZone={timeZone}
                  onOpenStudent={onOpenStudent}
                  onEditStudent={onEditStudent}
                  onDeleteStudent={onDeleteStudent}
                />
              ))}

              {!isLoading && preparedStudents.length === 0 ? (
                <div className={styles.emptyState}>По текущим фильтрам ученики не найдены</div>
              ) : null}

              {isLoading && preparedStudents.length === 0
                ? Array.from({ length: 6 }).map((_, index) => <div key={index} className={styles.cardSkeleton} />)
                : null}
            </section>
          )}

          {hasMore ? <div ref={loadMoreRef} className={styles.loadMoreAnchor} aria-hidden /> : null}
        </div>
      </div>

      <button
        type="button"
        className={styles.mobileAddButton}
        onClick={onAddStudent}
        aria-label="Добавить ученика"
      >
        <FontAwesomeIcon icon={faPlus} />
      </button>
    </div>
  );
};

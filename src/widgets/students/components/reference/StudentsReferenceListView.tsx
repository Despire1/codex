import { type FC, type RefObject, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChartLine,
  faClock,
  faEllipsis,
  faFilter,
  faUserCheck,
  faUsers,
} from '@fortawesome/free-solid-svg-icons';
import { StudentListItem } from '../../../../entities/types';
import {
  buildStudentCardPresentation,
  getStatusUiMeta,
  getStudentDisplayName,
  getStudentInitials,
  type StudentLifecycleStatus,
} from '../../model/referencePresentation';
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
  timeZone: string;
}

const statusTabs: Array<{ id: 'all' | StudentLifecycleStatus; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'ACTIVE', label: 'Активные' },
  { id: 'PAUSED', label: 'На паузе' },
  { id: 'COMPLETED', label: 'Завершили' },
];

const levelOptions = ['Все уровни', 'Beginner', 'Elementary', 'Intermediate', 'Upper-Intermediate', 'Advanced'];

const sortOptions: Array<{ value: 'name' | 'created' | 'score' | 'activity'; label: string }> = [
  { value: 'name', label: 'Сортировка: По имени' },
  { value: 'created', label: 'По дате добавления' },
  { value: 'score', label: 'По успеваемости' },
  { value: 'activity', label: 'По активности' },
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
  timeZone,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | StudentLifecycleStatus>('all');
  const [levelFilter, setLevelFilter] = useState('Все уровни');
  const [sortBy, setSortBy] = useState<'name' | 'created' | 'score' | 'activity'>('name');

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
                <select
                  value={levelFilter}
                  onChange={(event) => setLevelFilter(event.target.value)}
                  className={styles.selectControl}
                >
                  {levelOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>

                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as 'name' | 'created' | 'score' | 'activity')}
                  className={styles.selectControl}
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <button type="button" className={styles.iconControlButton} aria-label="Дополнительные фильтры">
                  <FontAwesomeIcon icon={faFilter} />
                </button>
              </div>
            </div>
          </section>

          <section className={styles.studentGrid}>
            {preparedStudents.map(({ entry, presentation }) => {
              const statusMeta = getStatusUiMeta(presentation.status);

              return (
                <article
                  key={entry.student.id}
                  className={styles.studentCard}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenStudent(entry.student.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onOpenStudent(entry.student.id);
                    }
                  }}
                >
                  <div className={styles.studentCardHead}>
                    <div className={styles.studentIdentity}>
                      <div
                        className={styles.avatarCircle}
                        style={{
                          borderColor: presentation.uiColor,
                          background: presentation.uiColor,
                          color: '#ffffff',
                        }}
                      >
                        {getStudentInitials(entry)}
                      </div>
                      <div>
                        <h3 className={styles.studentName}>{getStudentDisplayName(entry)}</h3>
                        <p className={styles.studentLevel}>{presentation.levelLabel}</p>
                      </div>
                    </div>
                    <button type="button" className={styles.cardMenuButton} aria-label="Действия по ученику">
                      <FontAwesomeIcon icon={faEllipsis} />
                    </button>
                  </div>

                  <div className={styles.studentMetricsGrid}>
                    <div className={styles.metricCell}>
                      <div className={styles.metricValue}>{presentation.lessonsConducted}</div>
                      <div className={styles.metricLabel}>Занятий</div>
                    </div>
                    <div className={styles.metricCell}>
                      <div className={`${styles.metricValue} ${styles.metricGreen}`}>{presentation.attendanceRate}%</div>
                      <div className={styles.metricLabel}>Посещ.</div>
                    </div>
                    <div className={styles.metricCell}>
                      <div className={`${styles.metricValue} ${styles.metricBlue}`}>{presentation.averageScore.toFixed(1)}</div>
                      <div className={styles.metricLabel}>Средний</div>
                    </div>
                  </div>

                  <div className={styles.homeworkProgressRow}>
                    <span>Выполнено домашек</span>
                    <strong>
                      {presentation.completedHomeworks}/{presentation.totalHomeworks || presentation.completedHomeworks}
                    </strong>
                  </div>
                  <div className={styles.progressBarTrack}>
                    <div
                      className={styles.progressBarFill}
                      style={{
                        width: `${presentation.progressPercent}%`,
                        background: presentation.uiColor,
                      }}
                    />
                  </div>

                  <div className={styles.studentCardFooter}>
                    <span className={styles.nextLessonMeta}>
                      <span
                        className={`${styles.nextLessonDot} ${
                          presentation.nextLessonTone === 'today'
                            ? styles.nextLessonDotToday
                            : presentation.nextLessonTone === 'future'
                              ? styles.nextLessonDotFuture
                              : styles.nextLessonDotNone
                        }`}
                        aria-hidden
                      />
                      <span className={styles.nextLessonText}>{presentation.nextLessonLabel}</span>
                    </span>
                    <span
                      className={`${styles.statusText} ${
                        statusMeta.tone === 'active'
                          ? styles.statusTextActive
                          : statusMeta.tone === 'paused'
                            ? styles.statusTextPaused
                            : styles.statusTextCompleted
                      }`}
                    >
                      {statusMeta.label}
                    </span>
                  </div>
                </article>
              );
            })}

            {!isLoading && preparedStudents.length === 0 ? (
              <div className={styles.emptyState}>По текущим фильтрам ученики не найдены</div>
            ) : null}

            {isLoading && preparedStudents.length === 0
              ? Array.from({ length: 6 }).map((_, index) => <div key={index} className={styles.cardSkeleton} />)
              : null}
          </section>

          {hasMore ? <div ref={loadMoreRef} className={styles.loadMoreAnchor} aria-hidden /> : null}
        </div>
      </div>
    </div>
  );
};

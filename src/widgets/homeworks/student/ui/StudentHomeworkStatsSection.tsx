import { FC, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowUp,
  faCircle,
  faCircleCheck,
  faClipboardList,
  faFire,
  faMedal,
  faStar,
  faTrophy,
} from '@fortawesome/free-solid-svg-icons';
import { HomeworkAssignment } from '../../../../entities/types';
import { StudentHomeworkSummary } from '../../types';
import { buildStudentHomeworkReferenceDashboardStats } from '../model/lib/referencePresentation';
import styles from './StudentHomeworkStatsSection.module.css';

type StudentHomeworkStatsSectionProps = {
  assignments: HomeworkAssignment[];
  summary: StudentHomeworkSummary;
  loading: boolean;
};

export const StudentHomeworkStatsSection: FC<StudentHomeworkStatsSectionProps> = ({ assignments, summary, loading }) => {
  const stats = useMemo(
    () => buildStudentHomeworkReferenceDashboardStats(assignments, summary),
    [assignments, summary],
  );

  return (
    <section className={styles.grid} aria-label="Статистика домашних заданий">
      <article className={`${styles.card} ${styles.cardPrimary}`}>
        <div className={styles.primaryGlow} aria-hidden />
        <div className={styles.cardContent}>
          <div className={styles.cardMain}>
            <div className={`${styles.iconWrap} ${styles.iconWrapPrimary}`}>
              <FontAwesomeIcon icon={faClipboardList} />
            </div>
            <h3 className={styles.value}>{loading ? '—' : stats.activeCount}</h3>
            <p className={styles.label}>Активных заданий</p>
            <div className={styles.metaRow}>
              <span className={styles.urgentBadge}>
                <FontAwesomeIcon icon={faCircle} />
                {loading ? '—' : `${stats.overdueCount} срочное`}
              </span>
            </div>
          </div>

          <div className={styles.cardAside}>
            <div className={styles.metricBox}>
              <div className={styles.metricValue}>{loading ? '—' : stats.newCount}</div>
              <div className={styles.metricLabel}>Новых</div>
            </div>
            <div className={styles.metricBox}>
              <div className={styles.metricValueAccent}>{loading ? '—' : stats.inProgressCount}</div>
              <div className={styles.metricLabel}>В работе</div>
            </div>
          </div>
        </div>
      </article>

      <article className={styles.card}>
        <div className={styles.cardContent}>
          <div className={styles.cardMain}>
            <div className={`${styles.iconWrap} ${styles.iconWrapGreen}`}>
              <FontAwesomeIcon icon={faCircleCheck} />
            </div>
            <h3 className={styles.valueDark}>{loading ? '—' : stats.reviewedCount}</h3>
            <p className={styles.labelDark}>Выполнено</p>
            <div className={styles.metaRow}>
              <span className={styles.trendBadge}>
                <FontAwesomeIcon icon={faArrowUp} />
                {loading ? '—' : `+${stats.completedThisWeek} эта неделя`}
              </span>
            </div>
          </div>

          <div className={styles.cardAside}>
            <div className={`${styles.metricBox} ${styles.metricBlue}`}>
              <div className={styles.metricBlueValue}>{loading ? '—' : stats.averageScore?.toFixed(1) ?? '—'}</div>
              <div className={styles.metricBlueLabel}>Средний</div>
            </div>
            <div className={`${styles.metricBox} ${styles.metricPurple}`}>
              <div className={styles.metricPurpleValue}>{loading ? '—' : stats.streakDays}</div>
              <div className={styles.metricPurpleLabel}>Дней</div>
            </div>
          </div>
        </div>
      </article>

      <article className={`${styles.card} ${styles.cardPerformance}`}>
        <div className={styles.cardContent}>
          <div className={styles.cardMain}>
            <div className={`${styles.iconWrap} ${styles.iconWrapDark}`}>
              <FontAwesomeIcon icon={faTrophy} />
            </div>
            <h3 className={styles.valueDark}>{loading ? '—' : `${stats.performancePercent}%`}</h3>
            <p className={styles.labelBlack}>Успеваемость</p>
            <div className={styles.awardsRow}>
              <div className={styles.awardsIcons}>
                <span className={styles.awardsIcon}>
                  <FontAwesomeIcon icon={faStar} />
                </span>
                <span className={styles.awardsIcon}>
                  <FontAwesomeIcon icon={faMedal} />
                </span>
                <span className={styles.awardsIcon}>
                  <FontAwesomeIcon icon={faFire} />
                </span>
              </div>
              <span className={styles.awardsText}>{loading ? '—' : `${stats.awardsCount} награды`}</span>
            </div>
          </div>

          <div className={styles.cardAsideCompact}>
            <div className={styles.metricDarkBox}>
              <div className={styles.metricDarkValue}>{loading ? '—' : stats.groupRankLabel}</div>
              <div className={styles.metricDarkLabel}>В группе</div>
            </div>
            <div className={styles.metricDarkBox}>
              <div className={styles.metricDarkValue}>{loading ? '—' : stats.levelLabel}</div>
              <div className={styles.metricDarkLabel}>Уровень</div>
            </div>
            <div className={styles.metricDarkBox}>
              <div className={styles.metricDarkValue}>{loading ? '—' : stats.xp}</div>
              <div className={styles.metricDarkLabel}>XP</div>
            </div>
          </div>
        </div>
      </article>
    </section>
  );
};

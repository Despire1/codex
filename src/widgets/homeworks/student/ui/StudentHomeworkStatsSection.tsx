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
import { getPluralForm } from '../../../../shared/lib/pluralizeRu';
import styles from './StudentHomeworkStatsSection.module.css';

type StudentHomeworkStatsSectionProps = {
  assignments: HomeworkAssignment[];
  summary: StudentHomeworkSummary;
  loading: boolean;
};

export const StudentHomeworkStatsSection: FC<StudentHomeworkStatsSectionProps> = ({
  assignments,
  summary,
  loading,
}) => {
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
            <p className={styles.label}>
              {loading
                ? 'Активных заданий'
                : getPluralForm(stats.activeCount, {
                    one: 'Активное задание',
                    few: 'Активных задания',
                    many: 'Активных заданий',
                  })}
            </p>
            {!loading && stats.overdueCount > 0 ? (
              <div className={styles.metaRow}>
                <span className={styles.urgentBadge}>
                  <FontAwesomeIcon icon={faCircle} />
                  {stats.overdueCount}{' '}
                  {getPluralForm(stats.overdueCount, { one: 'срочное', few: 'срочных', many: 'срочных' })}
                </span>
              </div>
            ) : null}
          </div>

          {!loading && (stats.newCount > 0 || stats.inProgressCount > 0) ? (
            <div className={styles.cardAside}>
              {stats.newCount > 0 ? (
                <div className={styles.metricBox}>
                  <div className={styles.metricValue}>{stats.newCount}</div>
                  <div className={styles.metricLabel}>Новых</div>
                </div>
              ) : null}
              {stats.inProgressCount > 0 ? (
                <div className={styles.metricBox}>
                  <div className={styles.metricValueAccent}>{stats.inProgressCount}</div>
                  <div className={styles.metricLabel}>В работе</div>
                </div>
              ) : null}
            </div>
          ) : null}
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
            <div className={`${styles.metricBox} ${styles.metricBlue}`} title="Средний балл по проверенным заданиям">
              <div className={styles.metricBlueValue}>{loading ? '—' : (stats.averageScore?.toFixed(1) ?? '—')}</div>
              <div className={styles.metricBlueLabel}>Средний балл</div>
            </div>
            <div className={`${styles.metricBox} ${styles.metricPurple}`} title="Дней подряд без пропусков">
              <div className={styles.metricPurpleValue}>{loading ? '—' : stats.streakDays}</div>
              <div className={styles.metricPurpleLabel}>Дней подряд</div>
            </div>
          </div>
        </div>
      </article>

      {stats.hasGamificationData ? (
        <article className={`${styles.card} ${styles.cardPerformance}`}>
          <div className={styles.cardContent}>
            <div className={styles.cardMain}>
              <div className={`${styles.iconWrap} ${styles.iconWrapDark}`}>
                <FontAwesomeIcon icon={faTrophy} />
              </div>
              <h3 className={styles.valueDark}>
                {loading ? '—' : stats.performancePercent > 0 ? `${stats.performancePercent}%` : '—'}
              </h3>
              <p className={styles.labelBlack}>Успеваемость</p>
              {stats.awardsCount > 0 ? (
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
                  <span className={styles.awardsText}>
                    {loading
                      ? '—'
                      : `${stats.awardsCount} ${getPluralForm(stats.awardsCount, {
                          one: 'награда',
                          few: 'награды',
                          many: 'наград',
                        })}`}
                  </span>
                </div>
              ) : null}
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
      ) : null}
    </section>
  );
};

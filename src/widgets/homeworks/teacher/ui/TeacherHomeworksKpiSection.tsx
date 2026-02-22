import { FC } from 'react';
import { TeacherAssignmentsSummary } from '../../types';
import {
  HomeworkArrowUpIcon,
  HomeworkBellIcon,
  HomeworkCalendarDayIcon,
  HomeworkChartLineIcon,
  HomeworkClockIcon,
  HomeworkHourglassHalfIcon,
  HomeworkInboxIcon,
  HomeworkPaperPlaneIcon,
  HomeworkStarIcon,
  HomeworkStarRegularIcon,
} from '../../../../shared/ui/icons/HomeworkFaIcons';
import styles from './TeacherHomeworksKpiSection.module.css';

interface TeacherHomeworksKpiSectionProps {
  summary: TeacherAssignmentsSummary;
}

const clampPercent = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
};

const normalizeScoreValue = (value: number | null) => {
  if (!Number.isFinite(value)) return null;
  const raw = Number(value);
  const normalized = raw > 10 ? raw / 10 : raw;
  return Math.max(0, Math.min(10, Number(normalized.toFixed(1))));
};

const formatScoreValue = (value: number | null) => {
  if (value === null) return '—';
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
};

export const TeacherHomeworksKpiSection: FC<TeacherHomeworksKpiSectionProps> = ({ summary }) => {
  const trackedAssignments = summary.inProgressCount + summary.reviewCount + summary.closedCount;
  const activeProgressPercent = clampPercent((summary.inProgressCount / Math.max(trackedAssignments, 1)) * 100);
  const completionRatePercent = clampPercent((summary.closedCount / Math.max(trackedAssignments, 1)) * 100);
  const averageScore = normalizeScoreValue(summary.averageScore30d);
  const filledStars = Math.max(0, Math.min(5, Math.round((averageScore ?? 0) / 2)));
  const weekDeltaLabel = `${summary.reviewedWeekDeltaPercent >= 0 ? '+' : ''}${summary.reviewedWeekDeltaPercent}% за неделю`;
  const hasDeadlinesToday = summary.dueTodayCount > 0;

  return (
    <section className={styles.kpiGrid} aria-label="Сводка по домашним заданиям">
      <article className={`${styles.card} ${styles.primaryCard}`}>
        <span className={styles.primaryGlow} aria-hidden="true" />
        <div className={styles.cardInner}>
          <div className={styles.cardHeader}>
            <span className={`${styles.iconWrap} ${styles.primaryIconWrap}`}>
              <HomeworkInboxIcon size={16} />
            </span>
            <span className={styles.priorityBadge}>High Priority</span>
          </div>

          <h3 className={`${styles.value} ${styles.valueOnAccent}`}>{summary.inboxCount}</h3>
          <p className={`${styles.title} ${styles.titleOnAccent}`}>Требует внимания</p>

          <div className={styles.primaryMetaRow}>
            <span className={styles.primaryMetaItem}>
              <HomeworkClockIcon size={10} />
              {summary.overdueCount} просрочено
            </span>
            <span className={styles.primaryMetaItem}>
              <HomeworkBellIcon size={10} />
              {summary.reviewCount} проверить
            </span>
          </div>
        </div>
      </article>

      <article className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={`${styles.iconWrap} ${styles.infoIconWrap}`}>
            <HomeworkPaperPlaneIcon size={15} />
          </span>
          <span className={styles.successBadge}>+{summary.sentTodayCount} сегодня</span>
        </div>

        <h3 className={styles.value}>{summary.inProgressCount}</h3>
        <p className={styles.title}>В работе</p>

        <div className={styles.progressRow}>
          <div className={styles.progressTrack}>
            <div className={styles.progressBar} style={{ width: `${activeProgressPercent}%` }} />
          </div>
          <span className={styles.progressValue}>{activeProgressPercent}%</span>
        </div>
      </article>

      <article className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={`${styles.iconWrap} ${styles.warningIconWrap}`}>
            <HomeworkCalendarDayIcon size={15} />
          </span>
          <span className={styles.pulseDot} aria-hidden="true" />
        </div>

        <h3 className={styles.value}>{summary.dueTodayCount}</h3>
        <p className={styles.title}>Дедлайн сегодня</p>

        <div className={styles.deadlineHintRow}>
          <HomeworkHourglassHalfIcon size={10} />
          <span>{hasDeadlinesToday ? 'Осталось до 18:00' : 'На сегодня дедлайнов нет'}</span>
        </div>
      </article>

      <article className={`${styles.card} ${styles.successCard}`}>
        <span className={styles.successGlow} aria-hidden="true" />
        <div className={styles.cardInner}>
          <div className={styles.cardHeader}>
            <span className={`${styles.iconWrap} ${styles.successIconWrap}`}>
              <HomeworkChartLineIcon size={15} />
            </span>
            <span
              className={`${styles.deltaIconWrap} ${
                summary.reviewedWeekDeltaPercent < 0 ? styles.deltaIconWrapNegative : ''
              }`}
            >
              <HomeworkArrowUpIcon size={10} />
            </span>
          </div>

          <h3 className={`${styles.value} ${styles.valueOnAccent}`}>{completionRatePercent}%</h3>
          <p className={`${styles.title} ${styles.titleOnAccent}`}>Процент выполнения</p>
          <div
            className={`${styles.deltaText} ${
              summary.reviewedWeekDeltaPercent < 0 ? styles.deltaTextNegative : ''
            }`}
          >
            {weekDeltaLabel}
          </div>
        </div>
      </article>

      <article className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={`${styles.iconWrap} ${styles.gradeIconWrap}`}>
            <HomeworkStarIcon size={15} />
          </span>
          <span className={styles.starsRow} aria-hidden="true">
            {Array.from({ length: 5 }, (_, index) =>
              index < filledStars ? (
                <HomeworkStarIcon key={`star_fill_${index}`} size={10} className={styles.starFilled} />
              ) : (
                <HomeworkStarRegularIcon key={`star_empty_${index}`} size={10} className={styles.starOutline} />
              ),
            )}
          </span>
        </div>

        <h3 className={styles.value}>{formatScoreValue(averageScore)}</h3>
        <p className={styles.title}>Средний балл</p>
        <div className={styles.note}>За последние 30 дней</div>
      </article>
    </section>
  );
};

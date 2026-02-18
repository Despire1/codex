import { FC } from 'react';
import { formatDeltaPercent, formatRubles } from '../../model/mobileDashboardPresentation';
import styles from './MobileDashboardStats.module.css';

interface MobileDashboardStatsProps {
  todayPlanRub: number;
  todayPlanDeltaPercent: number;
  unpaidRub: number;
  unpaidStudentsCount: number;
  receivableWeekRub: number;
}

export const MobileDashboardStats: FC<MobileDashboardStatsProps> = ({
  todayPlanRub,
  todayPlanDeltaPercent,
  unpaidRub,
  unpaidStudentsCount,
  receivableWeekRub,
}) => {
  return (
    <section className={styles.row} aria-label="Сводка">
      <article className={styles.card}>
        <div className={styles.title}>План на сегодня</div>
        <div className={styles.value}>{formatRubles(todayPlanRub)}</div>
        <div className={`${styles.caption} ${todayPlanDeltaPercent >= 0 ? styles.captionPositive : styles.captionMuted}`}>
          {formatDeltaPercent(todayPlanDeltaPercent)}
        </div>
      </article>

      <article className={styles.card}>
        <div className={styles.title}>Долги учеников</div>
        <div className={`${styles.value} ${styles.valueDanger}`}>{formatRubles(unpaidRub)}</div>
        <div className={`${styles.caption} ${styles.captionDanger}`}>
          {unpaidStudentsCount} {unpaidStudentsCount === 1 ? 'ученик' : unpaidStudentsCount < 5 ? 'ученика' : 'учеников'}
        </div>
      </article>

      <article className={styles.card}>
        <div className={styles.title}>К получению</div>
        <div className={styles.value}>{formatRubles(receivableWeekRub)}</div>
        <div className={`${styles.caption} ${styles.captionMuted}`}>До конца недели</div>
      </article>
    </section>
  );
};

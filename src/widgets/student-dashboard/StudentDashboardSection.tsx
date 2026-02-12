import { FC, useEffect, useState } from 'react';
import { api } from '../../shared/api/client';
import styles from './StudentDashboardSection.module.css';

type StudentDashboardSectionProps = {
  activeTeacherName?: string | null;
};

type Summary = {
  activeCount: number;
  overdueCount: number;
  submittedCount: number;
  reviewedCount: number;
  dueTodayCount: number;
};

const emptySummary: Summary = {
  activeCount: 0,
  overdueCount: 0,
  submittedCount: 0,
  reviewedCount: 0,
  dueTodayCount: 0,
};

export const StudentDashboardSection: FC<StudentDashboardSectionProps> = ({ activeTeacherName }) => {
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getStudentHomeworkSummaryV2()
      .then((data) => {
        if (cancelled) return;
        setSummary(data);
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load student dashboard summary', error);
        if (cancelled) return;
        setSummary(emptySummary);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className={styles.page}>
      <div className={styles.headline}>Главная</div>
      {activeTeacherName ? <div className={styles.teacher}>Преподаватель: {activeTeacherName}</div> : null}
      <div className={styles.grid}>
        <article className={styles.card}>
          <div className={styles.label}>Активные</div>
          <div className={styles.value}>{loading ? '…' : summary.activeCount}</div>
        </article>
        <article className={styles.card}>
          <div className={styles.label}>Дедлайн сегодня</div>
          <div className={styles.value}>{loading ? '…' : summary.dueTodayCount}</div>
        </article>
        <article className={styles.card}>
          <div className={styles.label}>Просроченные</div>
          <div className={styles.value}>{loading ? '…' : summary.overdueCount}</div>
        </article>
        <article className={styles.card}>
          <div className={styles.label}>Проверенные</div>
          <div className={styles.value}>{loading ? '…' : summary.reviewedCount}</div>
        </article>
      </div>
    </section>
  );
};

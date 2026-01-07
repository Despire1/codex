import { FC } from 'react';
import styles from '../StudentsSection.module.css';
import { Lesson, PaymentEvent } from '../../../entities/types';
import { SelectedStudent } from '../types';

interface OverviewTabProps {
  selectedStudent: SelectedStudent;
  studentLessonsSummary: Lesson[];
  payments: PaymentEvent[];
}

export const OverviewTab: FC<OverviewTabProps> = ({
  selectedStudent,
  studentLessonsSummary,
  payments,
}) => {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const nextLesson = studentLessonsSummary
    .filter((lesson) => lesson.status !== 'COMPLETED')
    .map((lesson) => ({ lesson, startAt: new Date(lesson.startAt).getTime() }))
    .filter(({ startAt }) => startAt > now)
    .sort((a, b) => a.startAt - b.startAt)[0]?.lesson ?? null;
  const remindersEnabled = selectedStudent.link.autoRemindHomework;
  const paymentsLast30Days = payments.reduce((total, event) => {
    if (event.studentId !== selectedStudent.id) return total;
    if (event.type !== 'AUTO_CHARGE' && event.type !== 'MANUAL_PAID') return total;
    if (!event.lessonId) return total;
    const createdAt = Date.parse(event.createdAt);
    if (Number.isNaN(createdAt) || createdAt < thirtyDaysAgo) return total;
    const amount = typeof event.moneyAmount === 'number' ? event.moneyAmount : event.priceSnapshot;
    if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) return total;
    return total + amount;
  }, 0);
  const paymentsLast30DaysRounded = Math.round(paymentsLast30Days);
  const statusContent = (() => {
    if (!nextLesson) {
      return {
        title: 'Нет запланированных уроков',
        subtitle: 'Запланируйте следующий урок',
        tone: 'warning',
      };
    }
    if (!remindersEnabled) {
      return {
        title: 'Напоминания выключены',
        subtitle: 'Можно забыть про урок',
        tone: 'warning',
      };
    }
    return {
      title: 'Всё под контролем',
      subtitle: 'Оплаты и расписание в порядке',
      tone: 'ok',
    };
  })();

  return (
    <div className={`${styles.card} ${styles.tabCard}`}>
      <div className={styles.homeworkHeader}>
        <div>
          <div className={styles.priceLabel}>Обзор</div>
        </div>
      </div>
      <div
        className={`${styles.statCard} ${styles['overview-statusCard']} ${
          statusContent.tone === 'ok'
            ? styles['overview-statusCardOk']
            : statusContent.tone === 'warning'
              ? styles['overview-statusCardWarning']
              : styles['overview-statusCardAlert']
        }`}
      >
        <p className={styles.statLabel}>Состояние</p>
        <p className={`${styles.statValueLarge} ${styles['overview-statValue']}`}>{statusContent.title}</p>
        <p className={styles['overview-statusSubtitle']}>{statusContent.subtitle}</p>
      </div>
      <div className={styles.overviewGrid}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Баланс</p>
          <p className={`${styles.statValueLarge} ${styles['overview-statValue']}`}>
            {selectedStudent.link.balanceLessons} уроков
          </p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Оплаты за 30 дней</p>
          <p className={`${styles.statValueLarge} ${styles['overview-statValue']}`}>
            {paymentsLast30DaysRounded} ₽
          </p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Напоминания</p>
          <p className={`${styles.statValueLarge} ${styles['overview-statValue']}`}>
            {remindersEnabled ? 'Включены — ничего не забудете' : 'Выключены — возможны пропуски'}
          </p>
        </div>
      </div>
    </div>
  );
};

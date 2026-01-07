import { FC } from 'react';
import styles from '../StudentsSection.module.css';
import { Lesson } from '../../../entities/types';
import { SelectedStudent } from '../types';

interface OverviewTabProps {
  selectedStudent: SelectedStudent;
  studentLessonsSummary: Lesson[];
}

export const OverviewTab: FC<OverviewTabProps> = ({
  selectedStudent,
  studentLessonsSummary,
}) => {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const nextLesson = studentLessonsSummary
    .filter((lesson) => lesson.status !== 'COMPLETED')
    .map((lesson) => ({ lesson, startAt: new Date(lesson.startAt).getTime() }))
    .filter(({ startAt }) => startAt > now)
    .sort((a, b) => a.startAt - b.startAt)[0]?.lesson ?? null;
  const remindersEnabled = selectedStudent.link.autoRemindHomework;
  const unpaidLessonsCount = studentLessonsSummary.reduce(
    (count, lesson) => (lesson.isPaid ? count : count + 1),
    0,
  );
  const paymentsLast30Days = studentLessonsSummary.reduce((total, lesson) => {
    if (!lesson.isPaid) return total;
    const startAt = new Date(lesson.startAt).getTime();
    if (Number.isNaN(startAt) || startAt < thirtyDaysAgo || startAt > now) return total;
    const amount = lesson.price ?? selectedStudent.pricePerLesson ?? 0;
    if (amount <= 0) return total;
    return total + amount;
  }, 0);
  const paymentsLast30DaysRounded = Math.round(paymentsLast30Days);
  const statusContent = (() => {
    if (unpaidLessonsCount > 0) {
      return {
        title: 'Есть неоплаченные занятия',
        subtitle: 'Проверьте оплаты',
        tone: 'alert',
      };
    }
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
          <p className={styles.statLabel}>Доход за последние 30 дней</p>
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

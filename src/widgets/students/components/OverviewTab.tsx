import { FC } from 'react';
import styles from '../StudentsSection.module.css';
import controls from '../../../shared/styles/controls.module.css';
import { Lesson } from '../../../entities/types';
import { SelectedStudent } from '../types';

interface OverviewTabProps {
  selectedStudent: SelectedStudent;
  studentLessons: Lesson[];
  onRemindHomework: (studentId: number) => void;
}

export const OverviewTab: FC<OverviewTabProps> = ({
  selectedStudent,
  studentLessons,
  onRemindHomework,
}) => {
  const sumDebt = studentLessons
    .filter((lesson) => lesson.status === 'COMPLETED' && !lesson.isPaid)
    .reduce((total, lesson) => total + (lesson.price ?? 0), 0);
  const now = Date.now();
  const nextLesson = studentLessons
    .filter((lesson) => lesson.status !== 'COMPLETED')
    .map((lesson) => ({ lesson, startAt: new Date(lesson.startAt).getTime() }))
    .filter(({ startAt }) => startAt > now)
    .sort((a, b) => a.startAt - b.startAt)[0]?.lesson ?? null;
  const remindersEnabled = selectedStudent.link.autoRemindHomework;
  const statusContent = (() => {
    if (sumDebt > 0) {
      return {
        title: 'Есть неоплаченные занятия',
        subtitle: 'Стоит отметить оплату',
      };
    }
    if (!nextLesson) {
      return {
        title: 'Нет запланированных уроков',
        subtitle: 'Запланируйте следующий урок',
      };
    }
    if (!remindersEnabled) {
      return {
        title: 'Напоминания выключены',
        subtitle: 'Можно забыть про урок',
      };
    }
    return {
      title: 'Всё под контролем',
      subtitle: 'Оплаты в порядке, уроки запланированы',
    };
  })();

  return (
    <div className={`${styles.card} ${styles.tabCard}`}>
      <div className={styles.homeworkHeader}>
        <div>
          <div className={styles.priceLabel}>Обзор</div>
        </div>
        <button className={controls.secondaryButton} onClick={() => onRemindHomework(selectedStudent.id)}>
          Напомнить про ДЗ
        </button>
      </div>
      <div className={`${styles.statCard} ${styles['overview-statusCard']}`}>
        <p className={styles.statLabel}>Состояние</p>
        <p className={styles.statValueLarge}>{statusContent.title}</p>
        <p className={styles['overview-statusSubtitle']}>{statusContent.subtitle}</p>
      </div>
      <div className={styles.overviewGrid}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Баланс</p>
          <p className={styles.statValueLarge}>{selectedStudent.link.balanceLessons} уроков</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Оплаты</p>
          <p className={styles.statValueLarge}>
            {sumDebt > 0 ? 'Есть неоплаченные занятия' : 'Все занятия оплачены'}
          </p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Напоминания</p>
          <p className={styles.statValueLarge}>
            {remindersEnabled ? 'Включены — ничего не забудете' : 'Выключены — возможны пропуски'}
          </p>
        </div>
      </div>
    </div>
  );
};

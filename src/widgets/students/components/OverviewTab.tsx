import { FC } from 'react';
import styles from '../StudentsSection.module.css';
import controls from '../../../shared/styles/controls.module.css';
import { StudentListItem } from '../../../entities/types';
import { SelectedStudent } from '../types';

interface OverviewTabProps {
  selectedStudent: SelectedStudent;
  selectedStudentStats: StudentListItem['stats'] | null;
  onRemindHomework: (studentId: number) => void;
}

export const OverviewTab: FC<OverviewTabProps> = ({
  selectedStudent,
  selectedStudentStats,
  onRemindHomework,
}) => {
  return (
    <div className={`${styles.card} ${styles.tabCard}`}>
      <div className={styles.homeworkHeader}>
        <div>
          <div className={styles.priceLabel}>Обзор</div>
          <div className={styles.subtleLabel}>Короткая сводка по ученику</div>
        </div>
        <button className={controls.secondaryButton} onClick={() => onRemindHomework(selectedStudent.id)}>
          Напомнить про ДЗ
        </button>
      </div>
      <div className={styles.overviewGrid}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Баланс</p>
          <p className={styles.statValueLarge}>{selectedStudent.link.balanceLessons} уроков</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>ДЗ</p>
          <p className={styles.statValueLarge}>{selectedStudentStats?.pendingHomeworkCount ?? 0} в работе</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Напоминания</p>
          <p className={styles.statValueLarge}>
            {selectedStudent.link.autoRemindHomework ? 'Включены' : 'Выключены'}
          </p>
        </div>
      </div>
    </div>
  );
};

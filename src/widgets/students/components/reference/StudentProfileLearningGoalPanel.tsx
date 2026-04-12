import { FC } from 'react';
import { StudentListItem } from '../../../../entities/types';
import styles from './StudentProfileLearningGoalPanel.module.css';

interface StudentProfileLearningGoalPanelProps {
  studentEntry: StudentListItem;
}

const TargetIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 512 512" fill="currentColor" aria-hidden focusable="false" className={className}>
    <path d="M256 48a208 208 0 1 0 208 208A208.2 208.2 0 0 0 256 48zm0 352a144 144 0 1 1 144-144A144.16 144.16 0 0 1 256 400zm0-240a96 96 0 1 0 96 96 96.11 96.11 0 0 0-96-96zm0 128a32 32 0 1 1 32-32 32 32 0 0 1-32 32zm0-288a32 32 0 0 0 0 64c106 0 192 86 192 192a32 32 0 0 0 64 0C512 114.62 397.38 0 256 0z" />
  </svg>
);

export const StudentProfileLearningGoalPanel: FC<StudentProfileLearningGoalPanelProps> = ({ studentEntry }) => {
  const learningGoal = studentEntry.link.learningGoal?.trim();

  if (!learningGoal) {
    return null;
  }

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>Цель занятий</h3>
      </div>

      <article className={styles.goalCard}>
        <div className={styles.goalHeader}>
          <div className={styles.goalBody}>
            <div className={styles.goalIconWrap} aria-hidden>
              <TargetIcon className={styles.goalIcon} />
            </div>
            <p className={styles.goalContent}>{learningGoal}</p>
          </div>
        </div>
      </article>
    </section>
  );
};

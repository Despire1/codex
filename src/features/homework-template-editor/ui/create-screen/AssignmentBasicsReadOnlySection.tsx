import { FC } from 'react';
import type { HomeworkAssignment } from '../../../../entities/types';
import { IssuedStudentsHistory } from './IssuedStudentsHistory';
import styles from './AssignmentBasicsReadOnlySection.module.css';

interface AssignmentBasicsReadOnlySectionProps {
  title: string;
  description: string;
  issuedAssignments?: HomeworkAssignment[];
  issuedAssignmentsCount?: number;
}

export const AssignmentBasicsReadOnlySection: FC<AssignmentBasicsReadOnlySectionProps> = ({
  title,
  description,
  issuedAssignments = [],
  issuedAssignmentsCount = 0,
}) => (
  <section className={styles.card}>
    <div className={styles.field}>
      <span className={styles.label}>Название задания</span>
      <div className={styles.value}>{title.trim() || 'Без названия'}</div>
    </div>

    <div className={styles.field}>
      <span className={styles.label}>Инструкции для ученика</span>
      <div className={`${styles.value} ${styles.multiline}`}>
        {description.trim() || 'Инструкции пока не добавлены.'}
      </div>
    </div>

    {issuedAssignmentsCount > 0 ? (
      <div className={styles.field}>
        <IssuedStudentsHistory assignments={issuedAssignments} expectedCount={issuedAssignmentsCount} />
      </div>
    ) : null}
  </section>
);

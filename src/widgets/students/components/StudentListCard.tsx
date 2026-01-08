import { FC, type KeyboardEvent } from 'react';
import { StudentListItem } from '../../../entities/types';
import styles from '../StudentsSection.module.css';

interface StudentListCardProps {
  item: StudentListItem;
  isActive: boolean;
  nextLessonLabel: string;
  onSelect: (studentId: number) => void;
}

const resolveBalanceBadge = (item: StudentListItem) => {
  const balanceLessons = item.link.balanceLessons;
  if (balanceLessons > 0) {
    return {
      label: `${balanceLessons} занятий`,
      className: styles.badgeInfo,
    };
  }
  if (balanceLessons < 0) {
    const debtRub = item.debtRub ?? null;
    const label = typeof debtRub === 'number' && debtRub > 0
      ? `Долг: ${debtRub} ₽`
      : `Долг: ${Math.abs(balanceLessons)} занятий`;
    return {
      label,
      className: styles.badgeDebt,
    };
  }
  return null;
};

export const StudentListCard: FC<StudentListCardProps> = ({ item, isActive, nextLessonLabel, onSelect }) => {
  const username = item.student.username?.trim();
  const balanceBadge = resolveBalanceBadge(item);

  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelect(item.student.id);
  };

  return (
    <div
      className={`${styles.studentCard} ${isActive ? styles.activeStudent : ''}`}
      onClick={() => onSelect(item.student.id)}
      onKeyDown={handleCardKeyDown}
      role="button"
      tabIndex={0}
    >
      <div className={styles.studentStripe} aria-hidden />
      <div className={styles.studentCardBody}>
        <div className={styles.studentCardHeader}>
          <div className={styles.studentName}>{item.link.customName}</div>
        </div>
        {username && <div className={styles.studentTelegram}>Telegram: @{username}</div>}
        <div className={styles.studentBadgesRow}>
          {balanceBadge && <span className={`${styles.lozenge} ${balanceBadge.className}`}>{balanceBadge.label}</span>}
          <span className={`${styles.lozenge} ${styles.badgeMuted}`}>{nextLessonLabel}</span>
        </div>
      </div>
    </div>
  );
};

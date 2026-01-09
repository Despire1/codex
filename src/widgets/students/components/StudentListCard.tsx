import { FC, type KeyboardEvent } from 'react';
import { StudentListItem } from '../../../entities/types';
import styles from '../StudentsSection.module.css';

interface StudentListCardProps {
  item: StudentListItem;
  isActive: boolean;
  nextLessonLabel: string;
  nextLessonVariant: 'empty' | 'today' | 'future';
  onSelect: (studentId: number) => void;
}

const getLessonNoun = (count: number) => {
  if (!Number.isInteger(count)) return 'занятий';
  const remainder100 = count % 100;
  const remainder10 = count % 10;
  if (remainder100 >= 11 && remainder100 <= 14) return 'занятий';
  if (remainder10 === 1) return 'занятие';
  if (remainder10 >= 2 && remainder10 <= 4) return 'занятия';
  return 'занятий';
};

const formatLessonCount = (count: number) => `${count} ${getLessonNoun(count)}`;

const resolveBalanceBadge = (item: StudentListItem) => {
  const debtRub = item.debtRub ?? null;
  const debtLessonCount = item.debtLessonCount ?? 0;
  const hasDebt = (typeof debtRub === 'number' && debtRub > 0) || debtLessonCount > 0;
  if (hasDebt) {
    const debtCountLabel = debtLessonCount > 0 ? ` (${formatLessonCount(debtLessonCount)})` : '';
    const label = typeof debtRub === 'number' && debtRub > 0
      ? `Не оплачено: ${debtRub} ₽${debtCountLabel}`
      : `Не оплачено: ${formatLessonCount(debtLessonCount)}`;
    return {
      label,
      className: styles.badgeDebt,
    };
  }
  const balanceLessons = item.link.balanceLessons;
  if (balanceLessons > 0) {
    return {
      label: `Баланс: ${formatLessonCount(balanceLessons)}`,
      className: styles.badgeSuccess,
    };
  }
  if (balanceLessons < 0) {
    const label = `Долг: ${formatLessonCount(Math.abs(balanceLessons))}`;
    return {
      label,
      className: styles.badgeDebt,
    };
  }
  return null;
};

const resolveNextLessonClassName = (variant: StudentListCardProps['nextLessonVariant']) => {
  if (variant === 'today') return styles.badgeNextLessonToday;
  if (variant === 'future') return styles.badgeNextLesson;
  return styles.badgeMuted;
};

export const StudentListCard: FC<StudentListCardProps> = ({
  item,
  isActive,
  nextLessonLabel,
  nextLessonVariant,
  onSelect,
}) => {
  const username = item.student.username?.trim();
  const showActivationBadge = Boolean(username) && item.student.isActivated === false;
  const activationHint =
    'Ученик ещё не активирован. Нужно, чтобы он нажал кнопку Start в Telegram-боте — тогда появится в системе и будет получать уведомления.';
  const balanceBadge = resolveBalanceBadge(item);
  const nextLessonClassName = resolveNextLessonClassName(nextLessonVariant);

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
        {username && (
          <div className={styles.studentTelegramRow}>
            <div className={styles.studentTelegram}>Telegram: @{username}</div>
            {showActivationBadge && (
              <span className={`${styles.lozenge} ${styles.badgeInactive}`} title={activationHint}>
                Не активирован
              </span>
            )}
          </div>
        )}
        <div className={styles.studentBadgesRow}>
          {balanceBadge && <span className={`${styles.lozenge} ${balanceBadge.className}`}>{balanceBadge.label}</span>}
          <span className={`${styles.lozenge} ${nextLessonClassName}`}>{nextLessonLabel}</span>
        </div>
      </div>
    </div>
  );
};

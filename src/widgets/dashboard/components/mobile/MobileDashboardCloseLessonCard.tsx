import { FC } from 'react';
import { CurrencyRubleIcon, MoreHorizIcon, TaskAltIcon } from '@/icons/MaterialIcons';
import { formatRubles, type MobileDashboardCloseLesson } from '../../model/mobileDashboardPresentation';
import styles from './MobileDashboardCloseLessonCard.module.css';

interface MobileDashboardCloseLessonCardProps {
  closeLesson: MobileDashboardCloseLesson | null;
  onTogglePaid: (lessonId: number, studentId?: number) => void;
  onOpenHomeworkAssign: (studentId?: number | null, lessonId?: number | null) => void;
  onOpenActions: () => void;
}

export const MobileDashboardCloseLessonCard: FC<MobileDashboardCloseLessonCardProps> = ({
  closeLesson,
  onTogglePaid,
  onOpenHomeworkAssign,
  onOpenActions,
}) => {
  if (!closeLesson) {
    return (
      <section className={styles.card}>
        <div className={styles.header}>
          <h3 className={styles.title}>Закрыть урок</h3>
        </div>
        <p className={styles.empty}>Нет уроков, требующих закрытия.</p>
      </section>
    );
  }

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>Закрыть урок</h3>
          <p className={styles.meta}>
            {closeLesson.studentLabel} • {closeLesson.timeLabel}
          </p>
        </div>
        <span className={styles.price}>{formatRubles(closeLesson.amountRub)}</span>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.paidButton}
          onClick={() => onTogglePaid(closeLesson.lesson.id, closeLesson.primaryStudentId ?? undefined)}
        >
          <CurrencyRubleIcon width={14} height={14} />
          <span>{closeLesson.isPaid ? 'Отменить оплату' : 'Оплачено'}</span>
        </button>
        <button
          type="button"
          className={styles.homeworkButton}
          onClick={() => onOpenHomeworkAssign(closeLesson.primaryStudentId, closeLesson.lesson.id)}
        >
          <TaskAltIcon width={14} height={14} />
          <span>ДЗ</span>
        </button>
        <button type="button" className={styles.moreButton} onClick={onOpenActions} aria-label="Другие действия урока">
          <MoreHorizIcon width={18} height={18} />
        </button>
      </div>
    </section>
  );
};

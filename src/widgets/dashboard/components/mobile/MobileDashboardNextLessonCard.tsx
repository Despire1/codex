import { FC } from 'react';
import { EventRepeatOutlinedIcon } from '@/icons/MaterialIcons';
import { type MobileDashboardNextLesson } from '../../model/mobileDashboardPresentation';
import styles from './MobileDashboardNextLessonCard.module.css';

interface MobileDashboardNextLessonCardProps {
  nextLesson: MobileDashboardNextLesson | null;
  onReschedule: () => void;
}

export const MobileDashboardNextLessonCard: FC<MobileDashboardNextLessonCardProps> = ({ nextLesson, onReschedule }) => {
  if (!nextLesson) {
    return (
      <section className={styles.card}>
        <div className={styles.topRow}>
          <div className={styles.badge}>Следующий урок</div>
        </div>
        <h2 className={styles.title}>Сегодня уроков больше нет</h2>
        <p className={styles.subtitle}>Можно открыть расписание и запланировать новый урок.</p>
      </section>
    );
  }

  return (
    <section className={styles.card}>
      <div className={styles.topRow}>
        <div className={styles.badge}>Следующий урок</div>
        <div className={styles.time}>{nextLesson.timeLabel}</div>
      </div>
      <h2 className={styles.title}>{nextLesson.studentLabel}</h2>
      <div className={styles.tags}>
        <span className={styles.tag}>{nextLesson.subjectLabel}</span>
      </div>
      <button type="button" className={styles.action} onClick={onReschedule}>
        <EventRepeatOutlinedIcon width={16} height={16} />
        <span>Перенести</span>
      </button>
    </section>
  );
};

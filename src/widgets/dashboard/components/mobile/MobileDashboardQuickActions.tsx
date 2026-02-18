import { FC } from 'react';
import { AddOutlinedIcon, EventNoteIcon, PeopleIcon } from '@/icons/MaterialIcons';
import styles from './MobileDashboardQuickActions.module.css';

interface MobileDashboardQuickActionsProps {
  onAddStudent: () => void;
  onCreateLesson: () => void;
}

export const MobileDashboardQuickActions: FC<MobileDashboardQuickActionsProps> = ({
  onAddStudent,
  onCreateLesson,
}) => {
  return (
    <section className={styles.card}>
      <h3 className={styles.title}>Быстрые действия</h3>
      <div className={styles.grid}>
        <button type="button" className={styles.action} onClick={() => onAddStudent()}>
          <span className={styles.iconWrap}>
            <PeopleIcon width={17} height={17} />
            <AddOutlinedIcon width={12} height={12} className={styles.iconOverlay} />
          </span>
          <span>Добавить ученика</span>
        </button>
        <button type="button" className={styles.action} onClick={() => onCreateLesson()}>
          <span className={styles.iconWrap}>
            <EventNoteIcon width={17} height={17} />
            <AddOutlinedIcon width={12} height={12} className={styles.iconOverlay} />
          </span>
          <span>Создать урок</span>
        </button>
      </div>
    </section>
  );
};

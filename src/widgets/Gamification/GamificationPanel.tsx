import { useMemo } from 'react';
import { Task } from '@/entities/task/model/types';
import { useAccount } from '@/entities/account/model/useAccount';
import { EXPERIENCE_PER_TASK } from '@/entities/account/model/types';
import styles from './GamificationPanel.module.css';

interface Props {
  tasks: Task[];
}

export const GamificationPanel = ({ tasks }: Props) => {
  const { experience, level, nextLevelExp, progress } = useAccount();
  const completedTasks = useMemo(() => tasks.filter((task) => task.completed).length, [tasks]);

  return (
    <section className={styles.panel}>
      <div className={styles.levelBlock}>
        <p className={styles.caption}>Прогресс аккаунта</p>
        <div className={styles.levelRow}>
          <span className={styles.levelBadge}>Ур. {level}</span>
          <span className={styles.xp}>{experience} XP</span>
        </div>
        <div className={styles.progress}>
          <div className={styles.progressFill} style={{ width: `${progress * 100}%` }} />
        </div>
        <p className={styles.progressHint}>
          До следующего уровня: {nextLevelExp - experience} XP
        </p>
      </div>
      <div className={styles.stats}>
        <div className={styles.reward}>
          <p className={styles.rewardLabel}>Бонус за задачу</p>
          <p className={styles.rewardValue}>+{EXPERIENCE_PER_TASK} XP</p>
        </div>
        <div className={styles.completion}>
          <p className={styles.completionValue}>{completedTasks}</p>
          <p className={styles.completionLabel}>Завершено задач</p>
        </div>
      </div>
    </section>
  );
};

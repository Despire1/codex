import { type FC } from 'react';
import { useOnboardingState } from '../../features/onboarding/model/useOnboardingState';
import styles from './CollapsedOnboardingWidget.module.css';
import controls from '../../shared/styles/controls.module.css';

interface CollapsedOnboardingWidgetProps {
  onExpand: () => void;
}

export const CollapsedOnboardingWidget: FC<CollapsedOnboardingWidgetProps> = ({ onExpand }) => {
  const onboarding = useOnboardingState();
  const completed = [
    Boolean(onboarding.createdStudent),
    Boolean(onboarding.createdLesson),
    onboarding.reminderSent,
  ].filter(Boolean).length;

  return (
    <section className={styles.card}>
      <div>
        <div className={styles.title}>Первые шаги</div>
        <div className={styles.progress}>{completed}/3</div>
      </div>
      <button type="button" className={controls.secondaryButton} onClick={onExpand}>
        Развернуть
      </button>
    </section>
  );
};

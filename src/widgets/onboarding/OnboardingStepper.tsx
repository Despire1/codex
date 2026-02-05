import { type FC } from 'react';
import type { Lesson } from '../../entities/types';
import type { CreatedStudent } from '../../features/onboarding/model/useOnboardingState';
import { TaskAltIcon } from '../../icons/MaterialIcons';
import styles from './OnboardingStepper.module.css';

interface OnboardingStepperProps {
  createdStudent: CreatedStudent | null;
  createdLesson: Lesson | null;
  reminderSent: boolean;
  onStepClick: (step: 1 | 2 | 3) => void;
}

export const OnboardingStepper: FC<OnboardingStepperProps> = ({
  createdStudent,
  createdLesson,
  reminderSent,
  onStepClick,
}) => {
  const steps = [
    {
      id: 1 as const,
      title: 'Добавь ученика',
      hint: 'Достаточно имени. Остальное — потом.',
      done: Boolean(createdStudent),
      disabled: Boolean(createdStudent),
    },
    {
      id: 2 as const,
      title: 'Создай первое занятие',
      hint: 'Ученик подставится автоматически.',
      done: Boolean(createdLesson),
      disabled: !createdStudent || Boolean(createdLesson),
    },
    {
      id: 3 as const,
      title: 'Отправь напоминание',
      hint: 'В Telegram или просто сохрани шаблон.',
      done: reminderSent,
      disabled: !createdLesson || reminderSent,
    },
  ];

  const completedCount = steps.filter((step) => step.done).length;

  return (
    <aside className={styles.card}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Первые шаги</div>
          <div className={styles.progress}>{completedCount}/3</div>
        </div>
      </div>
      <div className={styles.list}>
        {steps.map((step) => {
          const isActive = !step.done && !step.disabled;
          return (
            <button
              key={step.id}
              type="button"
              className={`${styles.step} ${step.done ? styles.stepDone : ''} ${isActive ? styles.stepActive : ''}`}
              onClick={() => onStepClick(step.id)}
              disabled={step.disabled}
            >
              <div className={styles.stepIcon}>
                {step.done ? <TaskAltIcon width={18} height={18} /> : <span>{step.id}</span>}
              </div>
              <div className={styles.stepBody}>
                <div className={styles.stepTitle}>{step.title}</div>
                <div className={styles.stepHint}>{step.hint}</div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
};

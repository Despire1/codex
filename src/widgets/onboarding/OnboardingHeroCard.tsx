import { type FC, type RefObject, useMemo } from 'react';
import type { Lesson } from '../../entities/types';
import type { CreatedStudent } from '../../features/onboarding/model/useOnboardingState';
import styles from './OnboardingHeroCard.module.css';
import controls from '../../shared/styles/controls.module.css';

interface OnboardingHeroCardProps {
  createdStudent: CreatedStudent | null;
  createdLesson: Lesson | null;
  onPrimaryAction: () => void;
  onDismiss: () => void;
  primaryButtonRef?: RefObject<HTMLButtonElement>;
  highlightPrimary?: boolean;
}

const resolveStep = (createdStudent: CreatedStudent | null, createdLesson: Lesson | null) => {
  if (!createdStudent) return 1;
  if (!createdLesson) return 2;
  return 3;
};

export const OnboardingHeroCard: FC<OnboardingHeroCardProps> = ({
  createdStudent,
  createdLesson,
  onPrimaryAction,
  onDismiss,
  primaryButtonRef,
  highlightPrimary = false,
}) => {
  const step = resolveStep(createdStudent, createdLesson);
  const studentName = createdStudent?.link.customName || 'учеником';
  const isTelegramReady = Boolean(createdStudent?.student.isActivated);

  const primaryLabel = useMemo(() => {
    if (step === 1) return 'Добавить ученика';
    if (step === 2) return `Создать занятие с ${studentName}`;
    if (!isTelegramReady) return 'Подключить Telegram и отправить';
    return 'Отправить напоминание';
  }, [isTelegramReady, step, studentName]);

  const subtitle = useMemo(() => {
    if (step === 1) {
      return 'Добавь ученика — и мы соберём занятия и оплаты в порядок.';
    }
    if (step === 2) {
      return 'Создай первое занятие, ученик подставится автоматически.';
    }
    return 'Остался финальный шаг: напоминание в Telegram.';
  }, [step]);

  return (
    <section className={styles.card}>
      <div className={styles.illustration} aria-hidden />
      <div className={styles.content}>
        <div className={styles.stepBadge}>Шаг {step} из 3</div>
        <h2 className={styles.title}>Привет! Настроим TeacherBot за 1 минуту ✨</h2>
        <p className={styles.subtitle}>{subtitle}</p>
        <div className={styles.actions}>
          <button
            ref={primaryButtonRef}
            type="button"
            className={`${controls.primaryButton} ${styles.primaryButton} ${
              highlightPrimary ? styles.primaryButtonHighlight : ''
            }`}
            onClick={onPrimaryAction}
          >
            {primaryLabel}
          </button>
          <button type="button" className={controls.secondaryButton} onClick={onDismiss}>
            Сделаю позже
          </button>
        </div>
      </div>
    </section>
  );
};

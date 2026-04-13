import { FC } from 'react';
import {
  HomeworkClipboardQuestionIcon,
  HomeworkClockIcon,
  HomeworkPaperPlaneIcon,
  HomeworkStarIcon,
} from '../../../../shared/ui/icons/HomeworkFaIcons';
import styles from './AssignmentCreateFooter.module.css';

interface AssignmentCreateFooterProps {
  questionCount: number;
  totalPoints: number;
  estimatedMinutes: number;
  primaryActionLabel: string;
  primarySubmittingLabel: string;
  submitting: boolean;
  primaryDisabled?: boolean;
  onCancel: () => void;
  onPrimaryAction: () => void;
}

export const AssignmentCreateFooter: FC<AssignmentCreateFooterProps> = ({
  questionCount,
  totalPoints,
  estimatedMinutes,
  primaryActionLabel,
  primarySubmittingLabel,
  submitting,
  primaryDisabled = false,
  onCancel,
  onPrimaryAction,
}) => (
  <footer className={styles.footer}>
    <div className={styles.meta}>
      <span>
        <HomeworkClipboardQuestionIcon size={13} />
        {questionCount} вопроса
      </span>
      <span>
        <HomeworkStarIcon size={13} />
        {totalPoints} баллов
      </span>
      <span>
        <HomeworkClockIcon size={13} />
        ~{estimatedMinutes} мин
      </span>
    </div>

    <div className={styles.actions}>
      <button type="button" className={styles.cancelButton} onClick={onCancel}>
        Отмена
      </button>
      <button
        type="button"
        className={styles.primaryButton}
        disabled={submitting || primaryDisabled}
        onClick={onPrimaryAction}
      >
        <HomeworkPaperPlaneIcon size={13} />
        <span>{submitting ? primarySubmittingLabel : primaryActionLabel}</span>
      </button>
    </div>
  </footer>
);

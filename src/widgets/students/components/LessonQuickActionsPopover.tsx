import { memo } from 'react';
import styles from '../StudentsSection.module.css';

interface LessonQuickAction {
  label: string;
  onClick: () => void;
  variant?: 'danger';
}

interface LessonQuickActionsPopoverProps {
  actions: LessonQuickAction[];
  onClose: () => void;
}

export const LessonQuickActionsPopover = memo(({ actions, onClose }: LessonQuickActionsPopoverProps) => {
  return (
    <div className={styles.moreMenu} role="menu">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          className={action.variant === 'danger' ? styles.dangerButton : undefined}
          onClick={() => {
            action.onClick();
            onClose();
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
});

LessonQuickActionsPopover.displayName = 'LessonQuickActionsPopover';

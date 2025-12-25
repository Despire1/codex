import { memo, useEffect, useRef } from 'react';
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
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (!popoverRef.current) return;
      if (!popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [onClose]);

  return (
    <div className={styles.moreMenu} ref={popoverRef} role="menu">
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

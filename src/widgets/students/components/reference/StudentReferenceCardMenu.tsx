import { type FC, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEllipsis } from '@fortawesome/free-solid-svg-icons';
import { AdaptivePopover } from '@/shared/ui/AdaptivePopover/AdaptivePopover';
import type { StudentReferenceCardQuickActions } from './StudentReferenceCard.types';
import styles from './StudentReferenceCardMenu.module.css';

interface StudentReferenceCardMenuProps extends StudentReferenceCardQuickActions {
  studentId: number;
  isCompleted: boolean;
  onEditStudent: (studentId: number) => void;
  onDeleteStudent: (studentId: number) => void;
  onToggleCompletion: (studentId: number) => void;
  hasTelegram?: boolean;
}

export const StudentReferenceCardMenu: FC<StudentReferenceCardMenuProps> = ({
  studentId,
  isCompleted,
  onEditStudent,
  onDeleteStudent,
  onToggleCompletion,
  onScheduleLesson,
  onWriteStudent,
  onTopUpBalance,
  onAssignHomework,
  hasTelegram = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const runAction = (event: React.MouseEvent, action: () => void) => {
    event.stopPropagation();
    setIsOpen(false);
    action();
  };

  return (
    <AdaptivePopover
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      side="bottom"
      align="end"
      offset={8}
      className={styles.popover}
      trigger={
        <button
          type="button"
          className={styles.trigger}
          aria-label="Действия по ученику"
          onClick={(event) => {
            event.stopPropagation();
            setIsOpen((prev) => !prev);
          }}
        >
          <FontAwesomeIcon icon={faEllipsis} />
        </button>
      }
    >
      <div className={styles.menu} role="menu" onClick={(event) => event.stopPropagation()}>
        {onScheduleLesson ? (
          <button type="button" onClick={(event) => runAction(event, () => onScheduleLesson(studentId))}>
            Назначить занятие
          </button>
        ) : null}
        {onAssignHomework ? (
          <button type="button" onClick={(event) => runAction(event, () => onAssignHomework(studentId))}>
            Выдать домашку
          </button>
        ) : null}
        {onTopUpBalance ? (
          <button type="button" onClick={(event) => runAction(event, () => onTopUpBalance(studentId))}>
            Пополнить баланс
          </button>
        ) : null}
        {onWriteStudent && hasTelegram ? (
          <button type="button" onClick={(event) => runAction(event, () => onWriteStudent(studentId))}>
            Написать в Telegram
          </button>
        ) : null}
        <div className={styles.separator} aria-hidden />
        <button type="button" onClick={(event) => runAction(event, () => onEditStudent(studentId))}>
          Редактировать
        </button>
        <button type="button" onClick={(event) => runAction(event, () => onToggleCompletion(studentId))}>
          {isCompleted ? 'Возобновить обучение' : 'Завершить обучение'}
        </button>
        <button
          type="button"
          className={styles.danger}
          onClick={(event) => runAction(event, () => onDeleteStudent(studentId))}
        >
          Удалить
        </button>
      </div>
    </AdaptivePopover>
  );
};

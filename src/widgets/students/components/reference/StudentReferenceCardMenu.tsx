import { type FC, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEllipsis } from '@fortawesome/free-solid-svg-icons';
import { AdaptivePopover } from '@/shared/ui/AdaptivePopover/AdaptivePopover';
import styles from './StudentReferenceCardMenu.module.css';

interface StudentReferenceCardMenuProps {
  studentId: number;
  onEditStudent: (studentId: number) => void;
  onDeleteStudent: (studentId: number) => void;
}

export const StudentReferenceCardMenu: FC<StudentReferenceCardMenuProps> = ({
  studentId,
  onEditStudent,
  onDeleteStudent,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <AdaptivePopover
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      side="bottom"
      align="end"
      offset={8}
      className={styles.popover}
      trigger={(
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
      )}
    >
      <div className={styles.menu} role="menu" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setIsOpen(false);
            onEditStudent(studentId);
          }}
        >
          Редактировать
        </button>
        <button
          type="button"
          className={styles.danger}
          onClick={(event) => {
            event.stopPropagation();
            setIsOpen(false);
            onDeleteStudent(studentId);
          }}
        >
          Удалить
        </button>
      </div>
    </AdaptivePopover>
  );
};

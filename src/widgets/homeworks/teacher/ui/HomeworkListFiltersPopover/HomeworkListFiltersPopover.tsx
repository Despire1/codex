import { FC, useMemo, useState } from 'react';
import { TeacherHomeworkSort, TeacherHomeworkStudentOption } from '../../../types';
import { HomeworkChevronDownIcon, HomeworkFilterIcon } from '../../../../../shared/ui/icons/HomeworkFaIcons';
import { AdaptivePopover } from '../../../../../shared/ui/AdaptivePopover/AdaptivePopover';
import styles from './HomeworkListFiltersPopover.module.css';

interface HomeworkListFiltersPopoverProps {
  sortBy: TeacherHomeworkSort;
  selectedStudentId: number | null;
  students: TeacherHomeworkStudentOption[];
  loadingStudents: boolean;
  sortOptions: Array<{ id: TeacherHomeworkSort; label: string }>;
  onSortChange: (value: TeacherHomeworkSort) => void;
  onSelectedStudentIdChange: (studentId: number | null) => void;
}

export const HomeworkListFiltersPopover: FC<HomeworkListFiltersPopoverProps> = ({
  sortBy,
  selectedStudentId,
  students,
  loadingStudents,
  sortOptions,
  onSortChange,
  onSelectedStudentIdChange,
}) => {
  const [open, setOpen] = useState(false);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedStudentId !== null) count += 1;
    if (sortBy !== 'urgency') count += 1;
    return count;
  }, [selectedStudentId, sortBy]);

  const handleReset = () => {
    onSelectedStudentIdChange(null);
    onSortChange('urgency');
  };

  return (
    <AdaptivePopover
      isOpen={open}
      onClose={() => setOpen(false)}
      side="bottom"
      align="end"
      className={styles.popover}
      trigger={
        <button
          type="button"
          className={`${styles.triggerButton} ${activeFiltersCount > 0 ? styles.triggerButtonActive : ''}`}
          onClick={() => setOpen((prev) => !prev)}
          aria-label="Открыть фильтры списка домашних заданий"
          aria-expanded={open}
        >
          <span className={styles.triggerMain}>
            <HomeworkFilterIcon size={12} className={styles.triggerIcon} />
            <span>Фильтр</span>
            {activeFiltersCount > 0 ? <span className={styles.triggerBadge}>{activeFiltersCount}</span> : null}
          </span>
          <HomeworkChevronDownIcon
            size={12}
            className={`${styles.triggerChevron} ${open ? styles.triggerChevronOpen : ''}`}
          />
        </button>
      }
    >
      <div className={styles.content}>
        <div className={styles.section}>
          <label className={styles.field}>
            <span className={styles.label}>Ученики</span>
            <select
              className={styles.select}
              value={selectedStudentId ? String(selectedStudentId) : ''}
              onChange={(event) => onSelectedStudentIdChange(event.target.value ? Number(event.target.value) : null)}
              disabled={loadingStudents}
            >
              <option value="">Все ученики</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Сортировка</span>
            <select
              className={styles.select}
              value={sortBy}
              onChange={(event) => onSortChange(event.target.value as TeacherHomeworkSort)}
            >
              {sortOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.resetButton}
            onClick={handleReset}
            disabled={activeFiltersCount === 0}
          >
            Сбросить
          </button>
        </div>
      </div>
    </AdaptivePopover>
  );
};

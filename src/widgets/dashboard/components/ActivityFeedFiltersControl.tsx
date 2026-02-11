import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { FilterAltOutlinedIcon } from '../../../icons/MaterialIcons';
import { ActivityCategory } from '../../../entities/types';
import controls from '../../../shared/styles/controls.module.css';
import { AnchoredPopover } from '../../../shared/ui/AnchoredPopover/AnchoredPopover';
import { DatePickerField } from '../../../shared/ui/DatePickerField';
import { StudentSelect } from '../../../shared/ui/StudentSelect';
import type { DashboardActivityFilters } from '../model/useDashboardActivityFeed';
import styles from './ActivityFeedFiltersControl.module.css';

type StudentFilterOption = {
  id: number;
  name: string;
};

interface ActivityFeedFiltersControlProps {
  filters: DashboardActivityFilters;
  students: StudentFilterOption[];
  onApplyFilters: (next: DashboardActivityFilters) => void;
  popoverSide?: 'top' | 'bottom' | 'left' | 'right';
  popoverAlign?: 'start' | 'center' | 'end';
  buttonClassName?: string;
  popoverClassName?: string;
}

const allCategories: ActivityCategory[] = ['LESSON', 'STUDENT', 'HOMEWORK', 'SETTINGS', 'PAYMENT', 'NOTIFICATION'];

const categoryLabel: Record<ActivityCategory, string> = {
  LESSON: 'Уроки',
  STUDENT: 'Ученики',
  HOMEWORK: 'Домашки',
  SETTINGS: 'Настройки',
  PAYMENT: 'Оплаты',
  NOTIFICATION: 'Уведомления',
};

const toggleCategory = (filters: DashboardActivityFilters, category: ActivityCategory): ActivityCategory[] => {
  if (filters.categories.includes(category)) {
    return filters.categories.filter((item) => item !== category);
  }
  return [...filters.categories, category];
};

const normalizeFilters = (input: DashboardActivityFilters): DashboardActivityFilters => ({
  categories: Array.from(new Set(input.categories)).sort(),
  studentId: input.studentId ?? null,
  from: input.from ?? '',
  to: input.to ?? '',
});

const areFiltersEqual = (left: DashboardActivityFilters, right: DashboardActivityFilters) => {
  const normalizedLeft = normalizeFilters(left);
  const normalizedRight = normalizeFilters(right);

  if (normalizedLeft.studentId !== normalizedRight.studentId) return false;
  if (normalizedLeft.from !== normalizedRight.from) return false;
  if (normalizedLeft.to !== normalizedRight.to) return false;
  if (normalizedLeft.categories.length !== normalizedRight.categories.length) return false;

  return normalizedLeft.categories.every((category, index) => category === normalizedRight.categories[index]);
};

export const ActivityFeedFiltersControl: FC<ActivityFeedFiltersControlProps> = ({
  filters,
  students,
  onApplyFilters,
  popoverSide = 'bottom',
  popoverAlign = 'start',
  buttonClassName = '',
  popoverClassName = '',
}) => {
  const filterButtonRef = useRef<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<DashboardActivityFilters>(filters);

  useEffect(() => {
    if (isOpen) return;
    setDraftFilters(filters);
  }, [filters, isOpen]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.categories.length > 0) count += 1;
    if (filters.studentId !== null) count += 1;
    if (filters.from) count += 1;
    if (filters.to) count += 1;
    return count;
  }, [filters.categories.length, filters.from, filters.studentId, filters.to]);

  const hasDraftChanges = !areFiltersEqual(draftFilters, filters);

  const applyFilters = () => {
    onApplyFilters(draftFilters);
    setIsOpen(false);
  };

  const resetFilters = () => {
    setDraftFilters({
      categories: [],
      studentId: null,
      from: '',
      to: '',
    });
  };

  return (
    <>
      <button
        ref={filterButtonRef}
        type="button"
        className={`${controls.iconButton} ${styles.trigger} ${buttonClassName}`.trim()}
        aria-label="Фильтры ленты активности"
        title={`Фильтры${activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className={styles.iconWrapper}>
          <FilterAltOutlinedIcon width={18} height={18} />
          {activeFiltersCount > 0 && <span className={styles.filterCounter}>{activeFiltersCount}</span>}
        </span>
      </button>

      <AnchoredPopover
        isOpen={isOpen}
        anchorEl={filterButtonRef.current}
        onClose={() => setIsOpen(false)}
        side={popoverSide}
        align={popoverAlign}
        preventCloseOnOtherPopoverClick
        className={`${styles.filterPopover} ${popoverClassName}`.trim()}
      >
        <div className={styles.filtersPanel}>
          <div className={styles.categoryRow}>
            {allCategories.map((category) => {
              const active = draftFilters.categories.includes(category);
              return (
                <button
                  key={category}
                  type="button"
                  className={`${styles.categoryButton} ${active ? styles.categoryButtonActive : ''}`}
                  onClick={() => setDraftFilters((prev) => ({ ...prev, categories: toggleCategory(prev, category) }))}
                >
                  {categoryLabel[category]}
                </button>
              );
            })}
          </div>

          <div className={styles.controlsRow}>
            <div className={`${styles.controlItem} ${styles.studentControl}`}>
              <span>Ученик</span>
              <StudentSelect
                options={students}
                value={draftFilters.studentId}
                onChange={(nextStudentId) => setDraftFilters((prev) => ({ ...prev, studentId: nextStudentId }))}
                allLabel="Все ученики"
                placeholder="Все ученики"
              />
            </div>

            <div className={styles.dateRangeRow}>
              <div className={styles.controlItem}>
                <span>С какого...</span>
                <DatePickerField
                  value={draftFilters.from || undefined}
                  max={draftFilters.to || undefined}
                  onChange={(nextFrom) =>
                    setDraftFilters((prev) => ({
                      ...prev,
                      from: nextFrom ?? '',
                    }))
                  }
                  placeholder="Выберите дату"
                  allowClear
                />
              </div>

              <div className={styles.controlItem}>
                <span>По какое...</span>
                <DatePickerField
                  value={draftFilters.to || undefined}
                  min={draftFilters.from || undefined}
                  onChange={(nextTo) =>
                    setDraftFilters((prev) => ({
                      ...prev,
                      to: nextTo ?? '',
                    }))
                  }
                  placeholder="Выберите дату"
                  allowClear
                />
              </div>
            </div>
          </div>

          <div className={styles.panelActions}>
            <button type="button" className={controls.secondaryButton} onClick={resetFilters}>
              Сбросить
            </button>
            <button
              type="button"
              className={controls.primaryButton}
              onClick={applyFilters}
              disabled={!hasDraftChanges}
            >
              Применить
            </button>
          </div>
        </div>
      </AnchoredPopover>
    </>
  );
};

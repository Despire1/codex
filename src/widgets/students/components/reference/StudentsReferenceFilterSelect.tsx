import { type FC, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { AdaptivePopover } from '@/shared/ui/AdaptivePopover/AdaptivePopover';
import styles from './StudentsReferenceFilterSelect.module.css';

export type StudentsReferenceFilterOption = {
  value: string;
  label: string;
};

interface StudentsReferenceFilterSelectProps {
  value: string;
  options: ReadonlyArray<StudentsReferenceFilterOption>;
  onChange: (nextValue: string) => void;
  ariaLabel: string;
  className?: string;
}

export const StudentsReferenceFilterSelect: FC<StudentsReferenceFilterSelectProps> = ({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const selectedLabel = useMemo(
    () => options.find((option) => option.value === value)?.label ?? options[0]?.label ?? '',
    [options, value],
  );

  return (
    <AdaptivePopover
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      side="bottom"
      align="end"
      offset={10}
      rootClassName={`${styles.root} ${className}`.trim()}
      trigger={
        <button
          type="button"
          className={`${styles.triggerButton} ${isOpen ? styles.triggerButtonOpen : ''}`}
          onClick={() => setIsOpen((prev) => !prev)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={ariaLabel}
        >
          <span className={styles.triggerLabel}>{selectedLabel}</span>
          <FontAwesomeIcon icon={faChevronDown} className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`} />
        </button>
      }
      className={styles.popover}
    >
      <div className={styles.optionsList} role="listbox" aria-label={ariaLabel}>
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={isSelected}
              className={`${styles.optionButton} ${isSelected ? styles.optionButtonSelected : ''}`}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              <span className={styles.optionLabel}>{option.label}</span>
              <FontAwesomeIcon icon={faCheck} className={`${styles.optionCheck} ${isSelected ? styles.optionCheckVisible : ''}`} />
            </button>
          );
        })}
      </div>
    </AdaptivePopover>
  );
};

import { FC, useEffect, useMemo, useState } from 'react';
import { AdaptivePopover } from '../../../../shared/ui/AdaptivePopover/AdaptivePopover';
import { HomeworkCheckIcon, HomeworkChevronDownIcon } from '../../../../shared/ui/icons/HomeworkFaIcons';
import styles from './AssignmentSettingsSelect.module.css';

export type AssignmentSettingsSelectOption = {
  value: string;
  label: string;
};

interface AssignmentSettingsSelectProps {
  value: string;
  options: ReadonlyArray<AssignmentSettingsSelectOption>;
  onChange: (nextValue: string) => void;
  placeholder: string;
  ariaLabel: string;
  disabled?: boolean;
}

export const AssignmentSettingsSelect: FC<AssignmentSettingsSelectProps> = ({
  value,
  options,
  onChange,
  placeholder,
  ariaLabel,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  useEffect(() => {
    if (!disabled) return;
    setIsOpen(false);
  }, [disabled]);

  return (
    <AdaptivePopover
      isOpen={isOpen && !disabled}
      onClose={() => setIsOpen(false)}
      side="bottom"
      align="start"
      offset={10}
      rootClassName={styles.root}
      trigger={
        <button
          type="button"
          className={`${styles.triggerButton} ${isOpen ? styles.triggerButtonOpen : ''}`}
          onClick={() => {
            if (disabled) return;
            setIsOpen((prev) => !prev);
          }}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={ariaLabel}
          disabled={disabled}
        >
          <span className={`${styles.triggerLabel} ${selectedOption ? styles.triggerLabelFilled : styles.triggerLabelPlaceholder}`}>
            {selectedOption?.label ?? placeholder}
          </span>
          <HomeworkChevronDownIcon size={12} className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`} />
        </button>
      }
      className={styles.popover}
    >
      <div className={styles.optionsList} role="listbox" aria-label={ariaLabel}>
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <button
              key={option.value || '__empty'}
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
              <HomeworkCheckIcon size={11} className={`${styles.optionCheck} ${isSelected ? styles.optionCheckVisible : ''}`} />
            </button>
          );
        })}
      </div>
    </AdaptivePopover>
  );
};

import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import controls from '../../styles/controls.module.css';
import styles from './StudentSelect.module.css';

export type StudentSelectOption = {
  id: number;
  name: string;
};

interface StudentSelectBaseProps {
  options: StudentSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  dropdownClassName?: string;
  searchPlaceholder?: string;
}

interface StudentSelectSingleProps extends StudentSelectBaseProps {
  mode?: 'single';
  value: number | null;
  onChange: (next: number | null) => void;
  allLabel?: string;
}

interface StudentSelectMultipleProps extends StudentSelectBaseProps {
  mode: 'multiple';
  value: number[];
  onChange: (next: number[]) => void;
}

type StudentSelectProps = StudentSelectSingleProps | StudentSelectMultipleProps;

export const StudentSelect: FC<StudentSelectProps> = (props) => {
  const {
    options,
    placeholder = 'Выберите ученика',
    disabled = false,
    className = '',
    buttonClassName = '',
    dropdownClassName = '',
    searchPlaceholder = 'Найти ученика',
  } = props;

  const isMultiple = props.mode === 'multiple';
  const allLabel = !isMultiple ? props.allLabel ?? 'Все ученики' : 'Все ученики';
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const optionById = useMemo(() => {
    const map = new Map<number, StudentSelectOption>();
    options.forEach((option) => map.set(option.id, option));
    return map;
  }, [options]);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru');
    if (!normalizedQuery) return options;
    return options.filter((option) => option.name.toLocaleLowerCase('ru').includes(normalizedQuery));
  }, [options, query]);

  const selectedLabel = useMemo(() => {
    if (isMultiple) {
      if (props.value.length === 0) return placeholder;
      const names = props.value.map((id) => optionById.get(id)?.name).filter(Boolean) as string[];
      if (names.length <= 2) return names.join(', ');
      return `${names[0]}, ${names[1]} +${names.length - 2}`;
    }
    if (props.value === null) return allLabel;
    return optionById.get(props.value)?.name ?? placeholder;
  }, [allLabel, isMultiple, optionById, placeholder, props]);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setQuery('');
  }, []);

  const handleSelectSingle = (nextId: number | null) => {
    if (isMultiple) return;
    props.onChange(nextId);
    closeMenu();
  };

  const handleToggleMultiple = (id: number) => {
    if (!isMultiple) return;
    const isSelected = props.value.includes(id);
    const next = isSelected ? props.value.filter((value) => value !== id) : [...props.value, id];
    props.onChange(next);
  };

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      closeMenu();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeMenu, isOpen]);

  return (
    <div className={`${styles.root} ${className}`.trim()} ref={rootRef}>
      <button
        type="button"
        className={`${styles.triggerButton} ${buttonClassName}`.trim()}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        disabled={disabled}
      >
        <span className={styles.triggerLabel}>{selectedLabel}</span>
        <span className={styles.chevron} aria-hidden>
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {isOpen && (
        <div className={`${styles.dropdown} ${dropdownClassName}`.trim()}>
          <div className={styles.panel}>
            <input
              className={`${controls.input} ${styles.searchInput}`}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
            />

            <div className={styles.optionsList}>
              {!isMultiple && (
                <button
                  type="button"
                  className={`${styles.option} ${props.value === null ? styles.optionActive : ''}`}
                  onClick={() => handleSelectSingle(null)}
                >
                  {allLabel}
                </button>
              )}

              {filteredOptions.map((option) => {
                const isSelected = isMultiple ? props.value.includes(option.id) : props.value === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`${styles.option} ${isSelected ? styles.optionActive : ''}`}
                    onClick={() => {
                      if (isMultiple) {
                        handleToggleMultiple(option.id);
                        return;
                      }
                      handleSelectSingle(option.id);
                    }}
                  >
                    {option.name}
                    {isMultiple && <span className={styles.check}>{isSelected ? '✓' : ''}</span>}
                  </button>
                );
              })}
            </div>

            {isMultiple && (
              <div className={styles.actions}>
                <button type="button" className={controls.secondaryButton} onClick={closeMenu}>
                  Готово
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

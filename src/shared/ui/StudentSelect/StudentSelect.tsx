import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

type DropdownPosition = {
  top: number;
  left: number;
  width: number;
  placement: 'top' | 'bottom';
  optionsMaxHeight: number;
};

const VIEWPORT_GAP = 12;
const DROPDOWN_OFFSET = 6;
const MIN_OPTIONS_HEIGHT = 96;
const MAX_OPTIONS_HEIGHT = 320;
const OPTION_ITEM_HEIGHT = 40;
const OPTION_LIST_GAP = 4;
const MAX_VISIBLE_OPTIONS = 5;
const MAX_VISIBLE_OPTIONS_HEIGHT =
  OPTION_ITEM_HEIGHT * MAX_VISIBLE_OPTIONS + OPTION_LIST_GAP * (MAX_VISIBLE_OPTIONS - 1);
const SINGLE_RESERVED_HEIGHT = 84;
const MULTIPLE_RESERVED_HEIGHT = 84;

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
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition | null>(null);

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
    setDropdownPosition(null);
  }, []);

  const updateDropdownPosition = useCallback(() => {
    if (!rootRef.current) return;

    const rect = rootRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const horizontalPadding = VIEWPORT_GAP * 2;
    const resolvedWidth = Math.min(rect.width, viewportWidth - horizontalPadding);
    const left = Math.min(
      Math.max(rect.left, VIEWPORT_GAP),
      Math.max(VIEWPORT_GAP, viewportWidth - VIEWPORT_GAP - resolvedWidth),
    );
    const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_GAP - DROPDOWN_OFFSET;
    const spaceAbove = rect.top - VIEWPORT_GAP - DROPDOWN_OFFSET;
    const openUpwards = spaceBelow < MIN_OPTIONS_HEIGHT && spaceAbove > spaceBelow;
    const reservedHeight = isMultiple ? MULTIPLE_RESERVED_HEIGHT : SINGLE_RESERVED_HEIGHT;
    const availableHeight = Math.max(
      MIN_OPTIONS_HEIGHT,
      openUpwards ? spaceAbove : spaceBelow,
    );
    const optionsMaxHeight = Math.max(
      MIN_OPTIONS_HEIGHT,
      Math.min(MAX_OPTIONS_HEIGHT, availableHeight - reservedHeight, MAX_VISIBLE_OPTIONS_HEIGHT),
    );

    setDropdownPosition({
      top: openUpwards ? rect.top - DROPDOWN_OFFSET : rect.bottom + DROPDOWN_OFFSET,
      left,
      width: resolvedWidth,
      placement: openUpwards ? 'top' : 'bottom',
      optionsMaxHeight,
    });
  }, [isMultiple]);

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
      if (rootRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      closeMenu();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };

    updateDropdownPosition();
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updateDropdownPosition);
    window.addEventListener('scroll', updateDropdownPosition, true);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updateDropdownPosition);
      window.removeEventListener('scroll', updateDropdownPosition, true);
    };
  }, [closeMenu, isOpen, updateDropdownPosition]);

  const dropdown = isOpen && dropdownPosition
    ? createPortal(
        <div
          ref={dropdownRef}
          className={`${styles.dropdown} ${dropdownClassName}`.trim()}
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: dropdownPosition.width,
            transform: dropdownPosition.placement === 'top' ? 'translateY(-100%)' : undefined,
          }}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className={styles.panel}>
            <input
              className={`${controls.input} ${styles.searchInput}`}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
            />

            <div className={styles.optionsList} style={{ maxHeight: dropdownPosition.optionsMaxHeight }}>
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
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className={`${styles.root} ${className}`.trim()} ref={rootRef}>
      <button
        type="button"
        className={`${styles.triggerButton} ${buttonClassName}`.trim()}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        disabled={disabled}
        aria-expanded={isOpen}
      >
        <span className={styles.triggerLabel}>{selectedLabel}</span>
        <span className={styles.chevron} aria-hidden>
          {isOpen ? '▲' : '▼'}
        </span>
      </button>
      {dropdown}
    </div>
  );
};

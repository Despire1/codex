import { ChangeEvent, KeyboardEvent, useEffect, useMemo, useState } from 'react';
import styles from './NumberInput.module.css';

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}

const formatValue = (value: number) => (Number.isFinite(value) ? String(value) : '');

const clampValue = (value: number, min?: number, max?: number) => {
  if (typeof min === 'number') {
    value = Math.max(min, value);
  }
  if (typeof max === 'number') {
    value = Math.min(max, value);
  }
  return value;
};

const parseNumericInput = (raw: string) => {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-') {
    return null;
  }
  const normalized = trimmed.replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
};

export const NumberInput = ({
  value,
  onChange,
  step = 1,
  min,
  max,
  className = '',
  disabled = false,
  placeholder,
  ariaLabel,
}: NumberInputProps) => {
  const [draft, setDraft] = useState(formatValue(value));

  const clampedValue = useMemo(() => clampValue(value, min, max), [value, min, max]);

  useEffect(() => {
    setDraft(formatValue(clampedValue));
  }, [clampedValue]);

  const commitValue = (nextValue: number) => {
    const clamped = clampValue(nextValue, min, max);
    onChange(clamped);
    setDraft(formatValue(clamped));
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextDraft = event.target.value;
    setDraft(nextDraft);
    const parsed = parseNumericInput(nextDraft);
    if (parsed !== null) {
      onChange(clampValue(parsed, min, max));
    }
  };

  const handleBlur = () => {
    const parsed = parseNumericInput(draft);
    if (parsed === null) {
      setDraft(formatValue(clampedValue));
      return;
    }
    commitValue(parsed);
  };

  const handleStep = (direction: number) => {
    const base = parseNumericInput(draft) ?? clampedValue ?? 0;
    commitValue(base + direction * step);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      handleStep(1);
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      handleStep(-1);
    }
  };

  return (
    <div className={`${styles.root} ${className}`}>
      <button
        type="button"
        className={styles.stepButton}
        onClick={() => handleStep(-1)}
        disabled={disabled}
        aria-label="Уменьшить"
      >
        −
      </button>
      <input
        className={styles.input}
        value={draft}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        inputMode="decimal"
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
      />
      <button
        type="button"
        className={styles.stepButton}
        onClick={() => handleStep(1)}
        disabled={disabled}
        aria-label="Увеличить"
      >
        +
      </button>
    </div>
  );
};

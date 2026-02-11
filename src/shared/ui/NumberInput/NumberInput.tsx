import { ChangeEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
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
  disallowZero?: boolean;
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
  disallowZero = false,
}: NumberInputProps) => {
  const [draft, setDraft] = useState(formatValue(value));
  const lastNonZeroValueRef = useRef(value !== 0 ? value : Math.abs(step) || 1);

  const clampedValue = useMemo(() => clampValue(value, min, max), [value, min, max]);
  const normalizedStep = useMemo(() => Math.max(Math.abs(step), 1), [step]);

  useEffect(() => {
    if (clampedValue !== 0) {
      lastNonZeroValueRef.current = clampedValue;
    }
    setDraft(formatValue(clampedValue));
  }, [clampedValue]);

  const resolveNonZeroFallback = (direction?: number) => {
    const candidates: number[] = [];
    if (lastNonZeroValueRef.current !== 0) candidates.push(lastNonZeroValueRef.current);
    if (clampedValue !== 0) candidates.push(clampedValue);
    if (direction) {
      candidates.push(direction > 0 ? normalizedStep : -normalizedStep);
    }
    candidates.push(normalizedStep, -normalizedStep);

    for (const candidate of candidates) {
      const normalized = clampValue(candidate, min, max);
      if (normalized !== 0) return normalized;
    }

    return 0;
  };

  const commitValue = (nextValue: number, direction?: number) => {
    let clamped = clampValue(nextValue, min, max);

    if (disallowZero && clamped === 0) {
      clamped = resolveNonZeroFallback(direction);
      if (clamped === 0) {
        setDraft(formatValue(clampedValue));
        return;
      }
    }

    if (clamped !== 0) {
      lastNonZeroValueRef.current = clamped;
    }

    onChange(clamped);
    setDraft(formatValue(clamped));
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextDraft = event.target.value;
    setDraft(nextDraft);
    const parsed = parseNumericInput(nextDraft);
    if (parsed !== null) {
      const nextValue = clampValue(parsed, min, max);
      if (disallowZero && nextValue === 0) return;
      if (nextValue !== 0) {
        lastNonZeroValueRef.current = nextValue;
      }
      onChange(nextValue);
    }
  };

  const handleBlur = () => {
    const parsed = parseNumericInput(draft);
    if (parsed === null) {
      setDraft(formatValue(clampedValue));
      return;
    }

    const nextValue = clampValue(parsed, min, max);
    if (disallowZero && nextValue === 0) {
      const fallback = resolveNonZeroFallback();
      if (fallback === 0) {
        setDraft(formatValue(clampedValue));
        return;
      }
      commitValue(fallback);
      return;
    }

    commitValue(nextValue);
  };

  const handleStep = (direction: number) => {
    const stepDirection = direction >= 0 ? 1 : -1;
    const parsedDraft = parseNumericInput(draft);
    const fallbackBase = disallowZero ? resolveNonZeroFallback(stepDirection) : 0;
    const baseValue = parsedDraft ?? clampedValue ?? fallbackBase;
    const safeBase = disallowZero && baseValue === 0 ? fallbackBase : baseValue;
    let nextValue = safeBase + stepDirection * normalizedStep;

    if (disallowZero && nextValue === 0) {
      nextValue += stepDirection * normalizedStep;
    }

    commitValue(nextValue, stepDirection);
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

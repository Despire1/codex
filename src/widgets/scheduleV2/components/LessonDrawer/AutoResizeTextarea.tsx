import { type FC, useLayoutEffect, useRef } from 'react';

interface AutoResizeTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

export const AutoResizeTextarea: FC<AutoResizeTextareaProps> = ({
  value,
  onChange,
  placeholder,
  disabled,
  autoFocus,
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(Math.max(el.scrollHeight, 72), 400);
    el.style.height = `${next}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      rows={3}
      style={{
        width: '100%',
        resize: 'none',
        minHeight: 72,
        padding: '8px 10px',
        borderRadius: 8,
        border: '1px solid var(--sv2-border-default)',
        fontFamily: 'inherit',
        fontSize: 13,
        lineHeight: 1.4,
        background: 'var(--sv2-surface-card)',
        overflow: 'hidden',
      }}
    />
  );
};

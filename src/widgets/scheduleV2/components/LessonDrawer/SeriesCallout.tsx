import type { FC } from 'react';

interface SeriesCalloutProps {
  onReschedule?: () => void;
}

export const SeriesCallout: FC<SeriesCalloutProps> = ({ onReschedule }) => (
  <div
    role="note"
    style={{
      margin: '0 0 12px',
      padding: '10px 12px',
      background: 'var(--sv2-color-slate-50)',
      border: '1px solid var(--sv2-border-subtle)',
      borderRadius: 12,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      fontSize: 12,
      color: 'var(--sv2-text-secondary)',
    }}
  >
    <span>Урок в серии. Дату и время меняйте через кнопку «Перенести».</span>
    {onReschedule ? (
      <button
        type="button"
        onClick={onReschedule}
        style={{
          border: '1px solid var(--sv2-border-default)',
          background: 'var(--sv2-surface-card)',
          color: 'var(--sv2-text-primary)',
          padding: '4px 10px',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Перенести
      </button>
    ) : null}
  </div>
);

import { useEffect, useRef, useState } from 'react';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import controls from '../../../../shared/styles/controls.module.css';
import { useFocusTrap } from '../../../../shared/lib/useFocusTrap';
import type { LessonMutationPreview, LessonSeriesScope } from '../../model/types';
import styles from './SeriesScopeDialog.module.css';

// SERIES намеренно скрыт: backend normalizeLessonScope (src/backend/server.ts) мапит SERIES → FOLLOWING,
// поэтому отдельная кнопка «Вся серия» сейчас не отличается от «Этот и следующие».
type VisibleLessonSeriesScope = Exclude<LessonSeriesScope, 'SERIES'>;

const VISIBLE_LESSON_SERIES_SCOPES: VisibleLessonSeriesScope[] = ['SINGLE', 'FOLLOWING'];

interface SeriesScopeDialogProps {
  open: boolean;
  title?: string;
  confirmText?: string;
  defaultScope?: LessonSeriesScope;
  previews?: Partial<Record<LessonSeriesScope, LessonMutationPreview>>;
  onConfirm: (scope: LessonSeriesScope) => void;
  onClose: () => void;
}

const scopeLabels: Record<VisibleLessonSeriesScope, { title: string; description: string }> = {
  SINGLE: {
    title: 'Только этот урок',
    description: 'Меняется только выбранный экземпляр.',
  },
  FOLLOWING: {
    title: 'Этот и следующие',
    description: 'Меняются выбранный урок и все следующие уроки серии.',
  },
};

const normalizeVisibleScope = (scope?: LessonSeriesScope): VisibleLessonSeriesScope =>
  scope === 'FOLLOWING' || scope === 'SERIES' ? 'FOLLOWING' : 'SINGLE';

const resolveScopeHint = (scope: VisibleLessonSeriesScope) =>
  scope === 'SINGLE'
    ? 'Изменение затронет только выбранный урок.'
    : 'Изменение применится от выбранного урока и ко всем следующим урокам серии.';

export const SeriesScopeDialog = ({
  open,
  title = 'Применить действие к',
  confirmText = 'Продолжить',
  defaultScope = 'SINGLE',
  previews,
  onConfirm,
  onClose,
}: SeriesScopeDialogProps) => {
  const [scope, setScope] = useState<VisibleLessonSeriesScope>(normalizeVisibleScope(defaultScope));
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, containerRef);

  useEffect(() => {
    if (!open) return;
    setScope(normalizeVisibleScope(defaultScope));
  }, [defaultScope, open]);

  const preview = previews?.[scope];
  const effectiveDateLabel = preview?.effectiveDateFrom
    ? new Date(preview.effectiveDateFrom).toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;
  const isConfirmDisabled = Boolean(preview) && (preview.affectedCount === 0 || preview.isBlocked);
  const summaryText = preview?.isBlocked
    ? 'Этот вариант сейчас недоступен.'
    : effectiveDateLabel && (preview?.skippedProtectedCount ?? 0) > 0
      ? `Изменения начнутся с ${effectiveDateLabel}.`
      : resolveScopeHint(scope);

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div ref={containerRef}>
        <div className={styles.options} role="radiogroup" aria-label="Применить действие к">
          {VISIBLE_LESSON_SERIES_SCOPES.map((value) => (
            <label key={value} className={`${styles.option} ${scope === value ? styles.optionActive : ''}`}>
              <input
                type="radio"
                name="seriesScope"
                value={value}
                checked={scope === value}
                onChange={() => setScope(value)}
              />
              <span className={styles.optionContent}>
                <span className={styles.optionTitle}>{scopeLabels[value].title}</span>
                <span className={styles.optionDescription}>{scopeLabels[value].description}</span>
              </span>
            </label>
          ))}
        </div>
        <div className={styles.summary}>{summaryText}</div>
        {preview?.isBlocked && preview.blockReason && (
          <div className={`${styles.notice} ${styles.noticeBlocked}`}>{preview.blockReason}</div>
        )}
        {preview && preview.affectedCount === 0 && !preview.isBlocked && (
          <div className={styles.notice}>Для этого варианта сейчас нет уроков, к которым можно применить действие.</div>
        )}
        {!preview?.isBlocked && preview?.resolutionReason && (
          <div className={styles.notice}>{preview.resolutionReason}</div>
        )}
        <div className={styles.actions}>
          <button type="button" className={controls.secondaryButton} onClick={onClose}>
            Назад
          </button>
          <button
            type="button"
            className={controls.primaryButton}
            disabled={isConfirmDisabled}
            onClick={() => onConfirm(scope)}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
};

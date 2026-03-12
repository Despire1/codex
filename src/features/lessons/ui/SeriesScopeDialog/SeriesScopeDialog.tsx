import { useEffect, useRef, useState } from 'react';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import controls from '../../../../shared/styles/controls.module.css';
import { useFocusTrap } from '../../../../shared/lib/useFocusTrap';
import type { LessonMutationPreview, LessonSeriesScope } from '../../model/types';
import styles from './SeriesScopeDialog.module.css';

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

const formatPreviewDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

const formatLessonWord = (count: number) => {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) return 'урок';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'урока';
  return 'уроков';
};

const formatLessonCount = (count: number) => `${count} ${formatLessonWord(count)}`;

const previewActionLabels: Record<LessonMutationPreview['action'], string> = {
  EDIT: 'Будут обновлены',
  RESCHEDULE: 'Будут перенесены',
  DELETE: 'Будут удалены',
  CANCEL: 'Будут отменены',
  RESTORE: 'Будут восстановлены',
};

const previewActionHints: Record<LessonMutationPreview['action'], string> = {
  EDIT: 'Сохраним новые параметры только для выбранной части серии.',
  RESCHEDULE: 'Изменим дату и время только в выбранном диапазоне.',
  DELETE: 'Удалим только ту часть серии, которую вы выберете.',
  CANCEL: 'Оставим уроки в календаре, но переведём их в статус "Отменён".',
  RESTORE: 'Вернём отменённые уроки обратно в расписание.',
};

const resolvePeriodLabel = (dateFrom: string | null, dateTo: string | null) => {
  if (dateFrom && dateTo) {
    return dateFrom === dateTo ? dateFrom : `${dateFrom} -> ${dateTo}`;
  }
  return dateFrom ?? dateTo ?? 'Выбранный диапазон';
};

const normalizeVisibleScope = (scope?: LessonSeriesScope): VisibleLessonSeriesScope =>
  scope === 'FOLLOWING' || scope === 'SERIES' ? 'FOLLOWING' : 'SINGLE';

const resolveProtectedNotes = (scope: VisibleLessonSeriesScope, action: LessonMutationPreview['action']) => {
  const notes = [
    scope === 'SINGLE'
      ? 'Остальные уроки серии останутся без изменений.'
      : 'Уроки до выбранного останутся без изменений.',
    'История оплаты и проведённых уроков не будет переписана.',
  ];

  if (action === 'DELETE') {
    notes.push('Связанные платежи, домашние задания и журнал активности не потеряются.');
  }

  if (action === 'CANCEL') {
    notes.push('Финансовое последствие отмены применится только к выбранному диапазону.');
  }

  return notes;
};

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
  const dateFrom = formatPreviewDate(preview?.dateFrom);
  const dateTo = formatPreviewDate(preview?.dateTo);
  const isConfirmDisabled = Boolean(preview) && (preview.affectedCount === 0 || preview.isBlocked);
  const scopeLabel = scopeLabels[scope].title;
  const previewHeadline = preview
    ? preview.isBlocked
      ? 'Этот вариант сейчас недоступен'
      : `${previewActionLabels[preview.action]} ${formatLessonCount(preview.affectedCount)}`
    : null;
  const previewDescription = preview
    ? preview.isBlocked
      ? 'Этот диапазон нельзя изменить без риска переписать историю серии.'
      : `${previewActionHints[preview.action]} ${resolveScopeHint(scope)}`
    : null;
  const statusItems = preview
    ? [
        { key: 'scheduled', label: 'запланировано', value: preview.scheduledCount },
        { key: 'canceled', label: 'уже отменено', value: preview.canceledCount },
        { key: 'completed', label: 'уже проведено', value: preview.completedCount },
        { key: 'paid', label: 'оплачено', value: preview.paidCount },
      ]
    : [];
  const protectedNotes = preview ? resolveProtectedNotes(scope, preview.action) : [];

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
        {preview && (
          <div className={styles.preview}>
            <div className={styles.previewHeader}>
              <div className={styles.previewHeaderText}>
                <div className={styles.previewEyebrow}>Что изменится</div>
                <div className={styles.previewTitle}>{previewHeadline}</div>
                {previewDescription && <div className={styles.previewDescription}>{previewDescription}</div>}
              </div>
              <div className={styles.scopeBadge}>{scopeLabel}</div>
            </div>

            <div className={styles.metrics}>
              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Затронется</div>
                <div className={styles.metricValue}>{preview.affectedCount}</div>
                <div className={styles.metricHint}>{formatLessonCount(preview.affectedCount)}</div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Период</div>
                <div className={styles.metricRange}>{resolvePeriodLabel(dateFrom, dateTo)}</div>
                <div className={styles.metricHint}>
                  {scope === 'SINGLE'
                    ? 'Показываем время только выбранного урока.'
                    : 'Показываем диапазон от выбранного урока и далее.'}
                </div>
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>Какие уроки попадут в действие</div>
              <div className={styles.statusGrid}>
                {statusItems.map((item) => (
                  <div
                    key={item.key}
                    className={`${styles.statusCard} ${item.value === 0 ? styles.statusCardMuted : ''}`}
                  >
                    <div className={styles.statusValue}>{item.value}</div>
                    <div className={styles.statusLabel}>{item.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {preview.isBlocked && preview.blockReason && (
              <div className={`${styles.noteBox} ${styles.noteBoxBlocked}`}>
                <div className={styles.noteTitle}>Почему нельзя применить</div>
                <div className={styles.noteText}>{preview.blockReason}</div>
              </div>
            )}

            {preview.affectedCount === 0 && !preview.isBlocked && (
              <div className={`${styles.noteBox} ${styles.noteBoxNeutral}`}>
                <div className={styles.noteTitle}>Нечего менять</div>
                <div className={styles.noteText}>
                  Для этого варианта нет уроков, которые можно изменить без переписывания истории.
                </div>
              </div>
            )}

            {preview.historyUntouched && !preview.isBlocked && (
              <div className={`${styles.noteBox} ${styles.noteBoxSafe}`}>
                <div className={styles.noteTitle}>Что останется без изменений</div>
                <ul className={styles.noteList}>
                  {protectedNotes.map((note) => (
                    <li key={note} className={styles.noteText}>
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <div className={styles.actions}>
          <button type="button" className={controls.secondaryButton} onClick={onClose}>
            Назад
          </button>
          <button type="button" className={controls.primaryButton} disabled={isConfirmDisabled} onClick={() => onConfirm(scope)}>
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
};

import { useEffect, useRef, useState } from 'react';
import { Modal } from '../../../../shared/ui/Modal/Modal';
import controls from '../../../../shared/styles/controls.module.css';
import { useFocusTrap } from '../../../../shared/lib/useFocusTrap';
import type { LessonSeriesScope } from '../../model/types';
import styles from './SeriesScopeDialog.module.css';

interface SeriesScopeDialogProps {
  open: boolean;
  defaultScope?: LessonSeriesScope;
  onConfirm: (scope: LessonSeriesScope) => void;
  onClose: () => void;
}

export const SeriesScopeDialog = ({
  open,
  defaultScope = 'SINGLE',
  onConfirm,
  onClose,
}: SeriesScopeDialogProps) => {
  const [scope, setScope] = useState<LessonSeriesScope>(defaultScope);
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, containerRef);

  useEffect(() => {
    if (!open) return;
    setScope(defaultScope);
  }, [defaultScope, open]);

  return (
    <Modal open={open} title="Применить действие к" onClose={onClose}>
      <div ref={containerRef}>
        <div className={styles.options} role="radiogroup" aria-label="Применить действие к">
          <label className={`${styles.option} ${scope === 'SINGLE' ? styles.optionActive : ''}`}>
            <input
              type="radio"
              name="seriesScope"
              value="SINGLE"
              checked={scope === 'SINGLE'}
              onChange={() => setScope('SINGLE')}
            />
            <span>Только этот урок</span>
          </label>
          <label className={`${styles.option} ${scope === 'SERIES' ? styles.optionActive : ''}`}>
            <input
              type="radio"
              name="seriesScope"
              value="SERIES"
              checked={scope === 'SERIES'}
              onChange={() => setScope('SERIES')}
            />
            <span>Все уроки серии</span>
          </label>
        </div>
        <div className={styles.actions}>
          <button type="button" className={controls.secondaryButton} onClick={onClose}>
            Назад
          </button>
          <button type="button" className={controls.primaryButton} onClick={() => onConfirm(scope)}>
            Продолжить
          </button>
        </div>
      </div>
    </Modal>
  );
};

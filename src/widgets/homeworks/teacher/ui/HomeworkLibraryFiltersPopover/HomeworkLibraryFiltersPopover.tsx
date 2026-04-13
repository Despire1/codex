import { FC } from 'react';
import { AnchoredPopover } from '../../../../../shared/ui/AnchoredPopover/AnchoredPopover';
import styles from './HomeworkLibraryFiltersPopover.module.css';

type HomeworkLibraryFormatFilter = 'test' | 'media' | 'voice' | 'writing';

interface HomeworkLibraryFiltersPopoverProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  levels: string[];
  selectedLevel: string;
  selectedFormats: HomeworkLibraryFormatFilter[];
  onClose: () => void;
  onLevelChange: (value: string) => void;
  onToggleFormat: (value: HomeworkLibraryFormatFilter) => void;
  onClear: () => void;
}

const FORMAT_LABELS: Array<{ id: HomeworkLibraryFormatFilter; label: string }> = [
  { id: 'test', label: 'Тесты' },
  { id: 'media', label: 'Материалы' },
  { id: 'voice', label: 'Голос' },
  { id: 'writing', label: 'Письменный ответ' },
];

export const HomeworkLibraryFiltersPopover: FC<HomeworkLibraryFiltersPopoverProps> = ({
  open,
  anchorEl,
  levels,
  selectedLevel,
  selectedFormats,
  onClose,
  onLevelChange,
  onToggleFormat,
  onClear,
}) => (
  <AnchoredPopover
    isOpen={open}
    anchorEl={anchorEl}
    onClose={onClose}
    side="bottom"
    align="end"
    offset={10}
    className={styles.popover}
  >
    <div className={styles.content}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>Фильтры</h3>
          <p className={styles.subtitle}>Быстрый отбор библиотеки заданий</p>
        </div>
        <button type="button" className={styles.clearButton} onClick={onClear}>
          Сбросить
        </button>
      </div>

      <div className={styles.group}>
        <p className={styles.groupLabel}>Уровень</p>
        <div className={styles.options}>
          <button
            type="button"
            className={`${styles.optionChip} ${selectedLevel === 'all' ? styles.optionChipActive : ''}`}
            onClick={() => onLevelChange('all')}
          >
            Все
          </button>
          {levels.map((level) => (
            <button
              key={level}
              type="button"
              className={`${styles.optionChip} ${selectedLevel === level ? styles.optionChipActive : ''}`}
              onClick={() => onLevelChange(level)}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <p className={styles.groupLabel}>Формат</p>
        <div className={styles.options}>
          {FORMAT_LABELS.map((format) => {
            const active = selectedFormats.includes(format.id);
            return (
              <button
                key={format.id}
                type="button"
                className={`${styles.optionChip} ${active ? styles.optionChipActive : ''}`}
                onClick={() => onToggleFormat(format.id)}
              >
                {format.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  </AnchoredPopover>
);

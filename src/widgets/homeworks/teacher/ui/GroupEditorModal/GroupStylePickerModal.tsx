import { MouseEvent } from 'react';
import {
  HomeworkCheckIcon,
  HomeworkXMarkIcon,
} from '../../../../../shared/ui/icons/HomeworkFaIcons';
import { GroupIconView } from '../../model/lib/groupIconView';
import {
  GROUP_EDITOR_COLOR_OPTIONS,
  GROUP_EDITOR_ICON_OPTIONS,
} from '../../model/lib/groupEditorStyles';
import styles from './GroupStylePickerModal.module.css';

type GroupStylePickerModalProps = {
  open: boolean;
  iconKey: string;
  bgColor: string;
  onClose: () => void;
  onSelectIcon: (iconKey: string) => void;
  onSelectColor: (bgColor: string) => void;
};

const stopPropagation = (event: MouseEvent<HTMLDivElement>) => {
  event.stopPropagation();
};

export const GroupStylePickerModal = ({
  open,
  iconKey,
  bgColor,
  onClose,
  onSelectIcon,
  onSelectColor,
}: GroupStylePickerModalProps) => {
  if (!open) return null;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={stopPropagation}>
        <div className={styles.header}>
          <div className={styles.titleBlock}>
            <h3 className={styles.title}>Стилизация группы</h3>
            <p className={styles.subtitle}>Выберите иконку и цвет фона</p>
          </div>
          <button type="button" className={styles.closeButton} aria-label="Закрыть" onClick={onClose}>
            <HomeworkXMarkIcon size={14} />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.section}>
            <p className={styles.sectionTitle}>Иконка</p>
            <div className={styles.iconGrid}>
              {GROUP_EDITOR_ICON_OPTIONS.map((option) => {
                const isSelected = option.key === iconKey;
                return (
                  <button
                    key={option.key}
                    type="button"
                    className={`${styles.iconOption} ${isSelected ? styles.iconOptionSelected : ''}`}
                    onClick={() => onSelectIcon(option.key)}
                  >
                    <span className={`${styles.iconPreview} ${isSelected ? styles.iconPreviewSelected : ''}`}>
                      <GroupIconView iconKey={option.key} size={16} />
                    </span>
                    <span className={styles.iconLabel}>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.section}>
            <p className={styles.sectionTitle}>Цвет</p>
            <div className={styles.colorGrid}>
              {GROUP_EDITOR_COLOR_OPTIONS.map((option) => {
                const isSelected = option.color.toUpperCase() === bgColor.toUpperCase();
                return (
                  <button
                    key={option.color}
                    type="button"
                    className={`${styles.colorOption} ${isSelected ? styles.colorOptionSelected : ''}`}
                    onClick={() => onSelectColor(option.color)}
                  >
                    <span className={styles.colorSwatch} style={{ backgroundColor: option.color }} />
                    <span className={styles.colorLabel}>{option.label}</span>
                    {isSelected ? <HomeworkCheckIcon size={11} className={styles.colorCheck} /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

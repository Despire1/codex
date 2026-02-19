import { FC } from 'react';
import { ChevronLeftIcon } from '../../../../icons/MaterialIcons';
import {
  HomeworkBarsIcon,
  HomeworkBellRegularIcon,
  HomeworkBookmarkRegularIcon,
  HomeworkCheckIcon,
} from '../../../../shared/ui/icons/HomeworkFaIcons';
import styles from './CreateTemplateHeader.module.css';

interface CreateTemplateHeaderProps {
  mode: 'create' | 'edit';
  submitting: boolean;
  hasValidationErrors: boolean;
  draftSavedAtLabel: string | null;
  onBack: () => void;
  onSaveDraft: () => void;
  onSubmit: () => void;
}

export const CreateTemplateHeader: FC<CreateTemplateHeaderProps> = ({
  mode,
  submitting,
  hasValidationErrors,
  draftSavedAtLabel,
  onBack,
  onSaveDraft,
  onSubmit,
}) => {
  const isEditMode = mode === 'edit';
  const title = isEditMode ? 'Редактирование шаблона' : 'Создание шаблона';
  const subtitle = draftSavedAtLabel
    ? `Черновик сохранен: ${draftSavedAtLabel}`
    : isEditMode
      ? 'Обновите настройки и вопросы шаблона'
      : 'Новое домашнее задание';

  return (
    <header className={styles.header}>
      <div className={styles.leftGroup}>
        <button type="button" className={styles.menuButton} aria-label="Открыть меню">
          <HomeworkBarsIcon size={16} />
        </button>

        <div className={styles.titleGroup}>
          <button type="button" className={styles.backButton} onClick={onBack} aria-label="Назад">
            <ChevronLeftIcon width={16} height={16} />
          </button>

          <div>
            <h1 className={styles.title}>{title}</h1>
            <p className={styles.subtitle}>{subtitle}</p>
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        {mode === 'create' ? (
          <button type="button" className={styles.ghostButton} onClick={onSaveDraft} disabled={submitting}>
            <HomeworkBookmarkRegularIcon size={14} />
            <span>Сохранить черновик</span>
          </button>
        ) : null}

        <button type="button" className={styles.bellButton} aria-label="Уведомления">
          <HomeworkBellRegularIcon size={15} />
          <span className={styles.bellDot} />
        </button>

        <button
          type="button"
          className={styles.submitButton}
          disabled={submitting || hasValidationErrors}
          onClick={onSubmit}
        >
          <HomeworkCheckIcon size={14} className={styles.submitIcon} />
          <span>{submitting ? (isEditMode ? 'Сохраняю…' : 'Создаю…') : isEditMode ? 'Сохранить шаблон' : 'Создать шаблон'}</span>
        </button>
      </div>
    </header>
  );
};

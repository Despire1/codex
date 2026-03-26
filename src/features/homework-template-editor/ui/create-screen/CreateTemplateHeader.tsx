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
  variant: 'template' | 'assignment';
  submitting: boolean;
  hasValidationErrors: boolean;
  draftSavedAtLabel: string | null;
  showSecondaryAction: boolean;
  secondaryActionLabel: string;
  primaryActionLabel: string;
  primarySubmittingLabel: string;
  onBack: () => void;
  onSecondaryAction: () => void;
  onPrimaryAction: () => void;
}

export const CreateTemplateHeader: FC<CreateTemplateHeaderProps> = ({
  mode,
  variant,
  submitting,
  hasValidationErrors,
  draftSavedAtLabel,
  showSecondaryAction,
  secondaryActionLabel,
  primaryActionLabel,
  primarySubmittingLabel,
  onBack,
  onSecondaryAction,
  onPrimaryAction,
}) => {
  const isEditMode = mode === 'edit';
  const title =
    variant === 'assignment'
      ? isEditMode
        ? 'Редактирование домашнего задания'
        : 'Создание домашнего задания'
      : isEditMode
        ? 'Редактирование шаблона'
        : 'Создание шаблона';
  const subtitle = draftSavedAtLabel
    ? `Черновик сохранен: ${draftSavedAtLabel}`
    : variant === 'assignment'
      ? 'Настройте домашку и выберите способ выдачи'
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
        {showSecondaryAction ? (
          <button type="button" className={styles.ghostButton} onClick={onSecondaryAction} disabled={submitting}>
            <HomeworkBookmarkRegularIcon size={14} />
            <span>{secondaryActionLabel}</span>
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
          onClick={onPrimaryAction}
        >
          <HomeworkCheckIcon size={14} className={styles.submitIcon} />
          <span>{submitting ? primarySubmittingLabel : primaryActionLabel}</span>
        </button>
      </div>
    </header>
  );
};

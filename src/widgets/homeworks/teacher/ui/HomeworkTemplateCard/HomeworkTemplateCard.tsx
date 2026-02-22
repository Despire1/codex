import { FC, KeyboardEvent, MouseEvent } from 'react';
import { HomeworkTemplate } from '../../../../../entities/types';
import {
  HomeworkClockIcon,
  HomeworkMicrophoneIcon,
  HomeworkPlusIcon,
  HomeworkStarIcon,
  HomeworkStarRegularIcon,
} from '../../../../../shared/ui/icons/HomeworkFaIcons';
import {
  isHomeworkTemplateFavorite,
  resolveHomeworkTemplateCardMeta,
  resolveHomeworkTemplateCategory,
  resolveHomeworkTemplateCategoryTone,
  resolveHomeworkTemplatePreview,
} from '../../model/lib/templatePresentation';
import styles from './HomeworkTemplateCard.module.css';

interface HomeworkTemplateCardProps {
  template: HomeworkTemplate;
  onToggleFavorite: (template: HomeworkTemplate) => void;
  onUseTemplate: (template: HomeworkTemplate) => void;
  onEditTemplate: (template: HomeworkTemplate) => void;
}

export const HomeworkTemplateCard: FC<HomeworkTemplateCardProps> = ({
  template,
  onToggleFavorite,
  onUseTemplate,
  onEditTemplate,
}) => {
  const favorite = isHomeworkTemplateFavorite(template);
  const category = resolveHomeworkTemplateCategory(template);
  const categoryTone = resolveHomeworkTemplateCategoryTone(template);
  const preview = resolveHomeworkTemplatePreview(template);
  const footerMeta = resolveHomeworkTemplateCardMeta(template);

  const handleCardClick = () => {
    onEditTemplate(template);
  };

  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onEditTemplate(template);
  };

  const handleToggleFavorite = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onToggleFavorite(template);
  };

  const handleUseTemplate = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onUseTemplate(template);
  };

  return (
    <article
      className={styles.card}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`Открыть шаблон "${template.title}"`}
    >
      <div className={styles.head}>
        <span className={`${styles.category} ${categoryTone === 'purple' ? styles.categoryPurple : styles.categoryBlue}`}>
          {category}
        </span>
        <button
          type="button"
          className={`${styles.favoriteButton} ${favorite ? styles.favoriteButtonActive : ''}`}
          onClick={handleToggleFavorite}
          aria-label="Переключить избранное"
        >
          {favorite ? <HomeworkStarIcon size={14} /> : <HomeworkStarRegularIcon size={14} />}
        </button>
      </div>

      <h3 className={styles.title}>{template.title}</h3>
      <p className={styles.preview}>{preview}</p>

      <div className={styles.footer}>
        <span className={styles.meta}>
          {footerMeta.kind === 'audio' ? (
            <HomeworkMicrophoneIcon size={11} className={styles.metaIcon} />
          ) : (
            <HomeworkClockIcon size={11} className={styles.metaIcon} />
          )}
          {footerMeta.label}
        </span>
        <button
          type="button"
          className={styles.useButton}
          onClick={handleUseTemplate}
          aria-label={`Использовать шаблон "${template.title}"`}
        >
          <HomeworkPlusIcon size={12} />
        </button>
      </div>
    </article>
  );
};

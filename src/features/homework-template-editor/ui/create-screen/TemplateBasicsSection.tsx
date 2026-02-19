import { FC, KeyboardEvent, RefObject, useMemo, useState } from 'react';
import {
  HomeworkChevronDownIcon,
  HomeworkCircleInfoIcon,
  HomeworkPlusIcon,
  HomeworkXMarkIcon,
} from '../../../../shared/ui/icons/HomeworkFaIcons';
import styles from './TemplateBasicsSection.module.css';

const CATEGORY_OPTIONS = ['Грамматика', 'Лексика', 'Speaking', 'Listening', 'Writing', 'Reading'];

interface TemplateBasicsSectionProps {
  title: string;
  titleError?: string | null;
  titleValidationPath?: string;
  titleInputRef?: RefObject<HTMLInputElement | null>;
  description: string;
  category: string;
  estimatedMinutes: number | null;
  tags: string[];
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onEstimatedMinutesChange: (value: number | null) => void;
  onTagAdd: (value: string) => void;
  onTagRemove: (value: string) => void;
}

export const TemplateBasicsSection: FC<TemplateBasicsSectionProps> = ({
  title,
  titleError = null,
  titleValidationPath,
  titleInputRef,
  description,
  category,
  estimatedMinutes,
  tags,
  onTitleChange,
  onDescriptionChange,
  onCategoryChange,
  onEstimatedMinutesChange,
  onTagAdd,
  onTagRemove,
}) => {
  const [pendingTag, setPendingTag] = useState('');

  const resolvedCategory = useMemo(
    () => (category && CATEGORY_OPTIONS.includes(category) ? category : CATEGORY_OPTIONS[0]),
    [category],
  );

  const submitPendingTag = () => {
    if (!pendingTag.trim()) return;
    onTagAdd(pendingTag.trim());
    setPendingTag('');
  };

  const handlePendingTagKeydown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitPendingTag();
    }
  };

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionIcon}>
          <HomeworkCircleInfoIcon size={16} />
        </span>
        <h2 className={styles.sectionTitle}>Основная информация</h2>
      </div>

      <div className={styles.fields}>
        <label className={styles.fieldLabel}>
          <span className={styles.fieldLabelTitle}>
            Название шаблона <span className={styles.requiredMark}>*</span>
          </span>
          <input
            type="text"
            ref={titleInputRef}
            className={`${styles.input} ${titleError ? styles.inputError : ''}`}
            placeholder="Например: Present Perfect Practice"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            data-validation-path={titleValidationPath}
            aria-invalid={Boolean(titleError)}
            aria-describedby={titleError ? 'template-title-error' : undefined}
          />
          {titleError ? (
            <span id="template-title-error" className={styles.fieldErrorText}>
              {titleError}
            </span>
          ) : null}
        </label>

        <label className={styles.fieldLabel}>
          Описание
          <textarea
            className={styles.textarea}
            placeholder="Краткое описание задания для учеников..."
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
          />
          <span className={styles.fieldHint}>Будет видно ученику при получении задания</span>
        </label>

        <div className={styles.splitGrid}>
          <label className={styles.fieldLabel}>
            Категория
            <span className={styles.selectWrap}>
              <select
                className={styles.select}
                value={resolvedCategory}
                onChange={(event) => onCategoryChange(event.target.value)}
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <HomeworkChevronDownIcon size={12} className={styles.selectIcon} />
            </span>
          </label>

          <label className={styles.fieldLabel}>
            Примерное время
            <span className={styles.minutesInputWrap}>
              <input
                type="number"
                className={styles.input}
                min={1}
                max={240}
                placeholder="15"
                value={estimatedMinutes ?? ''}
                onChange={(event) =>
                  onEstimatedMinutesChange(event.target.value ? Number(event.target.value) : null)
                }
              />
              <span className={styles.minutesSuffix}>мин</span>
            </span>
          </label>
        </div>

        <div className={styles.fieldLabel}>
          Теги
          <div className={styles.tagsWrap}>
            {tags.map((tag) => (
              <span key={tag} className={styles.tagChip}>
                {tag}
                <button
                  type="button"
                  className={styles.tagRemoveButton}
                  onClick={() => onTagRemove(tag)}
                  aria-label={`Удалить тег ${tag}`}
                >
                  <HomeworkXMarkIcon size={10} />
                </button>
              </span>
            ))}

            <div className={styles.tagEditor}>
              <input
                type="text"
                className={styles.tagInput}
                value={pendingTag}
                onChange={(event) => setPendingTag(event.target.value)}
                onKeyDown={handlePendingTagKeydown}
                placeholder="Новый тег"
              />
              <button type="button" className={styles.tagAddButton} onClick={submitPendingTag}>
                <HomeworkPlusIcon size={11} />
                Добавить
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

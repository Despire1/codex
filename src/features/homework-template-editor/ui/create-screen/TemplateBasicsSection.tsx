import { FC, KeyboardEvent, RefObject, useMemo, useState } from 'react';
import {
  HomeworkCircleInfoIcon,
  HomeworkFileArrowUpIcon,
  HomeworkLinkIcon,
  HomeworkListCheckIcon,
  HomeworkMicrophoneIcon,
  HomeworkPenToSquareIcon,
  HomeworkPlusIcon,
  HomeworkPuzzlePieceIcon,
  HomeworkXMarkIcon,
} from '../../../../shared/ui/icons/HomeworkFaIcons';
import { AssignmentSettingsSelect, type AssignmentSettingsSelectOption } from './AssignmentSettingsSelect';
import { HomeworkEditorTaskType } from '../../model/types';
import styles from './TemplateBasicsSection.module.css';

const CATEGORY_OPTIONS = ['Грамматика', 'Лексика', 'Speaking', 'Listening', 'Writing', 'Reading'];

interface TemplateBasicsSectionProps {
  titleLabel?: string;
  titlePlaceholder?: string;
  title: string;
  titleError?: string | null;
  titleValidationPath?: string;
  titleInputRef?: RefObject<HTMLInputElement | null>;
  description: string;
  category: string;
  estimatedMinutes: number | null;
  tags: string[];
  selectedType: HomeworkEditorTaskType;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onEstimatedMinutesChange: (value: number | null) => void;
  onTagAdd: (value: string) => void;
  onTagRemove: (value: string) => void;
  onTypeChange: (value: HomeworkEditorTaskType) => void;
}

const TYPE_OPTIONS: AssignmentSettingsSelectOption[] = [
  {
    value: 'TEST',
    label: 'Тест',
    description: 'Вопросы с автопроверкой или ручной проверкой',
    icon: <HomeworkListCheckIcon size={14} />,
  },
  {
    value: 'WRITTEN',
    label: 'Письменное',
    description: 'Текстовый ответ ученика',
    icon: <HomeworkPenToSquareIcon size={14} />,
  },
  {
    value: 'ORAL',
    label: 'Устное',
    description: 'Голосовой ответ',
    icon: <HomeworkMicrophoneIcon size={14} />,
  },
  {
    value: 'FILE',
    label: 'Файл',
    description: 'Документ, фото или вложение',
    icon: <HomeworkFileArrowUpIcon size={14} />,
  },
  {
    value: 'COMBO',
    label: 'Комбо',
    description: 'Тест и свободный ответ в одном задании',
    icon: <HomeworkPuzzlePieceIcon size={14} />,
  },
  {
    value: 'EXTERNAL',
    label: 'Внешняя ссылка',
    description: 'Материалы или платформа по ссылке',
    icon: <HomeworkLinkIcon size={14} />,
  },
];

export const TemplateBasicsSection: FC<TemplateBasicsSectionProps> = ({
  titleLabel = 'Название шаблона',
  titlePlaceholder = 'Например: Present Perfect Practice',
  title,
  titleError = null,
  titleValidationPath,
  titleInputRef,
  description,
  category,
  estimatedMinutes,
  tags,
  selectedType,
  onTitleChange,
  onDescriptionChange,
  onCategoryChange,
  onEstimatedMinutesChange,
  onTagAdd,
  onTagRemove,
  onTypeChange,
}) => {
  const [pendingTag, setPendingTag] = useState('');

  const resolvedCategory = useMemo(
    () => (category && CATEGORY_OPTIONS.includes(category) ? category : ''),
    [category],
  );
  const categoryOptions = useMemo(
    () => [
      { value: '', label: 'Без категории' },
      ...CATEGORY_OPTIONS.map((option) => ({ value: option, label: option })),
    ],
    [],
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
            {titleLabel} <span className={styles.requiredMark}>*</span>
          </span>
          <input
            type="text"
            ref={titleInputRef}
            className={`${styles.input} ${titleError ? styles.inputError : ''}`}
            placeholder={titlePlaceholder}
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
            <AssignmentSettingsSelect
              value={resolvedCategory}
              options={categoryOptions}
              placeholder="Без категории"
              ariaLabel="Выбор категории домашнего задания"
              compact
              onChange={onCategoryChange}
            />
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

        <div className={styles.metaRow}>
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

          <label className={styles.fieldLabel}>
            Тип задания
            <div className={styles.typeField}>
              <AssignmentSettingsSelect
                value={selectedType}
                options={TYPE_OPTIONS}
                placeholder="Выберите тип…"
                ariaLabel="Выбор типа домашнего задания"
                compact
                onChange={(nextValue) => onTypeChange(nextValue as HomeworkEditorTaskType)}
              />
            </div>
          </label>
        </div>
      </div>
    </section>
  );
};

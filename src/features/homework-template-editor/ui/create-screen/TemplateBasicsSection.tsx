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
  disabled?: boolean;
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
  assignmentTemplateId?: string;
  assignmentTemplateOptions?: ReadonlyArray<AssignmentSettingsSelectOption>;
  assignmentGroupId?: string;
  assignmentGroupOptions?: ReadonlyArray<AssignmentSettingsSelectOption>;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onEstimatedMinutesChange: (value: number | null) => void;
  onTagAdd: (value: string) => void;
  onTagRemove: (value: string) => void;
  onTypeChange: (value: HomeworkEditorTaskType) => void;
  onAssignmentTemplateChange?: (value: string) => void;
  onAssignmentGroupChange?: (value: string) => void;
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
  disabled = false,
  titleLabel = 'Название домашнего задания',
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
  assignmentTemplateId = '',
  assignmentTemplateOptions,
  assignmentGroupId = '',
  assignmentGroupOptions,
  onTitleChange,
  onDescriptionChange,
  onCategoryChange,
  onEstimatedMinutesChange,
  onTagAdd,
  onTagRemove,
  onTypeChange,
  onAssignmentTemplateChange,
  onAssignmentGroupChange,
}) => {
  const [pendingTag, setPendingTag] = useState('');

  const resolvedCategory = useMemo(() => (category && CATEGORY_OPTIONS.includes(category) ? category : ''), [category]);
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
            disabled={disabled}
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
            disabled={disabled}
            onChange={(event) => onDescriptionChange(event.target.value)}
          />
          <span className={styles.fieldHint}>Будет видно ученику при получении задания</span>
        </label>

        <div className={styles.metaPanel}>
          {assignmentTemplateOptions && onAssignmentTemplateChange ? (
            <div className={`${styles.metaCard} ${styles.metaCardFull}`}>
              <div className={styles.fieldLabel}>
                <span>Создать на основе домашки</span>
                <AssignmentSettingsSelect
                  value={assignmentTemplateId}
                  options={assignmentTemplateOptions}
                  placeholder={
                    assignmentTemplateOptions.length > 0
                      ? 'Выберите домашнее задание…'
                      : 'Нет доступных домашних заданий'
                  }
                  ariaLabel="Выбор домашнего задания"
                  compact
                  allowClear
                  disabled={disabled || assignmentTemplateOptions.length === 0}
                  onChange={onAssignmentTemplateChange}
                />
              </div>
            </div>
          ) : null}

          <div className={styles.metaGrid}>
            <div className={styles.metaCard}>
              <div className={styles.fieldLabel}>
                <span>Тип задания</span>
                <AssignmentSettingsSelect
                  value={selectedType}
                  options={TYPE_OPTIONS}
                  placeholder="Выберите тип…"
                  ariaLabel="Выбор типа домашнего задания"
                  compact
                  disabled={disabled}
                  onChange={(nextValue) => onTypeChange(nextValue as HomeworkEditorTaskType)}
                />
              </div>
            </div>

            <div className={styles.metaCard}>
              <div className={styles.fieldLabel}>
                <span>Категория</span>
                <AssignmentSettingsSelect
                  value={resolvedCategory}
                  options={categoryOptions}
                  placeholder="Без категории"
                  ariaLabel="Выбор категории домашнего задания"
                  compact
                  disabled={disabled}
                  onChange={onCategoryChange}
                />
              </div>
            </div>

            {assignmentGroupOptions && onAssignmentGroupChange ? (
              <div className={styles.metaCard}>
                <div className={styles.fieldLabel}>
                  <span>Группа домашних заданий</span>
                  <AssignmentSettingsSelect
                    value={assignmentGroupId}
                    options={assignmentGroupOptions}
                    placeholder="Без группы"
                    ariaLabel="Выбор группы домашних заданий"
                    compact
                    disabled={disabled}
                    onChange={onAssignmentGroupChange}
                  />
                </div>
              </div>
            ) : null}

            <div className={`${styles.metaCard} ${styles.metaCardCompact}`}>
              <label className={styles.fieldLabel}>
                Примерное время
                <span className={styles.minutesInputWrap}>
                  {/* TEA-277: read-only авто-расчёт. Override через отдельное поле БД будет
                      сделан в Варианте B (требует Prisma migration). */}
                  <input
                    type="number"
                    className={styles.input}
                    value={estimatedMinutes ?? ''}
                    readOnly
                    disabled
                    aria-readonly
                  />
                  <span className={styles.minutesSuffix}>мин</span>
                </span>
              </label>
            </div>

            <div className={`${styles.metaCard} ${styles.metaCardWide}`}>
              <div className={styles.fieldLabel}>
                Теги
                <div className={styles.tagsWrap}>
                  {tags.map((tag) => (
                    <span key={tag} className={styles.tagChip}>
                      {tag}
                      <button
                        type="button"
                        className={styles.tagRemoveButton}
                        disabled={disabled}
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
                      disabled={disabled}
                      onChange={(event) => setPendingTag(event.target.value)}
                      onKeyDown={handlePendingTagKeydown}
                      placeholder="Новый тег"
                    />
                    <button
                      type="button"
                      className={styles.tagAddButton}
                      onClick={submitPendingTag}
                      disabled={disabled}
                    >
                      <HomeworkPlusIcon size={11} />
                      Добавить
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

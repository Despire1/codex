import { KeyboardEvent as ReactKeyboardEvent, MouseEvent, useEffect, useMemo, useState } from 'react';
import { HomeworkAssignment, HomeworkTemplate } from '../../../../../entities/types';
import {
  HomeworkCheckIcon,
  HomeworkCircleInfoIcon,
  HomeworkClockIcon,
  HomeworkMagnifyingGlassIcon,
  HomeworkMicrophoneIcon,
  HomeworkPenToSquareIcon,
  HomeworkXMarkIcon,
} from '../../../../../shared/ui/icons/HomeworkFaIcons';
import { estimateHomeworkTemplateDurationMinutes } from '../../model/lib/templatePresentation';
import { GroupIconView } from '../../model/lib/groupIconView';
import {
  resolveGroupEditorColorLabel,
  resolveGroupEditorIconLabel,
} from '../../model/lib/groupEditorStyles';
import { GroupStylePickerModal } from './GroupStylePickerModal';
import styles from './GroupEditorModal.module.css';

type GroupEditorDraft = {
  title: string;
  description: string;
  iconKey: string;
  bgColor: string;
};

type GroupEditorModalProps = {
  open: boolean;
  mode: 'create' | 'edit';
  draft: GroupEditorDraft;
  templates: HomeworkTemplate[];
  assignments: HomeworkAssignment[];
  selectedTemplateIds: number[];
  selectedAssignmentIds: number[];
  submitting: boolean;
  deleteSubmitting: boolean;
  canDelete: boolean;
  onChangeTitle: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onChangeIconKey: (iconKey: string) => void;
  onChangeBgColor: (bgColor: string) => void;
  onToggleTemplate: (templateId: number) => void;
  onToggleAssignment: (assignmentId: number) => void;
  onClose: () => void;
  onSubmit: () => void;
  onDelete: () => void;
};

const formatCreatedAt = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(date);
};

const hasVoiceFlow = (template: HomeworkTemplate) =>
  template.blocks.some((block) => {
    if (block.type === 'STUDENT_RESPONSE') {
      return Boolean(block.allowAudio || block.allowVoice);
    }
    return false;
  });

const stopPropagation = (event: MouseEvent<HTMLElement>) => {
  event.stopPropagation();
};

const onSearchEscape = (
  event: ReactKeyboardEvent<HTMLInputElement>,
  setValue: (value: string) => void,
  onClose: () => void,
) => {
  if (event.key !== 'Escape') return;
  if ((event.currentTarget.value || '').trim().length > 0) {
    setValue('');
    return;
  }
  onClose();
};

export const GroupEditorModal = ({
  open,
  mode,
  draft,
  templates,
  assignments,
  selectedTemplateIds,
  selectedAssignmentIds,
  submitting,
  deleteSubmitting,
  canDelete,
  onChangeTitle,
  onChangeDescription,
  onChangeIconKey,
  onChangeBgColor,
  onToggleTemplate,
  onToggleAssignment,
  onClose,
  onSubmit,
  onDelete,
}: GroupEditorModalProps) => {
  const [activeTab, setActiveTab] = useState<'templates' | 'homework'>('templates');
  const [searchQuery, setSearchQuery] = useState('');
  const [styleModalOpen, setStyleModalOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setActiveTab('templates');
    setSearchQuery('');
    setStyleModalOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (styleModalOpen) {
        event.preventDefault();
        setStyleModalOpen(false);
        return;
      }
      onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, styleModalOpen, onClose]);

  const templateUsageMap = useMemo(() => {
    const map = new Map<number, number>();
    assignments.forEach((assignment) => {
      if (!assignment.templateId) return;
      map.set(assignment.templateId, (map.get(assignment.templateId) ?? 0) + 1);
    });
    return map;
  }, [assignments]);

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const visibleTemplates = useMemo(() => {
    const items = templates.filter((item) => !item.isArchived);
    if (!normalizedSearch) return items;
    return items.filter((template) => {
      const text = `${template.title} ${template.tags.join(' ')} ${template.subject ?? ''} ${template.level ?? ''}`.toLowerCase();
      return text.includes(normalizedSearch);
    });
  }, [templates, normalizedSearch]);

  const visibleAssignments = useMemo(() => {
    if (!normalizedSearch) return assignments;
    return assignments.filter((assignment) => {
      const text = `${assignment.title} ${assignment.studentName ?? ''} ${assignment.templateTitle ?? ''}`.toLowerCase();
      return text.includes(normalizedSearch);
    });
  }, [assignments, normalizedSearch]);

  if (!open) return null;

  const submitLabel =
    mode === 'create'
      ? submitting
        ? 'Создаем группу...'
        : 'Создать группу'
      : submitting
        ? 'Сохраняем...'
        : 'Сохранить изменения';

  return (
    <>
      <div className={styles.backdrop} onClick={onClose}>
        <div className={styles.modal} onClick={stopPropagation}>
          <div className={styles.header}>
            <div className={styles.headerText}>
              <h2 className={styles.title}>{mode === 'create' ? 'Создать группу' : 'Редактировать группу'}</h2>
              <p className={styles.subtitle}>Организуйте задания и шаблоны в одном месте</p>
            </div>
            <button type="button" className={styles.closeButton} aria-label="Закрыть" onClick={onClose}>
              <HomeworkXMarkIcon size={14} />
            </button>
          </div>

          <div className={styles.body}>
            <div className={styles.fields}>
              <div className={styles.nameRow}>
                <label className={styles.nameField}>
                  <span className={styles.label}>
                    Название группы <span className={styles.required}>*</span>
                  </span>
                  <input
                    type="text"
                    className={styles.input}
                    value={draft.title}
                    onChange={(event) => onChangeTitle(event.target.value)}
                    placeholder="Например: Грамматика, Speaking, Vocabulary"
                    maxLength={80}
                    autoFocus
                  />
                  <p className={styles.hint}>
                    <HomeworkCircleInfoIcon size={11} /> Обязательное поле
                  </p>
                </label>

                <div className={styles.iconField}>
                  <p className={styles.label}>Иконка</p>
                  <button
                    type="button"
                    className={styles.iconPreviewButton}
                    onClick={() => setStyleModalOpen(true)}
                    aria-label="Изменить стиль группы"
                  >
                    <span className={styles.iconPreview} style={{ backgroundColor: draft.bgColor }}>
                      <GroupIconView iconKey={draft.iconKey} size={22} />
                    </span>
                    <span className={styles.iconMeta}>
                      <span className={styles.iconMetaLabel}>{resolveGroupEditorIconLabel(draft.iconKey)}</span>
                      <span className={styles.iconMetaColor}>{resolveGroupEditorColorLabel(draft.bgColor)}</span>
                    </span>
                    <span className={styles.editStyleButton}>
                      <HomeworkPenToSquareIcon size={12} />
                    </span>
                  </button>
                </div>
              </div>

              <label className={styles.field}>
                <span className={styles.label}>
                  Описание группы <span className={styles.labelOptional}>(опционально)</span>
                </span>
                <textarea
                  className={styles.textarea}
                  value={draft.description}
                  onChange={(event) => onChangeDescription(event.target.value)}
                  placeholder="Краткое описание для чего эта группа..."
                  maxLength={280}
                />
              </label>
            </div>

            <div className={styles.itemsSection}>
              <label className={styles.label}>Добавить задания и шаблоны</label>
              <p className={styles.sectionHint}>Выберите сущности, которые войдут в группу сразу при создании</p>

              <div className={styles.pickerCard}>
                <div className={styles.tabsRow}>
                  <button
                    type="button"
                    className={`${styles.tabButton} ${activeTab === 'templates' ? styles.tabButtonActive : ''}`}
                    onClick={() => setActiveTab('templates')}
                  >
                    Шаблоны
                    <span className={styles.tabCounter}>{visibleTemplates.length}</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.tabButton} ${activeTab === 'homework' ? styles.tabButtonActive : ''}`}
                    onClick={() => setActiveTab('homework')}
                  >
                    Домашки
                    <span className={styles.tabCounter}>{visibleAssignments.length}</span>
                  </button>
                </div>

                <div className={styles.pickerBody}>
                  <label className={styles.searchField}>
                    <HomeworkMagnifyingGlassIcon size={12} className={styles.searchIcon} />
                    <input
                      type="search"
                      className={styles.searchInput}
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      onKeyDown={(event) => onSearchEscape(event, setSearchQuery, onClose)}
                      placeholder="Поиск по названию..."
                    />
                  </label>

                  <div className={styles.itemsList}>
                    {activeTab === 'templates'
                      ? visibleTemplates.map((template) => {
                          const isChecked = selectedTemplateIds.includes(template.id);
                          const hasVoice = hasVoiceFlow(template);
                          const duration = estimateHomeworkTemplateDurationMinutes(template);
                          const usage = templateUsageMap.get(template.id) ?? 0;
                          return (
                            <label
                              key={`template_${template.id}`}
                              className={`${styles.itemCard} ${isChecked ? styles.itemCardChecked : ''}`}
                            >
                              <input
                                type="checkbox"
                                className={styles.itemCheckbox}
                                checked={isChecked}
                                onChange={() => onToggleTemplate(template.id)}
                              />
                              <div className={styles.itemMain}>
                                <div className={styles.itemHead}>
                                  <div>
                                    <h4 className={styles.itemTitle}>{template.title}</h4>
                                    <p className={styles.itemDescription}>{template.subject || 'Шаблон домашнего задания'}</p>
                                  </div>
                                  <span className={styles.templateBadge}>Шаблон</span>
                                </div>
                                <div className={styles.itemMeta}>
                                  <span className={styles.itemMetaLine}>
                                    {hasVoice ? <HomeworkMicrophoneIcon size={11} /> : <HomeworkClockIcon size={11} />}
                                    {hasVoice ? 'Audio' : `${Math.max(1, duration)} мин`}
                                  </span>
                                  <span className={styles.itemMetaPositive}>
                                    Используется {usage} {usage === 1 ? 'раз' : usage >= 2 && usage <= 4 ? 'раза' : 'раз'}
                                  </span>
                                </div>
                              </div>
                            </label>
                          );
                        })
                      : visibleAssignments.map((assignment) => {
                          const isChecked = selectedAssignmentIds.includes(assignment.id);
                          return (
                            <label
                              key={`assignment_${assignment.id}`}
                              className={`${styles.itemCard} ${isChecked ? styles.itemCardChecked : ''}`}
                            >
                              <input
                                type="checkbox"
                                className={styles.itemCheckbox}
                                checked={isChecked}
                                onChange={() => onToggleAssignment(assignment.id)}
                              />
                              <div className={styles.itemMain}>
                                <div className={styles.itemHead}>
                                  <div>
                                    <h4 className={styles.itemTitle}>{assignment.title}</h4>
                                    <p className={styles.itemDescription}>
                                      {assignment.templateTitle || assignment.studentName || 'Домашнее задание'}
                                    </p>
                                  </div>
                                  <span className={styles.homeworkBadge}>Домашка</span>
                                </div>
                                <div className={styles.itemMeta}>
                                  <span className={styles.itemMetaLine}>
                                    <HomeworkClockIcon size={11} />
                                    {assignment.deadlineAt ? formatCreatedAt(assignment.deadlineAt) : 'Без дедлайна'}
                                  </span>
                                  <span className={styles.itemMetaMuted}>Создано {formatCreatedAt(assignment.createdAt)}</span>
                                </div>
                              </div>
                            </label>
                          );
                        })}

                    {activeTab === 'templates' && visibleTemplates.length === 0 ? (
                      <div className={styles.emptyState}>Шаблоны не найдены</div>
                    ) : null}
                    {activeTab === 'homework' && visibleAssignments.length === 0 ? (
                      <div className={styles.emptyState}>Домашки не найдены</div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.footer}>
            <div className={styles.footerLeft}>
              {canDelete ? (
                <button
                  type="button"
                  className={styles.deleteButton}
                  disabled={deleteSubmitting || submitting}
                  onClick={onDelete}
                >
                  {deleteSubmitting ? 'Удаляем...' : 'Удалить группу'}
                </button>
              ) : null}
              <button type="button" className={styles.cancelButton} onClick={onClose}>
                Отмена
              </button>
            </div>
            <button
              type="button"
              className={styles.submitButton}
              disabled={submitting || !draft.title.trim()}
              onClick={onSubmit}
            >
              <HomeworkCheckIcon size={12} className={styles.submitIcon} />
              {submitLabel}
            </button>
          </div>
        </div>
      </div>

      <GroupStylePickerModal
        open={styleModalOpen}
        iconKey={draft.iconKey}
        bgColor={draft.bgColor}
        onClose={() => setStyleModalOpen(false)}
        onSelectIcon={onChangeIconKey}
        onSelectColor={onChangeBgColor}
      />
    </>
  );
};

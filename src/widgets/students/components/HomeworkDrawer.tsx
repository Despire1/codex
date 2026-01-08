import { DragEvent, FC } from 'react';
import { ru } from 'date-fns/locale';
import {
  AddOutlinedIcon,
  CloseIcon,
  EditOutlinedIcon,
  ExpandLessOutlinedIcon,
  ExpandMoreOutlinedIcon,
  MoreHorizIcon,
  ReplayOutlinedIcon,
} from '../../../icons/MaterialIcons';
import { Homework, HomeworkAttachment, HomeworkStatus } from '../../../entities/types';
import controls from '../../../shared/styles/controls.module.css';
import styles from '../StudentsSection.module.css';
import { HomeworkDraft, HomeworkStatusInfo, SelectedStudent } from '../types';
import { useTimeZone } from '../../../shared/lib/timezoneContext';
import { formatInTimeZone, toUtcDateFromDate } from '../../../shared/lib/timezoneDates';

interface HomeworkDrawerProps {
  activeHomework: Homework;
  selectedStudent: SelectedStudent | null;
  drawerMode: 'view' | 'edit';
  isDrawerVisible: boolean;
  isDrawerMenuOpen: boolean;
  isSaving: boolean;
  saveError: string | null;
  hasUnsavedChanges: boolean;
  shouldShowDescriptionToggle: boolean;
  isDescriptionExpanded: boolean;
  activeStatusInfo: HomeworkStatusInfo | null;
  resolvedTimeSpentMinutes: number | null;
  homeworkDraft: HomeworkDraft;
  attachmentPreview: HomeworkAttachment | null;
  showUnsavedConfirm: boolean;
  onClose: () => void;
  onToggleDrawerMenu: () => void;
  onStartEdit: () => void;
  onMoveToDraft: (homeworkId: number) => void;
  onSendHomework?: (homeworkId: number) => void;
  onToggleDescription: () => void;
  onDraftChange: (draft: HomeworkDraft) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onOpenAttachmentPreview: (attachment: HomeworkAttachment) => void;
  onCloseAttachmentPreview: () => void;
  onAddAttachments: (files: File[]) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onToggleHomework: (homeworkId: number) => void;
  onRemindHomework: (homeworkId: number) => void;
  onSaveDraft: () => void | Promise<boolean>;
  onDiscardChanges: () => void;
  onResetDraft: () => void;
  onKeepEditing: () => void;
  onConfirmSaveAndClose: () => void | Promise<void>;
  formatTimeSpentMinutes: (minutes?: number | null) => string;
  formatCompletionMoment: (completedAt?: string | null) => string;
  getStatusLabel: (status: HomeworkStatus) => string;
}

export const HomeworkDrawer: FC<HomeworkDrawerProps> = ({
  activeHomework,
  selectedStudent,
  drawerMode,
  isDrawerVisible,
  isDrawerMenuOpen,
  isSaving,
  saveError,
  hasUnsavedChanges,
  shouldShowDescriptionToggle,
  isDescriptionExpanded,
  activeStatusInfo,
  resolvedTimeSpentMinutes,
  homeworkDraft,
  attachmentPreview,
  showUnsavedConfirm,
  onClose,
  onToggleDrawerMenu,
  onStartEdit,
  onMoveToDraft,
  onSendHomework,
  onToggleDescription,
  onDraftChange,
  onRemoveAttachment,
  onOpenAttachmentPreview,
  onCloseAttachmentPreview,
  onAddAttachments,
  onDrop,
  onToggleHomework,
  onRemindHomework,
  onSaveDraft,
  onDiscardChanges,
  onResetDraft,
  onKeepEditing,
  onConfirmSaveAndClose,
  formatTimeSpentMinutes,
  formatCompletionMoment,
  getStatusLabel,
}) => {
  const timeZone = useTimeZone();
  return (
    <>
      <button
        className={`${styles.drawerScrim} ${isDrawerVisible ? styles.scrimVisible : ''}`}
        aria-label="Закрыть карточку ДЗ"
        onClick={onClose}
      />
      <aside className={`${styles.homeworkDrawer} ${isDrawerVisible ? styles.drawerOpen : ''}`} aria-live="polite">
        <div className={styles.drawerHeaderSticky}>
          <div>
            <div className={styles.drawerTitle}>{selectedStudent?.link.customName}</div>
            <div className={styles.drawerSubtitle}>@{selectedStudent?.username || 'нет'} • #{activeHomework.id}</div>
          </div>
          <div className={styles.drawerHeaderActions}>
            {onSendHomework && activeStatusInfo?.status === 'DRAFT' && (
              <button
                className={controls.secondaryButton}
                onClick={() => onSendHomework(activeHomework.id)}
                disabled={isSaving}
              >
                Отправить ученику
              </button>
            )}
            {drawerMode === 'view' && (
              <div className={styles.moreActionsWrapper}>
                <button
                  className={controls.iconButton}
                  aria-label="Дополнительные действия"
                  onClick={onToggleDrawerMenu}
                >
                  <MoreHorizIcon width={18} height={18} />
                </button>
                {isDrawerMenuOpen && (
                  <div className={styles.moreMenu}>
                    <button
                      aria-label="Редактировать"
                      onClick={onStartEdit}
                    >
                      Редактировать
                    </button>
                    {activeStatusInfo?.status !== 'DRAFT' && (
                      <button aria-label="В черновик" onClick={() => onMoveToDraft(activeHomework.id)}>
                        В черновик
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            <button className={controls.iconButton} aria-label="Закрыть" onClick={onClose}>
              <CloseIcon width={18} height={18} />
            </button>
          </div>
        </div>

        <div className={styles.drawerScroll} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <div className={styles.drawerBadgeRow}>
            {activeStatusInfo && (
              <span
                className={`${styles.drawerBadge} ${
                  activeStatusInfo.status === 'DONE'
                    ? styles.badgeSuccess
                    : activeStatusInfo.status === 'IN_PROGRESS'
                      ? styles.badgeWarning
                      : activeStatusInfo.status === 'ASSIGNED'
                        ? styles.badgeInfo
                        : styles.badgeMuted
                }`}
              >
                {getStatusLabel(activeStatusInfo.status)}
              </span>
            )}
            {activeStatusInfo?.isOverdue && activeStatusInfo.status !== 'DONE' && (
              <span className={`${styles.drawerBadge} ${styles.badgeDanger}`}>Просрочено</span>
            )}
            <span className={styles.drawerBadge}>
              {homeworkDraft.deadline
                ? `Дедлайн: ${formatInTimeZone(toUtcDateFromDate(homeworkDraft.deadline, timeZone), 'd MMM', {
                    locale: ru,
                    timeZone,
                  })}`
                : 'Без дедлайна'}
            </span>
            <span className={styles.drawerBadge}>
              {resolvedTimeSpentMinutes !== null
                ? `Время: ${formatTimeSpentMinutes(resolvedTimeSpentMinutes)}`
                : 'Время не указано'}
            </span>
            <span className={styles.drawerBadge}>
              {activeHomework.completedAt
                ? `Выполнено: ${formatCompletionMoment(activeHomework.completedAt)}`
                : 'Не выполнено'}
            </span>
            {hasUnsavedChanges && drawerMode === 'edit' && (
              <span className={`${styles.drawerBadge} ${styles.badgeMuted}`}>Есть несохранённые изменения</span>
            )}
          </div>

          <div className={styles.drawerSection}>
            <div className={styles.sectionHeader}>
              <p className={styles.priceLabel}>Описание</p>
              {drawerMode === 'view' && (
                <button className={styles.linkButton} onClick={onStartEdit}>
                  <EditOutlinedIcon width={16} height={16} />
                </button>
              )}
            </div>
            {drawerMode === 'edit' ? (
              <>
                <textarea
                  className={controls.input}
                  value={homeworkDraft.text}
                  onChange={(e) => onDraftChange({ ...homeworkDraft, text: e.target.value })}
                  placeholder="Введите текст домашнего задания..."
                  rows={8}
                />
                <div className={styles.inlineFields}>
                  <label className={styles.inputLabel}>
                    Дедлайн
                    <input
                      className={controls.input}
                      type="date"
                      value={homeworkDraft.deadline}
                      onChange={(e) => onDraftChange({ ...homeworkDraft, deadline: e.target.value })}
                    />
                  </label>
                  <label className={styles.inputLabel}>
                    Статус
                    <select
                      className={controls.input}
                      value={homeworkDraft.status}
                      onChange={(e) => onDraftChange({ ...homeworkDraft, status: e.target.value as HomeworkStatus })}
                    >
                      <option value="DRAFT">Черновик</option>
                      <option value="ASSIGNED">Назначено</option>
                      <option value="IN_PROGRESS">В работе</option>
                      <option value="DONE">Выполнено</option>
                    </select>
                  </label>
                  <label className={styles.inputLabel}>
                    Время выполнения (мин)
                    <input
                      className={controls.input}
                      type="number"
                      min={0}
                      step={5}
                      value={homeworkDraft.timeSpentMinutes}
                      onChange={(e) => onDraftChange({ ...homeworkDraft, timeSpentMinutes: e.target.value })}
                      placeholder="Например, 45"
                    />
                    <span className={styles.subtleLabel}>Сколько минут заняло выполнение</span>
                  </label>
                </div>
                {saveError && <div className={styles.errorText}>{saveError}</div>}
              </>
            ) : (
              <div className={styles.descriptionBlock}>
                <p
                  className={`${styles.drawerText} ${
                    !isDescriptionExpanded && shouldShowDescriptionToggle ? styles.clampedText : ''
                  }`}
                >
                  {activeHomework.text}
                </p>
                {shouldShowDescriptionToggle && (
                  <button
                    className={styles.expandButton}
                    onClick={onToggleDescription}
                    aria-expanded={isDescriptionExpanded}
                    type="button"
                  >
                    {isDescriptionExpanded ? (
                      <>
                        <ExpandLessOutlinedIcon width={16} height={16} /> Свернуть
                      </>
                    ) : (
                      <>
                        <ExpandMoreOutlinedIcon width={16} height={16} /> Развернуть
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className={styles.drawerSection}>
            <div className={styles.sectionHeader}>
              <p className={styles.priceLabel}>Фото</p>
              <span className={styles.subtleLabel}>PNG/JPG/WebP, до 10MB, до 5 фото</span>
              {drawerMode !== 'edit' && (
                <button className={styles.linkButton} onClick={onStartEdit}>
                  <AddOutlinedIcon width={18} height={18} />
                </button>
              )}
            </div>
            {drawerMode === 'edit' && (
              <div className={styles.attachmentControls}>
                <label className={controls.secondaryButton}>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    className={styles.hiddenInput}
                    onChange={(event) => {
                      const files = Array.from(event.target.files || []);
                      onAddAttachments(files as File[]);
                      event.target.value = '';
                    }}
                  />
                  <span className={styles.iconLeading} aria-hidden>
                    <AddOutlinedIcon width={16} height={16} />
                  </span>
                  Добавить фото
                </label>
                <div className={styles.dropHint}>Перетащите или вставьте фото сюда</div>
              </div>
            )}

            <div className={styles.attachmentsGrid}>
              {(homeworkDraft.attachments ?? []).map((attachment) => (
                <div key={attachment.id} className={styles.attachmentCard}>
                  {drawerMode === 'edit' && (
                    <button
                      className={styles.attachmentRemove}
                      aria-label="Удалить"
                      onClick={() => onRemoveAttachment(attachment.id)}
                    >
                      ×
                    </button>
                  )}
                  <button className={styles.attachmentThumb} onClick={() => onOpenAttachmentPreview(attachment)}>
                    <img src={attachment.url} alt={attachment.fileName} />
                  </button>
                  <div className={styles.attachmentMeta}>
                    <span className={styles.attachmentName}>{attachment.fileName}</span>
                    <span className={styles.attachmentSize}>{Math.round(attachment.size / 1024)} кб</span>
                  </div>
                </div>
              ))}
              {!(homeworkDraft.attachments ?? []).length && (
                <div className={styles.emptyState}>Пока нет вложений</div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.drawerFooter}>
          {drawerMode === 'view' ? (
            <>
              <button className={controls.primaryButton} onClick={() => onToggleHomework(activeHomework.id)}>
                {activeHomework.isDone ? 'Вернуть в активные' : 'Отметить выполненным'}
              </button>
              <button className={controls.secondaryButton} onClick={() => onRemindHomework(activeHomework.id)}>
                Напомнить
              </button>
            </>
          ) : (
            <>
              <button className={controls.primaryButton} onClick={onSaveDraft} disabled={isSaving}>
                {isSaving ? 'Сохранение…' : 'Сохранить'}
              </button>
              <button className={controls.secondaryButton} onClick={onDiscardChanges} disabled={isSaving}>
                Отмена
              </button>
              {hasUnsavedChanges && (
                <button className={controls.secondaryButton} onClick={onResetDraft} disabled={isSaving}>
                  <ReplayOutlinedIcon width={16} height={16} /> Сбросить
                </button>
              )}
            </>
          )}
        </div>
      </aside>

      {attachmentPreview && (
        <div className={styles.modalOverlay} onClick={onCloseAttachmentPreview}>
          <div className={styles.previewDialog} onClick={(e) => e.stopPropagation()}>
            <img src={attachmentPreview.url} alt={attachmentPreview.fileName} />
            <div className={styles.previewFooter}>
              <span>{attachmentPreview.fileName}</span>
              <button className={controls.secondaryButton} onClick={onCloseAttachmentPreview}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {showUnsavedConfirm && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.priceLabel}>Несохранённые изменения</div>
                <div className={styles.subtleLabel}>Сохранить перед закрытием?</div>
              </div>
              <button className={controls.iconButton} aria-label="Закрыть" onClick={onKeepEditing}>
                <CloseIcon width={18} height={18} />
              </button>
            </div>
            <div className={styles.modalBody}>У вас есть несохранённые изменения. Сохранить их?</div>
            <div className={styles.modalFooter}>
              <button className={controls.secondaryButton} onClick={onDiscardChanges}>
                Не сохранять
              </button>
              <button className={controls.secondaryButton} onClick={onKeepEditing}>
                Отмена
              </button>
              <button className={controls.primaryButton} onClick={onConfirmSaveAndClose} disabled={isSaving}>
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

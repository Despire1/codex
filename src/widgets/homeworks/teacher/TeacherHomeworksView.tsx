import { FC, useMemo, useState } from 'react';
import controls from '../../../shared/styles/controls.module.css';
import styles from '../HomeworksSection.module.css';
import { TeacherHomeworksViewModel } from '../types';
import {
  ASSIGNMENT_STATUS_LABELS,
  SEND_MODE_LABELS,
  TEACHER_ASSIGNMENT_BUCKETS,
} from '../../../entities/homework-assignment/model/lib/assignmentBuckets';
import viewStyles from './TeacherHomeworksView.module.css';
import { HomeworkAssignModal } from '../../../features/homework-assign/ui/HomeworkAssignModal';
import {
  createInitialTemplateEditorDraft,
  createTemplateEditorDraftFromTemplate,
} from '../../../features/homework-template-editor/model/lib/blocks';
import { HomeworkTemplateEditorDraft } from '../../../features/homework-template-editor/model/types';
import { HomeworkTemplateEditorModal } from '../../../features/homework-template-editor/ui/HomeworkTemplateEditorModal';
import { describeTemplateBlocks } from '../../../entities/homework-template/model/lib/describeTemplateBlocks';
import { HomeworkTemplate } from '../../../entities/types';
import { HomeworkReviewModal } from '../../../features/homework-review/ui/HomeworkReviewModal';

const formatDeadline = (deadlineAt?: string | null) => {
  if (!deadlineAt) return 'Без дедлайна';
  const date = new Date(deadlineAt);
  if (Number.isNaN(date.getTime())) return 'Без дедлайна';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const isSendNowAvailable = (status: string) => status === 'DRAFT' || status === 'SCHEDULED';

export const TeacherHomeworksView: FC<TeacherHomeworksViewModel> = ({
  assignments,
  templates,
  students,
  summary,
  activeBucket,
  selectedStudentId,
  deadlineFrom,
  deadlineTo,
  showArchivedTemplates,
  loadingAssignments,
  loadingTemplates,
  loadingSummary,
  loadingStudents,
  assignmentsError,
  templatesError,
  summaryError,
  studentsError,
  submittingTemplate,
  submittingAssignment,
  reviewAssignment,
  reviewSubmissions,
  reviewLoading,
  reviewSubmitting,
  onBucketChange,
  onSelectedStudentIdChange,
  onDeadlineFromChange,
  onDeadlineToChange,
  onShowArchivedTemplatesChange,
  onOpenCreateTemplateScreen,
  onUpdateTemplate,
  onDuplicateTemplate,
  onArchiveTemplate,
  onCreateAssignment,
  onSendAssignmentNow,
  onOpenReview,
  onCloseReview,
  onSubmitReview,
  onRefresh,
}) => {
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<HomeworkTemplate | null>(null);
  const [templateDraft, setTemplateDraft] = useState<HomeworkTemplateEditorDraft>(createInitialTemplateEditorDraft());
  const studentsById = useMemo(() => new Map(students.map((item) => [item.id, item.name])), [students]);

  const countsByBucket = useMemo(
    () => ({
      draft: summary.draftCount,
      sent: summary.sentCount,
      review: summary.reviewCount,
      reviewed: summary.reviewedCount,
      overdue: summary.overdueCount,
    }),
    [summary.draftCount, summary.overdueCount, summary.reviewCount, summary.reviewedCount, summary.sentCount],
  );

  const openEditTemplateModal = (template: HomeworkTemplate) => {
    setEditingTemplate(template);
    setTemplateDraft(createTemplateEditorDraftFromTemplate(template));
    setIsTemplateModalOpen(true);
  };

  const submitTemplateEditor = async () => {
    const payload = {
      title: templateDraft.title,
      tags: templateDraft.tagsText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      subject: templateDraft.subject.trim() || null,
      level: templateDraft.level.trim() || null,
      blocks: templateDraft.blocks,
    };
    if (!editingTemplate) return false;
    return onUpdateTemplate(editingTemplate.id, payload);
  };

  return (
    <section className={styles.page}>
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>На проверке</div>
          <div className={styles.kpiValue}>{summary.reviewCount}</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Просрочено</div>
          <div className={styles.kpiValue}>{summary.overdueCount}</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Шаблонов</div>
          <div className={styles.kpiValue}>{templates.length}</div>
        </div>
      </div>

      <div className={viewStyles.actionBar}>
        <button type="button" className={controls.primaryButton} onClick={onOpenCreateTemplateScreen}>
          Создать шаблон
        </button>
        <button
          type="button"
          className={controls.secondaryButton}
          onClick={() => setIsAssignmentModalOpen(true)}
          disabled={!students.length}
        >
          Выдать домашку
        </button>
        {!students.length ? <div className={viewStyles.inlineHint}>Нет учеников для выдачи. Добавь ученика.</div> : null}
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>Выданные домашки</h3>
          <button type="button" className={controls.secondaryButton} onClick={onRefresh}>
            Обновить
          </button>
        </div>

        <div className={viewStyles.tabs}>
          {TEACHER_ASSIGNMENT_BUCKETS.map((bucket) => (
            <button
              key={bucket.id}
              type="button"
              className={`${viewStyles.tab} ${activeBucket === bucket.id ? viewStyles.tabActive : ''}`}
              onClick={() => onBucketChange(bucket.id)}
            >
              {bucket.label}
              <span className={viewStyles.counter}>
                {countsByBucket[bucket.id]}
              </span>
            </button>
          ))}
        </div>

        <div className={viewStyles.inlineControls}>
          <select
            className={`${controls.input} ${viewStyles.select}`}
            value={selectedStudentId ? String(selectedStudentId) : ''}
            onChange={(event) => onSelectedStudentIdChange(event.target.value ? Number(event.target.value) : null)}
            disabled={loadingStudents}
          >
            <option value="">Все ученики</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            className={`${controls.input} ${viewStyles.dateInput}`}
            value={deadlineFrom}
            onChange={(event) => onDeadlineFromChange(event.target.value)}
          />
          <input
            type="date"
            className={`${controls.input} ${viewStyles.dateInput}`}
            value={deadlineTo}
            onChange={(event) => onDeadlineToChange(event.target.value)}
          />
        </div>

        {assignmentsError ? <div className={viewStyles.error}>{assignmentsError}</div> : null}
        {summaryError ? <div className={viewStyles.error}>{summaryError}</div> : null}
        {studentsError ? <div className={viewStyles.error}>{studentsError}</div> : null}
        {loadingAssignments || loadingSummary ? <div className={styles.empty}>Загрузка…</div> : null}

        {!loadingAssignments && assignments.length === 0 ? (
          <div className={styles.empty}>По выбранным фильтрам домашних заданий нет</div>
        ) : null}

        {!loadingAssignments && assignments.length > 0 ? (
          <div className={styles.list}>
            {assignments.map((assignment) => (
              <article key={assignment.id} className={styles.assignmentCard}>
                <div className={styles.assignmentTitle}>{assignment.title}</div>
                <div className={styles.assignmentMeta}>Ученик: {studentsById.get(assignment.studentId) ?? `#${assignment.studentId}`}</div>
                <div className={styles.assignmentMeta}>Статус: {ASSIGNMENT_STATUS_LABELS[assignment.status]}</div>
                <div className={styles.assignmentMeta}>Отправка: {SEND_MODE_LABELS[assignment.sendMode]}</div>
                <div className={styles.assignmentMeta}>Дедлайн: {formatDeadline(assignment.deadlineAt)}</div>
                {assignment.latestSubmissionAttemptNo ? (
                  <div className={styles.assignmentMeta}>Попытка: #{assignment.latestSubmissionAttemptNo}</div>
                ) : null}
                <div className={styles.cardActions}>
                  {isSendNowAvailable(assignment.status) ? (
                    <button
                      type="button"
                      className={controls.secondaryButton}
                      onClick={() => {
                        void onSendAssignmentNow(assignment);
                      }}
                    >
                      Отправить сейчас
                    </button>
                  ) : null}
                  {assignment.status === 'SUBMITTED' ? (
                    <button
                      type="button"
                      className={controls.secondaryButton}
                      onClick={() => onOpenReview(assignment)}
                    >
                      Проверить
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>Шаблоны</h3>
          <label className={viewStyles.checkboxLabel}>
            <input
              type="checkbox"
              checked={showArchivedTemplates}
              onChange={(event) => onShowArchivedTemplatesChange(event.target.checked)}
            />
            Показать архив
          </label>
        </div>

        {templatesError ? <div className={viewStyles.error}>{templatesError}</div> : null}
        {loadingTemplates ? <div className={styles.empty}>Загрузка…</div> : null}
        {!loadingTemplates && templates.length === 0 ? <div className={styles.empty}>Шаблоны не найдены</div> : null}

        {!loadingTemplates && templates.length > 0 ? (
          <div className={styles.list}>
            {templates.map((template) => {
              const described = describeTemplateBlocks(template.blocks);
              return (
                <article key={template.id} className={styles.assignmentCard}>
                  <div className={viewStyles.templateHeader}>
                    <div className={styles.assignmentTitle}>{template.title}</div>
                    <div className={viewStyles.templateActions}>
                      <button type="button" className={controls.smallButton} onClick={() => openEditTemplateModal(template)}>
                        Редактировать
                      </button>
                      <button
                        type="button"
                        className={controls.smallButton}
                        onClick={() => {
                          void onDuplicateTemplate(template);
                        }}
                      >
                        Дублировать
                      </button>
                      {!template.isArchived ? (
                        <button
                          type="button"
                          className={controls.smallButton}
                          onClick={() => {
                            void onArchiveTemplate(template);
                          }}
                        >
                          Удалить
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className={styles.assignmentMeta}>Обновлен: {formatDeadline(template.updatedAt)}</div>
                  <div className={styles.assignmentMeta}>
                    Теги: {template.tags.length ? template.tags.join(', ') : '—'}
                  </div>
                  <div className={viewStyles.blockList}>
                    {described.items.map((item) => (
                      <span key={item.id} className={viewStyles.blockChip}>
                        {item.title}
                        {item.details ? `: ${item.details}` : ''}
                      </span>
                    ))}
                  </div>
                  {described.firstTextPreview ? <div className={viewStyles.preview}>{described.firstTextPreview}</div> : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </div>

      <HomeworkTemplateEditorModal
        open={isTemplateModalOpen}
        mode="edit"
        draft={templateDraft}
        submitting={submittingTemplate}
        onDraftChange={setTemplateDraft}
        onSubmit={submitTemplateEditor}
        onClose={() => {
          setIsTemplateModalOpen(false);
          setEditingTemplate(null);
        }}
      />

      <HomeworkAssignModal
        open={isAssignmentModalOpen}
        templates={templates.filter((item) => !item.isArchived)}
        students={students}
        submitting={submittingAssignment}
        defaultStudentId={selectedStudentId}
        onSubmit={onCreateAssignment}
        onClose={() => setIsAssignmentModalOpen(false)}
      />

      <HomeworkReviewModal
        open={Boolean(reviewAssignment)}
        assignment={reviewAssignment}
        submissions={reviewSubmissions}
        loading={reviewLoading}
        submitting={reviewSubmitting}
        onClose={onCloseReview}
        onSubmitReview={onSubmitReview}
      />
    </section>
  );
};

import { FC, useEffect, useMemo, useState } from 'react';
import controls from '../../../shared/styles/controls.module.css';
import styles from './TeacherHomeworksView.module.css';
import { TeacherBulkAction, TeacherHomeworksViewModel } from '../types';
import { HomeworkAssignModal } from '../../../features/homework-assign/ui/HomeworkAssignModal';
import { HomeworkAssignment, HomeworkTemplate } from '../../../entities/types';
import { HomeworkReviewModal } from '../../../features/homework-review/ui/HomeworkReviewModal';
import { Modal } from '../../../shared/ui/Modal/Modal';
import { loadStoredCreateTemplateDraftSummary } from '../../../features/homework-template-editor/model/lib/createTemplateDraftStorage';
import {
  HomeworkAlignLeftIcon,
  HomeworkBellRegularIcon,
  HomeworkBookmarkRegularIcon,
  HomeworkBoltIcon,
  HomeworkChevronDownIcon,
  HomeworkCircleExclamationIcon,
  HomeworkFilePdfIcon,
  HomeworkFilterIcon,
  HomeworkGearIcon,
  HomeworkLayerGroupIcon,
  HomeworkLinkIcon,
  HomeworkListCheckIcon,
  HomeworkMicrophoneIcon,
  HomeworkRobotIcon,
  HomeworkRotateRightIcon,
  HomeworkStarIcon,
  HomeworkStarRegularIcon,
} from '../../../shared/ui/icons/HomeworkFaIcons';
import {
  AutoCheckBadge,
  formatAssignmentStatus,
  resolveAssignmentAutoCheckBadge,
  resolveAssignmentDeadlineMeta,
  resolveAssignmentProblemBadges,
  resolveAssignmentResponseMeta,
} from './model/lib/assignmentPresentation';
import {
  estimateHomeworkTemplateDurationMinutes,
  formatHomeworkTemplateDuration,
  isHomeworkTemplateFavorite,
  resolveHomeworkTemplateCategory,
  resolveHomeworkTemplatePreview,
} from './model/lib/templatePresentation';

const TAB_LABELS: Record<TeacherHomeworksViewModel['activeTab'], string> = {
  all: 'Все',
  inbox: 'Inbox',
  draft: 'Черновики',
  scheduled: 'Запланировано',
  in_progress: 'В работе',
  review: 'На проверке',
  closed: 'Закрыто',
  overdue: 'Просрочено',
};

const SORT_LABELS: Array<{ id: TeacherHomeworksViewModel['sortBy']; label: string }> = [
  { id: 'urgency', label: 'По срочности' },
  { id: 'deadline', label: 'По дедлайну' },
  { id: 'student', label: 'По ученику' },
  { id: 'updated', label: 'По обновлению' },
  { id: 'created', label: 'По созданию' },
];

const BULK_ACTION_LABELS: Array<{ id: TeacherBulkAction; label: string }> = [
  { id: 'SEND_NOW', label: 'Отправить сейчас' },
  { id: 'REMIND', label: 'Напомнить' },
  { id: 'MOVE_TO_DRAFT', label: 'Перевести в черновики' },
  { id: 'DELETE', label: 'Удалить' },
];

const ASSIGNMENT_SKELETON_ROWS = Array.from({ length: 6 }, (_, index) => index);

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const getStudentInitials = (name: string) => {
  const cleanName = name.trim();
  if (!cleanName) return 'У';
  const parts = cleanName.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
};

const needsAssignmentReview = (assignment: HomeworkAssignment) =>
  assignment.status === 'SUBMITTED' ||
  assignment.status === 'IN_REVIEW' ||
  assignment.status === 'RETURNED' ||
  (assignment.problemFlags ?? []).includes('SUBMITTED') ||
  (assignment.problemFlags ?? []).includes('IN_REVIEW');

const resolveStatusTone = (assignment: HomeworkAssignment) => {
  if (assignment.hasConfigError) return 'config';
  if (assignment.isOverdue || assignment.status === 'OVERDUE') return 'overdue';
  if (assignment.status === 'SUBMITTED') return 'submitted';
  if (assignment.status === 'IN_REVIEW') return 'review';
  if (assignment.status === 'RETURNED') return 'returned';
  if (assignment.status === 'REVIEWED') return 'reviewed';
  if (assignment.status === 'SCHEDULED') return 'scheduled';
  if (assignment.status === 'DRAFT') return 'draft';
  return 'normal';
};

type ResponseVisual = {
  kind: 'empty' | 'icons';
  emptyText?: string;
  icons?: Array<{ id: string; kind: 'text' | 'file' | 'voice' | 'test'; tone: 'slate' | 'blue' | 'green' | 'indigo' }>;
  autoCheckBadge?: AutoCheckBadge | null;
};

const resolveResponseVisual = (assignment: HomeworkAssignment): ResponseVisual => {
  if (assignment.hasConfigError) {
    return { kind: 'empty', emptyText: '-' };
  }
  if (!assignment.latestSubmissionStatus) {
    return { kind: 'empty', emptyText: 'Нет ответа' };
  }

  const autoCheckBadge = resolveAssignmentAutoCheckBadge(assignment);
  if (autoCheckBadge) {
    return {
      kind: 'icons',
      icons: [{ id: 'test', kind: 'test', tone: 'indigo' }],
      autoCheckBadge,
    };
  }

  if (assignment.status === 'RETURNED') {
    return {
      kind: 'icons',
      icons: [{ id: 'voice', kind: 'voice', tone: 'green' }],
    };
  }

  if (assignment.latestSubmissionStatus === 'SUBMITTED' || assignment.latestSubmissionStatus === 'REVIEWED') {
    return {
      kind: 'icons',
      icons: [
        { id: 'text', kind: 'text', tone: 'slate' },
        { id: 'file', kind: 'file', tone: 'blue' },
      ],
    };
  }

  if (assignment.latestSubmissionStatus === 'DRAFT') {
    return {
      kind: 'icons',
      icons: [{ id: 'text', kind: 'text', tone: 'slate' }],
    };
  }

  return { kind: 'empty', emptyText: 'Нет ответа' };
};

const resolveStatusLabel = (assignment: HomeworkAssignment) => {
  if (assignment.hasConfigError) return 'Настроить';
  if (assignment.status === 'RETURNED') return 'Исправлено';
  return formatAssignmentStatus(assignment);
};

const resolveStatusIcon = (assignment: HomeworkAssignment) => {
  if (assignment.hasConfigError) return <HomeworkGearIcon size={12} className={styles.statusIcon} />;
  if (assignment.isOverdue || assignment.status === 'OVERDUE') {
    return <HomeworkCircleExclamationIcon size={12} className={styles.statusIcon} />;
  }
  if (assignment.status === 'RETURNED') {
    return <HomeworkRotateRightIcon size={12} className={styles.statusIcon} />;
  }
  return null;
};

export const TeacherHomeworksView: FC<TeacherHomeworksViewModel> = ({
  assignments,
  templates,
  students,
  summary,
  activeTab,
  searchQuery,
  sortBy,
  selectedStudentId,
  loadingAssignments,
  loadingMoreAssignments,
  hasMoreAssignments,
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
  detailAssignment,
  detailSubmissions,
  detailLoading,
  assignModalRequest,
  homeworkActivityItems,
  homeworkActivityLoading,
  homeworkActivityHasUnread,
  onTabChange,
  onSearchChange,
  onSortChange,
  onSelectedStudentIdChange,
  onOpenCreateTemplateScreen,
  onOpenEditTemplateScreen,
  onDuplicateTemplate,
  onArchiveTemplate,
  onRestoreTemplate,
  onToggleTemplateFavorite,
  onCreateAssignment,
  onSendAssignmentNow,
  onRemindAssignment,
  onDeleteAssignment,
  onFixConfigError,
  onBulkAction,
  onOpenReview,
  onCloseReview,
  onStartReviewQueue,
  onOpenDetail,
  onCloseDetail,
  onLoadMoreAssignments,
  onConsumeAssignModalRequest,
  onSubmitReview,
  onRefresh,
  onLoadHomeworkActivity,
  onMarkHomeworkActivitySeen,
}) => {
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [isBulkPanelOpen, setIsBulkPanelOpen] = useState(false);
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
  const [assignDefaults, setAssignDefaults] = useState<{ studentId: number | null; lessonId: number | null; templateId: number | null }>({
    studentId: selectedStudentId,
    lessonId: null,
    templateId: null,
  });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkAction, setBulkAction] = useState<TeacherBulkAction>('SEND_NOW');

  const countsByTab = useMemo(
    () => ({
      all: summary.totalCount,
      inbox: summary.inboxCount,
      draft: summary.draftCount,
      scheduled: summary.scheduledCount,
      in_progress: summary.inProgressCount,
      review: summary.reviewCount,
      closed: summary.closedCount,
      overdue: summary.overdueCount,
    }),
    [summary],
  );

  const studentsById = useMemo(() => new Map(students.map((item) => [item.id, item.name])), [students]);

  const quickTemplates = useMemo(() => {
    const activeTemplates = templates.filter((template) => !template.isArchived);
    return activeTemplates
      .slice()
      .sort((left, right) => {
        const leftFavorite = isHomeworkTemplateFavorite(left) ? 1 : 0;
        const rightFavorite = isHomeworkTemplateFavorite(right) ? 1 : 0;
        if (leftFavorite !== rightFavorite) return rightFavorite - leftFavorite;
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      })
      .slice(0, 3);
  }, [templates]);

  const archivedTemplates = useMemo(
    () =>
      templates
        .filter((template) => template.isArchived)
        .slice()
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
    [templates],
  );

  const savedCreateDraft = useMemo(() => loadStoredCreateTemplateDraftSummary(), []);

  const allSelected = assignments.length > 0 && selectedIds.length === assignments.length;

  useEffect(() => {
    setAssignDefaults((prev) => ({ ...prev, studentId: selectedStudentId }));
  }, [selectedStudentId]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => assignments.some((assignment) => assignment.id === id)));
  }, [assignments]);

  useEffect(() => {
    if (!assignModalRequest) return;
    setAssignDefaults({
      studentId: assignModalRequest.studentId ?? selectedStudentId,
      lessonId: assignModalRequest.lessonId ?? null,
      templateId: null,
    });
    if (assignModalRequest.open) {
      setIsAssignmentModalOpen(true);
    }
    onConsumeAssignModalRequest();
  }, [assignModalRequest, onConsumeAssignModalRequest, selectedStudentId]);

  const openAssignModal = (defaults?: { studentId?: number | null; lessonId?: number | null; templateId?: number | null }) => {
    setAssignDefaults({
      studentId: defaults?.studentId ?? selectedStudentId,
      lessonId: defaults?.lessonId ?? null,
      templateId: defaults?.templateId ?? null,
    });
    setIsAssignmentModalOpen(true);
  };

  const handleBulkApply = async () => {
    if (!selectedIds.length) return;
    await onBulkAction({ ids: selectedIds, action: bulkAction });
    setSelectedIds([]);
  };

  const handleOpenActivity = () => {
    setIsActivityModalOpen(true);
    onLoadHomeworkActivity();
    const latestOccurredAt = homeworkActivityItems[0]?.occurredAt;
    void onMarkHomeworkActivitySeen(latestOccurredAt);
  };

  const closedProgressPercent = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (summary.reviewedThisMonthCount / Math.max(summary.reviewedThisMonthCount + summary.inProgressCount, 1)) * 100,
      ),
    ),
  );

  return (
    <section className={styles.page}>
      <section className={styles.kpiGrid}>
        <article className={`${styles.kpiCard} ${styles.kpiCardPrimary}`}>
          <div className={styles.kpiTopLine}>
            <div className={styles.kpiLabel}>Требует внимания</div>
            <span className={styles.kpiPriority}>High Priority</span>
          </div>
          <div className={styles.kpiValue}>{summary.inboxCount}</div>
          <div className={styles.kpiHint}>Inbox</div>
          <div className={styles.kpiMicroStats}>
            <span>{summary.overdueCount} просрочено</span>
            <span>{summary.reviewCount} на проверке</span>
          </div>
        </article>
        <article className={styles.kpiCard}>
          <div className={styles.kpiLabel}>В работе</div>
          <div className={styles.kpiValue}>{summary.inProgressCount}</div>
          <div className={styles.kpiTrend}>+{summary.sentTodayCount} сегодня</div>
        </article>
        <article className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Запланировано</div>
          <div className={styles.kpiValue}>{summary.scheduledCount}</div>
          <div className={styles.kpiHint}>На ближайшие дни</div>
        </article>
        <article className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Закрыто в этом месяце</div>
          <div className={styles.kpiValue}>{summary.reviewedThisMonthCount}</div>
          <div className={styles.kpiProgressTrack}>
            <div className={styles.kpiProgressBar} style={{ width: `${closedProgressPercent}%` }} />
          </div>
        </article>
      </section>

      <section className={styles.workspace}>
        <div className={styles.topActionsRow}>
          <div className={styles.tabsRow}>
            {(Object.keys(TAB_LABELS) as Array<keyof typeof TAB_LABELS>).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`${styles.tabButton} ${activeTab === tab ? styles.tabButtonActive : ''}`}
                onClick={() => onTabChange(tab)}
              >
                {TAB_LABELS[tab]}
                {tab === 'inbox' || activeTab === tab ? (
                  <span className={styles.tabCounter}>{countsByTab[tab]}</span>
                ) : null}
              </button>
            ))}
          </div>

          <div className={styles.actionsRow}>
            <button
              type="button"
              className={styles.toolIconButton}
              title="Массовые действия"
              onClick={() => setIsBulkPanelOpen((prev) => !prev)}
            >
              <HomeworkLayerGroupIcon size={16} className={styles.toolbarIcon} />
            </button>
            <button
              type="button"
              className={styles.toolIconButton}
              title="Фильтры"
              onClick={() => setIsAdvancedFiltersOpen((prev) => !prev)}
            >
              <HomeworkFilterIcon size={14} className={styles.toolbarIcon} />
            </button>
            <button type="button" className={styles.reviewQueueButton} onClick={onStartReviewQueue}>
              <HomeworkBoltIcon size={14} className={styles.toolbarIcon} />
              <span>Проверять подряд</span>
            </button>
          </div>
        </div>

        {isBulkPanelOpen ? (
          <div className={styles.bulkPanel}>
            <select
              className={`${controls.input} ${styles.bulkSelect}`}
              value={bulkAction}
              onChange={(event) => setBulkAction(event.target.value as TeacherBulkAction)}
            >
              {BULK_ACTION_LABELS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.bulkApplyButton}
              onClick={() => {
                void handleBulkApply();
              }}
              disabled={!selectedIds.length}
            >
              Применить ({selectedIds.length})
            </button>
          </div>
        ) : null}

        {isAdvancedFiltersOpen ? (
          <div className={styles.advancedFiltersRow}>
            <div className={styles.advancedFiltersControls}>
              <label className={styles.inlineFilterGroup}>
                <span className={styles.inlineFilterLabel}>Ученик:</span>
                <select
                  className={styles.inlineFilterSelect}
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
              </label>

              <label className={styles.inlineFilterGroup}>
                <span className={styles.inlineFilterLabel}>Сортировка:</span>
                <select
                  className={styles.inlineFilterSelect}
                  value={sortBy}
                  onChange={(event) => onSortChange(event.target.value as TeacherHomeworksViewModel['sortBy'])}
                >
                  {SORT_LABELS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button type="button" className={styles.refreshButton} onClick={onRefresh}>
              Обновить
            </button>
          </div>
        ) : null}

        {assignmentsError ? <div className={styles.error}>{assignmentsError}</div> : null}
        {summaryError ? <div className={styles.error}>{summaryError}</div> : null}
        {studentsError ? <div className={styles.error}>{studentsError}</div> : null}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) =>
                      setSelectedIds(event.target.checked ? assignments.map((assignment) => assignment.id) : [])
                    }
                    aria-label="Выбрать все"
                  />
                </th>
                <th>Ученик / Задание</th>
                <th>Статус</th>
                <th>Дедлайн</th>
                <th>Ответ</th>
                <th className={styles.rightCell}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {loadingAssignments ? (
                ASSIGNMENT_SKELETON_ROWS.map((index) => (
                  <tr key={`skeleton_${index}`} className={styles.rowSkeleton} aria-hidden>
                    <td>
                      <span className={`${styles.skeletonPulse} ${styles.skeletonCheck}`} />
                    </td>
                    <td>
                      <div className={styles.studentCell}>
                        <span className={`${styles.skeletonPulse} ${styles.skeletonAvatar}`} />
                        <div className={styles.primaryCell}>
                          <span className={`${styles.skeletonPulse} ${styles.skeletonLine} ${styles.skeletonLineTitle}`} />
                          <span className={`${styles.skeletonPulse} ${styles.skeletonLine} ${styles.skeletonLineMeta}`} />
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`${styles.skeletonPulse} ${styles.skeletonBadge}`} />
                    </td>
                    <td>
                      <div className={styles.deadlineColumn}>
                        <span className={`${styles.skeletonPulse} ${styles.skeletonLine} ${styles.skeletonLineDeadline}`} />
                        <span className={`${styles.skeletonPulse} ${styles.skeletonLine} ${styles.skeletonLineDeadlineSub}`} />
                      </div>
                    </td>
                    <td>
                      <span className={`${styles.skeletonPulse} ${styles.skeletonLine} ${styles.skeletonLineResponse}`} />
                    </td>
                    <td className={styles.rightCell}>
                      <div className={styles.rowActions}>
                        <span className={`${styles.skeletonPulse} ${styles.skeletonAction}`} />
                        <span className={`${styles.skeletonPulse} ${styles.skeletonAction} ${styles.skeletonActionShort}`} />
                      </div>
                    </td>
                  </tr>
                ))
              ) : assignments.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.emptyRow}>
                    По текущим фильтрам задач нет
                  </td>
                </tr>
              ) : (
                assignments.map((assignment) => {
                  const deadlineMeta = resolveAssignmentDeadlineMeta(assignment);
                  const responseMeta = resolveAssignmentResponseMeta(assignment);
                  const problemBadges = resolveAssignmentProblemBadges(assignment);
                  const studentLabel = assignment.studentName || studentsById.get(assignment.studentId) || `Ученик #${assignment.studentId}`;
                  const studentInitials = getStudentInitials(studentLabel);
                  const statusTone = resolveStatusTone(assignment);
                  const shouldReview = needsAssignmentReview(assignment);
                  const responseVisual = resolveResponseVisual(assignment);
                  const responseText = responseVisual.kind === 'empty' ? responseVisual.emptyText || responseMeta : '';
                  const shouldShowEmptyResponse = responseText === 'Нет ответа';
                  const statusIcon = resolveStatusIcon(assignment);
                  const isOverdueRow = problemBadges.hasOverdue;
                  const canSendNow = assignment.status === 'DRAFT' || assignment.status === 'SCHEDULED';
                  return (
                    <tr
                      key={assignment.id}
                      className={`${styles.row} ${
                        problemBadges.hasOverdue ? styles.rowOverdue : ''
                      } ${problemBadges.hasConfigError ? styles.rowConfigError : ''}`}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(assignment.id)}
                          onChange={(event) =>
                            setSelectedIds((prev) =>
                              event.target.checked ? [...prev, assignment.id] : prev.filter((id) => id !== assignment.id),
                            )
                          }
                          aria-label={`Выбрать ${assignment.title}`}
                        />
                      </td>
                      <td>
                        <div className={styles.studentCell}>
                          <div className={styles.studentAvatarWrap}>
                            <div className={styles.studentAvatar}>{studentInitials}</div>
                            {assignment.status === 'SUBMITTED' || assignment.status === 'IN_REVIEW' ? (
                              <span className={styles.studentOnlineDot} aria-hidden />
                            ) : null}
                          </div>
                          <div className={styles.primaryCell}>
                            <div className={styles.assignmentTitle}>{assignment.title}</div>
                            <div className={styles.assignmentMeta}>
                              <span>{studentLabel}</span>
                              <span className={styles.metaDot} />
                              {assignment.lessonId ? (
                                <span className={styles.lessonMeta}>
                                  <HomeworkLinkIcon size={10} className={styles.lessonMetaIcon} />
                                  <span>Урок #{assignment.lessonId}</span>
                                </span>
                              ) : (
                                <span>Без привязки к уроку</span>
                              )}
                              {assignment.templateTitle ? (
                                <>
                                  <span className={styles.metaDot} />
                                  <span>Шаблон: {assignment.templateTitle}</span>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className={styles.statusColumn}>
                          <span
                            className={`${styles.statusBadge} ${styles[`statusBadge_${statusTone}`]} ${
                              statusIcon ? styles.statusBadgeWithIcon : ''
                            }`}
                          >
                            {statusIcon}
                            {resolveStatusLabel(assignment)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className={styles.deadlineColumn}>
                          <div>{deadlineMeta.primary}</div>
                          {deadlineMeta.tone === 'danger' ? (
                            <div className={`${styles.deadlineHint} ${styles.deadlineHintDanger}`}>
                              {deadlineMeta.secondary}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <div className={styles.responseColumn}>
                          {responseVisual.kind === 'empty' ? (
                            shouldShowEmptyResponse ? <div className={styles.responseEmpty}>{responseText}</div> : null
                          ) : (
                            <div className={styles.responseIcons}>
                              {(responseVisual.icons ?? []).map((icon) => (
                                <span
                                  key={`${assignment.id}_${icon.id}`}
                                  className={`${styles.responseIconChip} ${styles[`responseIconChip_${icon.tone}`]}`}
                                >
                                  {icon.kind === 'text' ? <HomeworkAlignLeftIcon size={12} className={styles.inlineFaIcon} /> : null}
                                  {icon.kind === 'file' ? <HomeworkFilePdfIcon size={12} className={styles.inlineFaIcon} /> : null}
                                  {icon.kind === 'voice' ? <HomeworkMicrophoneIcon size={12} className={styles.inlineFaIcon} /> : null}
                                  {icon.kind === 'test' ? <HomeworkListCheckIcon size={12} className={styles.inlineFaIcon} /> : null}
                                </span>
                              ))}
                              {responseVisual.autoCheckBadge ? (
                                <span
                                  className={`${styles.responseAutoBadge} ${
                                    styles[`responseAutoBadge_${responseVisual.autoCheckBadge.tone}`]
                                  }`}
                                >
                                  <HomeworkRobotIcon size={12} className={styles.inlineFaIcon} />
                                  <span>{responseVisual.autoCheckBadge.label}</span>
                                </span>
                              ) : null}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className={styles.rightCell}>
                        <div className={styles.rowActions}>
                          {shouldReview ? (
                            <button
                              type="button"
                              className={styles.reviewButton}
                              onClick={() => onOpenReview(assignment)}
                            >
                              Проверить
                            </button>
                          ) : assignment.hasConfigError ? (
                            <button
                              type="button"
                              className={styles.fixButton}
                              onClick={() => {
                                void onFixConfigError(assignment);
                              }}
                            >
                              Исправить
                            </button>
                          ) : isOverdueRow ? (
                            <>
                              <button
                                type="button"
                                className={styles.iconActionButton}
                                onClick={() => {
                                  void onRemindAssignment(assignment);
                                }}
                                title="Напомнить"
                                aria-label="Напомнить"
                              >
                                <HomeworkBellRegularIcon size={13} className={styles.inlineFaIcon} />
                              </button>
                              <button type="button" className={styles.detailOutlinedButton} onClick={() => onOpenDetail(assignment)}>
                                Детали
                              </button>
                            </>
                          ) : (
                            <>
                              {canSendNow ? (
                                <button
                                  type="button"
                                  className={styles.sendNowButton}
                                  onClick={() => {
                                    void onSendAssignmentNow(assignment);
                                  }}
                                >
                                  Отправить
                                </button>
                              ) : null}
                              <button type="button" className={styles.detailOutlinedButton} onClick={() => onOpenDetail(assignment)}>
                                Детали
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className={styles.mobileList}>
          {loadingAssignments
            ? ASSIGNMENT_SKELETON_ROWS.map((index) => (
                <article key={`mobile_skeleton_${index}`} className={`${styles.mobileCard} ${styles.mobileSkeletonCard}`} aria-hidden>
                  <div className={styles.mobileTop}>
                    <span className={`${styles.skeletonPulse} ${styles.skeletonLine} ${styles.mobileSkeletonTitle}`} />
                    <span className={`${styles.skeletonPulse} ${styles.mobileSkeletonBadge}`} />
                  </div>
                  <div className={styles.assignmentMeta}>
                    <span className={`${styles.skeletonPulse} ${styles.skeletonLine} ${styles.mobileSkeletonMeta}`} />
                    <span className={`${styles.skeletonPulse} ${styles.skeletonLine} ${styles.mobileSkeletonMetaShort}`} />
                  </div>
                  <div className={styles.mobileActions}>
                    <span className={`${styles.skeletonPulse} ${styles.mobileSkeletonAction}`} />
                    <span className={`${styles.skeletonPulse} ${styles.mobileSkeletonAction}`} />
                  </div>
                </article>
              ))
            : assignments.map((assignment) => {
                const deadlineMeta = resolveAssignmentDeadlineMeta(assignment);
                const studentLabel = assignment.studentName || studentsById.get(assignment.studentId) || `Ученик #${assignment.studentId}`;
                const statusTone = resolveStatusTone(assignment);
                const shouldReview = needsAssignmentReview(assignment);
                return (
                  <article
                    key={`mobile_${assignment.id}`}
                    className={`${styles.mobileCard} ${assignment.isOverdue ? styles.rowOverdue : ''} ${
                      assignment.hasConfigError ? styles.rowConfigError : ''
                    }`}
                  >
                    <div className={styles.mobileTop}>
                      <div className={styles.assignmentTitle}>{assignment.title}</div>
                      <span className={`${styles.statusBadge} ${styles[`statusBadge_${statusTone}`]}`}>
                        {formatAssignmentStatus(assignment)}
                      </span>
                    </div>
                    <div className={styles.assignmentMeta}>
                      <span>{studentLabel}</span>
                      <span>{deadlineMeta.primary}</span>
                    </div>
                    <div className={styles.mobileActions}>
                      <button type="button" className={controls.smallButton} onClick={() => onOpenDetail(assignment)}>
                        Детали
                      </button>
                      {shouldReview ? (
                        <button type="button" className={styles.mobileReviewButton} onClick={() => onOpenReview(assignment)}>
                          Проверить
                        </button>
                      ) : null}
                      {!shouldReview ? (
                        <button
                          type="button"
                          className={controls.smallButton}
                          onClick={() => {
                            void onRemindAssignment(assignment);
                          }}
                        >
                          Напомнить
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
        </div>

        {hasMoreAssignments ? (
          <div className={styles.loadMoreRow}>
            <button
              type="button"
              className={styles.loadMoreButton}
              onClick={onLoadMoreAssignments}
              disabled={loadingMoreAssignments}
            >
              <span>{loadingMoreAssignments ? 'Загрузка...' : 'Показать еще 10'}</span>
              <HomeworkChevronDownIcon size={12} className={styles.loadMoreArrow} />
            </button>
          </div>
        ) : null}
      </section>

      <section className={styles.templatesSection}>
        <div className={styles.templatesHeader}>
          <h2>Быстрые шаблоны</h2>
          <div className={styles.templatesHeaderActions}>
            <button type="button" className={controls.secondaryButton} onClick={() => setIsArchiveModalOpen(true)}>
              Архив ({archivedTemplates.length})
            </button>
            <button type="button" className={controls.secondaryButton} onClick={onOpenCreateTemplateScreen}>
              Создать шаблон
            </button>
          </div>
        </div>

        {templatesError ? <div className={styles.error}>{templatesError}</div> : null}
        {loadingTemplates ? <div className={styles.emptyTemplates}>Загрузка шаблонов...</div> : null}

        {!loadingTemplates ? (
          <div className={styles.templatesGrid}>
            {savedCreateDraft ? (
              <article className={`${styles.templateCard} ${styles.templateDraftCard}`}>
                <div className={styles.templateCardHead}>
                  <span className={styles.templateDraftBadge}>
                    <HomeworkBookmarkRegularIcon size={12} /> Черновик
                  </span>
                </div>
                <h3 className={styles.templateTitle}>{savedCreateDraft.title}</h3>
                <p className={styles.templatePreview}>{savedCreateDraft.preview}</p>
                <div className={styles.templateFooter}>
                  <span>
                    Сохранен: {savedCreateDraft.savedAtLabel}
                    {savedCreateDraft.questionCount > 0 ? ` · ${savedCreateDraft.questionCount} вопросов` : ''}
                  </span>
                  <div className={styles.templateActions}>
                    <button type="button" className={controls.smallButton} onClick={onOpenCreateTemplateScreen}>
                      Продолжить редактирование
                    </button>
                  </div>
                </div>
              </article>
            ) : null}

            {quickTemplates.map((template) => {
              const favorite = isHomeworkTemplateFavorite(template);
              const category = resolveHomeworkTemplateCategory(template);
              const estimated = formatHomeworkTemplateDuration(estimateHomeworkTemplateDurationMinutes(template));
              return (
                <article key={template.id} className={styles.templateCard}>
                  <div className={styles.templateCardHead}>
                    <span className={styles.templateCategory}>{category}</span>
                    <button
                      type="button"
                      className={styles.starButton}
                      onClick={() => {
                        void onToggleTemplateFavorite(template);
                      }}
                      aria-label="Переключить избранное"
                    >
                      {favorite ? <HomeworkStarIcon size={16} /> : <HomeworkStarRegularIcon size={16} />}
                    </button>
                  </div>
                  <h3 className={styles.templateTitle}>{template.title}</h3>
                  <p className={styles.templatePreview}>{resolveHomeworkTemplatePreview(template)}</p>
                  <div className={styles.templateFooter}>
                    <span>{estimated}</span>
                    <div className={styles.templateActions}>
                      <button
                        type="button"
                        className={controls.smallButton}
                        onClick={() => openAssignModal({ templateId: template.id })}
                      >
                        + Выдать
                      </button>
                      <button
                        type="button"
                        className={controls.smallButton}
                        onClick={() => onOpenEditTemplateScreen(template.id)}
                      >
                        Редактировать
                      </button>
                      <button
                        type="button"
                        className={controls.smallButton}
                        onClick={() => {
                          void onDuplicateTemplate(template);
                        }}
                      >
                        Дубль
                      </button>
                      {!template.isArchived ? (
                        <button
                          type="button"
                          className={controls.smallButton}
                          onClick={() => {
                            void onArchiveTemplate(template);
                          }}
                        >
                          Архив
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}

            <article className={`${styles.templateCard} ${styles.templateCreateCard}`}>
              <button type="button" className={styles.createTemplateButton} onClick={onOpenCreateTemplateScreen}>
                Создать новый шаблон
              </button>
            </article>
          </div>
        ) : null}
      </section>

      <Modal open={isArchiveModalOpen} onClose={() => setIsArchiveModalOpen(false)} title="Архив шаблонов">
        <div className={styles.archiveModalContent}>
          {archivedTemplates.length === 0 ? (
            <div className={styles.emptyTemplates}>В архиве пока нет шаблонов</div>
          ) : (
            <div className={styles.archiveTemplatesList}>
              {archivedTemplates.map((template) => {
                const category = resolveHomeworkTemplateCategory(template);
                const estimated = formatHomeworkTemplateDuration(estimateHomeworkTemplateDurationMinutes(template));
                return (
                  <article key={`archived_${template.id}`} className={styles.archiveTemplateCard}>
                    <div className={styles.templateCardHead}>
                      <span className={styles.templateCategory}>{category}</span>
                    </div>
                    <h3 className={styles.templateTitle}>{template.title}</h3>
                    <p className={styles.templatePreview}>{resolveHomeworkTemplatePreview(template)}</p>
                    <div className={styles.templateFooter}>
                      <span>{estimated}</span>
                      <div className={styles.templateActions}>
                        <button
                          type="button"
                          className={controls.smallButton}
                          disabled={submittingTemplate}
                          onClick={() => {
                            void onRestoreTemplate(template);
                          }}
                        >
                          Восстановить
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      <HomeworkAssignModal
        open={isAssignmentModalOpen}
        templates={templates.filter((item) => !item.isArchived)}
        students={students}
        submitting={submittingAssignment}
        defaultStudentId={assignDefaults.studentId}
        defaultLessonId={assignDefaults.lessonId}
        defaultTemplateId={assignDefaults.templateId}
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

      <Modal open={Boolean(detailAssignment)} onClose={onCloseDetail} title="Детали домашнего задания">
        {detailLoading ? (
          <div className={styles.modalState}>Загрузка...</div>
        ) : detailAssignment ? (
          <div className={styles.detailLayout}>
            <div className={styles.detailMeta}>Название: {detailAssignment.title}</div>
            <div className={styles.detailMeta}>Ученик: {detailAssignment.studentName ?? studentsById.get(detailAssignment.studentId) ?? `#${detailAssignment.studentId}`}</div>
            <div className={styles.detailMeta}>Статус: {formatAssignmentStatus(detailAssignment)}</div>
            <div className={styles.detailMeta}>Дедлайн: {formatDateTime(detailAssignment.deadlineAt)}</div>
            <div className={styles.detailMeta}>Отправлено: {formatDateTime(detailAssignment.sentAt)}</div>
            <div className={styles.detailMeta}>Проверено: {formatDateTime(detailAssignment.reviewedAt)}</div>
            <div className={styles.detailMeta}>Комментарий: {detailAssignment.teacherComment || '—'}</div>
            <div className={styles.detailMeta}>Попыток: {detailSubmissions.length}</div>
            <div className={styles.detailActions}>
              {needsAssignmentReview(detailAssignment) ? (
                <button
                  type="button"
                  className={styles.reviewButton}
                  onClick={() => {
                    onCloseDetail();
                    onOpenReview(detailAssignment);
                  }}
                >
                  Проверить
                </button>
              ) : null}
              {(detailAssignment.status === 'DRAFT' || detailAssignment.status === 'SCHEDULED') ? (
                <button
                  type="button"
                  className={styles.sendNowButton}
                  onClick={() => {
                    void onSendAssignmentNow(detailAssignment);
                  }}
                >
                  Отправить
                </button>
              ) : null}
              {!needsAssignmentReview(detailAssignment) ? (
                <button
                  type="button"
                  className={styles.detailOutlinedButton}
                  onClick={() => {
                    void onRemindAssignment(detailAssignment);
                  }}
                >
                  Напомнить
                </button>
              ) : null}
              {detailAssignment.hasConfigError ? (
                <button
                  type="button"
                  className={styles.fixButton}
                  onClick={() => {
                    void onFixConfigError(detailAssignment);
                  }}
                >
                  Исправить
                </button>
              ) : null}
              <button
                type="button"
                className={styles.deleteButton}
                onClick={() => {
                  void onDeleteAssignment(detailAssignment);
                  onCloseDetail();
                }}
              >
                Удалить
              </button>
            </div>
            <div className={styles.submissionsList}>
              {detailSubmissions.map((submission) => (
                <article key={submission.id} className={styles.submissionCard}>
                  <div>Попытка #{submission.attemptNo}</div>
                  <div>Статус: {submission.status}</div>
                  <div>Сдано: {formatDateTime(submission.submittedAt)}</div>
                  <div>Комментарий: {submission.teacherComment || '—'}</div>
                </article>
              ))}
              {detailSubmissions.length === 0 ? <div className={styles.modalState}>Ответов пока нет</div> : null}
            </div>
          </div>
        ) : (
          <div className={styles.modalState}>Нет данных</div>
        )}
      </Modal>

      <Modal
        open={isActivityModalOpen}
        onClose={() => setIsActivityModalOpen(false)}
        title="События домашних заданий"
      >
        {homeworkActivityLoading ? <div className={styles.modalState}>Загрузка...</div> : null}
        {!homeworkActivityLoading ? (
          <div className={styles.activityList}>
            {homeworkActivityItems.map((item) => (
              <article key={item.id} className={styles.activityItem}>
                <div className={styles.activityTitle}>{item.title}</div>
                <div className={styles.activityMeta}>{item.details || '—'}</div>
                <div className={styles.activityMeta}>{formatDateTime(item.occurredAt)}</div>
              </article>
            ))}
            {homeworkActivityItems.length === 0 ? <div className={styles.modalState}>Событий пока нет</div> : null}
          </div>
        ) : null}
      </Modal>
    </section>
  );
};

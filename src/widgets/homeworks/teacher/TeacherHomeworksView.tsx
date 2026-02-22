import { FC, useEffect, useMemo, useState } from 'react';
import controls from '../../../shared/styles/controls.module.css';
import styles from './TeacherHomeworksView.module.css';
import { TeacherBulkAction, TeacherHomeworksViewModel, TeacherHomeworkGroupKey } from '../types';
import { HomeworkAssignModal } from '../../../features/homework-assign/ui/HomeworkAssignModal';
import { HomeworkAssignment, HomeworkGroupListItem, HomeworkTemplate } from '../../../entities/types';
import { HomeworkReviewModal } from '../../../features/homework-review/ui/HomeworkReviewModal';
import { Modal } from '../../../shared/ui/Modal/Modal';
import { Checkbox } from '../../../shared/ui/Checkbox/Checkbox';
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
  HomeworkFileLinesIcon,
  HomeworkFolderIcon,
  HomeworkGearIcon,
  HomeworkLayerGroupIcon,
  HomeworkLinkIcon,
  HomeworkListCheckIcon,
  HomeworkMicrophoneIcon,
  HomeworkPenToSquareIcon,
  HomeworkPlusIcon,
  HomeworkRobotIcon,
  HomeworkRotateRightIcon,
} from '../../../shared/ui/icons/HomeworkFaIcons';
import {
  AutoCheckBadge,
  formatAssignmentStatus,
  resolveAssignmentAutoCheckBadge,
  resolveAssignmentDeadlineMeta,
  resolveAssignmentProblemBadges,
  resolveAssignmentResponseMeta,
  resolveAssignmentStudentAvatarColor,
  resolveAssignmentStudentAvatarTextColor,
} from './model/lib/assignmentPresentation';
import {
  estimateHomeworkTemplateDurationMinutes,
  formatHomeworkTemplateDuration,
  isHomeworkTemplateFavorite,
  resolveHomeworkTemplateCategory,
  resolveHomeworkTemplatePreview,
} from './model/lib/templatePresentation';
import {
  DEFAULT_GROUP_EDITOR_BG_COLOR,
  DEFAULT_GROUP_EDITOR_ICON_KEY,
  resolveGroupEditorBgColor,
  resolveGroupEditorIconKey,
} from './model/lib/groupEditorStyles';
import { GroupIconView } from './model/lib/groupIconView';
import { GroupEditorModal } from './ui/GroupEditorModal/GroupEditorModal';
import { HomeworkTemplateCard } from './ui/HomeworkTemplateCard/HomeworkTemplateCard';
import { TeacherHomeworksKpiSection } from './ui/TeacherHomeworksKpiSection';

type WorkspaceMode = 'list' | 'groups' | 'templates';

const MODE_TABS: Array<{ id: WorkspaceMode; label: string }> = [
  { id: 'list', label: 'Список домашек' },
  { id: 'groups', label: 'Группы' },
  { id: 'templates', label: 'Шаблоны' },
];

const STATUS_TABS: Array<{ id: TeacherHomeworksViewModel['activeTab']; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'draft', label: 'Черновики' },
  { id: 'scheduled', label: 'Запланировано' },
  { id: 'in_progress', label: 'В работе' },
  { id: 'review', label: 'На проверке' },
  { id: 'closed', label: 'Закрыто' },
];

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

type GroupEditorDraft = {
  title: string;
  description: string;
  iconKey: string;
  bgColor: string;
};

const createEmptyGroupDraft = (): GroupEditorDraft => ({
  title: '',
  description: '',
  iconKey: DEFAULT_GROUP_EDITOR_ICON_KEY,
  bgColor: DEFAULT_GROUP_EDITOR_BG_COLOR,
});

const toGroupKey = (groupId: number | null): TeacherHomeworkGroupKey =>
  groupId === null ? 'ungrouped' : (`group_${groupId}` as const);

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

const toGroupEditorDraft = (group: HomeworkGroupListItem): GroupEditorDraft => ({
  title: group.title,
  description: group.description ?? '',
  iconKey: resolveGroupEditorIconKey(group.iconKey),
  bgColor: resolveGroupEditorBgColor(group.bgColor),
});

export const TeacherHomeworksView: FC<TeacherHomeworksViewModel> = ({
  assignments,
  templates,
  groups,
  groupAssignmentsByKey,
  groupAssignmentsLoadingByKey,
  groupAssignmentsErrorByKey,
  groupAssignmentsNextOffsetByKey,
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
  loadingGroups,
  loadingSummary,
  loadingStudents,
  assignmentsError,
  templatesError,
  groupsError,
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
  onCreateGroup,
  onUpdateGroup,
  onDeleteGroup,
  onLoadGroupAssignments,
  onRestoreTemplate,
  onRebindAssignmentsGroup,
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
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('list');
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [templateSearchQuery, setTemplateSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Partial<Record<TeacherHomeworkGroupKey, boolean>>>({});
  const [groupEditorOpen, setGroupEditorOpen] = useState(false);
  const [groupEditorMode, setGroupEditorMode] = useState<'create' | 'edit'>('create');
  const [editingGroup, setEditingGroup] = useState<HomeworkGroupListItem | null>(null);
  const [groupEditorDraft, setGroupEditorDraft] = useState<GroupEditorDraft>(createEmptyGroupDraft());
  const [groupEditorSelectedTemplateIds, setGroupEditorSelectedTemplateIds] = useState<number[]>([]);
  const [groupEditorSelectedAssignmentIds, setGroupEditorSelectedAssignmentIds] = useState<number[]>([]);
  const [groupEditorSubmitting, setGroupEditorSubmitting] = useState(false);
  const [groupDeleteSubmitting, setGroupDeleteSubmitting] = useState(false);
  const [assignDefaults, setAssignDefaults] = useState<{
    studentId: number | null;
    lessonId: number | null;
    templateId: number | null;
    groupId: number | null;
  }>({
    studentId: selectedStudentId,
    lessonId: null,
    templateId: null,
    groupId: null,
  });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkAction, setBulkAction] = useState<TeacherBulkAction>('SEND_NOW');

  const countsByTab = useMemo(
    () => ({
      all: summary.totalCount,
      draft: summary.draftCount,
      scheduled: summary.scheduledCount,
      in_progress: summary.inProgressCount,
      review: summary.reviewCount,
      closed: summary.closedCount,
    }),
    [summary],
  );

  const studentsById = useMemo(() => new Map(students.map((item) => [item.id, item.name])), [students]);

  const activeTemplates = useMemo(() => {
    const activeTemplates = templates.filter((template) => !template.isArchived);
    return activeTemplates
      .slice()
      .sort((left, right) => {
        const leftFavorite = isHomeworkTemplateFavorite(left) ? 1 : 0;
        const rightFavorite = isHomeworkTemplateFavorite(right) ? 1 : 0;
        if (leftFavorite !== rightFavorite) return rightFavorite - leftFavorite;
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      });
  }, [templates]);

  const archivedTemplates = useMemo(
    () =>
      templates
        .filter((template) => template.isArchived)
        .slice()
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
    [templates],
  );

  const filteredTemplates = useMemo(() => {
    const query = templateSearchQuery.trim().toLowerCase();
    if (!query) return activeTemplates;
    return activeTemplates.filter((template) => {
      const category = resolveHomeworkTemplateCategory(template).toLowerCase();
      const tags = template.tags.map((tag) => tag.toLowerCase()).join(' ');
      return (
        template.title.toLowerCase().includes(query) ||
        category.includes(query) ||
        tags.includes(query) ||
        resolveHomeworkTemplatePreview(template).toLowerCase().includes(query)
      );
    });
  }, [activeTemplates, templateSearchQuery]);
  const quickTemplates = filteredTemplates;

  const filteredGroups = useMemo(() => {
    const query = groupSearchQuery.trim().toLowerCase();
    if (!query) return groups;
    return groups.filter((group) => {
      const description = (group.description ?? '').toLowerCase();
      return group.title.toLowerCase().includes(query) || description.includes(query);
    });
  }, [groupSearchQuery, groups]);

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
      groupId: null,
    });
    if (assignModalRequest.open) {
      setIsAssignmentModalOpen(true);
    }
    onConsumeAssignModalRequest();
  }, [assignModalRequest, onConsumeAssignModalRequest, selectedStudentId]);

  const openAssignModal = (defaults?: {
    studentId?: number | null;
    lessonId?: number | null;
    templateId?: number | null;
    groupId?: number | null;
  }) => {
    setAssignDefaults({
      studentId: defaults?.studentId ?? selectedStudentId,
      lessonId: defaults?.lessonId ?? null,
      templateId: defaults?.templateId ?? null,
      groupId: defaults?.groupId ?? null,
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

  useEffect(() => {
    Object.entries(expandedGroups).forEach(([key, expanded]) => {
      if (!expanded) return;
      const groupKey = key as TeacherHomeworkGroupKey;
      if (groupAssignmentsByKey[groupKey] || groupAssignmentsLoadingByKey[groupKey]) return;
      void onLoadGroupAssignments(groupKey);
    });
  }, [expandedGroups, groupAssignmentsByKey, groupAssignmentsLoadingByKey, onLoadGroupAssignments]);

  const openCreateGroupEditor = () => {
    setGroupEditorMode('create');
    setEditingGroup(null);
    setGroupEditorDraft(createEmptyGroupDraft());
    setGroupEditorSelectedTemplateIds([]);
    setGroupEditorSelectedAssignmentIds([]);
    setGroupEditorOpen(true);
  };

  const openEditGroupEditor = (group: HomeworkGroupListItem) => {
    if (group.isSystem || group.id === null) return;
    setGroupEditorMode('edit');
    setEditingGroup(group);
    setGroupEditorDraft(toGroupEditorDraft(group));
    setGroupEditorSelectedTemplateIds([]);
    setGroupEditorSelectedAssignmentIds([]);
    setGroupEditorOpen(true);
  };

  const closeGroupEditor = () => {
    if (groupEditorSubmitting || groupDeleteSubmitting) return;
    setGroupEditorOpen(false);
    setEditingGroup(null);
    setGroupEditorSelectedTemplateIds([]);
    setGroupEditorSelectedAssignmentIds([]);
  };

  const submitGroupEditor = async () => {
    if (groupEditorSubmitting) return;
    const title = groupEditorDraft.title.trim();
    if (!title) return;

    const payload = {
      title,
      description: groupEditorDraft.description.trim() || null,
      iconKey: groupEditorDraft.iconKey,
      bgColor: groupEditorDraft.bgColor,
    };
    setGroupEditorSubmitting(true);
    try {
      let shouldCloseEditor = true;
      if (groupEditorMode === 'create') {
        const createdGroup = await onCreateGroup(payload);
        if (!createdGroup?.id) {
          shouldCloseEditor = false;
        } else if (groupEditorSelectedAssignmentIds.length) {
          await onRebindAssignmentsGroup(groupEditorSelectedAssignmentIds, createdGroup.id);
        }
      } else if (editingGroup?.id) {
        await onUpdateGroup(editingGroup.id, payload);
        if (groupEditorSelectedAssignmentIds.length) {
          await onRebindAssignmentsGroup(groupEditorSelectedAssignmentIds, editingGroup.id);
        }
      }
      if (shouldCloseEditor) {
        setGroupEditorOpen(false);
        setEditingGroup(null);
        setGroupEditorSelectedTemplateIds([]);
        setGroupEditorSelectedAssignmentIds([]);
      }
    } finally {
      setGroupEditorSubmitting(false);
    }
  };

  const removeGroupFromEditor = async () => {
    if (groupDeleteSubmitting || !editingGroup?.id) return;
    if (!window.confirm('Удалить группу? Домашки останутся и перейдут в "Без группы".')) return;
    setGroupDeleteSubmitting(true);
    try {
      await onDeleteGroup(editingGroup.id);
      setGroupEditorOpen(false);
      setEditingGroup(null);
      setGroupEditorSelectedTemplateIds([]);
      setGroupEditorSelectedAssignmentIds([]);
    } finally {
      setGroupDeleteSubmitting(false);
    }
  };

  const toggleGroupExpanded = (group: HomeworkGroupListItem) => {
    const groupKey = toGroupKey(group.id);
    setExpandedGroups((prev) => {
      const nextValue = !prev[groupKey];
      if (nextValue && !groupAssignmentsByKey[groupKey] && !groupAssignmentsLoadingByKey[groupKey]) {
        void onLoadGroupAssignments(groupKey);
      }
      return { ...prev, [groupKey]: nextValue };
    });
  };

  return (
    <section className={styles.page}>
      <TeacherHomeworksKpiSection summary={summary} />

      <section className={styles.workspace}>
        <div className={styles.topActionsRow}>
          <div className={styles.modeTabsRow}>
            {MODE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`${styles.modeTabButton} ${workspaceMode === tab.id ? styles.modeTabButtonActive : ''}`}
                onClick={() => setWorkspaceMode(tab.id)}
              >
                {tab.id === 'groups' ? <HomeworkFolderIcon size={13} className={styles.inlineFaIcon} /> : null}
                {tab.id === 'templates' ? <HomeworkLayerGroupIcon size={13} className={styles.inlineFaIcon} /> : null}
                {tab.label}
                {tab.id === 'list' ? <span className={styles.tabCounter}>{summary.totalCount}</span> : null}
              </button>
            ))}
          </div>

          {workspaceMode === 'list' ? (
            <div className={styles.actionsRow}>
              <button
                type="button"
                className={styles.toolIconButton}
                title="События"
                onClick={handleOpenActivity}
              >
                <HomeworkBellRegularIcon size={15} className={styles.toolbarIcon} />
                {homeworkActivityHasUnread ? <span className={styles.unreadDot} /> : null}
              </button>
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
          ) : null}
        </div>

        {workspaceMode === 'list' ? (
          <div className={styles.statusTabsRow}>
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`${styles.statusTabButton} ${activeTab === tab.id ? styles.statusTabButtonActive : ''}`}
                onClick={() => onTabChange(tab.id)}
              >
                {tab.label}
                {activeTab === tab.id ? <span className={styles.statusTabCounter}>{countsByTab[tab.id] ?? 0}</span> : null}
              </button>
            ))}
            {loadingSummary ? <span className={styles.statusTabsMeta}>Обновляем сводку...</span> : null}
          </div>
        ) : null}

        {workspaceMode === 'list' ? (
          <>
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
                <span className={styles.inlineFilterLabel}>Поиск:</span>
                <input
                  type="search"
                  className={styles.inlineSearchInput}
                  value={searchQuery}
                  placeholder="Название, ученик, шаблон..."
                  onChange={(event) => onSearchChange(event.target.value)}
                />
              </label>

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
                  <Checkbox
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
                  const studentAvatarColor = resolveAssignmentStudentAvatarColor(assignment);
                  const studentAvatarTextColor = resolveAssignmentStudentAvatarTextColor(studentAvatarColor);
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
                        <Checkbox
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
                            <div
                              className={styles.studentAvatar}
                              style={{ background: studentAvatarColor, color: studentAvatarTextColor }}
                            >
                              {studentInitials}
                            </div>
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
          </>
        ) : null}

        {workspaceMode === 'groups' ? (
          <section className={styles.groupsSection}>
            <div className={styles.groupsTopBar}>
              <input
                type="search"
                className={styles.groupsSearchInput}
                placeholder="Поиск по группам..."
                value={groupSearchQuery}
                onChange={(event) => setGroupSearchQuery(event.target.value)}
              />
              <button type="button" className={styles.groupsCreateButton} onClick={openCreateGroupEditor}>
                <HomeworkPlusIcon size={12} className={`${styles.toolbarIcon} ${styles.positivePlusIcon}`} />
                <span>Создать группу</span>
              </button>
            </div>

            {groupsError ? <div className={styles.error}>{groupsError}</div> : null}
            {loadingGroups ? <div className={styles.groupsEmptyState}>Загрузка групп...</div> : null}
            {!loadingGroups && filteredGroups.length === 0 ? (
              <div className={styles.groupsEmptyState}>Группы не найдены</div>
            ) : null}

            {!loadingGroups ? (
              <div className={styles.groupsList}>
                {filteredGroups.map((group) => {
                  const groupKey = toGroupKey(group.id);
                  const groupAssignments = groupAssignmentsByKey[groupKey] ?? [];
                  const groupLoading = Boolean(groupAssignmentsLoadingByKey[groupKey]);
                  const groupError = groupAssignmentsErrorByKey[groupKey];
                  const groupNextOffset = groupAssignmentsNextOffsetByKey[groupKey] ?? null;
                  const expanded = Boolean(expandedGroups[groupKey]);

                  return (
                    <article key={group.id ?? 'ungrouped'} className={styles.groupCard}>
                      <button
                        type="button"
                        className={styles.groupCardHeader}
                        style={{
                          background: `linear-gradient(90deg, ${group.bgColor || '#F3F4F6'} 0%, rgba(255,255,255,0) 72%)`,
                        }}
                        onClick={() => toggleGroupExpanded(group)}
                      >
                        <span className={styles.groupCardMain}>
                          <span
                            className={styles.groupIconBadge}
                            style={{
                              backgroundColor: group.bgColor || '#F3F4F6',
                            }}
                          >
                            <GroupIconView iconKey={group.iconKey} size={14} />
                          </span>
                          <span className={styles.groupTitleBlock}>
                            <span className={styles.groupTitleRow}>
                              <span className={styles.groupTitle}>{group.title}</span>
                              <span className={styles.groupCountBadge}>{group.assignmentsCount} заданий</span>
                            </span>
                            <span className={styles.groupSubtitle}>{group.description || 'Задания внутри группы'}</span>
                          </span>
                        </span>
                        <span className={styles.groupHeaderActions}>
                          {!group.isSystem && group.id !== null ? (
                            <span
                              role="button"
                              tabIndex={0}
                              className={styles.groupEditIconButton}
                              onClick={(event) => {
                                event.stopPropagation();
                                openEditGroupEditor(group);
                              }}
                              onKeyDown={(event) => {
                                if (event.key !== 'Enter' && event.key !== ' ') return;
                                event.preventDefault();
                                event.stopPropagation();
                                openEditGroupEditor(group);
                              }}
                            >
                              <HomeworkPenToSquareIcon size={12} className={styles.inlineFaIcon} />
                            </span>
                          ) : null}
                          <HomeworkChevronDownIcon
                            size={12}
                            className={`${styles.groupChevron} ${expanded ? styles.groupChevronExpanded : ''}`}
                          />
                        </span>
                      </button>

                      {expanded ? (
                        <div className={styles.groupCardContent}>
                          {groupError ? <div className={styles.groupErrorState}>{groupError}</div> : null}
                          {groupLoading && groupAssignments.length === 0 ? (
                            <div className={styles.groupLoadingState}>Загрузка заданий...</div>
                          ) : null}
                          {!groupLoading && groupAssignments.length === 0 ? (
                            <div className={styles.groupLoadingState}>В этой группе пока нет домашних заданий</div>
                          ) : null}
                          {groupAssignments.length > 0 ? (
                            <div className={styles.groupAssignmentsList}>
                              {groupAssignments.map((assignment) => {
                                const studentLabel =
                                  assignment.studentName ||
                                  studentsById.get(assignment.studentId) ||
                                  `Ученик #${assignment.studentId}`;
                                const tone = resolveStatusTone(assignment);
                              return (
                                <article key={assignment.id} className={styles.groupAssignmentItem}>
                                  <div className={styles.groupAssignmentIcon}>
                                    <HomeworkFileLinesIcon size={13} className={styles.inlineFaIcon} />
                                  </div>

                                    <div className={styles.groupAssignmentMain}>
                                      <div className={styles.groupAssignmentTitleRow}>
                                        <h4 className={styles.groupAssignmentTitle}>{assignment.title}</h4>
                                        <span className={styles.groupAssignmentTypeBadge}>Домашка</span>
                                      </div>
                                      <div className={styles.groupAssignmentMeta}>
                                        <span>Создано {formatDateTime(assignment.createdAt)}</span>
                                        <span className={styles.metaDot} />
                                        <span>{studentLabel}</span>
                                      </div>
                                    </div>

                                    <div className={styles.groupAssignmentActions}>
                                      <span
                                        className={`${styles.groupAssignmentStatus} ${
                                          styles[`groupAssignmentStatus_${tone}`] || ''
                                        }`}
                                      >
                                        {resolveStatusLabel(assignment)}
                                      </span>
                                      <button
                                        type="button"
                                        className={styles.groupAssignmentEditButton}
                                        onClick={() => onOpenDetail(assignment)}
                                        title="Редактировать"
                                        aria-label="Редактировать"
                                      >
                                        <HomeworkPenToSquareIcon size={12} className={styles.inlineFaIcon} />
                                      </button>
                                    </div>
                                  </article>
                                );
                              })}
                            </div>
                          ) : null}
                          {groupNextOffset !== null ? (
                            <div className={styles.groupLoadMoreRow}>
                              <button
                                type="button"
                                className={styles.groupLoadMoreButton}
                                onClick={() => {
                                  void onLoadGroupAssignments(groupKey, { append: true });
                                }}
                                disabled={groupLoading}
                              >
                                {groupLoading ? 'Загрузка...' : 'Показать еще'}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : null}
          </section>
        ) : null}

      {workspaceMode === 'templates' ? (
        <section className={styles.templatesSection}>
          <div className={styles.templatesTopBar}>
            <input
              type="search"
              className={styles.templatesSearchInput}
              placeholder="Поиск по шаблонам..."
              value={templateSearchQuery}
              onChange={(event) => setTemplateSearchQuery(event.target.value)}
            />
            <div className={styles.templatesTopActions}>
              <button type="button" className={controls.secondaryButton} onClick={() => setIsArchiveModalOpen(true)}>
                Архив ({archivedTemplates.length})
              </button>
              <button type="button" className={styles.templatesCreateButton} onClick={onOpenCreateTemplateScreen}>
                <HomeworkPlusIcon size={12} className={`${styles.toolbarIcon} ${styles.positivePlusIcon}`} />
                <span>Создать шаблон</span>
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

            {quickTemplates.map((template) => (
              <HomeworkTemplateCard
                key={template.id}
                template={template}
                onToggleFavorite={(item) => {
                  void onToggleTemplateFavorite(item);
                }}
                onUseTemplate={(item) => openAssignModal({ templateId: item.id })}
                onEditTemplate={(item) => onOpenEditTemplateScreen(item.id)}
              />
            ))}

            <article className={`${styles.templateCard} ${styles.templateCreateCard}`}>
              <button type="button" className={styles.createTemplateButton} onClick={onOpenCreateTemplateScreen}>
                <span className={styles.createTemplateIconWrap}>
                  <HomeworkPlusIcon size={18} className={styles.createTemplatePlusIcon} />
                </span>
                <span className={styles.createTemplateTitle}>Создать шаблон</span>
                <span className={styles.createTemplateHint}>Конструктор заданий</span>
              </button>
            </article>
          </div>
        ) : null}
      </section>
      ) : null}

      </section>

      <GroupEditorModal
        open={groupEditorOpen}
        mode={groupEditorMode}
        draft={groupEditorDraft}
        templates={templates}
        assignments={assignments}
        selectedTemplateIds={groupEditorSelectedTemplateIds}
        selectedAssignmentIds={groupEditorSelectedAssignmentIds}
        submitting={groupEditorSubmitting}
        deleteSubmitting={groupDeleteSubmitting}
        canDelete={groupEditorMode === 'edit' && Boolean(editingGroup?.id)}
        onChangeTitle={(value) => setGroupEditorDraft((prev) => ({ ...prev, title: value }))}
        onChangeDescription={(value) => setGroupEditorDraft((prev) => ({ ...prev, description: value }))}
        onChangeIconKey={(iconKey) => setGroupEditorDraft((prev) => ({ ...prev, iconKey }))}
        onChangeBgColor={(bgColor) => setGroupEditorDraft((prev) => ({ ...prev, bgColor }))}
        onToggleTemplate={(templateId) =>
          setGroupEditorSelectedTemplateIds((prev) =>
            prev.includes(templateId) ? prev.filter((id) => id !== templateId) : [...prev, templateId],
          )
        }
        onToggleAssignment={(assignmentId) =>
          setGroupEditorSelectedAssignmentIds((prev) =>
            prev.includes(assignmentId) ? prev.filter((id) => id !== assignmentId) : [...prev, assignmentId],
          )
        }
        onClose={closeGroupEditor}
        onSubmit={() => {
          void submitGroupEditor();
        }}
        onDelete={() => {
          void removeGroupFromEditor();
        }}
      />

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
        groups={groups}
        students={students}
        submitting={submittingAssignment}
        defaultStudentId={assignDefaults.studentId}
        defaultLessonId={assignDefaults.lessonId}
        defaultTemplateId={assignDefaults.templateId}
        defaultGroupId={assignDefaults.groupId}
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

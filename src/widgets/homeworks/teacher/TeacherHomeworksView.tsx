import { ChangeEvent, FC, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import controls from '../../../shared/styles/controls.module.css';
import styles from './TeacherHomeworksView.module.css';
import { TeacherBulkAction, TeacherHomeworksViewModel, TeacherHomeworkGroupKey } from '../types';
import { HomeworkAssignModal } from '../../../features/homework-assign/ui/HomeworkAssignModal';
import { HomeworkAssignment, HomeworkGroupListItem, HomeworkTemplate } from '../../../entities/types';
import { canCancelHomeworkAssignmentIssue } from '../../../entities/homework-assignment/model/lib/assignmentIssuance';
import { HomeworkReviewModal } from '../../../features/homework-review/ui/HomeworkReviewModal';
import { Modal } from '../../../shared/ui/Modal/Modal';
import { Checkbox } from '../../../shared/ui/Checkbox/Checkbox';
import { Tooltip } from '../../../shared/ui/Tooltip/Tooltip';
import { Ellipsis } from '../../../shared/ui/Ellipsis/Ellipsis';
import { AnchoredPopover } from '../../../shared/ui/AnchoredPopover/AnchoredPopover';
import { DayPicker } from '../../../shared/day-picker';
import { loadStoredCreateTemplateDraftSummary } from '../../../features/homework-template-editor/model/lib/createTemplateDraftStorage';
import {
  HomeworkAlignLeftIcon,
  HomeworkBellRegularIcon,
  HomeworkBookmarkRegularIcon,
  HomeworkBoltIcon,
  HomeworkChevronDownIcon,
  HomeworkFilePdfIcon,
  HomeworkFileLinesIcon,
  HomeworkFolderIcon,
  HomeworkLayerGroupIcon,
  HomeworkLinkIcon,
  HomeworkListCheckIcon,
  HomeworkMagnifyingGlassIcon,
  HomeworkMicrophoneIcon,
  HomeworkPenIcon,
  HomeworkPenToSquareIcon,
  HomeworkPlusIcon,
  HomeworkRobotIcon,
} from '../../../shared/ui/icons/HomeworkFaIcons';
import { MoreHorizIcon } from '../../../icons/MaterialIcons';
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
import { useTimeZone } from '../../../shared/lib/timezoneContext';
import { toLocalDateTimeValue, toUtcIsoFromLocal } from '../../../features/homework-assign/model/lib/assignmentStarter';
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
  resolveGroupCardPalette,
  resolveGroupEditorBgColor,
  resolveGroupEditorIconKey,
} from './model/lib/groupEditorStyles';
import { GroupIconView } from './model/lib/groupIconView';
import { GroupEditorModal } from './ui/GroupEditorModal/GroupEditorModal';
import { HomeworkTemplateCard } from './ui/HomeworkTemplateCard/HomeworkTemplateCard';
import { TeacherHomeworksKpiSection } from './ui/TeacherHomeworksKpiSection';
import { HomeworkListFiltersPopover } from './ui/HomeworkListFiltersPopover/HomeworkListFiltersPopover';
import { TopbarCreateMenu } from '../../layout/ui/TopbarCreateMenu/TopbarCreateMenu';

type WorkspaceMode = 'list' | 'groups' | 'templates';

const resolveWorkspaceMode = (value: string | null): WorkspaceMode => {
  if (value === 'groups' || value === 'templates') {
    return value;
  }
  return 'list';
};

const MODE_TABS: Array<{ id: WorkspaceMode; label: string }> = [
  { id: 'list', label: 'Список домашек' },
  { id: 'groups', label: 'Группы' },
  { id: 'templates', label: 'Шаблоны' },
];

const STATUS_TABS: Array<{ id: TeacherHomeworksViewModel['activeTab']; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'not_issued', label: 'Не выдана' },
  { id: 'sent', label: 'Выдана' },
  { id: 'review', label: 'На проверке' },
  { id: 'closed', label: 'Завершено' },
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
      icons: [],
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

const resolveIssuanceLabel = (assignment: HomeworkAssignment) => {
  if (assignment.status === 'DRAFT') return 'Черновик';
  if (assignment.status === 'REVIEWED') return 'Проверено';
  if (assignment.status === 'SCHEDULED') return 'Не выдана';
  return 'Выдана';
};

const resolveIssuanceTone = (assignment: HomeworkAssignment) =>
  assignment.status === 'REVIEWED'
    ? 'reviewed'
    : assignment.status === 'DRAFT' || assignment.status === 'SCHEDULED'
      ? 'draft'
      : 'sent';

const resolveAutoCheckTooltip = (badge: AutoCheckBadge | null) => {
  if (!badge) return null;
  if (badge.tone === 'success') return 'Проверено автоматически';
  if (badge.tone === 'warning') return 'Частично проверено автоматически';
  return 'Автопроверка недоступна';
};

const padTimePart = (value: number) => value.toString().padStart(2, '0');

const parseDraftDateTime = (value: string, timeZone: string) => {
  const nextIso = toUtcIsoFromLocal(value, timeZone);
  if (!nextIso) return null;
  const nextDate = new Date(nextIso);
  if (Number.isNaN(nextDate.getTime())) return null;
  return nextDate;
};

const getDraftTimeParts = (value?: string) => {
  if (!value) {
    return { hours: '20', minutes: '00' };
  }
  const [, timePart = '20:00'] = value.split('T');
  const [hours = '20', minutes = '00'] = timePart.split(':');
  return {
    hours: hours.padStart(2, '0'),
    minutes: minutes.padStart(2, '0'),
  };
};

type AssignmentRowMenuProps = {
  assignment: HomeworkAssignment;
  canCancelIssue: boolean;
  shouldShowRemind: boolean;
  onCancelIssue: (assignment: HomeworkAssignment) => void;
  onRemind: (assignment: HomeworkAssignment) => void;
  onDelete: (assignment: HomeworkAssignment) => void;
};

const AssignmentRowMenu: FC<AssignmentRowMenuProps> = ({
  assignment,
  canCancelIssue,
  shouldShowRemind,
  onCancelIssue,
  onRemind,
  onDelete,
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const isOpen = anchorEl !== null;
  const hasActions = true;

  if (!hasActions) return null;

  return (
    <>
      <button
        type="button"
        className={styles.rowMenuButton}
        aria-label="Открыть меню действий"
        onClick={(event) => {
          setAnchorEl((current) => (current ? null : event.currentTarget));
        }}
      >
        <MoreHorizIcon width={18} height={18} />
      </button>
      <AnchoredPopover
        isOpen={isOpen}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        side="bottom"
        align="end"
        className={styles.rowMenuPopover}
      >
        <div className={styles.rowMenuList}>
          {canCancelIssue ? (
            <button
              type="button"
              className={`${styles.rowMenuItem} ${styles.rowMenuItemDanger}`}
              onClick={() => {
                setAnchorEl(null);
                onCancelIssue(assignment);
              }}
            >
              Отменить выдачу
            </button>
          ) : null}
          {shouldShowRemind ? (
            <button
              type="button"
              className={styles.rowMenuItem}
              onClick={() => {
                setAnchorEl(null);
                onRemind(assignment);
              }}
            >
              Напомнить ученику
            </button>
          ) : null}
          <button
            type="button"
            className={`${styles.rowMenuItem} ${styles.rowMenuItemDangerSoft}`}
            onClick={() => {
              setAnchorEl(null);
              onDelete(assignment);
            }}
          >
            Удалить
          </button>
        </div>
      </AnchoredPopover>
    </>
  );
};

type AssignmentDeadlineCellProps = {
  assignment: HomeworkAssignment;
  onUpdate: (assignment: HomeworkAssignment, deadlineAt: string | null) => Promise<void>;
};

const AssignmentDeadlineCell: FC<AssignmentDeadlineCellProps> = ({ assignment, onUpdate }) => {
  const timeZone = useTimeZone();
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState<string | undefined>(
    assignment.deadlineAt ? toLocalDateTimeValue(assignment.deadlineAt, timeZone) : undefined,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraftValue(assignment.deadlineAt ? toLocalDateTimeValue(assignment.deadlineAt, timeZone) : undefined);
  }, [assignment.deadlineAt, timeZone]);

  const deadlineMeta = resolveAssignmentDeadlineMeta(assignment);
  const parsedDraftDate = useMemo(
    () => (draftValue ? parseDraftDateTime(draftValue, timeZone) : null),
    [draftValue, timeZone],
  );
  const selectedDraftDate = useMemo(
    () => (parsedDraftDate ? new Date(parsedDraftDate.getTime()) : undefined),
    [parsedDraftDate],
  );
  const selectedTimeParts = useMemo(() => getDraftTimeParts(draftValue), [draftValue]);
  const monthViewDate = useMemo(() => selectedDraftDate ?? new Date(), [selectedDraftDate]);
  const timeOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => padTimePart(index * 5)),
    [],
  );

  const handlePersist = async (nextLocalValue: string | undefined = draftValue) => {
    if (saving) return;
    setIsEditing(false);
    const nextDeadlineAt = nextLocalValue ? toUtcIsoFromLocal(nextLocalValue, timeZone) : null;
    if ((assignment.deadlineAt ?? null) === nextDeadlineAt) return;
    setSaving(true);
    try {
      await onUpdate(assignment, nextDeadlineAt);
    } finally {
      setSaving(false);
    }
  };

  const closeEditor = (nextLocalValue?: string) => {
    void handlePersist(nextLocalValue);
  };

  const handleDateSelect = (date?: Date) => {
    if (!date) return;
    const { hours, minutes } = getDraftTimeParts(draftValue);
    setDraftValue(`${format(date, "yyyy-MM-dd")}T${hours}:${minutes}`);
  };

  const handleTimeChange =
    (part: 'hours' | 'minutes') =>
    (event: ChangeEvent<HTMLSelectElement>) => {
      const baseDate = selectedDraftDate ?? new Date();
      const nextDate = format(baseDate, 'yyyy-MM-dd');
      const currentParts = getDraftTimeParts(draftValue);
      const nextParts =
        part === 'hours'
          ? { hours: event.target.value, minutes: currentParts.minutes }
          : { hours: currentParts.hours, minutes: event.target.value };
      setDraftValue(`${nextDate}T${nextParts.hours}:${nextParts.minutes}`);
    };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={styles.deadlineButton}
        onClick={() => {
          setIsEditing((current) => {
            if (current) {
              closeEditor(draftValue);
              return false;
            }
            return true;
          });
        }}
        disabled={saving}
      >
        <div className={styles.deadlineColumn}>
          <div>{deadlineMeta.primary}</div>
          {deadlineMeta.secondary ? (
            deadlineMeta.tone === 'danger' ? (
              <div className={`${styles.deadlineHint} ${styles.deadlineHintDanger}`}>{deadlineMeta.secondary}</div>
            ) : (
              <div className={styles.deadlineHint}>{deadlineMeta.secondary}</div>
            )
          ) : null}
        </div>
      </button>
      <AnchoredPopover
        isOpen={isEditing}
        anchorEl={anchorRef.current}
        onClose={() => closeEditor(draftValue)}
        side="bottom"
        align="start"
        className={styles.deadlinePopover}
      >
        <div className={styles.deadlinePickerCard}>
          <div className={styles.deadlinePickerHeader}>
            <span className={styles.deadlinePickerTitle}>Изменить дедлайн</span>
            <button
              type="button"
              className={styles.deadlineClearButton}
              onClick={() => {
                setDraftValue(undefined);
                closeEditor(undefined);
              }}
            >
              Убрать
            </button>
          </div>
          <div className={styles.deadlinePickerCalendar}>
            <DayPicker
              mode="single"
              locale={ru}
              weekStartsOn={1}
              selected={selectedDraftDate}
              defaultMonth={monthViewDate}
              onSelect={handleDateSelect}
            />
          </div>
          <div className={styles.deadlinePickerTimeRow}>
            <div className={styles.deadlineTimeField}>
              <span>Часы</span>
              <select
                className={styles.deadlineTimeSelect}
                value={selectedTimeParts.hours}
                onChange={handleTimeChange('hours')}
              >
                {Array.from({ length: 24 }, (_, hour) => padTimePart(hour)).map((hour) => (
                  <option key={hour} value={hour}>
                    {hour}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.deadlineTimeField}>
              <span>Минуты</span>
              <select
                className={styles.deadlineTimeSelect}
                value={selectedTimeParts.minutes}
                onChange={handleTimeChange('minutes')}
              >
                {timeOptions.map((minute) => (
                  <option key={minute} value={minute}>
                    {minute}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className={styles.deadlineApplyButton}
              onClick={() => closeEditor(draftValue)}
            >
              Готово
            </button>
          </div>
        </div>
      </AnchoredPopover>
    </>
  );
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
  assignModalRequest,
  homeworkActivityItems,
  homeworkActivityLoading,
  homeworkActivityHasUnread,
  onTabChange,
  onSearchChange,
  onSortChange,
  onSelectedStudentIdChange,
  onOpenCreateAssignmentScreen,
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
  onCancelAssignmentIssue,
  onRemindAssignment,
  onOpenStudentProfile,
  onOpenLessonDay,
  onUpdateAssignmentDeadline,
  onDeleteAssignment,
  onFixConfigError,
  onBulkAction,
  onOpenReview,
  onCloseReview,
  onStartReviewQueue,
  onOpenDetail,
  onLoadMoreAssignments,
  onConsumeAssignModalRequest,
  onSubmitReview,
  onLoadHomeworkActivity,
  onMarkHomeworkActivitySeen,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [isBulkPanelOpen, setIsBulkPanelOpen] = useState(false);
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
  const workspaceSearchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );
  const workspaceMode = useMemo(
    () => resolveWorkspaceMode(workspaceSearchParams.get('view')),
    [workspaceSearchParams],
  );

  const setWorkspaceMode = (nextMode: WorkspaceMode) => {
    const nextSearchParams = new URLSearchParams(location.search);
    if (nextMode === 'list') {
      nextSearchParams.delete('view');
    } else {
      nextSearchParams.set('view', nextMode);
    }
    navigate(`${location.pathname}${nextSearchParams.toString() ? `?${nextSearchParams.toString()}` : ''}`);
  };

  const countsByTab = useMemo(
    () => ({
      all: summary.totalCount,
      not_issued: summary.draftCount + summary.scheduledCount,
      sent: summary.inProgressCount,
      review: summary.reviewCount,
      closed: summary.closedCount,
    }),
    [summary],
  );
  const canStartReviewQueue = summary.permissions.canStartReviewQueue;

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
  const createMenuItems = [
    {
      id: 'create_assignment',
      label: 'Создать домашнее задание',
      description: 'Открыть редактор и собрать задание с нуля.',
      onSelect: onOpenCreateAssignmentScreen,
    },
    {
      id: 'assign_homework',
      label: 'Отправить домашнее задание',
      description: 'Быстро выдать домашку ученику по шаблону или черновику.',
      onSelect: () => openAssignModal(),
    },
    {
      id: 'create_template',
      label: 'Создать шаблон',
      description: 'Подготовить заготовку, чтобы потом выдавать задания быстрее.',
      onSelect: onOpenCreateTemplateScreen,
    },
  ];

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
          <div className={styles.topSection}>
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

          </div>

          {workspaceMode === 'list' ? (
            <div className={styles.actionsRow}>
              <label className={styles.toolbarSearch}>
                <HomeworkMagnifyingGlassIcon size={12} className={styles.toolbarSearchIcon} />
                <input
                  type="search"
                  className={styles.toolbarSearchInput}
                  value={searchQuery}
                  placeholder="Поиск по заданию, ученику или шаблону"
                  onChange={(event) => onSearchChange(event.target.value)}
                />
              </label>
              <HomeworkListFiltersPopover
                sortBy={sortBy}
                selectedStudentId={selectedStudentId}
                students={students}
                loadingStudents={loadingStudents}
                sortOptions={SORT_LABELS}
                onSortChange={onSortChange}
                onSelectedStudentIdChange={onSelectedStudentIdChange}
              />
              <div className={styles.mobileCreateMenu}>
                <TopbarCreateMenu
                  label="Добавить"
                  items={createMenuItems}
                  triggerClassName={styles.mobileCreateMenuButton}
                />
              </div>
              <Tooltip content="События">
                <button
                  type="button"
                  className={styles.toolIconButton}
                  onClick={handleOpenActivity}
                >
                  <HomeworkBellRegularIcon size={15} className={styles.toolbarIcon} />
                  {homeworkActivityHasUnread ? <span className={styles.unreadDot} /> : null}
                </button>
              </Tooltip>
              <Tooltip content="Массовые действия">
                <button
                  type="button"
                  className={styles.toolIconButton}
                  onClick={() => setIsBulkPanelOpen((prev) => !prev)}
                >
                  <HomeworkLayerGroupIcon size={16} className={styles.toolbarIcon} />
                </button>
              </Tooltip>
              {canStartReviewQueue ? (
                <button type="button" className={styles.reviewQueueButton} onClick={onStartReviewQueue}>
                  <HomeworkBoltIcon size={14} className={styles.toolbarIcon} />
                  <span>Проверять подряд</span>
                </button>
              ) : null}
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
                <th>Дата создания</th>
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
                  <td colSpan={7} className={styles.emptyRow}>
                    Пока ничего не найдено. Попробуйте изменить поиск или используйте кнопку «Добавить» в верхнем хедере, чтобы создать задание, выдать домашку или собрать новый шаблон.
                  </td>
                </tr>
              ) : (
                assignments.map((assignment) => {
                  const responseMeta = resolveAssignmentResponseMeta(assignment);
                  const problemBadges = resolveAssignmentProblemBadges(assignment);
                  const studentLabel = assignment.studentName || studentsById.get(assignment.studentId) || `Ученик #${assignment.studentId}`;
                  const studentInitials = getStudentInitials(studentLabel);
                  const studentAvatarColor = resolveAssignmentStudentAvatarColor(assignment);
                  const studentAvatarTextColor = resolveAssignmentStudentAvatarTextColor(studentAvatarColor);
                  const shouldReview = needsAssignmentReview(assignment);
                  const responseVisual = resolveResponseVisual(assignment);
                  const responseText = responseVisual.kind === 'empty' ? responseVisual.emptyText || responseMeta : '';
                  const shouldShowEmptyResponse = responseText === 'Нет ответа';
                  const isOverdueRow = problemBadges.hasOverdue;
                  const canSendNow = assignment.status === 'DRAFT' || assignment.status === 'SCHEDULED';
                  const canCancelIssue = canCancelHomeworkAssignmentIssue(assignment);
                  const shouldShowRemind = assignment.status === 'SENT' || assignment.status === 'RETURNED' || isOverdueRow;
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
                            <button
                              type="button"
                              className={styles.assignmentTitleButton}
                              onClick={() => onOpenDetail(assignment)}
                              aria-label={`Открыть домашнее задание "${assignment.title}"`}
                            >
                              <Ellipsis
                                className={styles.assignmentTitle}
                                title={assignment.title}
                                tooltipAlign="start"
                              >
                                {assignment.title}
                              </Ellipsis>
                            </button>
                            <div className={styles.assignmentMeta}>
                              <button
                                type="button"
                                className={styles.metaLinkButton}
                                onClick={() => onOpenStudentProfile(assignment.studentId)}
                              >
                                {studentLabel}
                              </button>
                              <span className={styles.metaDot} />
                              {assignment.lessonId ? (
                                <button
                                  type="button"
                                  className={`${styles.lessonMeta} ${styles.metaLinkButton}`}
                                  onClick={() => onOpenLessonDay(assignment)}
                                >
                                  <HomeworkLinkIcon size={10} className={styles.lessonMetaIcon} />
                                  <span>{formatDateTime(assignment.lessonStartAt)}</span>
                                </button>
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
                          <span className={`${styles.issuanceBadge} ${styles[`issuanceBadge_${resolveIssuanceTone(assignment)}`]}`}>
                            {resolveIssuanceLabel(assignment)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <AssignmentDeadlineCell assignment={assignment} onUpdate={onUpdateAssignmentDeadline} />
                      </td>
                      <td>
                        <div className={styles.createdAtCell}>{formatDateTime(assignment.createdAt)}</div>
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
                                <Tooltip content={resolveAutoCheckTooltip(responseVisual.autoCheckBadge) ?? ''}>
                                  <span
                                    className={`${styles.responseAutoBadge} ${
                                      styles[`responseAutoBadge_${responseVisual.autoCheckBadge.tone}`]
                                    }`}
                                  >
                                    <HomeworkRobotIcon size={12} className={styles.inlineFaIcon} />
                                    <span>{responseVisual.autoCheckBadge.label}</span>
                                  </span>
                                </Tooltip>
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
                                  Выдать
                                </button>
                              ) : null}
                              <AssignmentRowMenu
                                assignment={assignment}
                                canCancelIssue={canCancelIssue}
                                shouldShowRemind={shouldShowRemind}
                                onCancelIssue={(targetAssignment) => {
                                  void onCancelAssignmentIssue(targetAssignment);
                                }}
                                onRemind={(targetAssignment) => {
                                  void onRemindAssignment(targetAssignment);
                                }}
                                onDelete={(targetAssignment) => {
                                  void onDeleteAssignment(targetAssignment);
                                }}
                              />
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
                  <div className={styles.mobileCardHeader}>
                    <span className={`${styles.skeletonPulse} ${styles.skeletonCheck}`} />
                    <span className={`${styles.skeletonPulse} ${styles.mobileSkeletonBadge}`} />
                  </div>
                  <div className={styles.mobileStudent}>
                    <span className={`${styles.skeletonPulse} ${styles.skeletonAvatar}`} />
                    <div className={styles.mobileStudentMain}>
                      <div className={styles.mobileTop}>
                        <span className={`${styles.skeletonPulse} ${styles.skeletonLine} ${styles.mobileSkeletonTitle}`} />
                        <span className={`${styles.skeletonPulse} ${styles.mobileSkeletonBadge}`} />
                      </div>
                      <span className={`${styles.skeletonPulse} ${styles.skeletonLine} ${styles.mobileSkeletonMeta}`} />
                    </div>
                  </div>
                  <div className={styles.mobileMetaGrid}>
                    <div className={styles.mobileMetaCard}>
                      <span className={`${styles.skeletonPulse} ${styles.skeletonLine} ${styles.mobileSkeletonMeta}`} />
                      <span className={`${styles.skeletonPulse} ${styles.skeletonLine} ${styles.mobileSkeletonMetaShort}`} />
                    </div>
                    <div className={styles.mobileMetaCard}>
                      <span className={`${styles.skeletonPulse} ${styles.skeletonLine} ${styles.mobileSkeletonMeta}`} />
                      <span className={`${styles.skeletonPulse} ${styles.skeletonLine} ${styles.mobileSkeletonMetaShort}`} />
                    </div>
                  </div>
                  <div className={styles.mobileSubmeta}>
                    <span className={`${styles.skeletonPulse} ${styles.skeletonLine} ${styles.mobileSkeletonTitle}`} />
                    <span className={`${styles.skeletonPulse} ${styles.skeletonLine} ${styles.mobileSkeletonMetaShort}`} />
                  </div>
                  <div className={styles.mobileActions}>
                    <span className={`${styles.skeletonPulse} ${styles.mobileSkeletonAction}`} />
                    <span className={`${styles.skeletonPulse} ${styles.mobileSkeletonAction}`} />
                  </div>
                </article>
              ))
            : assignments.length === 0 ? (
                <div className={styles.mobileEmptyState}>
                  Пока ничего не найдено. Попробуйте изменить поиск или используйте кнопку «Добавить», чтобы создать новое задание.
                </div>
              ) : assignments.map((assignment) => {
                const responseMeta = resolveAssignmentResponseMeta(assignment);
                const studentLabel = assignment.studentName || studentsById.get(assignment.studentId) || `Ученик #${assignment.studentId}`;
                const studentInitials = getStudentInitials(studentLabel);
                const studentAvatarColor = resolveAssignmentStudentAvatarColor(assignment);
                const studentAvatarTextColor = resolveAssignmentStudentAvatarTextColor(studentAvatarColor);
                const statusTone = resolveStatusTone(assignment);
                const shouldReview = needsAssignmentReview(assignment);
                const problemBadges = resolveAssignmentProblemBadges(assignment);
                const responseVisual = resolveResponseVisual(assignment);
                const isSelected = selectedIds.includes(assignment.id);
                const isOverdueRow = problemBadges.hasOverdue;
                const canSendNow = assignment.status === 'DRAFT' || assignment.status === 'SCHEDULED';
                const canCancelIssue = canCancelHomeworkAssignmentIssue(assignment);
                const shouldShowRemind = assignment.status === 'SENT' || assignment.status === 'RETURNED' || isOverdueRow;
                const hasLessonMeta = Boolean(assignment.lessonId);
                const hasTemplateMeta = Boolean(assignment.templateTitle);
                return (
                  <article
                    key={`mobile_${assignment.id}`}
                    className={`${styles.mobileCard} ${assignment.isOverdue ? styles.rowOverdue : ''} ${
                      assignment.hasConfigError ? styles.rowConfigError : ''
                    }`}
                  >
                    <div className={styles.mobileCardHeader}>
                      <div className={styles.mobileBadgeRow}>
                        <span className={`${styles.issuanceBadge} ${styles[`issuanceBadge_${resolveIssuanceTone(assignment)}`]}`}>
                          {resolveIssuanceLabel(assignment)}
                        </span>
                        <span className={`${styles.statusBadge} ${styles[`statusBadge_${statusTone}`]}`}>
                          {resolveStatusLabel(assignment)}
                        </span>
                      </div>
                      <Checkbox
                        checked={isSelected}
                        onChange={(event) =>
                          setSelectedIds((prev) =>
                            event.target.checked ? [...prev, assignment.id] : prev.filter((id) => id !== assignment.id),
                          )
                        }
                        aria-label={`Выбрать ${assignment.title}`}
                      />
                    </div>

                    <div className={styles.mobileStudent}>
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

                      <div className={styles.mobileStudentMain}>
                        <button
                          type="button"
                          className={styles.assignmentTitleButton}
                          onClick={() => onOpenDetail(assignment)}
                          aria-label={`Открыть домашнее задание "${assignment.title}"`}
                        >
                          <Ellipsis
                            className={styles.assignmentTitle}
                            title={assignment.title}
                            tooltipAlign="start"
                          >
                            {assignment.title}
                          </Ellipsis>
                        </button>
                        <button
                          type="button"
                          className={`${styles.mobileStudentLabel} ${styles.metaLinkButton}`}
                          onClick={() => onOpenStudentProfile(assignment.studentId)}
                        >
                          {studentLabel}
                        </button>
                        {problemBadges.hasOverdue || problemBadges.hasReturned || problemBadges.hasConfigError ? (
                          <div className={styles.problemBadges}>
                            {problemBadges.hasOverdue ? <span className={styles.problemDanger}>Просрочено</span> : null}
                            {problemBadges.hasReturned ? <span className={styles.problemWarn}>На доработке</span> : null}
                            {problemBadges.hasConfigError ? <span className={styles.problemDanger}>Ошибка настройки</span> : null}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className={styles.mobileMetaGrid}>
                      <div className={styles.mobileMetaCard}>
                        <span className={styles.mobileMetaLabel}>Дедлайн</span>
                        <AssignmentDeadlineCell assignment={assignment} onUpdate={onUpdateAssignmentDeadline} />
                      </div>

                      <div className={styles.mobileMetaCard}>
                        <span className={styles.mobileMetaLabel}>Создано</span>
                        <span className={styles.mobileMetaValue}>{formatDateTime(assignment.createdAt)}</span>
                      </div>

                      <div className={styles.mobileMetaCard}>
                        <span className={styles.mobileMetaLabel}>Ответ</span>
                        {responseVisual.kind === 'empty' ? (
                          <span className={styles.mobileResponseText}>{responseVisual.emptyText || responseMeta}</span>
                        ) : (
                          <div className={styles.mobileResponseRow}>
                            <div className={styles.responseIcons}>
                              {(responseVisual.icons ?? []).map((icon) => (
                                <span
                                  key={`${assignment.id}_mobile_${icon.id}`}
                                  className={`${styles.responseIconChip} ${styles[`responseIconChip_${icon.tone}`]}`}
                                >
                                  {icon.kind === 'text' ? <HomeworkAlignLeftIcon size={12} className={styles.inlineFaIcon} /> : null}
                                  {icon.kind === 'file' ? <HomeworkFilePdfIcon size={12} className={styles.inlineFaIcon} /> : null}
                                  {icon.kind === 'voice' ? <HomeworkMicrophoneIcon size={12} className={styles.inlineFaIcon} /> : null}
                                  {icon.kind === 'test' ? <HomeworkListCheckIcon size={12} className={styles.inlineFaIcon} /> : null}
                                </span>
                              ))}
                            </div>
                            {responseVisual.autoCheckBadge ? (
                              <Tooltip content={resolveAutoCheckTooltip(responseVisual.autoCheckBadge) ?? ''}>
                                <span
                                  className={`${styles.responseAutoBadge} ${
                                    styles[`responseAutoBadge_${responseVisual.autoCheckBadge.tone}`]
                                  }`}
                                >
                                  <HomeworkRobotIcon size={12} className={styles.inlineFaIcon} />
                                  <span>{responseVisual.autoCheckBadge.label}</span>
                                </span>
                              </Tooltip>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>

                    {hasLessonMeta || hasTemplateMeta ? (
                      <div className={styles.mobileSubmeta}>
                        {hasLessonMeta ? (
                          <button
                            type="button"
                            className={`${styles.lessonMeta} ${styles.metaLinkButton}`}
                            onClick={() => onOpenLessonDay(assignment)}
                          >
                            <HomeworkLinkIcon size={10} className={styles.lessonMetaIcon} />
                            <span>{formatDateTime(assignment.lessonStartAt)}</span>
                          </button>
                        ) : null}
                        {hasTemplateMeta ? <span>Шаблон: {assignment.templateTitle}</span> : null}
                      </div>
                    ) : null}

                    <div className={styles.mobileActions}>
                      {shouldReview ? (
                        <button
                          type="button"
                          className={`${styles.reviewButton} ${styles.mobileActionButton}`}
                          onClick={() => onOpenReview(assignment)}
                        >
                          Проверить
                        </button>
                      ) : null}

                      {assignment.hasConfigError ? (
                        <button
                          type="button"
                          className={`${styles.fixButton} ${styles.mobileActionButton}`}
                          onClick={() => {
                            void onFixConfigError(assignment);
                          }}
                        >
                          Исправить
                        </button>
                      ) : null}

                      {canSendNow ? (
                        <button
                          type="button"
                          className={`${styles.sendNowButton} ${styles.mobileActionButton}`}
                          onClick={() => {
                            void onSendAssignmentNow(assignment);
                          }}
                        >
                          Выдать
                        </button>
                      ) : null}

                      <AssignmentRowMenu
                        assignment={assignment}
                        canCancelIssue={canCancelIssue}
                        shouldShowRemind={shouldShowRemind}
                        onCancelIssue={(targetAssignment) => {
                          void onCancelAssignmentIssue(targetAssignment);
                        }}
                        onRemind={(targetAssignment) => {
                          void onRemindAssignment(targetAssignment);
                        }}
                        onDelete={(targetAssignment) => {
                          void onDeleteAssignment(targetAssignment);
                        }}
                      />
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
                  const palette = resolveGroupCardPalette(group.bgColor);

                  return (
                    <article key={group.id ?? 'ungrouped'} className={styles.groupCard}>
                      <div
                        role="button"
                        tabIndex={0}
                        className={styles.groupCardHeader}
                        style={{ background: palette.headerBackground }}
                        onClick={() => toggleGroupExpanded(group)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          event.preventDefault();
                          toggleGroupExpanded(group);
                        }}
                      >
                        <span className={styles.groupCardMain}>
                          <span
                            className={styles.groupIconBadge}
                            style={{
                              backgroundColor: palette.iconBackground,
                              color: palette.iconColor,
                            }}
                          >
                            <GroupIconView iconKey={group.iconKey} size={14} />
                          </span>
                          <span className={styles.groupTitleBlock}>
                            <span className={styles.groupTitleRow}>
                              <span className={styles.groupTitle}>{group.title}</span>
                              <span
                                className={styles.groupCountBadge}
                                style={{
                                  backgroundColor: palette.countBadgeBackground,
                                  color: palette.countBadgeColor,
                                }}
                              >
                                {group.assignmentsCount} заданий
                              </span>
                            </span>
                            <span className={styles.groupSubtitle}>{group.description || 'Задания внутри группы'}</span>
                          </span>
                        </span>
                        <span className={styles.groupHeaderActions}>
                          {!group.isSystem && group.id !== null ? (
                            <Tooltip content="Редактировать группу">
                              <button
                                type="button"
                                className={styles.groupEditIconButton}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openEditGroupEditor(group);
                                }}
                                aria-label="Редактировать группу"
                              >
                                <HomeworkPenIcon size={11} className={styles.inlineFaIcon} />
                              </button>
                            </Tooltip>
                          ) : null}
                          <HomeworkChevronDownIcon
                            size={12}
                            className={`${styles.groupChevron} ${expanded ? styles.groupChevronExpanded : ''}`}
                          />
                        </span>
                      </div>

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
                                      <Tooltip content="Редактировать">
                                        <button
                                          type="button"
                                          className={styles.groupAssignmentEditButton}
                                          onClick={() => onOpenDetail(assignment)}
                                          aria-label="Редактировать"
                                        >
                                          <HomeworkPenToSquareIcon size={12} className={styles.inlineFaIcon} />
                                        </button>
                                      </Tooltip>
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
                onUseTemplate={(item) => {
                  void onCreateAssignment({
                    studentId: selectedStudentId,
                    lessonId: null,
                    templateId: item.id,
                    groupId: null,
                    deadlineAt: null,
                    sendMode: 'MANUAL',
                  });
                }}
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

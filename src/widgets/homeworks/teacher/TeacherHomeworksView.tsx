import { ChangeEvent, FC, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useIsMobile } from '../../../shared/lib/useIsMobile';
import controls from '../../../shared/styles/controls.module.css';
import styles from './TeacherHomeworksView.module.css';
import { TeacherBulkAction, TeacherHomeworksViewModel, TeacherHomeworkGroupKey } from '../types';
import { HomeworkAssignModal } from '../../../features/homework-assign/ui/HomeworkAssignModal';
import { HomeworkAssignment, HomeworkGroupListItem, HomeworkTemplate } from '../../../entities/types';
import { canCancelHomeworkAssignmentIssue } from '../../../entities/homework-assignment/model/lib/assignmentIssuance';
import {
  canReissueHomeworkAssignment,
  canTeacherEditHomeworkAssignment,
  resolveHomeworkAssignmentWorkflow,
} from '../../../entities/homework-assignment/model/lib/workflow';
import { HomeworkReviewModal } from '../../../features/homework-review/ui/HomeworkReviewModal';
import { Modal } from '../../../shared/ui/Modal/Modal';
import { Checkbox } from '../../../shared/ui/Checkbox/Checkbox';
import { Tooltip } from '../../../shared/ui/Tooltip/Tooltip';
import { Ellipsis } from '../../../shared/ui/Ellipsis/Ellipsis';
import { AnchoredPopover } from '../../../shared/ui/AnchoredPopover/AnchoredPopover';
import { DayPicker } from '../../../shared/day-picker';
import {
  HomeworkAlignLeftIcon,
  HomeworkBellRegularIcon,
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
  DEFAULT_GROUP_EDITOR_BG_COLOR,
  DEFAULT_GROUP_EDITOR_ICON_KEY,
  resolveGroupCardPalette,
  resolveGroupEditorBgColor,
  resolveGroupEditorIconKey,
} from './model/lib/groupEditorStyles';
import { GroupIconView } from './model/lib/groupIconView';
import { GroupEditorModal } from './ui/GroupEditorModal/GroupEditorModal';
import { HomeworkLibraryWorkspace } from './ui/HomeworkLibraryWorkspace/HomeworkLibraryWorkspace';
import { HomeworkAssignmentsWorkspace } from './ui/HomeworkAssignmentsWorkspace/HomeworkAssignmentsWorkspace';
import { HomeworkListFiltersPopover } from './ui/HomeworkListFiltersPopover/HomeworkListFiltersPopover';
import { TeacherHomeworksHeader } from './ui/TeacherHomeworksHeader/TeacherHomeworksHeader';
import { TopbarCreateMenu } from '../../layout/ui/TopbarCreateMenu/TopbarCreateMenu';
import { TeacherHomeworksMobileScreen } from './ui/TeacherHomeworksMobileScreen/TeacherHomeworksMobileScreen';

type WorkspaceMode = 'list' | 'drafts' | 'groups' | 'templates';

const resolveWorkspaceMode = (value: string | null): WorkspaceMode => {
  if (value === 'list' || value === 'drafts' || value === 'groups' || value === 'templates') {
    return value;
  }
  return 'templates';
};

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
  { id: 'CANCEL_ISSUE', label: 'Отменить выдачу' },
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
  resolveHomeworkAssignmentWorkflow(assignment).canTeacherReview;

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
  canReissue: boolean;
  shouldShowRemind: boolean;
  onCancelIssue: (assignment: HomeworkAssignment) => void;
  onReissue: (assignment: HomeworkAssignment) => void;
  onRemind: (assignment: HomeworkAssignment) => void;
  onDelete: (assignment: HomeworkAssignment) => void;
};

const AssignmentRowMenu: FC<AssignmentRowMenuProps> = ({
  assignment,
  canCancelIssue,
  canReissue,
  shouldShowRemind,
  onCancelIssue,
  onReissue,
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
          {canReissue ? (
            <button
              type="button"
              className={styles.rowMenuItem}
              onClick={() => {
                setAnchorEl(null);
                onReissue(assignment);
              }}
            >
              Переоткрыть домашку
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
  readOnly?: boolean;
  onUpdate: (assignment: HomeworkAssignment, deadlineAt: string | null) => Promise<void>;
};

const AssignmentDeadlineCell: FC<AssignmentDeadlineCellProps> = ({ assignment, readOnly = false, onUpdate }) => {
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
          if (readOnly) return;
          setIsEditing((current) => {
            if (current) {
              closeEditor(draftValue);
              return false;
            }
            return true;
          });
        }}
        disabled={saving || readOnly}
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
  problemFilters,
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
  onToggleProblemFilter,
  onSelectedStudentIdChange,
  onOpenCreateTemplateScreen,
  onOpenTemplateDetailScreen,
  onOpenEditTemplateScreen,
  onCreateGroup,
  onUpdateGroup,
  onDeleteGroup,
  onLoadGroupAssignments,
  onDuplicateTemplate,
  onArchiveTemplate,
  onRestoreTemplate,
  onDeleteTemplate,
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
  onReissueAssignment,
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
  onOpenMobileSidebar,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile(720);
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [isBulkPanelOpen, setIsBulkPanelOpen] = useState(false);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
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
    if (nextMode === 'drafts') {
      onTabChange('not_issued');
    } else if (nextMode === 'list' && activeTab === 'not_issued') {
      onTabChange('all');
    }
    const nextSearchParams = new URLSearchParams(location.search);
    if (nextMode === 'templates') {
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
  const headerSubtitle = useMemo(() => {
    const formattedDate = new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());
    const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(new Date());
    return `${formattedDate}, ${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}`;
  }, []);

  const studentsById = useMemo(() => new Map(students.map((item) => [item.id, item.name])), [students]);

  const filteredGroups = useMemo(() => {
    const query = groupSearchQuery.trim().toLowerCase();
    if (!query) return groups;
    return groups.filter((group) => {
      const description = (group.description ?? '').toLowerCase();
      return group.title.toLowerCase().includes(query) || description.includes(query);
    });
  }, [groupSearchQuery, groups]);
  const draftAssignmentRows = useMemo(
    () => assignments.filter((assignment) => assignment.status === 'DRAFT' || assignment.status === 'SCHEDULED'),
    [assignments],
  );
  const issuedAssignmentRows = useMemo(
    () => assignments.filter((assignment) => assignment.status !== 'DRAFT' && assignment.status !== 'SCHEDULED'),
    [assignments],
  );
  const assignmentRows = useMemo(
    () => (workspaceMode === 'drafts' ? draftAssignmentRows : assignments),
    [assignments, draftAssignmentRows, workspaceMode],
  );
  const assignedCounts = useMemo(
    () => ({
      all: Math.max(summary.totalCount - summary.draftCount - summary.scheduledCount, 0),
      sent: summary.inProgressCount,
      review: summary.reviewCount,
      closed: summary.closedCount,
    }),
    [summary.closedCount, summary.draftCount, summary.inProgressCount, summary.reviewCount, summary.scheduledCount, summary.totalCount],
  );
  const draftCounts = useMemo(
    () => ({
      all: summary.draftCount + summary.scheduledCount,
      draft: summary.draftCount,
      scheduled: summary.scheduledCount,
    }),
    [summary.draftCount, summary.scheduledCount],
  );
  const allSelected =
    assignmentRows.length > 0 && assignmentRows.every((assignment) => selectedIds.includes(assignment.id));
  const createMenuItems = [
    {
      id: 'create_homework',
      label: 'Создать домашнее задание',
      description: 'Создать новое задание в библиотеке, чтобы потом выдать его ученику.',
      onSelect: onOpenCreateTemplateScreen,
      icon: <HomeworkFileLinesIcon size={12} />,
      iconTone: 'dark' as const,
    },
    {
      id: 'assign_homework',
      label: 'Отправить домашнее задание',
      description: 'Создать или открыть назначение для конкретного ученика.',
      onSelect: () => openAssignModal(),
      icon: <HomeworkLinkIcon size={12} />,
      iconTone: 'lime' as const,
    },
    {
      id: 'create_collection',
      label: 'Создать коллекцию',
      description: 'Собрать тематическую подборку домашних заданий.',
      onSelect: () => openCreateGroupEditor(),
      icon: <HomeworkFolderIcon size={12} />,
      iconTone: 'blue' as const,
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
      templateId: assignModalRequest.templateId ?? null,
      groupId: assignModalRequest.groupId ?? null,
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

  const openCreateGroupEditor = (templateIds: number[] = []) => {
    setGroupEditorMode('create');
    setEditingGroup(null);
    setGroupEditorDraft(createEmptyGroupDraft());
    setGroupEditorSelectedTemplateIds(templateIds);
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

  useEffect(() => {
    if (workspaceSearchParams.get('createCollection') !== '1') return;

    const requestedTemplateId = Number(workspaceSearchParams.get('templateId'));
    const nextTemplateIds =
      Number.isFinite(requestedTemplateId) && requestedTemplateId > 0 ? [requestedTemplateId] : [];

    openCreateGroupEditor(nextTemplateIds);

    const nextSearchParams = new URLSearchParams(location.search);
    nextSearchParams.delete('createCollection');
    nextSearchParams.delete('templateId');
    navigate(`${location.pathname}${nextSearchParams.toString() ? `?${nextSearchParams.toString()}` : ''}`, {
      replace: true,
    });
  }, [location.pathname, location.search, navigate, openCreateGroupEditor, workspaceSearchParams]);

  return (
    <section className={`${styles.page} ${isMobile ? styles.pageMobile : ''}`}>
      {isMobile ? (
        <TeacherHomeworksMobileScreen
          templates={templates}
          assignments={assignments}
          students={students}
          summary={summary}
          workspaceMode={workspaceMode}
          activeTab={activeTab}
          searchQuery={searchQuery}
          sortBy={sortBy}
          problemFilters={problemFilters}
          selectedStudentId={selectedStudentId}
          loadingTemplates={loadingTemplates}
          loadingAssignments={loadingAssignments}
          loadingMoreAssignments={loadingMoreAssignments}
          hasMoreAssignments={hasMoreAssignments}
          templatesError={templatesError}
          assignmentsError={assignmentsError}
          homeworkActivityHasUnread={homeworkActivityHasUnread}
          onOpenMobileSidebar={onOpenMobileSidebar}
          onOpenActivity={handleOpenActivity}
          onWorkspaceModeChange={setWorkspaceMode}
          onSearchChange={onSearchChange}
          onTabChange={onTabChange}
          onSortChange={onSortChange}
          onSelectedStudentIdChange={onSelectedStudentIdChange}
          onToggleProblemFilter={onToggleProblemFilter}
          onOpenCreateTemplateScreen={onOpenCreateTemplateScreen}
          onOpenAssignModal={() => openAssignModal()}
          onOpenTemplate={(template) => onOpenTemplateDetailScreen(template.id)}
          onEditTemplate={(template) => onOpenEditTemplateScreen(template)}
          onIssueTemplate={(template) => openAssignModal({ templateId: template.id })}
          onToggleFavorite={(template) => {
            void onToggleTemplateFavorite(template);
          }}
          onDuplicateTemplate={(template) => {
            void onDuplicateTemplate(template);
          }}
          onArchiveTemplate={(template) => {
            void onArchiveTemplate(template);
          }}
          onRestoreTemplate={(template) => {
            void onRestoreTemplate(template);
          }}
          onCreateCollection={(template) => openCreateGroupEditor(template ? [template.id] : [])}
          onDeleteTemplate={(template) => {
            void onDeleteTemplate(template);
          }}
          onOpenAssignment={onOpenDetail}
          onOpenReview={onOpenReview}
          onFixConfigError={(assignment) => {
            void onFixConfigError(assignment);
          }}
          onSendAssignmentNow={(assignment) => {
            void onSendAssignmentNow(assignment);
          }}
          onRemindAssignment={(assignment) => {
            void onRemindAssignment(assignment);
          }}
          onReissueAssignment={(assignment) => {
            void onReissueAssignment(assignment);
          }}
          onDeleteAssignment={(assignment) => {
            void onDeleteAssignment(assignment);
          }}
          onCancelAssignmentIssue={(assignment) => {
            void onCancelAssignmentIssue(assignment);
          }}
          onOpenStudentProfile={onOpenStudentProfile}
          onLoadMoreAssignments={onLoadMoreAssignments}
        />
      ) : (
        <>
          <TeacherHomeworksHeader
            title="Домашние задания"
            subtitle={headerSubtitle}
            workspaceMode={workspaceMode === 'groups' ? 'templates' : workspaceMode}
            hasUnreadActivity={homeworkActivityHasUnread}
            createMenuItems={createMenuItems}
            onOpenActivity={handleOpenActivity}
            onWorkspaceModeChange={setWorkspaceMode}
          />

          {workspaceMode === 'templates' ? (
            <HomeworkLibraryWorkspace
              templates={templates}
              loading={loadingTemplates}
              error={templatesError}
              onOpenTemplate={(template) => onOpenTemplateDetailScreen(template.id)}
              onEditTemplate={(template) => onOpenEditTemplateScreen(template)}
              onIssueTemplate={(template) => openAssignModal({ templateId: template.id })}
              onToggleFavorite={(template) => {
                void onToggleTemplateFavorite(template);
              }}
              onDuplicateTemplate={(template) => {
                void onDuplicateTemplate(template);
              }}
              onArchiveTemplate={(template) => {
                void onArchiveTemplate(template);
              }}
              onRestoreTemplate={(template) => {
                void onRestoreTemplate(template);
              }}
              onCreateCollection={(template) => openCreateGroupEditor(template ? [template.id] : [])}
              onDeleteTemplate={(template) => {
                void onDeleteTemplate(template);
              }}
            />
          ) : null}

          {workspaceMode === 'list' ? (
            <HomeworkAssignmentsWorkspace
              mode="assigned"
              assignments={issuedAssignmentRows}
              loading={loadingAssignments}
              error={assignmentsError ?? summaryError ?? studentsError}
              searchQuery={searchQuery}
              sortBy={sortBy}
              selectedStudentId={selectedStudentId}
              students={students}
              loadingStudents={loadingStudents}
              activeTab={activeTab}
              countsByTab={assignedCounts}
              draftCounts={draftCounts}
              onSearchChange={onSearchChange}
              onSortChange={onSortChange}
              onSelectedStudentIdChange={onSelectedStudentIdChange}
              onTabChange={onTabChange}
              onOpenDetail={onOpenDetail}
              onOpenReview={onOpenReview}
              onSendNow={onSendAssignmentNow}
              onFixConfigError={onFixConfigError}
              onCancelIssue={onCancelAssignmentIssue}
              onReissue={onReissueAssignment}
              onRemind={onRemindAssignment}
              onDelete={onDeleteAssignment}
            />
          ) : null}

          {workspaceMode === 'drafts' ? (
            <HomeworkAssignmentsWorkspace
              mode="drafts"
              assignments={draftAssignmentRows}
              loading={loadingAssignments}
              error={assignmentsError ?? summaryError ?? studentsError}
              searchQuery={searchQuery}
              sortBy={sortBy}
              selectedStudentId={selectedStudentId}
              students={students}
              loadingStudents={loadingStudents}
              activeTab={activeTab}
              countsByTab={assignedCounts}
              draftCounts={draftCounts}
              onSearchChange={onSearchChange}
              onSortChange={onSortChange}
              onSelectedStudentIdChange={onSelectedStudentIdChange}
              onTabChange={onTabChange}
              onOpenDetail={onOpenDetail}
              onOpenReview={onOpenReview}
              onSendNow={onSendAssignmentNow}
              onFixConfigError={onFixConfigError}
              onCancelIssue={onCancelAssignmentIssue}
              onReissue={onReissueAssignment}
              onRemind={onRemindAssignment}
              onDelete={onDeleteAssignment}
            />
          ) : null}
          {workspaceMode === 'groups' ? (
          <section className={styles.workspace}>
            <section className={styles.groupsSection}>
              <div className={styles.groupsTopBar}>
              <input
                type="search"
                className={styles.groupsSearchInput}
                placeholder="Поиск по группам..."
                value={groupSearchQuery}
                onChange={(event) => setGroupSearchQuery(event.target.value)}
              />
              <button type="button" className={styles.groupsCreateButton} onClick={() => openCreateGroupEditor()}>
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
                                const canEditAssignment = canTeacherEditHomeworkAssignment(assignment);
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
                                      <Tooltip content={canEditAssignment ? 'Редактировать' : 'Открыть'}>
                                        <button
                                          type="button"
                                          className={styles.groupAssignmentEditButton}
                                          onClick={() => onOpenDetail(assignment)}
                                          aria-label={canEditAssignment ? 'Редактировать' : 'Открыть'}
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
          </section>
          ) : null}
        </>
      )}

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

      <HomeworkAssignModal
        open={isAssignmentModalOpen}
        variant={isMobile ? 'sheet' : 'side-sheet'}
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

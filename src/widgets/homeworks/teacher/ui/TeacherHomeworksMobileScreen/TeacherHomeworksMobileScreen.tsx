import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import {
  canTeacherDeleteHomeworkTemplate,
} from '../../../../../entities/homework-template/model/lib/workflow';
import { HomeworkAssignment, HomeworkTemplate } from '../../../../../entities/types';
import { BottomSheet } from '../../../../../shared/ui/BottomSheet/BottomSheet';
import {
  HomeworkMagnifyingGlassIcon,
  HomeworkSlidersIcon,
} from '../../../../../shared/ui/icons/HomeworkFaIcons';
import {
  AddOutlinedIcon,
  BarsIcon,
  CloseIcon,
  NotificationsNoneOutlinedIcon,
} from '../../../../../icons/MaterialIcons';
import { canCancelHomeworkAssignmentIssue } from '../../../../../entities/homework-assignment/model/lib/assignmentIssuance';
import {
  canReissueHomeworkAssignment,
  canTeacherEditHomeworkAssignment,
  resolveHomeworkAssignmentWorkflow,
} from '../../../../../entities/homework-assignment/model/lib/workflow';
import {
  isHomeworkTemplateFavorite,
} from '../../model/lib/templatePresentation';
import {
  MobileLibraryScope,
  MobileLibrarySort,
  MobileUrgencyFilter,
  resolveMobileTemplateCategory,
  resolveMobileTemplateCollection,
  resolveMobileTemplateSearchText,
} from '../../model/lib/mobileHomeworkPresentation';
import {
  TeacherHomeworkListFilter,
  TeacherHomeworkProblemFilter,
  TeacherHomeworkSort,
  TeacherHomeworkStudentOption,
} from '../../../types';
import { TeacherHomeworksMobileAssignmentCard } from '../TeacherHomeworksMobileAssignmentCard/TeacherHomeworksMobileAssignmentCard';
import { TeacherHomeworksMobileDraftCard } from '../TeacherHomeworksMobileDraftCard/TeacherHomeworksMobileDraftCard';
import { TeacherHomeworksMobileLibraryCard } from '../TeacherHomeworksMobileLibraryCard/TeacherHomeworksMobileLibraryCard';
import styles from './TeacherHomeworksMobileScreen.module.css';

interface TeacherHomeworksMobileScreenProps {
  templates: HomeworkTemplate[];
  assignments: HomeworkAssignment[];
  students: TeacherHomeworkStudentOption[];
  summary: {
    totalCount: number;
    draftCount: number;
    scheduledCount: number;
    inProgressCount: number;
    reviewCount: number;
    closedCount: number;
    overdueCount: number;
    dueTodayCount: number;
    configErrorCount: number;
  };
  workspaceMode: 'list' | 'drafts' | 'groups' | 'templates';
  activeTab: TeacherHomeworkListFilter;
  searchQuery: string;
  sortBy: TeacherHomeworkSort;
  problemFilters: TeacherHomeworkProblemFilter[];
  selectedStudentId: number | null;
  loadingTemplates: boolean;
  loadingAssignments: boolean;
  loadingMoreAssignments: boolean;
  hasMoreAssignments: boolean;
  templatesError: string | null;
  assignmentsError: string | null;
  homeworkActivityHasUnread: boolean;
  onOpenMobileSidebar?: () => void;
  onOpenActivity: () => void;
  onWorkspaceModeChange: (mode: 'list' | 'drafts' | 'groups' | 'templates') => void;
  onSearchChange: (value: string) => void;
  onTabChange: (tab: TeacherHomeworkListFilter) => void;
  onSortChange: (value: TeacherHomeworkSort) => void;
  onSelectedStudentIdChange: (studentId: number | null) => void;
  onToggleProblemFilter: (filter: TeacherHomeworkProblemFilter) => void;
  onOpenCreateTemplateScreen: () => void;
  onOpenAssignModal: () => void;
  onOpenTemplate: (template: HomeworkTemplate) => void;
  onEditTemplate: (template: HomeworkTemplate) => void;
  onIssueTemplate: (template: HomeworkTemplate) => void;
  onToggleFavorite: (template: HomeworkTemplate) => void;
  onDuplicateTemplate: (template: HomeworkTemplate) => void;
  onArchiveTemplate: (template: HomeworkTemplate) => void;
  onRestoreTemplate: (template: HomeworkTemplate) => void;
  onCreateCollection: (template?: HomeworkTemplate) => void;
  onDeleteTemplate: (template: HomeworkTemplate) => void;
  onOpenAssignment: (assignment: HomeworkAssignment) => void;
  onOpenReview: (assignment: HomeworkAssignment) => void;
  onFixConfigError: (assignment: HomeworkAssignment) => void;
  onSendAssignmentNow: (assignment: HomeworkAssignment) => void;
  onRemindAssignment: (assignment: HomeworkAssignment) => void;
  onReissueAssignment: (assignment: HomeworkAssignment) => void;
  onDeleteAssignment: (assignment: HomeworkAssignment) => void;
  onCancelAssignmentIssue: (assignment: HomeworkAssignment) => void;
  onOpenStudentProfile: (studentId: number) => void;
  onLoadMoreAssignments: () => void;
}

type ActiveMenuState =
  | { kind: 'template'; template: HomeworkTemplate }
  | { kind: 'assignment'; assignment: HomeworkAssignment }
  | { kind: 'draft'; assignment: HomeworkAssignment }
  | null;

type AssignmentSheetDraft = {
  tab: TeacherHomeworkListFilter;
  sortBy: TeacherHomeworkSort;
  studentId: number | null;
  problemFilters: TeacherHomeworkProblemFilter[];
};

const LIBRARY_SORT_OPTIONS: Array<{ id: MobileLibrarySort; label: string }> = [
  { id: 'updated', label: 'Новые сверху' },
  { id: 'title', label: 'По названию' },
  { id: 'issued', label: 'По использованию' },
];

const ASSIGNMENT_SORT_OPTIONS: Array<{ id: TeacherHomeworkSort; label: string }> = [
  { id: 'urgency', label: 'По срочности' },
  { id: 'deadline', label: 'По сроку' },
  { id: 'student', label: 'По ученику' },
  { id: 'updated', label: 'По обновлению' },
  { id: 'created', label: 'По созданию' },
];

const STATUS_OPTIONS: Array<{ id: TeacherHomeworkListFilter; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'sent', label: 'В работе' },
  { id: 'review', label: 'На проверке' },
  { id: 'closed', label: 'Проверено' },
];

const toClassSuffix = (value: string) => `${value[0].toUpperCase()}${value.slice(1)}`;

const LIBRARY_SCOPE_TONES: Record<MobileLibraryScope, 'neutral' | 'success' | 'warning' | 'muted'> = {
  all: 'neutral',
  active: 'success',
  favorites: 'warning',
  archived: 'muted',
};

const URGENCY_TONES: Record<MobileUrgencyFilter, 'neutral' | 'danger' | 'warning' | 'success' | 'info'> = {
  all: 'neutral',
  overdue: 'danger',
  review: 'warning',
  closed: 'success',
  progress: 'info',
};

const deriveUrgencyFilter = (
  activeTab: TeacherHomeworkListFilter,
  problemFilters: TeacherHomeworkProblemFilter[],
): MobileUrgencyFilter => {
  if (problemFilters.includes('overdue')) return 'overdue';
  if (activeTab === 'review') return 'review';
  if (activeTab === 'closed') return 'closed';
  if (activeTab === 'sent') return 'progress';
  return 'all';
};

const toggleProblemFilter = (items: TeacherHomeworkProblemFilter[], filter: TeacherHomeworkProblemFilter) =>
  items.includes(filter) ? items.filter((item) => item !== filter) : [...items, filter];

export const TeacherHomeworksMobileScreen: FC<TeacherHomeworksMobileScreenProps> = ({
  templates,
  assignments,
  students,
  summary,
  workspaceMode,
  activeTab,
  searchQuery,
  sortBy,
  problemFilters,
  selectedStudentId,
  loadingTemplates,
  loadingAssignments,
  loadingMoreAssignments,
  hasMoreAssignments,
  templatesError,
  assignmentsError,
  homeworkActivityHasUnread,
  onOpenMobileSidebar,
  onOpenActivity,
  onWorkspaceModeChange,
  onSearchChange,
  onTabChange,
  onSortChange,
  onSelectedStudentIdChange,
  onToggleProblemFilter,
  onOpenCreateTemplateScreen,
  onOpenAssignModal,
  onOpenTemplate,
  onEditTemplate,
  onIssueTemplate,
  onToggleFavorite,
  onDuplicateTemplate,
  onArchiveTemplate,
  onRestoreTemplate,
  onCreateCollection,
  onDeleteTemplate,
  onOpenAssignment,
  onOpenReview,
  onFixConfigError,
  onSendAssignmentNow,
  onRemindAssignment,
  onReissueAssignment,
  onDeleteAssignment,
  onCancelAssignmentIssue,
  onOpenStudentProfile,
  onLoadMoreAssignments,
}) => {
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryScope, setLibraryScope] = useState<MobileLibraryScope>('active');
  const [libraryThemeFilter, setLibraryThemeFilter] = useState('all');
  const [libraryCollectionFilter, setLibraryCollectionFilter] = useState('all');
  const [librarySort, setLibrarySort] = useState<MobileLibrarySort>('updated');
  const [libraryDraft, setLibraryDraft] = useState({
    theme: 'all',
    collection: 'all',
    sort: 'updated' as MobileLibrarySort,
  });
  const [assignmentDraft, setAssignmentDraft] = useState<AssignmentSheetDraft>({
    tab: activeTab,
    sortBy,
    studentId: selectedStudentId,
    problemFilters,
  });
  const [selectedUrgency, setSelectedUrgency] = useState<MobileUrgencyFilter>(() => deriveUrgencyFilter(activeTab, problemFilters));
  const [isCreateSheetOpen, setCreateSheetOpen] = useState(false);
  const [isLibraryFilterSheetOpen, setLibraryFilterSheetOpen] = useState(false);
  const [isAssignmentFilterSheetOpen, setAssignmentFilterSheetOpen] = useState(false);
  const [isDraftsSheetOpen, setDraftsSheetOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<ActiveMenuState>(null);
  const [isLibrarySearchOpen, setLibrarySearchOpen] = useState(false);
  const [isAssignmentSearchOpen, setAssignmentSearchOpen] = useState(Boolean(searchQuery.trim()));
  const librarySearchInputRef = useRef<HTMLInputElement | null>(null);
  const assignmentSearchInputRef = useRef<HTMLInputElement | null>(null);

  const isAssignmentsTab = workspaceMode === 'list';

  useEffect(() => {
    if (isLibraryFilterSheetOpen) return;
    setLibraryDraft({
      theme: libraryThemeFilter,
      collection: libraryCollectionFilter,
      sort: librarySort,
    });
  }, [isLibraryFilterSheetOpen, libraryCollectionFilter, libraryScope, librarySort, libraryThemeFilter]);

  useEffect(() => {
    if (isAssignmentFilterSheetOpen) return;
    setAssignmentDraft({
      tab: activeTab,
      sortBy,
      studentId: selectedStudentId,
      problemFilters,
    });
  }, [activeTab, isAssignmentFilterSheetOpen, problemFilters, selectedStudentId, sortBy]);

  useEffect(() => {
    setSelectedUrgency(deriveUrgencyFilter(activeTab, problemFilters));
  }, [activeTab, problemFilters]);

  useEffect(() => {
    if (!libraryQuery.trim()) return;
    setLibrarySearchOpen(true);
  }, [libraryQuery]);

  useEffect(() => {
    if (!searchQuery.trim()) return;
    setAssignmentSearchOpen(true);
  }, [searchQuery]);

  useEffect(() => {
    if (!isLibrarySearchOpen) return;
    const frameId = window.requestAnimationFrame(() => {
      librarySearchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isLibrarySearchOpen]);

  useEffect(() => {
    if (!isAssignmentSearchOpen) return;
    const frameId = window.requestAnimationFrame(() => {
      assignmentSearchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isAssignmentSearchOpen]);

  const activeTemplates = useMemo(() => templates.filter((template) => !template.isArchived), [templates]);
  const favoriteTemplatesCount = useMemo(
    () => activeTemplates.filter((template) => isHomeworkTemplateFavorite(template)).length,
    [activeTemplates],
  );
  const archivedTemplatesCount = useMemo(
    () => templates.filter((template) => template.isArchived).length,
    [templates],
  );

  const availableThemes = useMemo(
    () =>
      Array.from(
        new Set(
          activeTemplates
            .map((template) => resolveMobileTemplateCategory(template))
            .filter(Boolean),
        ),
      ).sort((left, right) => left.localeCompare(right, 'ru')),
    [activeTemplates],
  );

  const availableCollections = useMemo(
    () =>
      Array.from(
        new Set(
          activeTemplates
            .map((template) => resolveMobileTemplateCollection(template))
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort((left, right) => left.localeCompare(right, 'ru')),
    [activeTemplates],
  );

  const filteredTemplates = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();
    let items =
      libraryScope === 'archived'
        ? templates.filter((template) => template.isArchived)
        : libraryScope === 'all'
          ? templates
          : activeTemplates;

    if (libraryScope === 'favorites') {
      items = activeTemplates.filter((template) => isHomeworkTemplateFavorite(template));
    }

    if (libraryThemeFilter !== 'all') {
      items = items.filter((template) => resolveMobileTemplateCategory(template) === libraryThemeFilter);
    }

    if (libraryCollectionFilter !== 'all') {
      items = items.filter((template) => resolveMobileTemplateCollection(template) === libraryCollectionFilter);
    }

    if (query) {
      items = items.filter((template) => resolveMobileTemplateSearchText(template).includes(query));
    }

    return items.slice().sort((left, right) => {
      if (librarySort === 'title') {
        return left.title.localeCompare(right.title, 'ru');
      }
      if (librarySort === 'issued') {
        return (right.issuedAssignmentsCount ?? 0) - (left.issuedAssignmentsCount ?? 0);
      }
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
  }, [
    activeTemplates,
    libraryCollectionFilter,
    libraryQuery,
    libraryScope,
    librarySort,
    libraryThemeFilter,
    templates,
  ]);

  const draftAssignments = useMemo(
    () =>
      assignments
        .filter((assignment) => assignment.status === 'DRAFT' || assignment.status === 'SCHEDULED')
        .slice()
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
    [assignments],
  );

  const featuredDraft = draftAssignments[0] ?? null;

  const operationalAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.status !== 'DRAFT' && assignment.status !== 'SCHEDULED'),
    [assignments],
  );

  const filteredAssignments = useMemo(() => {
    return operationalAssignments.filter((assignment) => {
      if (selectedUrgency === 'overdue' && !assignment.isOverdue && assignment.status !== 'OVERDUE') return false;
      if (selectedUrgency === 'review' && !resolveHomeworkAssignmentWorkflow(assignment).canTeacherReview) return false;
      if (selectedUrgency === 'closed' && assignment.status !== 'REVIEWED') return false;
      if (
        selectedUrgency === 'progress' &&
        !(assignment.status === 'SENT' || assignment.status === 'SUBMITTED' || assignment.status === 'RETURNED')
      ) {
        return false;
      }
      return true;
    });
  }, [operationalAssignments, selectedUrgency]);

  const libraryAppliedFilters = useMemo(() => {
    const items: Array<{ id: 'theme' | 'collection' | 'sort'; label: string }> = [];
    if (libraryThemeFilter !== 'all') items.push({ id: 'theme', label: libraryThemeFilter });
    if (libraryCollectionFilter !== 'all') items.push({ id: 'collection', label: libraryCollectionFilter });
    if (librarySort !== 'updated') {
      const option = LIBRARY_SORT_OPTIONS.find((item) => item.id === librarySort);
      items.push({ id: 'sort', label: option?.label ?? 'Сортировка' });
    }
    return items;
  }, [libraryCollectionFilter, librarySort, libraryThemeFilter]);

  const assignmentAppliedFilters = useMemo(() => {
    const items: Array<{ id: string; label: string; onRemove: () => void }> = [];
    if (selectedStudentId !== null) {
      const studentName = students.find((student) => student.id === selectedStudentId)?.name ?? 'Ученик';
      items.push({
        id: 'student',
        label: studentName,
        onRemove: () => onSelectedStudentIdChange(null),
      });
    }
    if (sortBy !== 'urgency') {
      const label = ASSIGNMENT_SORT_OPTIONS.find((item) => item.id === sortBy)?.label ?? 'Сортировка';
      items.push({
        id: 'sort',
        label,
        onRemove: () => onSortChange('urgency'),
      });
    }
    problemFilters.forEach((filter) => {
      items.push({
        id: filter,
        label: filter === 'overdue' ? 'Просрочено' : filter === 'returned' ? 'На доработке' : 'Ошибки',
        onRemove: () => onToggleProblemFilter(filter),
      });
    });
    return items;
  }, [onSelectedStudentIdChange, onSortChange, onToggleProblemFilter, problemFilters, selectedStudentId, sortBy, students]);

  const libraryFilterCount = libraryAppliedFilters.length;
  const assignmentFilterCount =
    assignmentAppliedFilters.length + (activeTab !== 'all' ? 1 : 0);

  const urgencyChips = useMemo(
    () => [
      { id: 'all' as const, label: 'Все', count: Math.max(summary.totalCount - (summary.draftCount + summary.scheduledCount), 0) },
      { id: 'overdue' as const, label: 'Просрочено', count: summary.overdueCount },
      { id: 'review' as const, label: 'На проверке', count: summary.reviewCount },
      { id: 'closed' as const, label: 'Проверено', count: summary.closedCount },
      { id: 'progress' as const, label: 'В работе', count: summary.inProgressCount },
    ],
    [summary],
  );

  const applyLibraryFilters = () => {
    setLibraryThemeFilter(libraryDraft.theme);
    setLibraryCollectionFilter(libraryDraft.collection);
    setLibrarySort(libraryDraft.sort);
    setLibraryFilterSheetOpen(false);
  };

  const resetLibraryFilters = () => {
    setLibraryDraft({ theme: 'all', collection: 'all', sort: 'updated' });
  };

  const applyAssignmentFilters = () => {
    if (assignmentDraft.tab !== activeTab) {
      onTabChange(assignmentDraft.tab);
    }
    if (assignmentDraft.sortBy !== sortBy) {
      onSortChange(assignmentDraft.sortBy);
    }
    if (assignmentDraft.studentId !== selectedStudentId) {
      onSelectedStudentIdChange(assignmentDraft.studentId);
    }
    (['overdue', 'returned', 'config_error'] as TeacherHomeworkProblemFilter[]).forEach((filter) => {
      const shouldHave = assignmentDraft.problemFilters.includes(filter);
      const hasNow = problemFilters.includes(filter);
      if (shouldHave !== hasNow) {
        onToggleProblemFilter(filter);
      }
    });
    setSelectedUrgency(deriveUrgencyFilter(assignmentDraft.tab, assignmentDraft.problemFilters));
    setAssignmentFilterSheetOpen(false);
  };

  const resetAssignmentFilters = () => {
    setAssignmentDraft({
      tab: 'all',
      sortBy: 'urgency',
      studentId: null,
      problemFilters: [],
    });
  };

  const handleUrgencySelect = (next: MobileUrgencyFilter) => {
    setSelectedUrgency(next);
    if (next === 'review') {
      onTabChange('review');
      if (problemFilters.length > 0) {
        problemFilters.forEach((filter) => onToggleProblemFilter(filter));
      }
      return;
    }
    if (next === 'progress') {
      onTabChange('sent');
      if (problemFilters.length > 0) {
        problemFilters.forEach((filter) => onToggleProblemFilter(filter));
      }
      return;
    }
    if (next === 'closed') {
      onTabChange('closed');
      if (problemFilters.length > 0) {
        problemFilters.forEach((filter) => onToggleProblemFilter(filter));
      }
      return;
    }
    if (activeTab !== 'all') {
      onTabChange('all');
    }
    if (next === 'overdue') {
      if (!problemFilters.includes('overdue')) onToggleProblemFilter('overdue');
      if (problemFilters.includes('config_error')) onToggleProblemFilter('config_error');
      return;
    }
    problemFilters.forEach((filter) => onToggleProblemFilter(filter));
  };

  const handleAssignmentPrimaryAction = (assignment: HomeworkAssignment) => {
    if (resolveHomeworkAssignmentWorkflow(assignment).canTeacherReview) {
      onOpenReview(assignment);
      return;
    }
    if (assignment.hasConfigError && canTeacherEditHomeworkAssignment(assignment)) {
      onFixConfigError(assignment);
      return;
    }
    if (assignment.isOverdue || assignment.status === 'OVERDUE') {
      onRemindAssignment(assignment);
      return;
    }
    onOpenAssignment(assignment);
  };

  const resolveAssignmentPrimaryActionLabel = (assignment: HomeworkAssignment) => {
    if (resolveHomeworkAssignmentWorkflow(assignment).canTeacherReview) return 'Проверить';
    if (assignment.hasConfigError && canTeacherEditHomeworkAssignment(assignment)) return 'Исправить';
    if (assignment.isOverdue || assignment.status === 'OVERDUE') return 'Напомнить';
    return 'Открыть';
  };

  const resolveAssignmentTone = (assignment: HomeworkAssignment) => {
    if (assignment.hasConfigError || assignment.isOverdue || assignment.status === 'OVERDUE') return 'danger' as const;
    if (resolveHomeworkAssignmentWorkflow(assignment).canTeacherReview) return 'review' as const;
    if (assignment.status === 'RETURNED') return 'warning' as const;
    if (assignment.status === 'REVIEWED') return 'success' as const;
    if (assignment.status === 'SUBMITTED' || assignment.status === 'SENT') return 'info' as const;
    return 'neutral' as const;
  };

  return (
    <div className={styles.screen}>
      <div className={styles.stickyChrome}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => onOpenMobileSidebar?.()}
              aria-label="Открыть меню"
            >
              <BarsIcon width={20} height={20} />
            </button>

            <h1 className={styles.title}>Домашки</h1>
          </div>

          <div className={styles.topbarActions}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={onOpenActivity}
              aria-label="События"
            >
              <NotificationsNoneOutlinedIcon width={20} height={20} />
              {homeworkActivityHasUnread ? <span className={styles.notificationDot} aria-hidden /> : null}
            </button>

            <button type="button" className={styles.addButton} onClick={() => setCreateSheetOpen(true)}>
              <AddOutlinedIcon width={16} height={16} />
              <span>Добавить</span>
            </button>
          </div>
        </header>

        <div className={styles.segmentWrap}>
          <div className={styles.segmentedControl} role="tablist" aria-label="Разделы домашек">
            <button
              type="button"
              className={`${styles.segmentButton} ${!isAssignmentsTab ? styles.segmentButtonActive : ''}`}
              onClick={() => onWorkspaceModeChange('templates')}
              role="tab"
              aria-selected={!isAssignmentsTab}
            >
              Библиотека
            </button>
            <button
              type="button"
              className={`${styles.segmentButton} ${isAssignmentsTab ? styles.segmentButtonActive : ''}`}
              onClick={() => onWorkspaceModeChange('list')}
              role="tab"
              aria-selected={isAssignmentsTab}
            >
              Назначенные
            </button>
          </div>
        </div>
      </div>

      <div className={styles.body}>
        {!isAssignmentsTab ? (
          <>
            <section className={styles.toolbarSection}>
              <div className={styles.utilityRow}>
                {isLibrarySearchOpen ? (
                  <>
                    <div className={styles.searchField}>
                      <HomeworkMagnifyingGlassIcon size={18} className={styles.searchIcon} />
                      <input
                        ref={librarySearchInputRef}
                        type="search"
                        value={libraryQuery}
                        onChange={(event) => setLibraryQuery(event.target.value)}
                        className={styles.searchInput}
                        placeholder="Поиск по заданиям"
                        tabIndex={0}
                      />
                      <button
                        type="button"
                        className={styles.searchCloseButton}
                        onClick={() => {
                          setLibraryQuery('');
                          setLibrarySearchOpen(false);
                        }}
                        aria-label="Скрыть поиск"
                      >
                        <CloseIcon width={18} height={18} />
                      </button>
                    </div>
                    <button
                      type="button"
                      className={styles.toolbarIconButton}
                      onClick={() => setLibraryFilterSheetOpen(true)}
                      aria-label="Фильтры библиотеки"
                    >
                      <HomeworkSlidersIcon size={18} />
                      {libraryFilterCount > 0 ? <span className={styles.toolbarIconDot} aria-hidden /> : null}
                    </button>
                  </>
                ) : (
                  <>
                    <div className={styles.chipsRow}>
                      <button
                        type="button"
                        className={`${styles.scopeChip} ${libraryScope === 'all' ? `${styles.scopeChipActive} ${styles[`chipTone${toClassSuffix(LIBRARY_SCOPE_TONES.all)}`]}` : ''}`}
                        onClick={() => setLibraryScope('all')}
                      >
                        <span>Все</span>
                        <span className={styles.scopeCount}>{templates.length}</span>
                      </button>
                      <button
                        type="button"
                        className={`${styles.scopeChip} ${libraryScope === 'active' ? `${styles.scopeChipActive} ${styles[`chipTone${toClassSuffix(LIBRARY_SCOPE_TONES.active)}`]}` : ''}`}
                        onClick={() => setLibraryScope('active')}
                      >
                        <span>Активные</span>
                        <span className={styles.scopeCount}>{activeTemplates.length}</span>
                      </button>
                      <button
                        type="button"
                        className={`${styles.scopeChip} ${libraryScope === 'favorites' ? `${styles.scopeChipActive} ${styles[`chipTone${toClassSuffix(LIBRARY_SCOPE_TONES.favorites)}`]}` : ''}`}
                        onClick={() => setLibraryScope('favorites')}
                      >
                        <span>Избранное</span>
                        {favoriteTemplatesCount > 0 ? <span className={styles.scopeCount}>{favoriteTemplatesCount}</span> : null}
                      </button>
                      <button
                        type="button"
                        className={`${styles.scopeChip} ${libraryScope === 'archived' ? `${styles.scopeChipActive} ${styles[`chipTone${toClassSuffix(LIBRARY_SCOPE_TONES.archived)}`]}` : ''}`}
                        onClick={() => setLibraryScope('archived')}
                      >
                        <span>Архив</span>
                        {archivedTemplatesCount > 0 ? <span className={styles.scopeCount}>{archivedTemplatesCount}</span> : null}
                      </button>
                    </div>

                    <div className={styles.toolbarActions}>
                      <button
                        type="button"
                        className={styles.toolbarIconButton}
                        onClick={() => setLibrarySearchOpen(true)}
                        aria-label="Открыть поиск"
                      >
                        <HomeworkMagnifyingGlassIcon size={18} />
                      </button>
                      <button
                        type="button"
                        className={styles.toolbarIconButton}
                        onClick={() => setLibraryFilterSheetOpen(true)}
                        aria-label="Фильтры библиотеки"
                      >
                        <HomeworkSlidersIcon size={18} />
                        {libraryFilterCount > 0 ? <span className={styles.toolbarIconDot} aria-hidden /> : null}
                      </button>
                    </div>
                  </>
                )}
              </div>

              {libraryAppliedFilters.length > 0 ? (
                <div className={styles.appliedFiltersRow}>
                  {libraryAppliedFilters.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={styles.appliedFilterChip}
                      onClick={() => {
                        if (item.id === 'theme') setLibraryThemeFilter('all');
                        if (item.id === 'collection') setLibraryCollectionFilter('all');
                        if (item.id === 'sort') setLibrarySort('updated');
                      }}
                    >
                      <span>{item.label}</span>
                      <CloseIcon width={14} height={14} />
                    </button>
                  ))}
                </div>
              ) : null}
            </section>

            {featuredDraft ? (
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <h2 className={styles.sectionTitle}>Продолжить</h2>
                  <button type="button" className={styles.sectionLink} onClick={() => setDraftsSheetOpen(true)}>
                    Все черновики ({draftAssignments.length})
                  </button>
                </div>

                <TeacherHomeworksMobileDraftCard
                  assignment={featuredDraft}
                  onOpen={onOpenAssignment}
                  onMore={(assignment) => setActiveMenu({ kind: 'draft', assignment })}
                />
              </section>
            ) : null}

            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Библиотека</h2>
              </div>

              {templatesError ? <div className={styles.stateCard}>{templatesError}</div> : null}
              {loadingTemplates ? (
                <div className={styles.cardsList}>
                  {Array.from({ length: 3 }, (_, index) => (
                    <div key={`template_skeleton_${index}`} className={`${styles.skeletonCard} ${styles.skeletonLibraryCard}`} />
                  ))}
                </div>
              ) : null}

              {!loadingTemplates && !templatesError ? (
                filteredTemplates.length > 0 ? (
                  <div className={styles.cardsList}>
                    {filteredTemplates.map((template) => (
                      <TeacherHomeworksMobileLibraryCard
                        key={template.id}
                        template={template}
                        onOpen={onOpenTemplate}
                        onIssue={onIssueTemplate}
                        onMore={(item) => setActiveMenu({ kind: 'template', template: item })}
                      />
                    ))}
                  </div>
                ) : (
                  <div className={styles.stateCard}>По текущим фильтрам ничего не найдено.</div>
                )
              ) : null}
            </section>
          </>
        ) : (
          <>
            <section className={styles.toolbarSection}>
              <div className={styles.utilityRow}>
                {isAssignmentSearchOpen ? (
                  <>
                    <div className={styles.searchField}>
                      <HomeworkMagnifyingGlassIcon size={18} className={styles.searchIcon} />
                      <input
                        ref={assignmentSearchInputRef}
                        type="search"
                        value={searchQuery}
                        onChange={(event) => onSearchChange(event.target.value)}
                        className={styles.searchInput}
                        placeholder="Поиск по ученику или заданию"
                        tabIndex={0}
                      />
                      <button
                        type="button"
                        className={styles.searchCloseButton}
                        onClick={() => {
                          onSearchChange('');
                          setAssignmentSearchOpen(false);
                        }}
                        aria-label="Скрыть поиск"
                      >
                        <CloseIcon width={18} height={18} />
                      </button>
                    </div>
                    <button
                      type="button"
                      className={styles.toolbarIconButton}
                      onClick={() => setAssignmentFilterSheetOpen(true)}
                      aria-label="Фильтры назначенных"
                    >
                      <HomeworkSlidersIcon size={18} />
                      {assignmentFilterCount > 0 ? <span className={styles.toolbarIconDot} aria-hidden /> : null}
                    </button>
                  </>
                ) : (
                  <>
                    <div className={styles.chipsRow}>
                      {urgencyChips.map((chip) => (
                        <button
                          key={chip.id}
                          type="button"
                          className={`${styles.urgencyChip} ${selectedUrgency === chip.id ? `${styles.urgencyChipActive} ${styles[`chipTone${toClassSuffix(URGENCY_TONES[chip.id])}`]}` : ''}`}
                          onClick={() => handleUrgencySelect(chip.id)}
                        >
                          <span>{chip.label}</span>
                          {chip.count > 0 ? <span className={styles.urgencyCount}>{chip.count}</span> : null}
                        </button>
                      ))}
                    </div>

                    <div className={styles.toolbarActions}>
                      <button
                        type="button"
                        className={styles.toolbarIconButton}
                        onClick={() => setAssignmentSearchOpen(true)}
                        aria-label="Открыть поиск"
                      >
                        <HomeworkMagnifyingGlassIcon size={18} />
                      </button>
                      <button
                        type="button"
                        className={styles.toolbarIconButton}
                        onClick={() => setAssignmentFilterSheetOpen(true)}
                        aria-label="Фильтры назначенных"
                      >
                        <HomeworkSlidersIcon size={18} />
                        {assignmentFilterCount > 0 ? <span className={styles.toolbarIconDot} aria-hidden /> : null}
                      </button>
                    </div>
                  </>
                )}
              </div>

              {assignmentAppliedFilters.length > 0 ? (
                <div className={styles.appliedFiltersRow}>
                  {assignmentAppliedFilters.map((item) => (
                    <button key={item.id} type="button" className={styles.appliedFilterChip} onClick={item.onRemove}>
                      <span>{item.label}</span>
                      <CloseIcon width={14} height={14} />
                    </button>
                  ))}
                </div>
              ) : null}
            </section>

            <section className={styles.section}>
              {assignmentsError ? <div className={styles.stateCard}>{assignmentsError}</div> : null}
              {loadingAssignments ? (
                <div className={styles.cardsList}>
                  {Array.from({ length: 4 }, (_, index) => (
                    <div key={`assignment_skeleton_${index}`} className={`${styles.skeletonCard} ${styles.skeletonAssignmentCard}`} />
                  ))}
                </div>
              ) : null}

              {!loadingAssignments && !assignmentsError ? (
                filteredAssignments.length > 0 ? (
                  <div className={styles.cardsList}>
                    {filteredAssignments.map((assignment) => (
                      <TeacherHomeworksMobileAssignmentCard
                        key={assignment.id}
                        assignment={assignment}
                        statusTone={resolveAssignmentTone(assignment)}
                        primaryActionLabel={resolveAssignmentPrimaryActionLabel(assignment)}
                        onOpen={onOpenAssignment}
                        onPrimaryAction={handleAssignmentPrimaryAction}
                        onMore={(item) => setActiveMenu({ kind: 'assignment', assignment: item })}
                        onOpenStudentProfile={onOpenStudentProfile}
                      />
                    ))}
                  </div>
                ) : (
                  <div className={styles.stateCard}>По текущим фильтрам ничего не найдено.</div>
                )
              ) : null}

              {hasMoreAssignments && !loadingAssignments ? (
                <div className={styles.loadMoreRow}>
                  <button type="button" className={styles.loadMoreButton} onClick={onLoadMoreAssignments} disabled={loadingMoreAssignments}>
                    {loadingMoreAssignments ? 'Загрузка...' : 'Показать ещё'}
                  </button>
                </div>
              ) : null}
            </section>
          </>
        )}
      </div>

      <BottomSheet isOpen={isCreateSheetOpen} onClose={() => setCreateSheetOpen(false)}>
        <div className={styles.sheet}>
          <div className={styles.sheetHeader}>
            <h3 className={styles.sheetTitle}>Добавить</h3>
          </div>

          <div className={styles.sheetList}>
            <button
              type="button"
              className={styles.sheetRow}
              onClick={() => {
                setCreateSheetOpen(false);
                onOpenCreateTemplateScreen();
              }}
            >
              <span className={styles.sheetRowIcon}><AddOutlinedIcon width={20} height={20} /></span>
              <span className={styles.sheetRowText}>Новое задание</span>
            </button>
            <button
              type="button"
              className={styles.sheetRow}
              onClick={() => {
                setCreateSheetOpen(false);
                onOpenAssignModal();
              }}
            >
              <span className={styles.sheetRowIcon}><AddOutlinedIcon width={20} height={20} /></span>
              <span className={styles.sheetRowText}>Выдать существующее</span>
            </button>
            <button
              type="button"
              className={styles.sheetRow}
              onClick={() => {
                setCreateSheetOpen(false);
                onCreateCollection();
              }}
            >
              <span className={styles.sheetRowIcon}><AddOutlinedIcon width={20} height={20} /></span>
              <span className={styles.sheetRowText}>Создать коллекцию</span>
            </button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet isOpen={isLibraryFilterSheetOpen} onClose={() => setLibraryFilterSheetOpen(false)}>
        <div className={styles.sheet}>
          <div className={styles.sheetHeader}>
            <h3 className={styles.sheetTitle}>Фильтры</h3>
            <button type="button" className={styles.sheetReset} onClick={resetLibraryFilters}>Сбросить</button>
          </div>

          <div className={styles.sheetSection}>
            <div className={styles.sheetSectionTitle}>Тема</div>
            <div className={styles.sheetList}>
              <button type="button" className={`${styles.optionRow} ${libraryDraft.theme === 'all' ? styles.optionRowActive : ''}`} onClick={() => setLibraryDraft((prev) => ({ ...prev, theme: 'all' }))}>Все темы</button>
              {availableThemes.map((theme) => (
                <button key={theme} type="button" className={`${styles.optionRow} ${libraryDraft.theme === theme ? styles.optionRowActive : ''}`} onClick={() => setLibraryDraft((prev) => ({ ...prev, theme }))}>
                  {theme}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.sheetSection}>
            <div className={styles.sheetSectionTitle}>Коллекция</div>
            <div className={styles.sheetList}>
              <button type="button" className={`${styles.optionRow} ${libraryDraft.collection === 'all' ? styles.optionRowActive : ''}`} onClick={() => setLibraryDraft((prev) => ({ ...prev, collection: 'all' }))}>Все коллекции</button>
              {availableCollections.map((collection) => (
                <button key={collection} type="button" className={`${styles.optionRow} ${libraryDraft.collection === collection ? styles.optionRowActive : ''}`} onClick={() => setLibraryDraft((prev) => ({ ...prev, collection }))}>
                  {collection}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.sheetSection}>
            <div className={styles.sheetSectionTitle}>Сортировка</div>
            <div className={styles.sheetList}>
              {LIBRARY_SORT_OPTIONS.map((option) => (
                <button key={option.id} type="button" className={`${styles.optionRow} ${libraryDraft.sort === option.id ? styles.optionRowActive : ''}`} onClick={() => setLibraryDraft((prev) => ({ ...prev, sort: option.id }))}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.sheetActionBar}>
            <button type="button" className={styles.sheetSecondaryButton} onClick={resetLibraryFilters}>Сбросить</button>
            <button type="button" className={styles.sheetPrimaryButton} onClick={applyLibraryFilters}>Применить</button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet isOpen={isAssignmentFilterSheetOpen} onClose={() => setAssignmentFilterSheetOpen(false)}>
        <div className={styles.sheet}>
          <div className={styles.sheetHeader}>
            <h3 className={styles.sheetTitle}>Фильтры</h3>
            <button type="button" className={styles.sheetReset} onClick={resetAssignmentFilters}>Сбросить</button>
          </div>

          <div className={styles.sheetSection}>
            <div className={styles.sheetSectionTitle}>Статус</div>
            <div className={styles.sheetList}>
              {STATUS_OPTIONS.map((option) => (
                <button key={option.id} type="button" className={`${styles.optionRow} ${assignmentDraft.tab === option.id ? styles.optionRowActive : ''}`} onClick={() => setAssignmentDraft((prev) => ({ ...prev, tab: option.id }))}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.sheetSection}>
            <div className={styles.sheetSectionTitle}>Ученик</div>
            <div className={styles.sheetList}>
              <button type="button" className={`${styles.optionRow} ${assignmentDraft.studentId === null ? styles.optionRowActive : ''}`} onClick={() => setAssignmentDraft((prev) => ({ ...prev, studentId: null }))}>
                Все ученики
              </button>
              {students.map((student) => (
                <button key={student.id} type="button" className={`${styles.optionRow} ${assignmentDraft.studentId === student.id ? styles.optionRowActive : ''}`} onClick={() => setAssignmentDraft((prev) => ({ ...prev, studentId: student.id }))}>
                  {student.name}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.sheetSection}>
            <div className={styles.sheetSectionTitle}>Особые случаи</div>
            <div className={styles.sheetList}>
              <button type="button" className={`${styles.optionRow} ${assignmentDraft.problemFilters.includes('overdue') ? styles.optionRowActive : ''}`} onClick={() => setAssignmentDraft((prev) => ({ ...prev, problemFilters: toggleProblemFilter(prev.problemFilters, 'overdue') }))}>
                Просрочено
              </button>
              <button type="button" className={`${styles.optionRow} ${assignmentDraft.problemFilters.includes('returned') ? styles.optionRowActive : ''}`} onClick={() => setAssignmentDraft((prev) => ({ ...prev, problemFilters: toggleProblemFilter(prev.problemFilters, 'returned') }))}>
                На доработке
              </button>
              <button type="button" className={`${styles.optionRow} ${assignmentDraft.problemFilters.includes('config_error') ? styles.optionRowActive : ''}`} onClick={() => setAssignmentDraft((prev) => ({ ...prev, problemFilters: toggleProblemFilter(prev.problemFilters, 'config_error') }))}>
                Ошибки
              </button>
            </div>
          </div>

          <div className={styles.sheetSection}>
            <div className={styles.sheetSectionTitle}>Сортировка</div>
            <div className={styles.sheetList}>
              {ASSIGNMENT_SORT_OPTIONS.map((option) => (
                <button key={option.id} type="button" className={`${styles.optionRow} ${assignmentDraft.sortBy === option.id ? styles.optionRowActive : ''}`} onClick={() => setAssignmentDraft((prev) => ({ ...prev, sortBy: option.id }))}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.sheetActionBar}>
            <button type="button" className={styles.sheetSecondaryButton} onClick={resetAssignmentFilters}>Сбросить</button>
            <button type="button" className={styles.sheetPrimaryButton} onClick={applyAssignmentFilters}>Применить</button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet isOpen={Boolean(activeMenu)} onClose={() => setActiveMenu(null)}>
        <div className={styles.sheet}>
          {activeMenu?.kind === 'template' ? (
            <div className={styles.sheetList}>
              <button type="button" className={styles.sheetRow} onClick={() => {
                const { template } = activeMenu;
                setActiveMenu(null);
                onOpenTemplate(template);
              }}>
                <span className={styles.sheetRowText}>Открыть</span>
              </button>
              <button type="button" className={styles.sheetRow} onClick={() => {
                const { template } = activeMenu;
                setActiveMenu(null);
                onEditTemplate(template);
              }}>
                <span className={styles.sheetRowText}>Редактировать</span>
              </button>
              <button type="button" className={styles.sheetRow} onClick={() => {
                const { template } = activeMenu;
                setActiveMenu(null);
                onIssueTemplate(template);
              }}>
                <span className={styles.sheetRowText}>Выдать</span>
              </button>
              <button type="button" className={styles.sheetRow} onClick={() => {
                const { template } = activeMenu;
                setActiveMenu(null);
                onToggleFavorite(template);
              }}>
                <span className={styles.sheetRowText}>
                  {isHomeworkTemplateFavorite(activeMenu.template) ? 'Убрать из избранного' : 'В избранное'}
                </span>
              </button>
              <button type="button" className={styles.sheetRow} onClick={() => {
                const { template } = activeMenu;
                setActiveMenu(null);
                onDuplicateTemplate(template);
              }}>
                <span className={styles.sheetRowText}>Дублировать</span>
              </button>
              <button type="button" className={styles.sheetRow} onClick={() => {
                const { template } = activeMenu;
                setActiveMenu(null);
                onCreateCollection(template);
              }}>
                <span className={styles.sheetRowText}>В коллекцию</span>
              </button>
              <button type="button" className={styles.sheetRow} onClick={() => {
                const { template } = activeMenu;
                setActiveMenu(null);
                if (template.isArchived) {
                  onRestoreTemplate(template);
                } else {
                  onArchiveTemplate(template);
                }
              }}>
                <span className={styles.sheetRowText}>{activeMenu.template.isArchived ? 'Вернуть из архива' : 'Архивировать'}</span>
              </button>
              {canTeacherDeleteHomeworkTemplate(activeMenu.template) ? (
                <button type="button" className={`${styles.sheetRow} ${styles.sheetRowDanger}`} onClick={() => {
                  const { template } = activeMenu;
                  setActiveMenu(null);
                  onDeleteTemplate(template);
                }}>
                  <span className={styles.sheetRowText}>Удалить</span>
                </button>
              ) : null}
            </div>
          ) : null}

          {activeMenu?.kind === 'draft' ? (
            <div className={styles.sheetList}>
              <button type="button" className={styles.sheetRow} onClick={() => {
                const { assignment } = activeMenu;
                setActiveMenu(null);
                onOpenAssignment(assignment);
              }}>
                <span className={styles.sheetRowText}>Продолжить</span>
              </button>
              {(activeMenu.assignment.status === 'DRAFT' || activeMenu.assignment.status === 'SCHEDULED') ? (
                <button type="button" className={styles.sheetRow} onClick={() => {
                  const { assignment } = activeMenu;
                  setActiveMenu(null);
                  onSendAssignmentNow(assignment);
                }}>
                  <span className={styles.sheetRowText}>Выдать сейчас</span>
                </button>
              ) : null}
              <button type="button" className={`${styles.sheetRow} ${styles.sheetRowDanger}`} onClick={() => {
                const { assignment } = activeMenu;
                setActiveMenu(null);
                onDeleteAssignment(assignment);
              }}>
                <span className={styles.sheetRowText}>Удалить</span>
              </button>
            </div>
          ) : null}

          {activeMenu?.kind === 'assignment' ? (
            <div className={styles.sheetList}>
              <button type="button" className={styles.sheetRow} onClick={() => {
                const { assignment } = activeMenu;
                setActiveMenu(null);
                onOpenAssignment(assignment);
              }}>
                <span className={styles.sheetRowText}>Открыть</span>
              </button>
              {canCancelHomeworkAssignmentIssue(activeMenu.assignment) ? (
                <button type="button" className={styles.sheetRow} onClick={() => {
                  const { assignment } = activeMenu;
                  setActiveMenu(null);
                  onCancelAssignmentIssue(assignment);
                }}>
                  <span className={styles.sheetRowText}>Отменить выдачу</span>
                </button>
              ) : null}
              {(activeMenu.assignment.status === 'SENT' || activeMenu.assignment.status === 'RETURNED' || activeMenu.assignment.isOverdue) ? (
                <button type="button" className={styles.sheetRow} onClick={() => {
                  const { assignment } = activeMenu;
                  setActiveMenu(null);
                  onRemindAssignment(assignment);
                }}>
                  <span className={styles.sheetRowText}>Напомнить</span>
                </button>
              ) : null}
              {canReissueHomeworkAssignment(activeMenu.assignment) ? (
                <button type="button" className={styles.sheetRow} onClick={() => {
                  const { assignment } = activeMenu;
                  setActiveMenu(null);
                  onReissueAssignment(assignment);
                }}>
                  <span className={styles.sheetRowText}>Переоткрыть</span>
                </button>
              ) : null}
              <button type="button" className={`${styles.sheetRow} ${styles.sheetRowDanger}`} onClick={() => {
                const { assignment } = activeMenu;
                setActiveMenu(null);
                onDeleteAssignment(assignment);
              }}>
                <span className={styles.sheetRowText}>Удалить</span>
              </button>
            </div>
          ) : null}
        </div>
      </BottomSheet>

      <BottomSheet isOpen={isDraftsSheetOpen} onClose={() => setDraftsSheetOpen(false)}>
        <div className={styles.sheet}>
          <div className={styles.sheetHeader}>
            <h3 className={styles.sheetTitle}>Черновики</h3>
          </div>

          <div className={styles.sheetCards}>
            {draftAssignments.map((assignment) => (
              <TeacherHomeworksMobileDraftCard
                key={assignment.id}
                assignment={assignment}
                onOpen={(item) => {
                  setDraftsSheetOpen(false);
                  onOpenAssignment(item);
                }}
                onMore={(item) => {
                  setDraftsSheetOpen(false);
                  setActiveMenu({ kind: 'draft', assignment: item });
                }}
              />
            ))}
          </div>
        </div>
      </BottomSheet>
    </div>
  );
};

import { FC, useEffect, useMemo, useState } from 'react';
import { HomeworkAssignment } from '../../../../../entities/types';
import {
  HomeworkAlignLeftIcon,
  HomeworkMagnifyingGlassIcon,
  HomeworkTableCellsIcon,
} from '../../../../../shared/ui/icons/HomeworkFaIcons';
import { TeacherHomeworkListFilter, TeacherHomeworkSort, TeacherHomeworkStudentOption } from '../../../types';
import { HomeworkListFiltersPopover } from '../HomeworkListFiltersPopover/HomeworkListFiltersPopover';
import { HomeworkAssignmentCard } from '../HomeworkAssignmentCard/HomeworkAssignmentCard';
import { HomeworkDraftScope } from '../../model/lib/homeworkAssignmentWorkspacePresentation';
import styles from './HomeworkAssignmentsWorkspace.module.css';

type WorkspaceMode = 'assigned' | 'drafts';

interface HomeworkAssignmentsWorkspaceProps {
  mode: WorkspaceMode;
  assignments: HomeworkAssignment[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  sortBy: TeacherHomeworkSort;
  selectedStudentId: number | null;
  students: TeacherHomeworkStudentOption[];
  loadingStudents: boolean;
  activeTab: TeacherHomeworkListFilter;
  countsByTab: Record<'all' | 'sent' | 'overdue' | 'review' | 'closed', number>;
  draftCounts: Record<HomeworkDraftScope, number>;
  onSearchChange: (value: string) => void;
  onSortChange: (value: TeacherHomeworkSort) => void;
  onSelectedStudentIdChange: (studentId: number | null) => void;
  onTabChange: (tab: TeacherHomeworkListFilter) => void;
  onOpenDetail: (assignment: HomeworkAssignment) => void;
  onOpenReview: (assignment: HomeworkAssignment) => void;
  onSendNow: (assignment: HomeworkAssignment) => Promise<void>;
  onFixConfigError: (assignment: HomeworkAssignment) => Promise<void>;
  onCancelIssue: (assignment: HomeworkAssignment) => Promise<void>;
  onReissue: (assignment: HomeworkAssignment) => Promise<void>;
  onRemind: (assignment: HomeworkAssignment) => Promise<void>;
  onDelete: (assignment: HomeworkAssignment) => Promise<void>;
}

const ASSIGNED_SCOPE_TABS: Array<{ id: TeacherHomeworkListFilter; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'sent', label: 'Выданы' },
  { id: 'overdue', label: 'Просрочено' },
  { id: 'review', label: 'На проверке' },
  { id: 'closed', label: 'Завершены' },
];

const DRAFT_SCOPE_TABS: Array<{ id: HomeworkDraftScope; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'draft', label: 'Черновики' },
  { id: 'scheduled', label: 'Запланированные' },
];

const SORT_LABELS: Array<{ id: TeacherHomeworkSort; label: string }> = [
  { id: 'urgency', label: 'По срочности' },
  { id: 'deadline', label: 'По дедлайну' },
  { id: 'student', label: 'По ученику' },
  { id: 'updated', label: 'По обновлению' },
  { id: 'created', label: 'По созданию' },
];

const filterAssignedItems = (assignments: HomeworkAssignment[], activeTab: TeacherHomeworkListFilter) => {
  const nonDraftAssignments = assignments.filter((assignment) => assignment.status !== 'DRAFT' && assignment.status !== 'SCHEDULED');
  if (activeTab === 'sent') {
    // «Выданы» — реально активные, без просроченных (у просроченных отдельный таб).
    return nonDraftAssignments.filter(
      (assignment) =>
        (assignment.status === 'SENT' || assignment.status === 'RETURNED') && !assignment.isOverdue,
    );
  }
  if (activeTab === 'overdue') {
    return nonDraftAssignments.filter(
      (assignment) => assignment.status === 'OVERDUE' || assignment.isOverdue,
    );
  }
  if (activeTab === 'review') {
    return nonDraftAssignments.filter((assignment) => assignment.status === 'SUBMITTED' || assignment.status === 'IN_REVIEW');
  }
  if (activeTab === 'closed') {
    return nonDraftAssignments.filter((assignment) => assignment.status === 'REVIEWED');
  }
  return nonDraftAssignments;
};

const filterDraftItems = (assignments: HomeworkAssignment[], draftScope: HomeworkDraftScope) => {
  if (draftScope === 'draft') {
    return assignments.filter((assignment) => assignment.status === 'DRAFT');
  }
  if (draftScope === 'scheduled') {
    return assignments.filter((assignment) => assignment.status === 'SCHEDULED');
  }
  return assignments;
};

export const HomeworkAssignmentsWorkspace: FC<HomeworkAssignmentsWorkspaceProps> = ({
  mode,
  assignments,
  loading,
  error,
  searchQuery,
  sortBy,
  selectedStudentId,
  students,
  loadingStudents,
  activeTab,
  countsByTab,
  draftCounts,
  onSearchChange,
  onSortChange,
  onSelectedStudentIdChange,
  onTabChange,
  onOpenDetail,
  onOpenReview,
  onSendNow,
  onFixConfigError,
  onCancelIssue,
  onReissue,
  onRemind,
  onDelete,
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [draftScope, setDraftScope] = useState<HomeworkDraftScope>('all');
  const [searchOpen, setSearchOpen] = useState(Boolean(searchQuery));

  useEffect(() => {
    if (searchQuery) {
      setSearchOpen(true);
    }
  }, [searchQuery]);

  const visibleAssignments = useMemo(
    () => (mode === 'drafts' ? filterDraftItems(assignments, draftScope) : filterAssignedItems(assignments, activeTab)),
    [activeTab, assignments, draftScope, mode],
  );

  const sectionTitle = mode === 'drafts' ? 'Черновики' : 'Назначенные задания';
  const searchPlaceholder =
    mode === 'drafts' ? 'Поиск по черновикам и запланированным выдачам...' : 'Поиск по выданным домашним заданиям...';

  const handleSearchToggle = () => {
    if (searchOpen) {
      onSearchChange('');
      setSearchOpen(false);
      return;
    }
    setSearchOpen(true);
  };

  return (
    <section className={styles.workspace}>
      <section className={styles.filtersCard}>
        <div className={styles.searchRow}>
          <div className={styles.scopeTabs}>
            {mode === 'drafts'
              ? DRAFT_SCOPE_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`${styles.scopeTab} ${draftScope === tab.id ? styles.scopeTabActive : ''}`}
                    onClick={() => setDraftScope(tab.id)}
                  >
                    <span>{tab.label}</span>
                    <span className={`${styles.scopeCount} ${draftScope === tab.id ? styles.scopeCountActive : ''}`}>
                      {draftCounts[tab.id]}
                    </span>
                  </button>
                ))
              : ASSIGNED_SCOPE_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`${styles.scopeTab} ${activeTab === tab.id ? styles.scopeTabActive : ''}`}
                    onClick={() => onTabChange(tab.id)}
                  >
                    <span>{tab.label}</span>
                    <span className={`${styles.scopeCount} ${activeTab === tab.id ? styles.scopeCountActive : ''}`}>
                      {countsByTab[tab.id as 'all' | 'sent' | 'overdue' | 'review' | 'closed']}
                    </span>
                  </button>
                ))}
          </div>

          <div className={styles.searchActions}>
            {searchOpen ? (
              <label className={`${styles.searchField} ${styles.searchFieldCompact}`}>
                <HomeworkMagnifyingGlassIcon size={14} className={styles.searchIcon} />
                <input
                  type="search"
                  className={styles.searchInput}
                  placeholder={searchPlaceholder}
                  value={searchQuery}
                  onChange={(event) => onSearchChange(event.target.value)}
                />
              </label>
            ) : null}

            <button
              type="button"
              className={styles.iconButton}
              onClick={handleSearchToggle}
              aria-label={searchOpen ? 'Скрыть поиск' : 'Открыть поиск'}
            >
              <HomeworkMagnifyingGlassIcon size={13} />
            </button>

            <HomeworkListFiltersPopover
              sortBy={sortBy}
              selectedStudentId={selectedStudentId}
              students={students}
              loadingStudents={loadingStudents}
              sortOptions={SORT_LABELS}
              onSortChange={onSortChange}
              onSelectedStudentIdChange={onSelectedStudentIdChange}
            />

            <div className={styles.viewToggle}>
              <button
                type="button"
                className={`${styles.viewToggleButton} ${viewMode === 'grid' ? styles.viewToggleButtonActive : ''}`}
                onClick={() => setViewMode('grid')}
                aria-label="Показать карточки сеткой"
              >
                <HomeworkTableCellsIcon size={13} />
              </button>
              <button
                type="button"
                className={`${styles.viewToggleButton} ${viewMode === 'list' ? styles.viewToggleButtonActive : ''}`}
                onClick={() => setViewMode('list')}
                aria-label="Показать карточки списком"
              >
                <HomeworkAlignLeftIcon size={13} />
              </button>
            </div>
          </div>
        </div>

      </section>

      <section className={styles.librarySection}>
        <div className={styles.libraryHead}>
          <h2 className={styles.sectionTitle}>{sectionTitle}</h2>
        </div>

        {error ? <div className={styles.stateCard}>{error}</div> : null}
        {loading ? <div className={styles.stateCard}>Загрузка домашних заданий...</div> : null}

        {!loading && !error ? (
          visibleAssignments.length > 0 ? (
            <div className={`${styles.cardsGrid} ${viewMode === 'list' ? styles.cardsList : ''}`}>
              {visibleAssignments.map((assignment) => (
                <HomeworkAssignmentCard
                  key={assignment.id}
                  assignment={assignment}
                  viewMode={viewMode}
                  onOpen={onOpenDetail}
                  onReview={onOpenReview}
                  onSendNow={(item) => {
                    void onSendNow(item);
                  }}
                  onFixConfigError={(item) => {
                    void onFixConfigError(item);
                  }}
                  onCancelIssue={(item) => {
                    void onCancelIssue(item);
                  }}
                  onReissue={(item) => {
                    void onReissue(item);
                  }}
                  onRemind={(item) => {
                    void onRemind(item);
                  }}
                  onDelete={(item) => {
                    void onDelete(item);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className={styles.stateCard}>
              {mode === 'drafts'
                ? 'Черновиков по текущим фильтрам пока нет.'
                : 'Назначенные домашние задания по текущим фильтрам пока не найдены.'}
            </div>
          )
        ) : null}
      </section>
    </section>
  );
};

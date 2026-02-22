import {
  ActivityFeedItem,
  HomeworkAssignment,
  HomeworkBlock,
  HomeworkGroup,
  HomeworkGroupListItem,
  HomeworkSubmission,
  HomeworkTemplate,
} from '../../entities/types';
import {
  HomeworkAssignmentProblemFilter,
  HomeworkAssignmentsSort,
  HomeworkAssignmentsSummary,
  HomeworkAssignmentsTab,
} from '../../shared/api/client';
import { StudentHomeworkSubmitPayload } from '../../features/homework-submit/ui/StudentHomeworkDetailView';

export type StudentHomeworkFilter = 'all' | 'new' | 'in_progress' | 'submitted' | 'reviewed';

export type StudentHomeworkSummary = {
  activeCount: number;
  overdueCount: number;
  submittedCount: number;
  reviewedCount: number;
  dueTodayCount: number;
};

export type TeacherHomeworkStudentOption = {
  id: number;
  name: string;
};

export type TeacherTemplateUpsertPayload = {
  title: string;
  tags: string[];
  subject?: string | null;
  level?: string | null;
  blocks: HomeworkBlock[];
};

export type TeacherAssignmentCreatePayload = {
  studentId: number;
  lessonId?: number | null;
  templateId?: number | null;
  groupId?: number | null;
  title?: string;
  sendMode: HomeworkAssignment['sendMode'];
  sendNow: boolean;
  deadlineAt: string | null;
};

export type TeacherAssignModalRequest = {
  requestId: string;
  open: boolean;
  studentId: number | null;
  lessonId: number | null;
};

export type TeacherBulkAction = 'SEND_NOW' | 'REMIND' | 'MOVE_TO_DRAFT' | 'DELETE';

export type TeacherAssignmentsSummary = HomeworkAssignmentsSummary;
export type TeacherHomeworkTab = HomeworkAssignmentsTab;
export type TeacherHomeworkSort = HomeworkAssignmentsSort;
export type TeacherHomeworkProblemFilter = HomeworkAssignmentProblemFilter;
export type TeacherHomeworkGroupKey = `group_${number}` | 'ungrouped';

export interface TeacherHomeworksViewModel {
  assignments: HomeworkAssignment[];
  templates: HomeworkTemplate[];
  groups: HomeworkGroupListItem[];
  groupAssignmentsByKey: Partial<Record<TeacherHomeworkGroupKey, HomeworkAssignment[]>>;
  groupAssignmentsLoadingByKey: Partial<Record<TeacherHomeworkGroupKey, boolean>>;
  groupAssignmentsErrorByKey: Partial<Record<TeacherHomeworkGroupKey, string | null>>;
  groupAssignmentsNextOffsetByKey: Partial<Record<TeacherHomeworkGroupKey, number | null>>;
  students: TeacherHomeworkStudentOption[];
  summary: TeacherAssignmentsSummary;
  activeTab: TeacherHomeworkTab;
  searchQuery: string;
  sortBy: TeacherHomeworkSort;
  problemFilters: TeacherHomeworkProblemFilter[];
  selectedStudentId: number | null;
  loadingAssignments: boolean;
  loadingMoreAssignments: boolean;
  hasMoreAssignments: boolean;
  loadingTemplates: boolean;
  loadingGroups: boolean;
  loadingSummary: boolean;
  loadingStudents: boolean;
  assignmentsError: string | null;
  templatesError: string | null;
  groupsError: string | null;
  summaryError: string | null;
  studentsError: string | null;
  submittingTemplate: boolean;
  submittingAssignment: boolean;
  reviewAssignment: HomeworkAssignment | null;
  reviewSubmissions: HomeworkSubmission[];
  reviewLoading: boolean;
  reviewSubmitting: boolean;
  detailAssignment: HomeworkAssignment | null;
  detailSubmissions: HomeworkSubmission[];
  detailLoading: boolean;
  assignModalRequest: TeacherAssignModalRequest | null;
  homeworkActivityItems: ActivityFeedItem[];
  homeworkActivityLoading: boolean;
  homeworkActivityHasUnread: boolean;
  onTabChange: (tab: TeacherHomeworkTab) => void;
  onSearchChange: (value: string) => void;
  onSortChange: (value: TeacherHomeworkSort) => void;
  onToggleProblemFilter: (filter: TeacherHomeworkProblemFilter) => void;
  onSelectedStudentIdChange: (studentId: number | null) => void;
  onOpenCreateTemplateScreen: () => void;
  onOpenEditTemplateScreen: (templateId: number) => void;
  onCreateGroup: (payload: {
    title: string;
    description?: string | null;
    iconKey?: string;
    bgColor?: string;
    sortOrder?: number;
  }) => Promise<HomeworkGroup | null>;
  onUpdateGroup: (
    groupId: number,
    payload: Partial<{
      title: string;
      description: string | null;
      iconKey: string;
      bgColor: string;
      sortOrder: number;
      isArchived: boolean;
    }>,
  ) => Promise<void>;
  onDeleteGroup: (groupId: number) => Promise<void>;
  onLoadGroupAssignments: (groupKey: TeacherHomeworkGroupKey, options?: { append?: boolean }) => Promise<void>;
  onRebindAssignmentGroup: (assignmentId: number, groupId: number | null) => Promise<void>;
  onRebindAssignmentsGroup: (assignmentIds: number[], groupId: number | null) => Promise<void>;
  onDuplicateTemplate: (template: HomeworkTemplate) => Promise<void>;
  onArchiveTemplate: (template: HomeworkTemplate) => Promise<void>;
  onRestoreTemplate: (template: HomeworkTemplate) => Promise<void>;
  onToggleTemplateFavorite: (template: HomeworkTemplate) => Promise<void>;
  onCreateAssignment: (payload: TeacherAssignmentCreatePayload) => Promise<boolean>;
  onSendAssignmentNow: (assignment: HomeworkAssignment) => Promise<void>;
  onRemindAssignment: (assignment: HomeworkAssignment) => Promise<void>;
  onDeleteAssignment: (assignment: HomeworkAssignment) => Promise<void>;
  onFixConfigError: (assignment: HomeworkAssignment) => Promise<void>;
  onBulkAction: (payload: { ids: number[]; action: TeacherBulkAction }) => Promise<void>;
  onOpenReview: (assignment: HomeworkAssignment) => void;
  onCloseReview: () => void;
  onStartReviewQueue: () => void;
  onOpenDetail: (assignment: HomeworkAssignment) => void;
  onCloseDetail: () => void;
  onLoadMoreAssignments: () => void;
  onConsumeAssignModalRequest: () => void;
  onSubmitReview: (payload: {
    action: 'REVIEWED' | 'RETURNED';
    submissionId: number;
    autoScore: number | null;
    manualScore: number | null;
    finalScore: number | null;
    teacherComment: string | null;
  }) => Promise<boolean>;
  onRefresh: () => void;
  onLoadHomeworkActivity: () => void;
  onMarkHomeworkActivitySeen: (seenThrough?: string) => Promise<void>;
}

export interface StudentHomeworksViewModel {
  assignments: HomeworkAssignment[];
  summary: StudentHomeworkSummary;
  filter: StudentHomeworkFilter;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onFilterChange: (next: StudentHomeworkFilter) => void;
  onRefresh: () => void;
  onLoadMore: () => void;
  onOpenAssignment: (assignment: HomeworkAssignment) => void;
}

export interface StudentHomeworkDetailModel {
  assignment: HomeworkAssignment | null;
  submissions: HomeworkSubmission[];
  loading: boolean;
  submitting: boolean;
  error: string | null;
  onBack: () => void;
  onRefresh: () => void;
  onSubmitPayload: (payload: StudentHomeworkSubmitPayload) => Promise<boolean>;
}

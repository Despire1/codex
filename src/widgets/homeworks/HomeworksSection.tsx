import { FC, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  ActivityFeedItem,
  HomeworkAssignment,
  HomeworkGroupListItem,
  HomeworkReviewDraft,
  HomeworkSubmission,
  HomeworkTemplate,
} from '../../entities/types';
import { canCancelHomeworkAssignmentIssue } from '../../entities/homework-assignment/model/lib/assignmentIssuance';
import { canTeacherEditHomeworkAssignment } from '../../entities/homework-assignment/model/lib/workflow';
import {
  canTeacherDeleteHomeworkTemplate,
  canTeacherEditHomeworkTemplate,
} from '../../entities/homework-template/model/lib/workflow';
import { getLatestSubmission } from '../../entities/homework-submission/model/lib/submissionState';
import { api, HomeworkAssignmentBucket, isApiRequestError } from '../../shared/api/client';
import { useUnsavedChanges } from '../../shared/lib/unsavedChanges';
import { useToast } from '../../shared/lib/toast';
import { useTimeZone } from '../../shared/lib/timezoneContext';
import { toZonedDate } from '../../shared/lib/timezoneDates';
import {
  StudentHomeworkDetailView,
  StudentHomeworkSubmitPayload,
} from '../../features/homework-submit/ui/StudentHomeworkDetailView';
import {
  createHomeworkEditorDraftFromAssignment,
  createHomeworkEditorDraftFromTemplate,
  createInitialHomeworkEditorDraft,
  projectHomeworkEditorToTemplateDraft,
} from '../../features/homework-template-editor/model/lib/blocks';
import { HomeworkEditorDraft } from '../../features/homework-template-editor/model/types';
import {
  buildHomeworkEditorDraftStorageKey,
  clearStoredHomeworkEditorDraft,
  loadStoredHomeworkEditorDraft,
  saveStoredHomeworkEditorDraft,
} from '../../features/homework-template-editor/model/lib/homeworkEditorDraftStorage';
import {
  areHomeworkEditorDraftsEqual,
  cloneHomeworkEditorDraft,
  hasHomeworkEditorContent,
  resolveOpenedHomeworkEditorDraft,
} from '../../features/homework-template-editor/model/lib/homeworkEditorDirty';
import {
  HomeworkTemplateCreateScreen,
  HomeworkTemplateCreateSubmitResult,
} from '../../features/homework-template-editor/ui/HomeworkTemplateCreateScreen';
import { HomeworkReviewScreen } from '../../features/homework-review/ui/HomeworkReviewScreen';
import { DialogModal } from '../../shared/ui/Modal/DialogModal';
import { StudentHomeworksView } from './student/StudentHomeworksView';
import { TeacherHomeworksView } from './teacher/TeacherHomeworksView';
import {
  StudentHomeworkFilter,
  StudentHomeworkSummary,
  TeacherAssignModalRequest,
  TeacherAssignmentEditorPrefill,
  TeacherAssignmentsSummary,
  TeacherBulkAction,
  TeacherHomeworkGroupKey,
  TeacherHomeworkListFilter,
  TeacherHomeworkProblemFilter,
  TeacherHomeworkSort,
  TeacherHomeworkStudentOption,
  TeacherTemplateUpsertPayload,
} from './types';
import {
  toggleHomeworkTemplateFavoriteTags,
  isHomeworkTemplateFavorite,
} from './teacher/model/lib/templatePresentation';

interface HomeworksSectionProps {
  mode: 'teacher' | 'student';
  onOpenMobileSidebar?: () => void;
  renderSearchButton?: (className: string) => ReactNode;
}

type HomeworksNavigationState = {
  openAssignModal?: boolean;
  studentId?: number | null;
  lessonId?: number | null;
  templateId?: number | null;
  groupId?: number | null;
};

const TEACHER_PAGE_SIZE = 10;
const STUDENT_PAGE_SIZE = 20;
const REVIEW_UNSAVED_ENTRY_KEY = 'homeworks-review';
const ASSIGNMENT_EDITOR_UNSAVED_ENTRY_KEY = 'homeworks-assignment-editor';
const REVIEW_DRAFT_STORAGE_PREFIX = 'homework-review-draft-v1';

const buildReviewDraftStorageKey = (assignmentId: number, submissionId: number) =>
  `${REVIEW_DRAFT_STORAGE_PREFIX}:${assignmentId}:${submissionId}`;

const saveReviewDraftToStorage = (assignmentId: number, draft: HomeworkReviewDraft) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(buildReviewDraftStorageKey(assignmentId, draft.submissionId), JSON.stringify(draft));
};

const readReviewDraftFromStorage = (assignmentId: number, submissionId: number): HomeworkReviewDraft | null => {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(buildReviewDraftStorageKey(assignmentId, submissionId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as HomeworkReviewDraft;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.submissionId !== submissionId ||
      !parsed.scoresById ||
      !parsed.commentsById
    ) {
      return null;
    }
    return {
      submissionId,
      scoresById: typeof parsed.scoresById === 'object' ? parsed.scoresById : {},
      commentsById: typeof parsed.commentsById === 'object' ? parsed.commentsById : {},
      generalComment: typeof parsed.generalComment === 'string' ? parsed.generalComment : '',
    };
  } catch {
    return null;
  }
};

const clearReviewDraftInStorage = (assignmentId: number, submissionId: number) => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(buildReviewDraftStorageKey(assignmentId, submissionId));
};

const mapStudentHomeworkFilterToApiFilter = (
  filter: StudentHomeworkFilter,
): 'all' | 'active' | 'submitted' | 'reviewed' => {
  if (filter === 'submitted') return 'submitted';
  if (filter === 'reviewed') return 'reviewed';
  if (filter === 'new' || filter === 'in_progress') return 'active';
  return 'all';
};

const emptySummary: StudentHomeworkSummary = {
  activeCount: 0,
  overdueCount: 0,
  submittedCount: 0,
  reviewedCount: 0,
  dueTodayCount: 0,
};

const emptyTeacherSummary: TeacherAssignmentsSummary = {
  totalCount: 0,
  draftCount: 0,
  sentCount: 0,
  reviewCount: 0,
  reviewedCount: 0,
  overdueCount: 0,
  inboxCount: 0,
  scheduledCount: 0,
  inProgressCount: 0,
  closedCount: 0,
  configErrorCount: 0,
  returnedCount: 0,
  reviewedThisMonthCount: 0,
  sentTodayCount: 0,
  dueTodayCount: 0,
  reviewedWeekDeltaPercent: 0,
  averageScore30d: null,
  permissions: {
    canStartReviewQueue: false,
  },
};

const resolveTeacherListQuery = (
  filter: TeacherHomeworkListFilter,
): { tab?: 'all' | 'in_progress' | 'review' | 'closed'; bucket?: HomeworkAssignmentBucket } => {
  if (filter === 'not_issued') {
    return { bucket: 'draft' };
  }
  if (filter === 'sent') {
    return { tab: 'in_progress' };
  }
  if (filter === 'review') {
    return { tab: 'review' };
  }
  if (filter === 'closed') {
    return { tab: 'closed' };
  }
  return { tab: 'all' };
};

const mergeHomeworkTemplate = (items: HomeworkTemplate[], nextTemplate: HomeworkTemplate) => [
  nextTemplate,
  ...items.filter((template) => template.id !== nextTemplate.id),
];

const HOMEWORK_COPY_TITLE_REGEX = /\s+\(копия(?:\s+(\d+))?\)$/iu;

const normalizeHomeworkCopyBaseTitle = (title: string) => {
  const normalizedTitle = title.trim() || 'Домашнее задание';
  return normalizedTitle.replace(HOMEWORK_COPY_TITLE_REGEX, '').trim() || 'Домашнее задание';
};

const buildHomeworkCopyTitle = (title: string, existingTitles: string[]) => {
  const baseTitle = normalizeHomeworkCopyBaseTitle(title);
  let maxCopyIndex = -1;

  existingTitles.forEach((existingTitle) => {
    const normalizedExistingTitle = existingTitle.trim();
    if (!normalizedExistingTitle) return;

    const match = normalizedExistingTitle.match(HOMEWORK_COPY_TITLE_REGEX);
    if (!match) return;

    const existingBaseTitle = normalizeHomeworkCopyBaseTitle(normalizedExistingTitle);
    if (existingBaseTitle !== baseTitle) return;

    const rawIndex = match[1];
    const resolvedIndex = rawIndex === undefined ? 0 : Number.parseInt(rawIndex, 10);
    if (!Number.isFinite(resolvedIndex)) return;

    maxCopyIndex = Math.max(maxCopyIndex, resolvedIndex);
  });

  const nextCopyIndex = maxCopyIndex + 1;
  return nextCopyIndex === 0 ? `${baseTitle} (копия)` : `${baseTitle} (копия ${nextCopyIndex})`;
};

export const HomeworksSection: FC<HomeworksSectionProps> = ({ mode, onOpenMobileSidebar, renderSearchButton }) => {
  const { showToast } = useToast();
  const { setEntry, clearEntry, requestNavigationBypass } = useUnsavedChanges();
  const navigate = useNavigate();
  const location = useLocation();
  const timeZone = useTimeZone();
  const { assignmentId: assignmentIdParam, templateId: templateIdParam } = useParams<{
    assignmentId?: string;
    templateId?: string;
  }>();
  const assignmentId = assignmentIdParam ? Number(assignmentIdParam) : Number.NaN;
  const templateId = templateIdParam ? Number(templateIdParam) : Number.NaN;
  const hasStudentAssignmentId = mode === 'student' && Number.isFinite(assignmentId) && assignmentId > 0;
  const hasTeacherReviewAssignmentId =
    mode === 'teacher' &&
    Number.isFinite(assignmentId) &&
    assignmentId > 0 &&
    /^\/homeworks\/review\/\d+\/?$/.test(location.pathname);
  const hasTeacherHomeworkSourceDetailId =
    mode === 'teacher' &&
    Number.isFinite(templateId) &&
    templateId > 0 &&
    /^\/homeworks\/\d+\/?$/.test(location.pathname);
  const isTeacherAssignmentCreateRoute = mode === 'teacher' && /^\/homeworks\/new\/?$/.test(location.pathname);
  const teacherAssignmentDetailRouteMatch =
    mode === 'teacher' ? location.pathname.match(/^\/homeworks\/assignments\/(\d+)\/?$/) : null;
  const detailAssignmentId = teacherAssignmentDetailRouteMatch ? Number(teacherAssignmentDetailRouteMatch[1]) : null;
  const hasTeacherAssignmentDetailId =
    mode === 'teacher' &&
    typeof detailAssignmentId === 'number' &&
    Number.isFinite(detailAssignmentId) &&
    detailAssignmentId > 0;
  const teacherAssignmentEditRouteMatch =
    mode === 'teacher' ? location.pathname.match(/^\/homeworks\/assignments\/(\d+)\/edit\/?$/) : null;
  const editingAssignmentId = teacherAssignmentEditRouteMatch ? Number(teacherAssignmentEditRouteMatch[1]) : null;
  const isTeacherAssignmentEditRoute =
    mode === 'teacher' &&
    typeof editingAssignmentId === 'number' &&
    Number.isFinite(editingAssignmentId) &&
    editingAssignmentId > 0;
  const isTeacherAssignmentEditorRoute =
    isTeacherAssignmentCreateRoute || isTeacherAssignmentEditRoute || hasTeacherAssignmentDetailId;
  const activeTeacherAssignmentId = isTeacherAssignmentEditRoute
    ? editingAssignmentId
    : hasTeacherAssignmentDetailId
      ? detailAssignmentId
      : null;
  const isTeacherTemplateCreateRoute = mode === 'teacher' && /^\/homeworks\/templates\/new\/?$/.test(location.pathname);
  const teacherTemplateEditRouteMatch =
    mode === 'teacher' ? location.pathname.match(/^\/homeworks\/(\d+)\/edit\/?$/) : null;
  const editingTemplateId = teacherTemplateEditRouteMatch ? Number(teacherTemplateEditRouteMatch[1]) : null;
  const isTeacherTemplateEditRoute =
    mode === 'teacher' &&
    typeof editingTemplateId === 'number' &&
    Number.isFinite(editingTemplateId) &&
    editingTemplateId > 0;
  const isTeacherTemplateEditorRoute = isTeacherTemplateCreateRoute || isTeacherTemplateEditRoute;
  const teacherTemplateListPath = '/homeworks';
  const navigateBackInHistory = useCallback(
    (fallbackPath = '/homeworks') => {
      if (typeof window !== 'undefined' && window.history.length > 1) {
        window.history.back();
        return;
      }

      navigate(fallbackPath);
    },
    [navigate],
  );
  const templateEditorDraftStorageKey =
    isTeacherTemplateEditRoute && editingTemplateId
      ? buildHomeworkEditorDraftStorageKey({
          variant: 'template',
          mode: 'edit',
          entityId: editingTemplateId,
        })
      : null;
  const assignmentEditorDraftStorageKey =
    isTeacherAssignmentEditRoute && editingAssignmentId
      ? buildHomeworkEditorDraftStorageKey({
          variant: 'assignment',
          mode: 'edit',
          entityId: editingAssignmentId,
        })
      : isTeacherAssignmentCreateRoute
        ? buildHomeworkEditorDraftStorageKey({
            variant: 'assignment',
            mode: 'create',
          })
        : null;

  const [templates, setTemplates] = useState<HomeworkTemplate[]>([]);
  const [groups, setGroups] = useState<HomeworkGroupListItem[]>([]);
  const [assignments, setAssignments] = useState<HomeworkAssignment[]>([]);
  const [groupAssignmentsByKey, setGroupAssignmentsByKey] = useState<
    Partial<Record<TeacherHomeworkGroupKey, HomeworkAssignment[]>>
  >({});
  const [groupAssignmentsLoadingByKey, setGroupAssignmentsLoadingByKey] = useState<
    Partial<Record<TeacherHomeworkGroupKey, boolean>>
  >({});
  const [groupAssignmentsErrorByKey, setGroupAssignmentsErrorByKey] = useState<
    Partial<Record<TeacherHomeworkGroupKey, string | null>>
  >({});
  const [groupAssignmentsNextOffsetByKey, setGroupAssignmentsNextOffsetByKey] = useState<
    Partial<Record<TeacherHomeworkGroupKey, number | null>>
  >({});
  const [students, setStudents] = useState<TeacherHomeworkStudentOption[]>([]);
  const [teacherSummary, setTeacherSummary] = useState<TeacherAssignmentsSummary>(emptyTeacherSummary);
  const [studentSummary, setStudentSummary] = useState<StudentHomeworkSummary>(emptySummary);

  const [activeTab, setActiveTab] = useState<TeacherHomeworkListFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<TeacherHomeworkSort>('urgency');
  const [problemFilters, setProblemFilters] = useState<TeacherHomeworkProblemFilter[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);

  const [assignmentsNextOffset, setAssignmentsNextOffset] = useState<number | null>(null);
  const [hasMoreAssignments, setHasMoreAssignments] = useState(false);

  const [studentFilter, setStudentFilter] = useState<StudentHomeworkFilter>('all');
  const [studentNextOffset, setStudentNextOffset] = useState<number | null>(null);
  const [studentHasMore, setStudentHasMore] = useState(false);

  const [assignModalRequest, setAssignModalRequest] = useState<TeacherAssignModalRequest | null>(null);

  const [loadingAssignments, setLoadingAssignments] = useState(mode === 'teacher');
  const [loadingMoreAssignments, setLoadingMoreAssignments] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);

  const [loadingStudentList, setLoadingStudentList] = useState(false);
  const [loadingStudentListMore, setLoadingStudentListMore] = useState(false);

  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [studentsError, setStudentsError] = useState<string | null>(null);

  const [submittingTemplate, setSubmittingTemplate] = useState(false);
  const [submittingAssignment, setSubmittingAssignment] = useState(false);

  const [reviewAssignment, setReviewAssignment] = useState<HomeworkAssignment | null>(null);
  const [reviewSubmissions, setReviewSubmissions] = useState<HomeworkSubmission[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewQueueActive, setReviewQueueActive] = useState(false);
  const [reviewInitialDraft, setReviewInitialDraft] = useState<HomeworkReviewDraft | null>(null);
  const [reviewCurrentDraft, setReviewCurrentDraft] = useState<HomeworkReviewDraft | null>(null);
  const [, setReviewHasUnsavedDraft] = useState(false);

  const [homeworkActivityItems, setHomeworkActivityItems] = useState<ActivityFeedItem[]>([]);
  const [homeworkActivityLoading, setHomeworkActivityLoading] = useState(false);
  const [homeworkActivityHasUnread, setHomeworkActivityHasUnread] = useState(false);

  const [templateEditorDraft, setTemplateEditorDraft] = useState<HomeworkEditorDraft>(
    createInitialHomeworkEditorDraft(),
  );
  const [templateEditorInitialDraft, setTemplateEditorInitialDraft] = useState<HomeworkEditorDraft>(
    createInitialHomeworkEditorDraft(),
  );
  const [templateEditorTemplate, setTemplateEditorTemplate] = useState<HomeworkTemplate | null>(null);
  const [templateEditorLoading, setTemplateEditorLoading] = useState(false);
  const [templateEditorError, setTemplateEditorError] = useState<string | null>(null);
  const [assignmentEditorDraft, setAssignmentEditorDraft] = useState<HomeworkEditorDraft>(
    createInitialHomeworkEditorDraft(),
  );
  const [assignmentEditorInitialDraft, setAssignmentEditorInitialDraft] = useState<HomeworkEditorDraft>(
    createInitialHomeworkEditorDraft(),
  );
  const [assignmentEditorLoading, setAssignmentEditorLoading] = useState(false);
  const [assignmentEditorError, setAssignmentEditorError] = useState<string | null>(null);
  const [assignmentEditorOriginalStatus, setAssignmentEditorOriginalStatus] = useState<
    HomeworkAssignment['status'] | null
  >(null);
  const [assignmentEditorServerAssignment, setAssignmentEditorServerAssignment] = useState<HomeworkAssignment | null>(
    null,
  );
  const [savingAssignmentAsTemplate, setSavingAssignmentAsTemplate] = useState(false);
  const [pendingAssignmentTemplate, setPendingAssignmentTemplate] = useState<HomeworkTemplate | null>(null);
  const [pendingTemplateEditCopy, setPendingTemplateEditCopy] = useState<{
    template: HomeworkTemplate;
    cancelPath: string | null;
  } | null>(null);
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<HomeworkTemplate | null>(null);
  const [cancelIssueAssignment, setCancelIssueAssignment] = useState<HomeworkAssignment | null>(null);
  const [cancelIssueSubmitting, setCancelIssueSubmitting] = useState(false);

  const [studentDetailAssignment, setStudentDetailAssignment] = useState<HomeworkAssignment | null>(null);
  const [studentDetailSubmissions, setStudentDetailSubmissions] = useState<HomeworkSubmission[]>([]);
  const [studentDetailLoading, setStudentDetailLoading] = useState(false);
  const [studentDetailSubmitting, setStudentDetailSubmitting] = useState(false);
  const [studentDetailError, setStudentDetailError] = useState<string | null>(null);
  const [homeworkDetailTemplate, setHomeworkDetailTemplate] = useState<HomeworkTemplate | null>(null);
  const [homeworkDetailAssignments, setHomeworkDetailAssignments] = useState<HomeworkAssignment[]>([]);
  const [homeworkDetailLoading, setHomeworkDetailLoading] = useState(false);
  const [homeworkDetailError, setHomeworkDetailError] = useState<string | null>(null);

  const [teacherInitialized, setTeacherInitialized] = useState(false);
  const teacherInitStartedRef = useRef(false);
  const hasSkippedTemplateEditorAutoSaveRef = useRef(false);
  const hasSkippedAssignmentEditorAutoSaveRef = useRef(false);
  const templateEditorReadOnly = useMemo(
    () =>
      isTeacherTemplateEditRoute &&
      templateEditorTemplate !== null &&
      !canTeacherEditHomeworkTemplate(templateEditorTemplate),
    [isTeacherTemplateEditRoute, templateEditorTemplate],
  );
  const templateEditorHasUnsavedChanges = useMemo(
    () =>
      isTeacherTemplateEditRoute &&
      !templateEditorReadOnly &&
      templateEditorTemplate !== null &&
      !areHomeworkEditorDraftsEqual(templateEditorDraft, templateEditorInitialDraft),
    [
      isTeacherTemplateEditRoute,
      templateEditorDraft,
      templateEditorInitialDraft,
      templateEditorReadOnly,
      templateEditorTemplate,
    ],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  useEffect(() => {
    if (mode !== 'teacher') return;
    if (isTeacherTemplateCreateRoute) {
      const initialDraft = createInitialHomeworkEditorDraft();
      setTemplateEditorDraft(initialDraft);
      setTemplateEditorInitialDraft(initialDraft);
      setTemplateEditorTemplate(null);
      setTemplateEditorLoading(false);
      setTemplateEditorError(null);
    } else if (!isTeacherTemplateEditorRoute) {
      setTemplateEditorInitialDraft(createInitialHomeworkEditorDraft());
      setTemplateEditorTemplate(null);
      setTemplateEditorLoading(false);
      setTemplateEditorError(null);
    }
  }, [isTeacherTemplateCreateRoute, isTeacherTemplateEditorRoute, mode]);

  useEffect(() => {
    if (!isTeacherAssignmentCreateRoute || !assignmentEditorDraftStorageKey) return;

    // The create-assignment route is always a fresh flow, never a restored draft.
    clearStoredHomeworkEditorDraft(assignmentEditorDraftStorageKey);

    return () => {
      clearStoredHomeworkEditorDraft(assignmentEditorDraftStorageKey);
    };
  }, [assignmentEditorDraftStorageKey, isTeacherAssignmentCreateRoute]);

  useEffect(() => {
    hasSkippedTemplateEditorAutoSaveRef.current = false;
  }, [templateEditorDraftStorageKey]);

  useEffect(() => {
    hasSkippedAssignmentEditorAutoSaveRef.current = false;
  }, [assignmentEditorDraftStorageKey]);

  const assignmentsById = useMemo(
    () => new Map(assignments.map((assignment) => [assignment.id, assignment])),
    [assignments],
  );

  useEffect(() => {
    if (mode !== 'teacher') return;
    if (!isTeacherTemplateEditRoute || editingTemplateId === null) {
      return;
    }

    const existingTemplate = templates.find((template) => template.id === editingTemplateId);
    if (existingTemplate) {
      const nextDraft = createHomeworkEditorDraftFromTemplate(existingTemplate);
      const storedDraft =
        templateEditorDraftStorageKey && canTeacherEditHomeworkTemplate(existingTemplate)
          ? loadStoredHomeworkEditorDraft(templateEditorDraftStorageKey)
          : null;
      const openedDraft = cloneHomeworkEditorDraft(resolveOpenedHomeworkEditorDraft(nextDraft, storedDraft?.draft));
      setTemplateEditorTemplate(existingTemplate);
      setTemplateEditorInitialDraft(cloneHomeworkEditorDraft(openedDraft));
      setTemplateEditorDraft(openedDraft);
      setTemplateEditorError(null);
      setTemplateEditorLoading(false);
      return;
    }

    let isCancelled = false;
    setTemplateEditorLoading(true);
    setTemplateEditorError(null);

    void api
      .listHomeworkTemplatesV2({ includeArchived: true })
      .then((response) => {
        if (isCancelled) return;
        setTemplates(response.items);
        const targetTemplate = response.items.find((template) => template.id === editingTemplateId);
        if (!targetTemplate) {
          setTemplateEditorError('Домашнее задание не найдено');
          return;
        }
        const nextDraft = createHomeworkEditorDraftFromTemplate(targetTemplate);
        const storedDraft =
          templateEditorDraftStorageKey && canTeacherEditHomeworkTemplate(targetTemplate)
            ? loadStoredHomeworkEditorDraft(templateEditorDraftStorageKey)
            : null;
        const openedDraft = cloneHomeworkEditorDraft(resolveOpenedHomeworkEditorDraft(nextDraft, storedDraft?.draft));
        setTemplateEditorTemplate(targetTemplate);
        setTemplateEditorInitialDraft(cloneHomeworkEditorDraft(openedDraft));
        setTemplateEditorDraft(openedDraft);
      })
      .catch((error) => {
        console.error('Failed to load template for edit screen', error);
        if (isCancelled) return;
        setTemplateEditorTemplate(null);
        setTemplateEditorError('Не удалось загрузить домашнее задание');
      })
      .finally(() => {
        if (isCancelled) return;
        setTemplateEditorLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [editingTemplateId, isTeacherTemplateEditRoute, mode, templateEditorDraftStorageKey, templates]);

  useEffect(() => {
    if (
      mode !== 'teacher' ||
      !isTeacherTemplateEditRoute ||
      templateEditorLoading ||
      templateEditorError ||
      !templateEditorTemplate ||
      canTeacherEditHomeworkTemplate(templateEditorTemplate)
    ) {
      return;
    }

    const cancelPath = `/homeworks/${templateEditorTemplate.id}`;
    setPendingTemplateEditCopy((current) => {
      if (current?.template.id === templateEditorTemplate.id && current.cancelPath === cancelPath) {
        return current;
      }

      return {
        template: templateEditorTemplate,
        cancelPath,
      };
    });
  }, [isTeacherTemplateEditRoute, mode, templateEditorError, templateEditorLoading, templateEditorTemplate]);

  useEffect(() => {
    if (mode !== 'teacher') return;
    if (!isTeacherAssignmentCreateRoute) {
      if (!isTeacherAssignmentEditRoute) {
        setAssignmentEditorLoading(false);
        setAssignmentEditorError(null);
      }
      return;
    }

    const nextDraft = cloneHomeworkEditorDraft(createInitialHomeworkEditorDraft());
    setAssignmentEditorInitialDraft(cloneHomeworkEditorDraft(nextDraft));
    setAssignmentEditorDraft(nextDraft);
    setAssignmentEditorOriginalStatus(null);
    setAssignmentEditorServerAssignment(null);
    setAssignmentEditorError(null);
    setAssignmentEditorLoading(false);
  }, [isTeacherAssignmentCreateRoute, isTeacherAssignmentEditRoute, mode]);

  useEffect(() => {
    if (mode !== 'teacher') return;
    if (activeTeacherAssignmentId === null) {
      setAssignmentEditorServerAssignment(null);
      return;
    }

    let isCancelled = false;
    setAssignmentEditorLoading(true);
    setAssignmentEditorError(null);

    void api
      .getHomeworkAssignmentV2(activeTeacherAssignmentId)
      .then(async (response) => {
        if (isCancelled) return;
        const assignment = response.assignment;
        let relatedTemplate =
          typeof assignment.templateId === 'number'
            ? (templates.find((template) => template.id === assignment.templateId) ?? null)
            : null;

        if (assignment.templateId && !relatedTemplate) {
          const templatesResponse = await api.listHomeworkTemplatesV2({ includeArchived: true });
          if (isCancelled) return;
          setTemplates(templatesResponse.items);
          relatedTemplate = templatesResponse.items.find((template) => template.id === assignment.templateId) ?? null;
        }

        const nextDraft = createHomeworkEditorDraftFromAssignment(assignment, relatedTemplate);
        const storedDraft =
          assignmentEditorDraftStorageKey && canTeacherEditHomeworkAssignment(assignment)
            ? loadStoredHomeworkEditorDraft(assignmentEditorDraftStorageKey)
            : null;
        const openedDraft = cloneHomeworkEditorDraft(resolveOpenedHomeworkEditorDraft(nextDraft, storedDraft?.draft));
        setAssignmentEditorInitialDraft(cloneHomeworkEditorDraft(openedDraft));
        setAssignmentEditorDraft(openedDraft);
        setAssignmentEditorOriginalStatus(assignment.status);
        setAssignmentEditorServerAssignment(response.assignment);
      })
      .catch((error) => {
        console.error('Failed to load assignment for editor screen', error);
        if (isCancelled) return;
        setAssignmentEditorError('Не удалось загрузить домашнее задание');
      })
      .finally(() => {
        if (isCancelled) return;
        setAssignmentEditorLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [assignmentEditorDraftStorageKey, activeTeacherAssignmentId, mode, templates]);

  useEffect(() => {
    const sourceTemplateId =
      hasTeacherHomeworkSourceDetailId && Number.isFinite(templateId) && templateId > 0 ? templateId : Number.NaN;

    if (mode !== 'teacher') return;
    if (!Number.isFinite(sourceTemplateId) || sourceTemplateId <= 0) {
      setHomeworkDetailTemplate(null);
      setHomeworkDetailAssignments([]);
      setHomeworkDetailLoading(false);
      setHomeworkDetailError(null);
      return;
    }

    let isCancelled = false;
    setHomeworkDetailLoading(true);
    setHomeworkDetailError(null);

    const loadHomeworkDetail = async () => {
      const templatesResponse = await api.listHomeworkTemplatesV2({ includeArchived: true });
      if (isCancelled) return;
      setTemplates(templatesResponse.items);
      const targetTemplate = templatesResponse.items.find((item) => item.id === sourceTemplateId) ?? null;
      if (!targetTemplate) {
        setHomeworkDetailTemplate(null);
        setHomeworkDetailAssignments([]);
        setHomeworkDetailError('Домашнее задание не найдено');
        return;
      }

      const collectedAssignments: HomeworkAssignment[] = [];
      let nextOffset: number | null = 0;
      while (nextOffset !== null) {
        const response = await api.listHomeworkAssignmentsV2({
          templateId: sourceTemplateId,
          limit: 100,
          offset: nextOffset,
        });
        if (isCancelled) return;
        collectedAssignments.push(...response.items);
        nextOffset = response.nextOffset;
      }

      if (isCancelled) return;
      setHomeworkDetailTemplate(targetTemplate);
      setHomeworkDetailAssignments(collectedAssignments);
    };

    void loadHomeworkDetail()
      .catch((error) => {
        console.error('Failed to load homework source detail', error);
        if (isCancelled) return;
        setHomeworkDetailTemplate(null);
        setHomeworkDetailAssignments([]);
        setHomeworkDetailError('Не удалось загрузить карточку домашнего задания');
      })
      .finally(() => {
        if (isCancelled) return;
        setHomeworkDetailLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [hasTeacherHomeworkSourceDetailId, mode, templateId]);

  const assignmentEditorReadOnly = useMemo(
    () =>
      hasTeacherAssignmentDetailId ||
      (isTeacherAssignmentEditRoute &&
        assignmentEditorServerAssignment !== null &&
        !canTeacherEditHomeworkAssignment(assignmentEditorServerAssignment)),
    [assignmentEditorServerAssignment, hasTeacherAssignmentDetailId, isTeacherAssignmentEditRoute],
  );

  const assignmentEditorHasUnsavedChanges = useMemo(
    () =>
      isTeacherAssignmentEditorRoute &&
      !assignmentEditorReadOnly &&
      !areHomeworkEditorDraftsEqual(assignmentEditorDraft, assignmentEditorInitialDraft),
    [assignmentEditorDraft, assignmentEditorInitialDraft, assignmentEditorReadOnly, isTeacherAssignmentEditorRoute],
  );

  const assignmentCanIssueNow = useMemo(
    () =>
      isTeacherAssignmentEditRoute &&
      assignmentEditorOriginalStatus === 'DRAFT' &&
      assignmentEditorDraft.assignment.sendMode === 'MANUAL' &&
      !assignmentEditorHasUnsavedChanges,
    [
      assignmentEditorDraft.assignment.sendMode,
      assignmentEditorHasUnsavedChanges,
      assignmentEditorOriginalStatus,
      isTeacherAssignmentEditRoute,
    ],
  );

  const assignmentPrimaryActionMode = useMemo<'create' | 'save' | 'issue'>(() => {
    if (!isTeacherAssignmentEditRoute) {
      return 'create';
    }
    if (assignmentEditorHasUnsavedChanges) {
      return 'save';
    }
    return assignmentCanIssueNow ? 'issue' : 'save';
  }, [assignmentCanIssueNow, assignmentEditorHasUnsavedChanges, isTeacherAssignmentEditRoute]);

  const assignmentPrimaryActionDisabled = useMemo(
    () => assignmentPrimaryActionMode === 'save' && !assignmentEditorHasUnsavedChanges,
    [assignmentEditorHasUnsavedChanges, assignmentPrimaryActionMode],
  );
  const assignmentCanCancelIssue = useMemo(
    () =>
      isTeacherAssignmentEditRoute &&
      !assignmentEditorHasUnsavedChanges &&
      assignmentEditorServerAssignment !== null &&
      canCancelHomeworkAssignmentIssue(assignmentEditorServerAssignment),
    [assignmentEditorHasUnsavedChanges, assignmentEditorServerAssignment, isTeacherAssignmentEditRoute],
  );

  const saveAssignmentEditorDraftLocally = useCallback(async () => {
    if (assignmentEditorDraftStorageKey) {
      saveStoredHomeworkEditorDraft(assignmentEditorDraftStorageKey, {
        draft: assignmentEditorDraft,
        savedAt: new Date().toISOString(),
      });
    }
    showToast({ message: 'Черновик сохранён', variant: 'success' });
    return true;
  }, [assignmentEditorDraft, assignmentEditorDraftStorageKey, showToast]);

  useEffect(() => {
    if (mode !== 'teacher' || !isTeacherAssignmentEditorRoute) {
      clearEntry(ASSIGNMENT_EDITOR_UNSAVED_ENTRY_KEY);
      return;
    }

    if (assignmentEditorReadOnly) {
      clearEntry(ASSIGNMENT_EDITOR_UNSAVED_ENTRY_KEY);
      return;
    }

    setEntry(ASSIGNMENT_EDITOR_UNSAVED_ENTRY_KEY, {
      isDirty: assignmentEditorHasUnsavedChanges,
      title: 'Сохранить изменения перед выходом?',
      message: 'У вас есть несохранённые изменения в домашнем задании. Сохранить их как черновик перед выходом?',
      confirmText: 'Сохранить',
      cancelText: 'Выйти без сохранения',
      onSave: saveAssignmentEditorDraftLocally,
      onDiscard: () => {
        if (assignmentEditorDraftStorageKey) {
          clearStoredHomeworkEditorDraft(assignmentEditorDraftStorageKey);
        }
      },
      onSaveErrorMessage: 'Не удалось сохранить черновик',
    });

    return () => {
      clearEntry(ASSIGNMENT_EDITOR_UNSAVED_ENTRY_KEY);
    };
  }, [
    assignmentEditorDraftStorageKey,
    assignmentEditorHasUnsavedChanges,
    clearEntry,
    assignmentEditorReadOnly,
    isTeacherAssignmentEditorRoute,
    mode,
    saveAssignmentEditorDraftLocally,
    setEntry,
  ]);

  useEffect(() => {
    if (mode !== 'teacher') return;
    if (!templateEditorDraftStorageKey || !isTeacherTemplateEditRoute || templateEditorReadOnly) return;
    if (!hasSkippedTemplateEditorAutoSaveRef.current) {
      hasSkippedTemplateEditorAutoSaveRef.current = true;
      return;
    }

    const timeoutId = window.setTimeout(() => {
      saveStoredHomeworkEditorDraft(templateEditorDraftStorageKey, {
        draft: templateEditorDraft,
        savedAt: new Date().toISOString(),
      });
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isTeacherTemplateEditRoute, mode, templateEditorDraft, templateEditorDraftStorageKey, templateEditorReadOnly]);

  useEffect(() => {
    if (mode !== 'teacher') return;
    if (!assignmentEditorDraftStorageKey || !isTeacherAssignmentEditorRoute || assignmentEditorReadOnly) return;
    if (!hasSkippedAssignmentEditorAutoSaveRef.current) {
      hasSkippedAssignmentEditorAutoSaveRef.current = true;
      return;
    }

    const timeoutId = window.setTimeout(() => {
      saveStoredHomeworkEditorDraft(assignmentEditorDraftStorageKey, {
        draft: assignmentEditorDraft,
        savedAt: new Date().toISOString(),
      });
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    assignmentEditorDraft,
    assignmentEditorDraftStorageKey,
    assignmentEditorReadOnly,
    isTeacherAssignmentEditorRoute,
    mode,
  ]);

  useEffect(() => {
    if (mode !== 'teacher') return;
    const state = (location.state ?? null) as HomeworksNavigationState | null;
    if (!state || !state.openAssignModal) return;
    const requestedStudentId =
      typeof state.studentId === 'number' && Number.isFinite(state.studentId) ? state.studentId : null;
    const requestedLessonId =
      typeof state.lessonId === 'number' && Number.isFinite(state.lessonId) ? state.lessonId : null;
    const requestedTemplateId =
      typeof state.templateId === 'number' && Number.isFinite(state.templateId) ? state.templateId : null;
    const requestedGroupId = typeof state.groupId === 'number' && Number.isFinite(state.groupId) ? state.groupId : null;

    if (requestedStudentId !== null) {
      setSelectedStudentId(requestedStudentId);
    }
    setAssignModalRequest({
      requestId: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      open: true,
      studentId: requestedStudentId,
      lessonId: requestedLessonId,
      templateId: requestedTemplateId,
      groupId: requestedGroupId,
    });
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, mode, navigate]);

  const loadTeacherStudents = useCallback(async () => {
    setLoadingStudents(true);
    setStudentsError(null);
    try {
      const result: TeacherHomeworkStudentOption[] = [];
      let offset = 0;
      const visitedOffsets = new Set<number>();
      while (!visitedOffsets.has(offset)) {
        visitedOffsets.add(offset);
        const response = await api.listStudents({ filter: 'all', limit: 100, offset });
        response.items.forEach((item) => {
          result.push({
            id: item.student.id,
            name: item.link.customName || item.student.username || `Ученик #${item.student.id}`,
            level: item.link.studentLevel ?? null,
            uiColor: item.link.uiColor ?? null,
          });
        });
        if (response.nextOffset === null) break;
        offset = response.nextOffset;
      }
      setStudents(result);
    } catch (error) {
      console.error('Failed to load homework students', error);
      setStudentsError('Не удалось загрузить список учеников');
    } finally {
      setLoadingStudents(false);
    }
  }, []);

  const loadTeacherTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    setTemplatesError(null);
    try {
      const response = await api.listHomeworkTemplatesV2({ includeArchived: true });
      setTemplates(response.items);
    } catch (error) {
      console.error('Failed to load homework templates', error);
      setTemplatesError('Не удалось загрузить домашние задания');
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  const loadTeacherGroups = useCallback(async () => {
    setLoadingGroups(true);
    setGroupsError(null);
    try {
      const response = await api.listHomeworkGroupsV2();
      setGroups(response.items);
    } catch (error) {
      console.error('Failed to load homework groups', error);
      setGroups([]);
      setGroupsError('Не удалось загрузить группы');
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  const resetGroupAssignmentsState = useCallback(() => {
    setGroupAssignmentsByKey({});
    setGroupAssignmentsLoadingByKey({});
    setGroupAssignmentsErrorByKey({});
    setGroupAssignmentsNextOffsetByKey({});
  }, []);

  const loadTeacherSummary = useCallback(
    async (studentId = selectedStudentId) => {
      setLoadingSummary(true);
      setSummaryError(null);
      try {
        const response = await api.getHomeworkAssignmentsSummaryV2({ studentId: studentId ?? undefined });
        setTeacherSummary(response);
      } catch (error) {
        console.error('Failed to load homework summary', error);
        setSummaryError('Не удалось загрузить сводку');
      } finally {
        setLoadingSummary(false);
      }
    },
    [selectedStudentId],
  );

  const fetchTeacherAssignments = useCallback(
    async (options: {
      offset: number;
      append: boolean;
      tab?: TeacherHomeworkListFilter;
      studentId?: number | null;
      search?: string;
      sort?: TeacherHomeworkSort;
      problemFilters?: TeacherHomeworkProblemFilter[];
    }) => {
      if (options.append) {
        setLoadingMoreAssignments(true);
      } else {
        setLoadingAssignments(true);
      }
      setAssignmentsError(null);

      const targetTab = options.tab ?? activeTab;
      const targetStudentId = options.studentId ?? selectedStudentId;
      const targetSearch = options.search ?? debouncedSearchQuery;
      const targetSort = options.sort ?? sortBy;
      const targetProblemFilters = options.problemFilters ?? problemFilters;
      const queryConfig = resolveTeacherListQuery(targetTab);

      try {
        const response = await api.listHomeworkAssignmentsV2({
          tab: queryConfig.tab,
          bucket: queryConfig.bucket,
          studentId: targetStudentId ?? undefined,
          q: targetSearch || undefined,
          sort: targetSort,
          problemFilters: targetProblemFilters,
          limit: TEACHER_PAGE_SIZE,
          offset: options.offset,
        });

        setAssignments((prev) => (options.append ? [...prev, ...response.items] : response.items));
        setAssignmentsNextOffset(response.nextOffset);
        setHasMoreAssignments(response.nextOffset !== null);

        return response.items;
      } catch (error) {
        console.error('Failed to load homework assignments', error);
        setAssignmentsError('Не удалось загрузить выданные домашки');
        if (!options.append) {
          setAssignments([]);
          setAssignmentsNextOffset(null);
          setHasMoreAssignments(false);
        }
        return [] as HomeworkAssignment[];
      } finally {
        if (options.append) {
          setLoadingMoreAssignments(false);
        } else {
          setLoadingAssignments(false);
        }
      }
    },
    [activeTab, debouncedSearchQuery, problemFilters, selectedStudentId, sortBy],
  );

  const loadTeacherAssignmentsByGroup = useCallback(
    async (groupKey: TeacherHomeworkGroupKey, options?: { append?: boolean }) => {
      const append = Boolean(options?.append);
      const nextOffset = groupAssignmentsNextOffsetByKey[groupKey] ?? null;
      if (append && nextOffset === null) return;

      const isUngrouped = groupKey === 'ungrouped';
      const groupId = isUngrouped ? null : Number(groupKey.replace('group_', ''));
      if (!isUngrouped && (!Number.isFinite(groupId) || groupId <= 0)) return;

      setGroupAssignmentsLoadingByKey((prev) => ({ ...prev, [groupKey]: true }));
      setGroupAssignmentsErrorByKey((prev) => ({ ...prev, [groupKey]: null }));
      try {
        const response = await api.listHomeworkAssignmentsV2({
          tab: 'all',
          sort: 'urgency',
          limit: TEACHER_PAGE_SIZE,
          offset: append ? (nextOffset ?? 0) : 0,
          groupId: isUngrouped ? undefined : groupId,
          ungrouped: isUngrouped || undefined,
        });
        setGroupAssignmentsByKey((prev) => ({
          ...prev,
          [groupKey]: append ? [...(prev[groupKey] ?? []), ...response.items] : response.items,
        }));
        setGroupAssignmentsNextOffsetByKey((prev) => ({ ...prev, [groupKey]: response.nextOffset }));
      } catch (error) {
        console.error('Failed to load homework assignments for group', error);
        setGroupAssignmentsErrorByKey((prev) => ({ ...prev, [groupKey]: 'Не удалось загрузить задания группы' }));
        if (!append) {
          setGroupAssignmentsByKey((prev) => ({ ...prev, [groupKey]: [] }));
          setGroupAssignmentsNextOffsetByKey((prev) => ({ ...prev, [groupKey]: null }));
        }
      } finally {
        setGroupAssignmentsLoadingByKey((prev) => ({ ...prev, [groupKey]: false }));
      }
    },
    [groupAssignmentsNextOffsetByKey],
  );

  const loadTeacherActivityUnread = useCallback(async () => {
    try {
      const unread = await api.getActivityFeedUnreadStatus();
      setHomeworkActivityHasUnread(unread.hasUnread);
    } catch (error) {
      console.error('Failed to load homework unread status', error);
      setHomeworkActivityHasUnread(false);
    }
  }, []);

  const loadTeacherActivityFeed = useCallback(async () => {
    setHomeworkActivityLoading(true);
    try {
      const response = await api.listActivityFeed({
        categories: ['HOMEWORK'],
        limit: 20,
      });
      setHomeworkActivityItems(response.items);
    } catch (error) {
      console.error('Failed to load homework activity feed', error);
      setHomeworkActivityItems([]);
    } finally {
      setHomeworkActivityLoading(false);
    }
  }, []);

  const markTeacherActivitySeen = useCallback(async (seenThrough?: string) => {
    try {
      const status = await api.markActivityFeedSeen(seenThrough ? { seenThrough } : undefined);
      setHomeworkActivityHasUnread(status.hasUnread);
    } catch (error) {
      console.error('Failed to mark homework activity feed as seen', error);
    }
  }, []);

  const loadStudentList = useCallback(
    async (options?: { append?: boolean }) => {
      const append = options?.append ?? false;
      const targetOffset = append ? (studentNextOffset ?? 0) : 0;

      if (append) {
        setLoadingStudentListMore(true);
      } else {
        setLoadingStudentList(true);
      }

      try {
        if (!append) {
          const summaryData = await api.getStudentHomeworkSummaryV2();
          setStudentSummary(summaryData);
        }
        const assignmentsData = await api.listStudentHomeworkAssignmentsV2({
          filter: mapStudentHomeworkFilterToApiFilter(studentFilter),
          limit: STUDENT_PAGE_SIZE,
          offset: targetOffset,
        });
        setAssignments((prev) => (append ? [...prev, ...assignmentsData.items] : assignmentsData.items));
        setStudentNextOffset(assignmentsData.nextOffset);
        setStudentHasMore(assignmentsData.nextOffset !== null);
      } catch (error) {
        console.error('Failed to load student homework list', error);
        if (!append) {
          setStudentSummary(emptySummary);
          setAssignments([]);
        }
        setStudentNextOffset(null);
        setStudentHasMore(false);
      } finally {
        if (append) {
          setLoadingStudentListMore(false);
        } else {
          setLoadingStudentList(false);
        }
      }
    },
    [studentFilter, studentNextOffset],
  );

  const loadStudentDetail = useCallback(async () => {
    if (!hasStudentAssignmentId) return;
    setStudentDetailLoading(true);
    setStudentDetailError(null);
    try {
      const response = await api.getStudentHomeworkAssignmentDetailV2(assignmentId);
      setStudentDetailAssignment(response.assignment);
      setStudentDetailSubmissions(response.submissions);
    } catch (error) {
      console.error('Failed to load student homework detail', error);
      setStudentDetailAssignment(null);
      setStudentDetailSubmissions([]);
      setStudentDetailError('Не удалось загрузить домашку');
    } finally {
      setStudentDetailLoading(false);
    }
  }, [assignmentId, hasStudentAssignmentId]);

  const loadTeacherReviewData = useCallback(async (targetAssignmentId: number) => {
    setReviewLoading(true);
    setReviewError(null);
    try {
      const response = await api.startHomeworkReviewSessionV2(targetAssignmentId);
      const latestSubmission = getLatestSubmission(response.submissions);
      const initialDraft = latestSubmission
        ? (latestSubmission.reviewDraft ?? readReviewDraftFromStorage(targetAssignmentId, latestSubmission.id))
        : null;

      setReviewAssignment(response.assignment);
      setReviewSubmissions(response.submissions);
      setReviewInitialDraft(initialDraft);
      setReviewCurrentDraft(initialDraft);
      setReviewHasUnsavedDraft(false);
    } catch (error) {
      console.error('Failed to load review data', error);
      setReviewAssignment(null);
      setReviewSubmissions([]);
      setReviewInitialDraft(null);
      setReviewCurrentDraft(null);
      setReviewHasUnsavedDraft(false);
      setReviewError('Не удалось загрузить данные для проверки');
    } finally {
      setReviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode !== 'teacher') {
      setTeacherInitialized(false);
      teacherInitStartedRef.current = false;
      return;
    }
    if (isTeacherTemplateEditorRoute) return;
    if (teacherInitialized || teacherInitStartedRef.current) return;

    let isMounted = true;
    teacherInitStartedRef.current = true;
    void Promise.allSettled([
      loadTeacherStudents(),
      loadTeacherTemplates(),
      loadTeacherGroups(),
      loadTeacherSummary(),
      fetchTeacherAssignments({ offset: 0, append: false }),
      loadTeacherActivityUnread(),
    ]).then(() => {
      if (!isMounted) return;
      setTeacherInitialized(true);
    });

    return () => {
      isMounted = false;
    };
  }, [
    fetchTeacherAssignments,
    isTeacherTemplateEditorRoute,
    loadTeacherActivityUnread,
    loadTeacherGroups,
    loadTeacherStudents,
    loadTeacherSummary,
    loadTeacherTemplates,
    mode,
    teacherInitialized,
  ]);

  useEffect(() => {
    if (mode !== 'teacher') return;
    if (!isTeacherTemplateEditorRoute) return;
    if (students.length > 0 || loadingStudents) return;
    void loadTeacherStudents();
  }, [isTeacherTemplateEditorRoute, loadTeacherStudents, loadingStudents, mode, students.length]);

  useEffect(() => {
    if (mode !== 'teacher' || !teacherInitialized || isTeacherTemplateEditorRoute) return;
    void fetchTeacherAssignments({ offset: 0, append: false });
  }, [
    activeTab,
    debouncedSearchQuery,
    fetchTeacherAssignments,
    isTeacherTemplateEditorRoute,
    mode,
    problemFilters,
    selectedStudentId,
    sortBy,
    teacherInitialized,
  ]);

  useEffect(() => {
    if (mode !== 'teacher' || !teacherInitialized || isTeacherTemplateEditorRoute) return;
    void loadTeacherSummary();
  }, [isTeacherTemplateEditorRoute, loadTeacherSummary, mode, selectedStudentId, teacherInitialized]);

  useEffect(() => {
    if (mode !== 'teacher' || !hasTeacherReviewAssignmentId) return;
    void loadTeacherReviewData(assignmentId);
  }, [assignmentId, hasTeacherReviewAssignmentId, loadTeacherReviewData, mode]);

  useEffect(() => {
    if (mode !== 'teacher' || hasTeacherReviewAssignmentId) return;
    setReviewAssignment(null);
    setReviewSubmissions([]);
    setReviewInitialDraft(null);
    setReviewCurrentDraft(null);
    setReviewHasUnsavedDraft(false);
    setReviewLoading(false);
    setReviewError(null);
    clearEntry(REVIEW_UNSAVED_ENTRY_KEY);
  }, [clearEntry, hasTeacherReviewAssignmentId, mode]);

  useEffect(() => {
    if (mode === 'teacher') return;
    if (hasStudentAssignmentId) {
      void loadStudentDetail();
      return;
    }
    void loadStudentList({ append: false });
  }, [hasStudentAssignmentId, loadStudentDetail, loadStudentList, mode, studentFilter]);

  const saveReviewDraft = useCallback(async () => {
    if (!reviewAssignment || !reviewCurrentDraft) return true;
    try {
      const response = await api.saveHomeworkReviewDraftV2(reviewAssignment.id, {
        submissionId: reviewCurrentDraft.submissionId,
        draft: reviewCurrentDraft,
      });
      setReviewAssignment(response.assignment);
      if (response.submission) {
        setReviewSubmissions((prev) => {
          const withoutUpdated = prev.filter((item) => item.id !== response.submission?.id);
          return [response.submission!, ...withoutUpdated].sort((left, right) => {
            if (right.attemptNo !== left.attemptNo) return right.attemptNo - left.attemptNo;
            return right.id - left.id;
          });
        });
      }
      saveReviewDraftToStorage(reviewAssignment.id, reviewCurrentDraft);
      setReviewInitialDraft(reviewCurrentDraft);
      setReviewHasUnsavedDraft(false);
      return true;
    } catch (error) {
      console.error('Failed to persist homework review draft', error);
      try {
        saveReviewDraftToStorage(reviewAssignment.id, reviewCurrentDraft);
        setReviewInitialDraft(reviewCurrentDraft);
        setReviewHasUnsavedDraft(false);
        showToast({
          message: 'Черновик сохранён локально. Сервер недоступен, попробуйте позже.',
          variant: 'error',
        });
        return true;
      } catch {
        showToast({ message: 'Не удалось сохранить проверку', variant: 'error' });
        return false;
      }
    }
  }, [reviewAssignment, reviewCurrentDraft, showToast]);

  useEffect(() => {
    if (mode !== 'teacher' || !hasTeacherReviewAssignmentId) {
      clearEntry(REVIEW_UNSAVED_ENTRY_KEY);
      return;
    }

    setEntry(REVIEW_UNSAVED_ENTRY_KEY, {
      isDirty: true,
      title: 'Сохранить черновик проверки?',
      message:
        'Ученик пока не увидит оценку и комментарии. Чтобы опубликовать проверку, вернитесь и нажмите «Опубликовать оценку».',
      confirmText: 'Сохранить черновик и выйти',
      cancelText: 'Остаться на проверке',
      cancelKeepsEditing: true,
      onSave: saveReviewDraft,
      onSaveErrorMessage: 'Не удалось сохранить черновик проверки',
    });

    return () => {
      clearEntry(REVIEW_UNSAVED_ENTRY_KEY);
    };
  }, [clearEntry, hasTeacherReviewAssignmentId, mode, saveReviewDraft, setEntry]);

  const buildTemplateUpsertPayload = useCallback((draftValue: HomeworkEditorDraft): TeacherTemplateUpsertPayload => {
    const templateDraft = projectHomeworkEditorToTemplateDraft(draftValue);
    return {
      title: templateDraft.title,
      tags: templateDraft.tagsText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      subject: templateDraft.subject.trim() || null,
      level: templateDraft.level.trim() || null,
      blocks: templateDraft.blocks,
    };
  }, []);

  const resolveTemplateSubmitFailure = useCallback(
    (error: unknown): HomeworkTemplateCreateSubmitResult => {
      if (isApiRequestError(error) && error.status === 400 && Array.isArray(error.issues) && error.issues.length > 0) {
        return {
          success: false,
          issues: error.issues,
        };
      }

      const fallbackMessage =
        isApiRequestError(error) && error.message ? error.message : 'Не удалось сохранить домашнее задание';
      showToast({ message: fallbackMessage, variant: 'error' });
      return { success: false };
    },
    [showToast],
  );

  const createTemplateCopy = useCallback(async (template: HomeworkTemplate) => {
    const existingTemplatesResponse = await api.listHomeworkTemplatesV2({ includeArchived: true });
    const nextCopyTitle = buildHomeworkCopyTitle(
      template.title,
      existingTemplatesResponse.items.map((item) => item.title),
    );
    const response = await api.createHomeworkTemplateV2({
      title: nextCopyTitle,
      tags: template.tags,
      subject: template.subject ?? null,
      level: template.level ?? null,
      blocks: template.blocks,
    });
    setTemplates((current) => mergeHomeworkTemplate(current, response.template));
    return response.template;
  }, []);

  const handleRequestTemplateEdit = useCallback(
    (template: HomeworkTemplate) => {
      if (canTeacherEditHomeworkTemplate(template)) {
        requestNavigationBypass();
        navigate(`/homeworks/${template.id}/edit`);
        return;
      }

      setPendingTemplateEditCopy({
        template,
        cancelPath: null,
      });
    },
    [navigate, requestNavigationBypass],
  );

  const handleConfirmTemplateEditCopy = useCallback(async () => {
    if (!pendingTemplateEditCopy) return;

    const { template, cancelPath } = pendingTemplateEditCopy;
    setSubmittingTemplate(true);
    try {
      const copiedTemplate = await createTemplateCopy(template);
      setPendingTemplateEditCopy(null);
      void loadTeacherTemplates();
      showToast({
        message: 'Создали копию домашнего задания. Исходная версия осталась без изменений.',
        variant: 'success',
      });
      requestNavigationBypass();
      navigate(`/homeworks/${copiedTemplate.id}/edit`, { replace: cancelPath !== null });
    } catch (error) {
      console.error('Failed to create editable copy of homework template', error);
      showToast({ message: 'Не удалось создать копию домашнего задания', variant: 'error' });
    } finally {
      setSubmittingTemplate(false);
    }
  }, [createTemplateCopy, loadTeacherTemplates, navigate, pendingTemplateEditCopy, requestNavigationBypass, showToast]);

  const handleCancelTemplateEditCopy = useCallback(async () => {
    const cancelPath = pendingTemplateEditCopy?.cancelPath ?? null;
    setPendingTemplateEditCopy(null);

    if (cancelPath) {
      requestNavigationBypass();
      navigate(cancelPath, { replace: true });
    }
  }, [navigate, pendingTemplateEditCopy, requestNavigationBypass]);

  const handleCreateTemplateFromScreen = useCallback(async (): Promise<HomeworkTemplateCreateSubmitResult> => {
    const payload = buildTemplateUpsertPayload(templateEditorDraft);
    setSubmittingTemplate(true);
    try {
      await api.createHomeworkTemplateV2({
        title: payload.title.trim(),
        tags: payload.tags,
        subject: payload.subject ?? null,
        level: payload.level ?? null,
        blocks: payload.blocks,
      });
      showToast({ message: 'Домашнее задание создано', variant: 'success' });
      await loadTeacherTemplates();
      return { success: true };
    } catch (error) {
      console.error('Failed to create homework template', error);
      return resolveTemplateSubmitFailure(error);
    } finally {
      setSubmittingTemplate(false);
    }
  }, [buildTemplateUpsertPayload, loadTeacherTemplates, resolveTemplateSubmitFailure, showToast, templateEditorDraft]);

  const handleUpdateTemplateFromScreen = useCallback(async (): Promise<HomeworkTemplateCreateSubmitResult> => {
    if (!isTeacherTemplateEditRoute || editingTemplateId === null) {
      showToast({ message: 'Домашнее задание не найдено', variant: 'error' });
      return { success: false };
    }

    const payload = buildTemplateUpsertPayload(templateEditorDraft);
    setSubmittingTemplate(true);
    try {
      await api.updateHomeworkTemplateV2(editingTemplateId, {
        title: payload.title.trim(),
        tags: payload.tags,
        subject: payload.subject ?? null,
        level: payload.level ?? null,
        blocks: payload.blocks,
      });
      if (templateEditorDraftStorageKey) {
        clearStoredHomeworkEditorDraft(templateEditorDraftStorageKey);
      }
      showToast({ message: 'Домашнее задание обновлено', variant: 'success' });
      await loadTeacherTemplates();
      return { success: true };
    } catch (error) {
      console.error('Failed to update homework template', error);
      return resolveTemplateSubmitFailure(error);
    } finally {
      setSubmittingTemplate(false);
    }
  }, [
    buildTemplateUpsertPayload,
    editingTemplateId,
    isTeacherTemplateEditRoute,
    loadTeacherTemplates,
    resolveTemplateSubmitFailure,
    showToast,
    templateEditorDraftStorageKey,
    templateEditorDraft,
  ]);

  const handleUpdateTemplateAndIssueFromScreen = useCallback(async (): Promise<HomeworkTemplateCreateSubmitResult> => {
    if (!isTeacherTemplateEditRoute || editingTemplateId === null) {
      showToast({ message: 'Домашнее задание не найдено', variant: 'error' });
      return { success: false };
    }

    if (!templateEditorDraft.assignment.studentId) {
      showToast({ message: 'Выберите ученика', variant: 'error' });
      return { success: false };
    }

    const payload = buildTemplateUpsertPayload(templateEditorDraft);
    setSubmittingTemplate(true);
    try {
      await api.updateHomeworkTemplateV2(editingTemplateId, {
        title: payload.title.trim(),
        tags: payload.tags,
        subject: payload.subject ?? null,
        level: payload.level ?? null,
        blocks: payload.blocks,
      });

      const assignmentResponse = await api.createHomeworkAssignmentV2({
        studentId: templateEditorDraft.assignment.studentId,
        lessonId: templateEditorDraft.assignment.lessonId ?? undefined,
        templateId: editingTemplateId,
        groupId: templateEditorDraft.assignment.groupId ?? undefined,
        title: templateEditorDraft.title.trim() || undefined,
        sendMode: templateEditorDraft.assignment.sendMode,
        scheduledFor: templateEditorDraft.assignment.scheduledFor,
        deadlineAt: templateEditorDraft.assignment.deadlineAt,
        contentSnapshot: templateEditorDraft.blocks,
      });

      let finalAssignment = assignmentResponse.assignment;
      const shouldSendNow =
        templateEditorDraft.assignment.sendMode === 'MANUAL' &&
        (finalAssignment.status === 'DRAFT' || finalAssignment.status === 'SCHEDULED');
      if (shouldSendNow) {
        const sendResponse = await api.sendHomeworkAssignmentV2(finalAssignment.id);
        finalAssignment = sendResponse.assignment;
      }

      if (templateEditorDraftStorageKey) {
        clearStoredHomeworkEditorDraft(templateEditorDraftStorageKey);
      }

      void Promise.allSettled([
        loadTeacherTemplates(),
        fetchTeacherAssignments({ offset: 0, append: false }),
        loadTeacherSummary(),
        loadTeacherGroups(),
      ]);

      showToast({
        message:
          templateEditorDraft.assignment.sendMode === 'MANUAL'
            ? 'Домашка выдана ученику'
            : templateEditorDraft.assignment.sendMode === 'AUTO_AFTER_LESSON_DONE'
              ? 'Домашка сохранена и будет выдана после урока'
              : 'Домашка сохранена и будет выдана по расписанию',
        variant: 'success',
      });

      requestNavigationBypass();
      navigate(`/homeworks/assignments/${finalAssignment.id}/edit`, { replace: true });
      return { success: true, closeOnSuccess: false };
    } catch (error) {
      console.error('Failed to update homework template and issue assignment', error);
      return resolveTemplateSubmitFailure(error);
    } finally {
      setSubmittingTemplate(false);
    }
  }, [
    buildTemplateUpsertPayload,
    editingTemplateId,
    fetchTeacherAssignments,
    isTeacherTemplateEditRoute,
    loadTeacherGroups,
    loadTeacherSummary,
    loadTeacherTemplates,
    navigate,
    requestNavigationBypass,
    resolveTemplateSubmitFailure,
    showToast,
    templateEditorDraft,
    templateEditorDraftStorageKey,
  ]);

  const handleDuplicateTemplate = useCallback(
    async (template: HomeworkTemplate) => {
      setSubmittingTemplate(true);
      try {
        await createTemplateCopy(template);
        void loadTeacherTemplates();
        showToast({ message: 'Домашнее задание продублировано', variant: 'success' });
      } catch (error) {
        console.error('Failed to duplicate homework template', error);
        showToast({ message: 'Не удалось продублировать домашнее задание', variant: 'error' });
      } finally {
        setSubmittingTemplate(false);
      }
    },
    [createTemplateCopy, loadTeacherTemplates, showToast],
  );

  const handleArchiveTemplate = useCallback(
    async (template: HomeworkTemplate) => {
      setSubmittingTemplate(true);
      try {
        await api.updateHomeworkTemplateV2(template.id, { isArchived: true });
        showToast({ message: 'Домашнее задание перенесено в архив', variant: 'success' });
        await loadTeacherTemplates();
      } catch (error) {
        console.error('Failed to archive homework template', error);
        showToast({ message: 'Не удалось архивировать домашнее задание', variant: 'error' });
      } finally {
        setSubmittingTemplate(false);
      }
    },
    [loadTeacherTemplates, showToast],
  );

  const handleRestoreTemplate = useCallback(
    async (template: HomeworkTemplate) => {
      setSubmittingTemplate(true);
      try {
        await api.updateHomeworkTemplateV2(template.id, { isArchived: false });
        showToast({ message: 'Домашнее задание восстановлено из архива', variant: 'success' });
        await loadTeacherTemplates();
      } catch (error) {
        console.error('Failed to restore homework template', error);
        showToast({ message: 'Не удалось восстановить домашнее задание', variant: 'error' });
      } finally {
        setSubmittingTemplate(false);
      }
    },
    [loadTeacherTemplates, showToast],
  );

  const handleDeleteTemplate = useCallback(
    async (template: HomeworkTemplate) => {
      if (!canTeacherDeleteHomeworkTemplate(template)) {
        showToast({
          message: 'Удалить домашку можно только пока её никто не получил или когда все выданные версии уже проверены.',
          variant: 'error',
        });
        return;
      }

      setDeleteTemplateTarget(template);
    },
    [showToast],
  );

  const handleConfirmDeleteTemplate = useCallback(async () => {
    if (!deleteTemplateTarget) return;

    try {
      await api.deleteHomeworkTemplateV2(deleteTemplateTarget.id);
      showToast({ message: 'Домашнее задание удалено', variant: 'success' });
      setDeleteTemplateTarget(null);
      await loadTeacherTemplates();

      const isDeletingViewedTemplate =
        (hasTeacherHomeworkSourceDetailId && homeworkDetailTemplate?.id === deleteTemplateTarget.id) ||
        (isTeacherTemplateEditRoute && editingTemplateId === deleteTemplateTarget.id);

      if (isDeletingViewedTemplate) {
        navigate('/homeworks', { replace: true });
      }
    } catch (error) {
      console.error('Failed to delete homework template', error);
      showToast({
        message: isApiRequestError(error) && error.message ? error.message : 'Не удалось удалить домашнее задание',
        variant: 'error',
      });
    }
  }, [
    deleteTemplateTarget,
    editingTemplateId,
    hasTeacherHomeworkSourceDetailId,
    homeworkDetailTemplate?.id,
    isTeacherTemplateEditRoute,
    loadTeacherTemplates,
    navigate,
    showToast,
  ]);

  const handleToggleTemplateFavorite = useCallback(
    async (template: HomeworkTemplate) => {
      setSubmittingTemplate(true);
      try {
        const nextTags = toggleHomeworkTemplateFavoriteTags(template.tags, !isHomeworkTemplateFavorite(template));
        await api.updateHomeworkTemplateV2(template.id, { tags: nextTags });
        await loadTeacherTemplates();
      } catch (error) {
        console.error('Failed to toggle template favorite', error);
        showToast({ message: 'Не удалось обновить избранное', variant: 'error' });
      } finally {
        setSubmittingTemplate(false);
      }
    },
    [loadTeacherTemplates, showToast],
  );

  const handleCreateGroup = useCallback(
    async (payload: {
      title: string;
      description?: string | null;
      iconKey?: string;
      bgColor?: string;
      sortOrder?: number;
    }) => {
      try {
        const response = await api.createHomeworkGroupV2(payload);
        await loadTeacherGroups();
        resetGroupAssignmentsState();
        showToast({ message: 'Группа создана', variant: 'success' });
        return response.group;
      } catch (error) {
        console.error('Failed to create homework group', error);
        showToast({ message: 'Не удалось создать группу', variant: 'error' });
        return null;
      }
    },
    [loadTeacherGroups, resetGroupAssignmentsState, showToast],
  );

  const handleUpdateGroup = useCallback(
    async (
      groupId: number,
      payload: Partial<{
        title: string;
        description: string | null;
        iconKey: string;
        bgColor: string;
        sortOrder: number;
        isArchived: boolean;
      }>,
    ) => {
      try {
        await api.updateHomeworkGroupV2(groupId, payload);
        await loadTeacherGroups();
        resetGroupAssignmentsState();
        showToast({ message: 'Группа обновлена', variant: 'success' });
      } catch (error) {
        console.error('Failed to update homework group', error);
        showToast({ message: 'Не удалось обновить группу', variant: 'error' });
      }
    },
    [loadTeacherGroups, resetGroupAssignmentsState, showToast],
  );

  const handleDeleteGroup = useCallback(
    async (groupId: number) => {
      try {
        await api.deleteHomeworkGroupV2(groupId);
        await Promise.all([
          loadTeacherGroups(),
          fetchTeacherAssignments({ offset: 0, append: false }),
          loadTeacherSummary(),
        ]);
        resetGroupAssignmentsState();
        showToast({ message: 'Группа удалена', variant: 'success' });
      } catch (error) {
        console.error('Failed to delete homework group', error);
        showToast({ message: 'Не удалось удалить группу', variant: 'error' });
      }
    },
    [fetchTeacherAssignments, loadTeacherGroups, loadTeacherSummary, resetGroupAssignmentsState, showToast],
  );

  const handleRebindAssignmentGroup = useCallback(
    async (assignmentId: number, groupId: number | null) => {
      const assignment = assignmentsById.get(assignmentId);
      if (assignment && !canTeacherEditHomeworkAssignment(assignment)) {
        showToast({
          message: 'После выдачи домашку нельзя переносить между группами. Сначала отмените выдачу.',
          variant: 'error',
        });
        return;
      }

      try {
        await api.updateHomeworkAssignmentV2(assignmentId, { groupId });
        await Promise.all([
          loadTeacherGroups(),
          fetchTeacherAssignments({ offset: 0, append: false }),
          loadTeacherSummary(),
        ]);
        resetGroupAssignmentsState();
        showToast({ message: 'Группа для домашки обновлена', variant: 'success' });
      } catch (error) {
        console.error('Failed to rebind homework assignment group', error);
        showToast({ message: 'Не удалось обновить группу домашки', variant: 'error' });
      }
    },
    [
      assignmentsById,
      fetchTeacherAssignments,
      loadTeacherGroups,
      loadTeacherSummary,
      resetGroupAssignmentsState,
      showToast,
    ],
  );

  const handleRebindAssignmentsGroup = useCallback(
    async (assignmentIds: number[], groupId: number | null) => {
      const ids = Array.from(
        new Set(assignmentIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)),
      );
      if (!ids.length) return;
      const hasLockedAssignments = ids.some((id) => {
        const assignment = assignmentsById.get(id);
        return assignment ? !canTeacherEditHomeworkAssignment(assignment) : false;
      });
      if (hasLockedAssignments) {
        showToast({
          message: 'После выдачи домашки нельзя массово переносить между группами. Сначала отмените выдачу.',
          variant: 'error',
        });
        return;
      }

      try {
        await Promise.all(ids.map((assignmentId) => api.updateHomeworkAssignmentV2(assignmentId, { groupId })));
        await Promise.all([
          loadTeacherGroups(),
          fetchTeacherAssignments({ offset: 0, append: false }),
          loadTeacherSummary(),
        ]);
        resetGroupAssignmentsState();
        showToast({
          message:
            ids.length === 1 ? 'Группа для домашки обновлена' : `Группа обновлена для ${ids.length} домашних заданий`,
          variant: 'success',
        });
      } catch (error) {
        console.error('Failed to rebind homework assignment group in bulk', error);
        showToast({ message: 'Не удалось обновить группу домашних заданий', variant: 'error' });
      }
    },
    [
      assignmentsById,
      fetchTeacherAssignments,
      loadTeacherGroups,
      loadTeacherSummary,
      resetGroupAssignmentsState,
      showToast,
    ],
  );

  const handleCreateAssignment = useCallback(
    async (payload: TeacherAssignmentEditorPrefill) => {
      if (!payload.studentId || !payload.templateId) {
        showToast({ message: 'Выберите ученика и домашнее задание', variant: 'error' });
        return false;
      }

      setSubmittingAssignment(true);
      try {
        let assignmentResponse = await api.createHomeworkAssignmentV2({
          studentId: payload.studentId,
          lessonId: payload.lessonId ?? undefined,
          templateId: payload.templateId,
          groupId: payload.groupId ?? undefined,
          sendMode: payload.sendMode,
          scheduledFor: payload.scheduledFor ?? null,
          deadlineAt: payload.deadlineAt,
        });

        if (
          payload.sendMode === 'MANUAL' &&
          (assignmentResponse.assignment.status === 'DRAFT' || assignmentResponse.assignment.status === 'SCHEDULED')
        ) {
          assignmentResponse = await api.sendHomeworkAssignmentV2(assignmentResponse.assignment.id);
        }

        void Promise.allSettled([
          fetchTeacherAssignments({ offset: 0, append: false }),
          loadTeacherSummary(),
          loadTeacherGroups(),
          loadTeacherTemplates(),
        ]);

        showToast({
          message:
            payload.sendMode === 'MANUAL'
              ? 'Домашнее задание выдано'
              : payload.sendMode === 'AUTO_AFTER_LESSON_DONE'
                ? 'Выдача домашнего задания запланирована после урока'
                : 'Выдача домашнего задания запланирована на дату',
          variant: 'success',
        });
        return true;
      } catch (error) {
        console.error('Failed to create homework assignment from side sheet', error);
        showToast({ message: 'Не удалось выдать домашнее задание', variant: 'error' });
        return false;
      } finally {
        setSubmittingAssignment(false);
      }
    },
    [fetchTeacherAssignments, loadTeacherGroups, loadTeacherSummary, loadTeacherTemplates, showToast],
  );

  const buildAssignmentDraftFromTemplate = useCallback(
    (template: HomeworkTemplate, assignmentContext: HomeworkEditorDraft['assignment']) =>
      createHomeworkEditorDraftFromTemplate(template, {
        studentId: assignmentContext.studentId ?? null,
        lessonId: assignmentContext.lessonId ?? null,
        groupId: assignmentContext.groupId ?? null,
        scheduledFor: assignmentContext.scheduledFor ?? null,
        deadlineAt: assignmentContext.deadlineAt ?? null,
        sendMode: assignmentContext.sendMode,
      }),
    [],
  );

  const applyAssignmentTemplate = useCallback(
    (template: HomeworkTemplate) => {
      setAssignmentEditorDraft((currentDraft) => buildAssignmentDraftFromTemplate(template, currentDraft.assignment));
    },
    [buildAssignmentDraftFromTemplate],
  );

  const handleAssignmentTemplateSelect = useCallback(
    (templateId: number | null) => {
      if (templateId === null) {
        setPendingAssignmentTemplate(null);
        setAssignmentEditorDraft((currentDraft) => ({
          ...currentDraft,
          assignment: {
            ...currentDraft.assignment,
            sourceTemplateId: null,
          },
        }));
        return;
      }

      if (assignmentEditorDraft.assignment.sourceTemplateId === templateId) {
        return;
      }

      const nextTemplate = templates.find((template) => template.id === templateId) ?? null;
      if (!nextTemplate) {
        showToast({ message: 'Домашнее задание не найдено', variant: 'error' });
        return;
      }

      if (hasHomeworkEditorContent(assignmentEditorDraft)) {
        setPendingAssignmentTemplate(nextTemplate);
        return;
      }

      applyAssignmentTemplate(nextTemplate);
    },
    [applyAssignmentTemplate, assignmentEditorDraft, showToast, templates],
  );

  const handleConfirmAssignmentTemplateReplace = useCallback(async () => {
    if (!pendingAssignmentTemplate) return;
    applyAssignmentTemplate(pendingAssignmentTemplate);
    setPendingAssignmentTemplate(null);
  }, [applyAssignmentTemplate, pendingAssignmentTemplate]);

  const handleCancelAssignmentTemplateReplace = useCallback(async () => {
    setPendingAssignmentTemplate(null);
  }, []);

  const handleSubmitAssignmentFromScreen = useCallback(
    async (action: 'save' | 'submit'): Promise<HomeworkTemplateCreateSubmitResult> => {
      if (assignmentEditorReadOnly) {
        showToast({
          message: 'Домашка уже выдана. Чтобы изменить её, сначала отмените выдачу.',
          variant: 'error',
        });
        return { success: false };
      }

      if (!assignmentEditorDraft.assignment.studentId) {
        showToast({ message: 'Выберите ученика', variant: 'error' });
        return { success: false };
      }

      setSubmittingAssignment(true);
      try {
        let assignmentResponse: { assignment: HomeworkAssignment };
        if (isTeacherAssignmentEditRoute && editingAssignmentId) {
          assignmentResponse = await api.updateHomeworkAssignmentV2(editingAssignmentId, {
            title: assignmentEditorDraft.title.trim(),
            lessonId: assignmentEditorDraft.assignment.lessonId,
            templateId: assignmentEditorDraft.assignment.sourceTemplateId,
            groupId: assignmentEditorDraft.assignment.groupId,
            sendMode: assignmentEditorDraft.assignment.sendMode,
            scheduledFor: assignmentEditorDraft.assignment.scheduledFor,
            deadlineAt: assignmentEditorDraft.assignment.deadlineAt,
            contentSnapshot: assignmentEditorDraft.blocks,
          });
        } else {
          assignmentResponse = await api.createHomeworkAssignmentV2({
            studentId: assignmentEditorDraft.assignment.studentId,
            lessonId: assignmentEditorDraft.assignment.lessonId ?? undefined,
            templateId: assignmentEditorDraft.assignment.sourceTemplateId ?? undefined,
            groupId: assignmentEditorDraft.assignment.groupId ?? undefined,
            title: assignmentEditorDraft.title.trim() || undefined,
            sendMode: assignmentEditorDraft.assignment.sendMode,
            scheduledFor: assignmentEditorDraft.assignment.scheduledFor,
            deadlineAt: assignmentEditorDraft.assignment.deadlineAt,
            contentSnapshot: assignmentEditorDraft.blocks,
          });
        }

        let finalAssignment = assignmentResponse.assignment;
        const shouldSendNow =
          action === 'submit' &&
          assignmentEditorDraft.assignment.sendMode === 'MANUAL' &&
          (finalAssignment.status === 'DRAFT' || finalAssignment.status === 'SCHEDULED');
        if (shouldSendNow) {
          const sendResponse = await api.sendHomeworkAssignmentV2(finalAssignment.id);
          finalAssignment = sendResponse.assignment;
        }

        setAssignmentEditorInitialDraft(assignmentEditorDraft);
        setAssignmentEditorOriginalStatus(finalAssignment.status);
        setAssignmentEditorServerAssignment(finalAssignment);

        void Promise.allSettled([
          fetchTeacherAssignments({ offset: 0, append: false }),
          loadTeacherSummary(),
          loadTeacherGroups(),
          loadTeacherTemplates(),
        ]);

        showToast({
          message:
            action === 'submit' && assignmentEditorDraft.assignment.sendMode === 'MANUAL'
              ? 'Домашка выдана ученику'
              : assignmentEditorDraft.assignment.sendMode === 'AUTO_AFTER_LESSON_DONE'
                ? 'Домашка сохранена и будет выдана после урока'
                : assignmentEditorDraft.assignment.sendMode === 'SCHEDULED'
                  ? 'Домашка сохранена и будет выдана по расписанию'
                  : 'Изменения сохранены',
          variant: 'success',
        });

        if (assignmentEditorDraftStorageKey) {
          clearStoredHomeworkEditorDraft(assignmentEditorDraftStorageKey);
        }
        clearEntry(ASSIGNMENT_EDITOR_UNSAVED_ENTRY_KEY);

        const targetAssignmentPath = canTeacherEditHomeworkAssignment(finalAssignment)
          ? `/homeworks/assignments/${finalAssignment.id}/edit`
          : `/homeworks/assignments/${finalAssignment.id}`;

        if (!isTeacherAssignmentEditRoute) {
          requestNavigationBypass();
          navigate(targetAssignmentPath, { replace: true });
        } else if (!canTeacherEditHomeworkAssignment(finalAssignment)) {
          requestNavigationBypass();
          navigate(targetAssignmentPath, { replace: true });
        }

        return { success: true, closeOnSuccess: false };
      } catch (error) {
        console.error('Failed to save homework assignment from editor', error);
        showToast({ message: 'Не удалось сохранить домашку', variant: 'error' });
        return { success: false };
      } finally {
        setSubmittingAssignment(false);
      }
    },
    [
      assignmentEditorDraft,
      editingAssignmentId,
      assignmentEditorDraftStorageKey,
      assignmentEditorReadOnly,
      fetchTeacherAssignments,
      isTeacherAssignmentEditRoute,
      loadTeacherGroups,
      loadTeacherSummary,
      loadTeacherTemplates,
      clearEntry,
      navigate,
      requestNavigationBypass,
      showToast,
    ],
  );

  const handleSaveAssignmentAsTemplate = useCallback(async (): Promise<HomeworkTemplateCreateSubmitResult> => {
    const payload = buildTemplateUpsertPayload(assignmentEditorDraft);
    setSavingAssignmentAsTemplate(true);
    try {
      const response = await api.createHomeworkTemplateV2({
        title: payload.title.trim(),
        tags: payload.tags,
        subject: payload.subject ?? null,
        level: payload.level ?? null,
        blocks: payload.blocks,
      });
      setTemplates((currentTemplates) => mergeHomeworkTemplate(currentTemplates, response.template));
      setAssignmentEditorDraft((currentDraft) => ({
        ...currentDraft,
        assignment: {
          ...currentDraft.assignment,
          sourceTemplateId: response.template.id,
        },
      }));
      if (assignmentEditorDraftStorageKey) {
        clearStoredHomeworkEditorDraft(assignmentEditorDraftStorageKey);
      }
      clearEntry(ASSIGNMENT_EDITOR_UNSAVED_ENTRY_KEY);
      showToast({ message: 'Домашнее задание сохранено в библиотеку', variant: 'success' });
      if (!isTeacherAssignmentEditRoute) {
        requestNavigationBypass();
        navigate(`/homeworks/${response.template.id}/edit`, { replace: true });
      }
      return { success: true, closeOnSuccess: false };
    } catch (error) {
      console.error('Failed to save assignment as template', error);
      return resolveTemplateSubmitFailure(error);
    } finally {
      setSavingAssignmentAsTemplate(false);
    }
  }, [
    assignmentEditorDraft,
    assignmentEditorDraftStorageKey,
    buildTemplateUpsertPayload,
    clearEntry,
    isTeacherAssignmentEditRoute,
    navigate,
    requestNavigationBypass,
    resolveTemplateSubmitFailure,
    showToast,
  ]);

  const handleSendAssignmentNow = useCallback(
    async (assignment: HomeworkAssignment) => {
      try {
        await api.sendHomeworkAssignmentV2(assignment.id);
        showToast({ message: 'Домашка отправлена ученику', variant: 'success' });
        await Promise.all([
          fetchTeacherAssignments({ offset: 0, append: false }),
          loadTeacherSummary(),
          loadTeacherTemplates(),
        ]);
      } catch (error) {
        console.error('Failed to send assignment now', error);
        showToast({ message: 'Не удалось отправить домашку', variant: 'error' });
      }
    },
    [fetchTeacherAssignments, loadTeacherSummary, loadTeacherTemplates, showToast],
  );

  const handleReissueAssignment = useCallback(
    async (assignment: HomeworkAssignment) => {
      try {
        await api.reissueHomeworkAssignmentV2(assignment.id);
        showToast({ message: 'Домашка переоткрыта для новой попытки', variant: 'success' });
        await Promise.all([fetchTeacherAssignments({ offset: 0, append: false }), loadTeacherSummary()]);
      } catch (error) {
        console.error('Failed to reissue assignment', error);
        showToast({ message: 'Не удалось переоткрыть домашку', variant: 'error' });
      }
    },
    [fetchTeacherAssignments, loadTeacherSummary, showToast],
  );

  const handleCancelAssignmentIssue = useCallback(async (assignment: HomeworkAssignment) => {
    setCancelIssueAssignment(assignment);
  }, []);

  const handleConfirmCancelAssignmentIssue = useCallback(async () => {
    if (!cancelIssueAssignment || cancelIssueSubmitting) return;
    setCancelIssueSubmitting(true);
    try {
      const response = await api.cancelHomeworkAssignmentIssueV2(cancelIssueAssignment.id);
      if (isTeacherAssignmentEditRoute && editingAssignmentId === cancelIssueAssignment.id) {
        setAssignmentEditorOriginalStatus(response.assignment.status);
        setAssignmentEditorServerAssignment(response.assignment);
      }
      setCancelIssueAssignment(null);
      showToast({ message: 'Выдача домашки отменена', variant: 'success' });
      await Promise.all([
        fetchTeacherAssignments({ offset: 0, append: false }),
        loadTeacherSummary(),
        loadTeacherGroups(),
        loadTeacherTemplates(),
      ]);
      resetGroupAssignmentsState();
    } catch (error) {
      console.error('Failed to cancel assignment issue', error);
      showToast({
        message:
          isApiRequestError(error) && typeof error.message === 'string' && error.message
            ? error.message
            : 'Не удалось отменить выдачу домашки',
        variant: 'error',
      });
    } finally {
      setCancelIssueSubmitting(false);
    }
  }, [
    cancelIssueAssignment,
    cancelIssueSubmitting,
    editingAssignmentId,
    fetchTeacherAssignments,
    isTeacherAssignmentEditRoute,
    loadTeacherGroups,
    loadTeacherSummary,
    loadTeacherTemplates,
    resetGroupAssignmentsState,
    showToast,
  ]);

  const handleRemindAssignment = useCallback(
    async (assignment: HomeworkAssignment) => {
      try {
        const response = await api.remindHomeworkAssignmentV2(assignment.id);
        if (response.status === 'sent') {
          showToast({ message: 'Напоминание отправлено', variant: 'success' });
        } else {
          showToast({ message: 'Напоминание не отправлено (нет канала)', variant: 'error' });
        }
        await Promise.all([fetchTeacherAssignments({ offset: 0, append: false }), loadTeacherActivityUnread()]);
      } catch (error) {
        console.error('Failed to remind assignment', error);
        showToast({ message: 'Не удалось отправить напоминание', variant: 'error' });
      }
    },
    [fetchTeacherAssignments, loadTeacherActivityUnread, showToast],
  );

  const handleOpenStudentProfile = useCallback(
    (studentId: number) => {
      setSelectedStudentId(studentId);
      navigate(`/students/${studentId}`);
    },
    [navigate],
  );

  const handleOpenAssignmentLessonDay = useCallback(
    (assignment: HomeworkAssignment) => {
      if (!assignment.lessonStartAt) return;
      const lessonDay = format(toZonedDate(assignment.lessonStartAt, timeZone), 'yyyy-MM-dd');
      navigate(`/schedule?date=${lessonDay}&view=day`);
    },
    [navigate, timeZone],
  );

  const handleUpdateAssignmentDeadline = useCallback(
    async (assignment: HomeworkAssignment, deadlineAt: string | null) => {
      if (!canTeacherEditHomeworkAssignment(assignment)) {
        showToast({
          message: 'После выдачи дедлайн нельзя менять. Сначала отмените выдачу.',
          variant: 'error',
        });
        return;
      }

      try {
        const response = await api.updateHomeworkAssignmentV2(assignment.id, { deadlineAt });
        if (isTeacherAssignmentEditRoute && editingAssignmentId === assignment.id) {
          setAssignmentEditorOriginalStatus(response.assignment.status);
          setAssignmentEditorServerAssignment(response.assignment);
        }
        showToast({ message: deadlineAt ? 'Дедлайн обновлён' : 'Дедлайн убран', variant: 'success' });
        await Promise.all([fetchTeacherAssignments({ offset: 0, append: false }), loadTeacherSummary()]);
      } catch (error) {
        console.error('Failed to update assignment deadline', error);
        showToast({ message: 'Не удалось обновить дедлайн', variant: 'error' });
      }
    },
    [editingAssignmentId, fetchTeacherAssignments, isTeacherAssignmentEditRoute, loadTeacherSummary, showToast],
  );

  const handleDeleteAssignment = useCallback(
    async (assignment: HomeworkAssignment) => {
      try {
        await api.deleteHomeworkAssignmentV2(assignment.id);
        showToast({ message: 'Домашка удалена', variant: 'success' });
        await Promise.all([
          fetchTeacherAssignments({ offset: 0, append: false }),
          loadTeacherSummary(),
          loadTeacherGroups(),
        ]);
        resetGroupAssignmentsState();
      } catch (error) {
        console.error('Failed to delete assignment', error);
        showToast({ message: 'Не удалось удалить домашку', variant: 'error' });
      }
    },
    [fetchTeacherAssignments, loadTeacherGroups, loadTeacherSummary, resetGroupAssignmentsState, showToast],
  );

  const handleFixConfigError = useCallback(
    async (assignment: HomeworkAssignment) => {
      if (!canTeacherEditHomeworkAssignment(assignment)) {
        showToast({
          message: 'Ошибка настройки у выданной домашки не исправляется напрямую. Сначала отмените выдачу.',
          variant: 'error',
        });
        return;
      }

      try {
        await api.updateHomeworkAssignmentV2(assignment.id, {
          sendMode: 'MANUAL',
        });
        showToast({ message: 'Ошибка настройки исправлена', variant: 'success' });
        await Promise.all([fetchTeacherAssignments({ offset: 0, append: false }), loadTeacherSummary()]);
      } catch (error) {
        console.error('Failed to fix assignment config', error);
        showToast({ message: 'Не удалось исправить конфигурацию', variant: 'error' });
      }
    },
    [fetchTeacherAssignments, loadTeacherSummary, showToast],
  );

  const handleBulkAction = useCallback(
    async ({ action, ids }: { action: TeacherBulkAction; ids: number[] }) => {
      if (!ids.length) return;
      try {
        const response = await api.bulkHomeworkAssignmentsV2({ action, ids });
        if (response.errorCount > 0) {
          showToast({
            message: `Готово частично: ${response.successCount}/${response.total}`,
            variant: 'error',
          });
        } else {
          showToast({
            message: `Массовое действие выполнено: ${response.successCount}`,
            variant: 'success',
          });
        }
        await Promise.all([
          fetchTeacherAssignments({ offset: 0, append: false }),
          loadTeacherSummary(),
          loadTeacherGroups(),
          loadTeacherActivityUnread(),
        ]);
        resetGroupAssignmentsState();
      } catch (error) {
        console.error('Failed to run bulk action', error);
        showToast({ message: 'Не удалось выполнить массовое действие', variant: 'error' });
      }
    },
    [
      fetchTeacherAssignments,
      loadTeacherActivityUnread,
      loadTeacherGroups,
      loadTeacherSummary,
      resetGroupAssignmentsState,
      showToast,
    ],
  );

  const handleOpenReview = useCallback(
    async (assignment: HomeworkAssignment, options?: { preserveQueue?: boolean }) => {
      if (!options?.preserveQueue) {
        setReviewQueueActive(false);
      }
      setReviewError(null);
      setReviewAssignment(null);
      setReviewSubmissions([]);
      setReviewInitialDraft(null);
      setReviewCurrentDraft(null);
      setReviewHasUnsavedDraft(false);
      clearEntry(REVIEW_UNSAVED_ENTRY_KEY);
      navigate(`/homeworks/review/${assignment.id}`);
    },
    [clearEntry, navigate],
  );

  const handleOpenDetail = useCallback(
    async (assignment: HomeworkAssignment) => {
      navigate(
        canTeacherEditHomeworkAssignment(assignment)
          ? `/homeworks/assignments/${assignment.id}/edit`
          : `/homeworks/assignments/${assignment.id}`,
      );
    },
    [navigate],
  );

  const handleSubmitReview = useCallback(
    async (payload: {
      action: 'REVIEWED' | 'RETURNED';
      submissionId: number;
      autoScore: number | null;
      manualScore: number | null;
      finalScore: number | null;
      teacherComment: string | null;
      reviewResult?: HomeworkSubmission['reviewResult'];
    }) => {
      if (!reviewAssignment) return false;
      setReviewSubmitting(true);
      setReviewError(null);
      try {
        await api.reviewHomeworkAssignmentV2(reviewAssignment.id, payload);
        clearReviewDraftInStorage(reviewAssignment.id, payload.submissionId);
        setReviewInitialDraft(null);
        setReviewCurrentDraft(null);
        setReviewHasUnsavedDraft(false);
        clearEntry(REVIEW_UNSAVED_ENTRY_KEY);
        showToast({
          message: payload.action === 'REVIEWED' ? 'Домашка проверена' : 'Домашка возвращена на доработку',
          variant: 'success',
        });
        if (reviewQueueActive) {
          setActiveTab('review');
          const nextQueueItems = await fetchTeacherAssignments({
            offset: 0,
            append: false,
            tab: 'review',
          });
          await Promise.all([loadTeacherSummary(), loadTeacherActivityUnread()]);
          const nextAssignment = nextQueueItems[0];
          if (nextAssignment) {
            await handleOpenReview(nextAssignment, { preserveQueue: true });
          } else {
            setReviewQueueActive(false);
            setReviewAssignment(null);
            setReviewSubmissions([]);
            setReviewError(null);
            navigate('/homeworks');
            showToast({ message: 'Очередь на проверку завершена', variant: 'success' });
          }
        } else {
          setReviewAssignment(null);
          setReviewSubmissions([]);
          setReviewError(null);
          await Promise.all([
            fetchTeacherAssignments({ offset: 0, append: false }),
            loadTeacherSummary(),
            loadTeacherActivityUnread(),
          ]);
          navigate('/homeworks');
        }
        return true;
      } catch (error) {
        console.error('Failed to review assignment', error);
        showToast({ message: 'Не удалось сохранить проверку', variant: 'error' });
        return false;
      } finally {
        setReviewSubmitting(false);
      }
    },
    [
      fetchTeacherAssignments,
      handleOpenReview,
      loadTeacherActivityUnread,
      loadTeacherSummary,
      navigate,
      clearEntry,
      reviewAssignment,
      reviewQueueActive,
      showToast,
    ],
  );

  const handleStartReviewQueue = useCallback(async () => {
    setReviewQueueActive(true);
    setActiveTab('review');
    const items = await fetchTeacherAssignments({
      offset: 0,
      append: false,
      tab: 'review',
    });
    if (!items.length) {
      setReviewQueueActive(false);
      showToast({ message: 'В очереди на проверку сейчас пусто', variant: 'error' });
      return;
    }
    await handleOpenReview(items[0], { preserveQueue: true });
  }, [fetchTeacherAssignments, handleOpenReview, showToast]);

  const handleStudentDetailSubmit = useCallback(
    async (payload: StudentHomeworkSubmitPayload) => {
      if (!studentDetailAssignment) {
        setStudentDetailError('Домашка недоступна для отправки');
        return false;
      }
      setStudentDetailSubmitting(true);
      setStudentDetailError(null);
      try {
        const response = await api.createHomeworkSubmissionV2(studentDetailAssignment.id, payload);

        setStudentDetailAssignment(response.assignment);
        setStudentDetailSubmissions((prev) => {
          const withoutCurrent = prev.filter((item) => item.id !== response.submission.id);
          return [response.submission, ...withoutCurrent].sort((left, right) => {
            if (right.attemptNo !== left.attemptNo) return right.attemptNo - left.attemptNo;
            return right.id - left.id;
          });
        });

        // TEA-401: detail уже применён локально (выше). Дублирующий loadStudentDetail убран —
        // оставляем только обновление списка, чтобы счётчики/бейджи sidebar были актуальны.
        void loadStudentList({ append: false });

        showToast({
          message: payload.submit ? 'Домашка отправлена' : 'Черновик сохранён',
          variant: 'success',
        });
        return true;
      } catch (error) {
        console.error('Failed to submit homework payload', error);
        const fallbackMessage = payload.submit ? 'Не удалось отправить домашку' : 'Не удалось сохранить черновик';
        const errorMessage = isApiRequestError(error) && error.message ? error.message : fallbackMessage;
        setStudentDetailError(errorMessage);
        return false;
      } finally {
        setStudentDetailSubmitting(false);
      }
    },
    [loadStudentDetail, loadStudentList, showToast, studentDetailAssignment],
  );

  const handleStudentDetailStartAttempt = useCallback(async () => {
    if (!studentDetailAssignment) return false;
    setStudentDetailSubmitting(true);
    setStudentDetailError(null);
    try {
      await api.createHomeworkSubmissionV2(studentDetailAssignment.id, { submit: false });
      await loadStudentDetail();
      await loadStudentList({ append: false });
      showToast({
        message: 'Попытка начата',
        variant: 'success',
      });
      return true;
    } catch (error) {
      console.error('Failed to start timed homework attempt', error);
      setStudentDetailError('Не удалось запустить таймер');
      return false;
    } finally {
      setStudentDetailSubmitting(false);
    }
  }, [loadStudentDetail, loadStudentList, showToast, studentDetailAssignment]);

  const teacherView = useMemo(
    () => (
      <TeacherHomeworksView
        assignments={assignments}
        templates={templates}
        groups={groups}
        groupAssignmentsByKey={groupAssignmentsByKey}
        groupAssignmentsLoadingByKey={groupAssignmentsLoadingByKey}
        groupAssignmentsErrorByKey={groupAssignmentsErrorByKey}
        groupAssignmentsNextOffsetByKey={groupAssignmentsNextOffsetByKey}
        students={students}
        summary={teacherSummary}
        activeTab={activeTab}
        searchQuery={searchQuery}
        sortBy={sortBy}
        problemFilters={problemFilters}
        selectedStudentId={selectedStudentId}
        loadingAssignments={loadingAssignments}
        loadingMoreAssignments={loadingMoreAssignments}
        hasMoreAssignments={hasMoreAssignments}
        loadingTemplates={loadingTemplates}
        loadingGroups={loadingGroups}
        loadingSummary={loadingSummary}
        loadingStudents={loadingStudents}
        assignmentsError={assignmentsError}
        templatesError={templatesError}
        groupsError={groupsError}
        summaryError={summaryError}
        studentsError={studentsError}
        submittingTemplate={submittingTemplate}
        submittingAssignment={submittingAssignment}
        reviewAssignment={reviewAssignment}
        reviewSubmissions={reviewSubmissions}
        reviewLoading={reviewLoading}
        reviewSubmitting={reviewSubmitting}
        assignModalRequest={assignModalRequest}
        homeworkActivityItems={homeworkActivityItems}
        homeworkActivityLoading={homeworkActivityLoading}
        homeworkActivityHasUnread={homeworkActivityHasUnread}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab !== 'review') {
            setReviewQueueActive(false);
          }
        }}
        onSearchChange={setSearchQuery}
        onSortChange={setSortBy}
        onToggleProblemFilter={(filter) =>
          setProblemFilters((prev) =>
            prev.includes(filter) ? prev.filter((item) => item !== filter) : [...prev, filter],
          )
        }
        onSelectedStudentIdChange={setSelectedStudentId}
        onOpenCreateTemplateScreen={() => navigate('/homeworks/new')}
        onOpenTemplateDetailScreen={(templateId) => navigate(`/homeworks/${templateId}`)}
        onOpenEditTemplateScreen={(template) => {
          handleRequestTemplateEdit(template);
        }}
        onCreateGroup={handleCreateGroup}
        onUpdateGroup={handleUpdateGroup}
        onDeleteGroup={handleDeleteGroup}
        onLoadGroupAssignments={(groupKey, options) => loadTeacherAssignmentsByGroup(groupKey, options)}
        onRebindAssignmentGroup={handleRebindAssignmentGroup}
        onRebindAssignmentsGroup={handleRebindAssignmentsGroup}
        onDuplicateTemplate={handleDuplicateTemplate}
        onArchiveTemplate={handleArchiveTemplate}
        onRestoreTemplate={handleRestoreTemplate}
        onDeleteTemplate={handleDeleteTemplate}
        onToggleTemplateFavorite={handleToggleTemplateFavorite}
        onCreateAssignment={handleCreateAssignment}
        onSendAssignmentNow={handleSendAssignmentNow}
        onCancelAssignmentIssue={handleCancelAssignmentIssue}
        onRemindAssignment={handleRemindAssignment}
        onOpenStudentProfile={handleOpenStudentProfile}
        onOpenLessonDay={handleOpenAssignmentLessonDay}
        onUpdateAssignmentDeadline={handleUpdateAssignmentDeadline}
        onDeleteAssignment={handleDeleteAssignment}
        onReissueAssignment={handleReissueAssignment}
        onFixConfigError={handleFixConfigError}
        onBulkAction={handleBulkAction}
        onOpenReview={(assignment) => {
          void handleOpenReview(assignment);
        }}
        onCloseReview={() => {
          setReviewQueueActive(false);
          setReviewAssignment(null);
          setReviewSubmissions([]);
          setReviewInitialDraft(null);
          setReviewCurrentDraft(null);
          setReviewHasUnsavedDraft(false);
          clearEntry(REVIEW_UNSAVED_ENTRY_KEY);
        }}
        onStartReviewQueue={() => {
          void handleStartReviewQueue();
        }}
        onOpenDetail={(assignment) => {
          void handleOpenDetail(assignment);
        }}
        onLoadMoreAssignments={() => {
          if (assignmentsNextOffset === null) return;
          void fetchTeacherAssignments({ offset: assignmentsNextOffset, append: true });
        }}
        onConsumeAssignModalRequest={() => setAssignModalRequest(null)}
        onSubmitReview={handleSubmitReview}
        onRefresh={() => {
          void Promise.all([
            fetchTeacherAssignments({ offset: 0, append: false }),
            loadTeacherSummary(),
            loadTeacherGroups(),
            loadTeacherTemplates(),
            loadTeacherStudents(),
          ]);
          resetGroupAssignmentsState();
        }}
        onLoadHomeworkActivity={() => {
          void loadTeacherActivityFeed();
        }}
        onMarkHomeworkActivitySeen={markTeacherActivitySeen}
        onOpenMobileSidebar={onOpenMobileSidebar}
        renderSearchButton={renderSearchButton}
      />
    ),
    [
      activeTab,
      assignments,
      assignmentsError,
      assignmentsNextOffset,
      assignModalRequest,
      clearEntry,
      fetchTeacherAssignments,
      handleArchiveTemplate,
      handleRestoreTemplate,
      handleBulkAction,
      handleCancelAssignmentIssue,
      handleCreateAssignment,
      handleCreateGroup,
      handleDeleteAssignment,
      handleDeleteTemplate,
      handleDeleteGroup,
      handleDuplicateTemplate,
      handleFixConfigError,
      handleOpenDetail,
      handleOpenAssignmentLessonDay,
      handleOpenStudentProfile,
      handleOpenReview,
      handleRequestTemplateEdit,
      handleReissueAssignment,
      handleRebindAssignmentGroup,
      handleRebindAssignmentsGroup,
      handleRemindAssignment,
      handleSendAssignmentNow,
      handleStartReviewQueue,
      handleSubmitReview,
      handleToggleTemplateFavorite,
      handleUpdateAssignmentDeadline,
      handleUpdateGroup,
      hasMoreAssignments,
      groupAssignmentsByKey,
      groupAssignmentsErrorByKey,
      groupAssignmentsLoadingByKey,
      groupAssignmentsNextOffsetByKey,
      groups,
      groupsError,
      homeworkActivityHasUnread,
      homeworkActivityItems,
      homeworkActivityLoading,
      loadTeacherAssignmentsByGroup,
      loadTeacherActivityFeed,
      loadTeacherGroups,
      loadTeacherStudents,
      loadTeacherSummary,
      loadTeacherTemplates,
      loadingAssignments,
      loadingGroups,
      loadingMoreAssignments,
      loadingStudents,
      loadingSummary,
      loadingTemplates,
      markTeacherActivitySeen,
      navigate,
      onOpenMobileSidebar,
      problemFilters,
      renderSearchButton,
      resetGroupAssignmentsState,
      reviewAssignment,
      reviewLoading,
      reviewSubmissions,
      reviewSubmitting,
      searchQuery,
      selectedStudentId,
      sortBy,
      students,
      studentsError,
      submittingAssignment,
      submittingTemplate,
      summaryError,
      teacherSummary,
      templates,
      templatesError,
    ],
  );

  const cancelIssueDialog = (
    <DialogModal
      open={cancelIssueAssignment !== null}
      title="Отменить выдачу домашнего задания?"
      description={
        cancelIssueAssignment
          ? `Домашка «${cancelIssueAssignment.title}» исчезнет у ученика, черновые ответы будут очищены, а ученик получит уведомление об отмене выдачи.`
          : ''
      }
      confirmText={cancelIssueSubmitting ? 'Отменяю…' : 'Отменить выдачу'}
      cancelText="Оставить как есть"
      onClose={() => {
        if (cancelIssueSubmitting) return;
        setCancelIssueAssignment(null);
      }}
      onConfirm={handleConfirmCancelAssignmentIssue}
      onCancel={() => {
        if (cancelIssueSubmitting) return;
        setCancelIssueAssignment(null);
      }}
    />
  );

  const deleteTemplateDialog = (
    <DialogModal
      open={deleteTemplateTarget !== null}
      title="Удалить домашнее задание?"
      description={
        deleteTemplateTarget
          ? `Домашка «${deleteTemplateTarget.title}» исчезнет из библиотеки. Уже проверенные выданные версии сохранятся у учеников как завершённые копии.`
          : ''
      }
      confirmText="Удалить домашку"
      cancelText="Оставить"
      onClose={() => setDeleteTemplateTarget(null)}
      onConfirm={handleConfirmDeleteTemplate}
      onCancel={() => setDeleteTemplateTarget(null)}
    />
  );

  const editTemplateCopyDialog = (
    <DialogModal
      open={pendingTemplateEditCopy !== null}
      title="Создать копию для редактирования?"
      description={
        pendingTemplateEditCopy
          ? `Домашнее задание «${pendingTemplateEditCopy.template.title}» уже выдавалось ученикам. Мы создадим копию с названием «${buildHomeworkCopyTitle(
              pendingTemplateEditCopy.template.title,
              templates.map((template) => template.title),
            )}», а текущая домашка и все уже выданные версии останутся без изменений.`
          : ''
      }
      confirmText={submittingTemplate ? 'Создаю копию…' : 'Создать копию'}
      cancelText="Отмена"
      onClose={() => {
        void handleCancelTemplateEditCopy();
      }}
      onConfirm={handleConfirmTemplateEditCopy}
      onCancel={handleCancelTemplateEditCopy}
    />
  );

  if (mode === 'teacher') {
    if (hasTeacherReviewAssignmentId) {
      return (
        <>
          <HomeworkReviewScreen
            assignment={reviewAssignment}
            submissions={reviewSubmissions}
            initialDraft={reviewInitialDraft}
            loading={reviewLoading}
            requestError={reviewError}
            submitting={reviewSubmitting}
            onBack={() => {
              navigateBackInHistory();
            }}
            onDraftChange={(draft, meta) => {
              setReviewCurrentDraft(draft);
              setReviewHasUnsavedDraft(meta.isDirty);
            }}
            onRefresh={() => {
              if (!Number.isFinite(assignmentId) || assignmentId <= 0) return;
              void loadTeacherReviewData(assignmentId);
            }}
            onSubmitReview={handleSubmitReview}
          />
          {cancelIssueDialog}
          {deleteTemplateDialog}
          {editTemplateCopyDialog}
        </>
      );
    }

    if (isTeacherAssignmentEditorRoute) {
      if (assignmentEditorLoading) {
        return <section>Загрузка домашнего задания...</section>;
      }

      if (assignmentEditorError) {
        return (
          <section>
            <p>{assignmentEditorError}</p>
            <button
              type="button"
              onClick={() => {
                if (hasTeacherAssignmentDetailId) {
                  navigateBackInHistory();
                  return;
                }

                navigate('/homeworks');
              }}
            >
              Назад
            </button>
          </section>
        );
      }

      return (
        <>
          <HomeworkTemplateCreateScreen
            variant="assignment"
            mode={isTeacherAssignmentEditRoute ? 'edit' : 'create'}
            draft={assignmentEditorDraft}
            submitting={submittingAssignment}
            readOnly={assignmentEditorReadOnly}
            readOnlyAssignment={assignmentEditorServerAssignment}
            saveAsTemplateSubmitting={savingAssignmentAsTemplate}
            students={students}
            groups={groups}
            templates={templates}
            lockAssignmentStudent={isTeacherAssignmentEditRoute}
            assignmentPrimaryActionMode={assignmentPrimaryActionMode}
            assignmentPrimaryActionDisabled={assignmentPrimaryActionDisabled}
            showCancelIssueAction={assignmentCanCancelIssue}
            cancelIssueSubmitting={cancelIssueSubmitting && cancelIssueAssignment?.id === editingAssignmentId}
            onDraftChange={setAssignmentEditorDraft}
            onSubmit={handleSubmitAssignmentFromScreen}
            onSaveAsTemplate={handleSaveAssignmentAsTemplate}
            onAssignmentTemplateSelect={handleAssignmentTemplateSelect}
            onCancelIssue={async () => {
              if (!assignmentEditorServerAssignment) return;
              await handleCancelAssignmentIssue(assignmentEditorServerAssignment);
            }}
            onReadOnlyEdit={() => {
              if (!activeTeacherAssignmentId) return;
              navigate(`/homeworks/assignments/${activeTeacherAssignmentId}/edit`);
            }}
            onBack={() => {
              if (hasTeacherAssignmentDetailId) {
                navigateBackInHistory();
                return;
              }

              navigate('/homeworks');
            }}
            onOpenMobileSidebar={onOpenMobileSidebar}
          />

          <DialogModal
            open={pendingAssignmentTemplate !== null}
            title="Заменить содержимое домашнего задания?"
            description={
              pendingAssignmentTemplate
                ? `Домашнее задание «${pendingAssignmentTemplate.title}» полностью заменит текущее название, вопросы, материалы и настройки задания.`
                : ''
            }
            confirmText="Применить домашку"
            cancelText="Отмена"
            onClose={() => setPendingAssignmentTemplate(null)}
            onConfirm={handleConfirmAssignmentTemplateReplace}
            onCancel={handleCancelAssignmentTemplateReplace}
          />
          {cancelIssueDialog}
          {deleteTemplateDialog}
          {editTemplateCopyDialog}
        </>
      );
    }

    if (isTeacherTemplateEditorRoute) {
      if (isTeacherTemplateEditRoute && templateEditorLoading) {
        return <section>Загрузка домашнего задания...</section>;
      }

      if (isTeacherTemplateEditRoute && templateEditorError) {
        return (
          <section>
            <p>{templateEditorError}</p>
            <button type="button" onClick={() => navigate(teacherTemplateListPath)}>
              Назад
            </button>
          </section>
        );
      }

      return (
        <>
          <HomeworkTemplateCreateScreen
            mode={isTeacherTemplateEditRoute ? 'edit' : 'create'}
            variant="template"
            draft={templateEditorDraft}
            submitting={submittingTemplate}
            primaryActionDisabled={isTeacherTemplateEditRoute ? !templateEditorHasUnsavedChanges : false}
            students={students}
            onDraftChange={setTemplateEditorDraft}
            onSubmit={(action) => {
              if (action === 'save') {
                return Promise.resolve({ success: true });
              }
              if (isTeacherTemplateEditRoute) {
                return templateEditorDraft.assignment.studentId
                  ? handleUpdateTemplateAndIssueFromScreen()
                  : handleUpdateTemplateFromScreen();
              }
              return handleCreateTemplateFromScreen();
            }}
            onBack={() => navigate(teacherTemplateListPath)}
            onOpenMobileSidebar={onOpenMobileSidebar}
          />
          {cancelIssueDialog}
          {deleteTemplateDialog}
          {editTemplateCopyDialog}
        </>
      );
    }

    if (hasTeacherHomeworkSourceDetailId) {
      if (homeworkDetailLoading) {
        return <section>Загрузка домашнего задания...</section>;
      }

      if (homeworkDetailError || !homeworkDetailTemplate) {
        return (
          <section>
            <p>{homeworkDetailError ?? 'Домашнее задание не найдено'}</p>
            <button type="button" onClick={() => navigateBackInHistory()}>
              Назад
            </button>
          </section>
        );
      }

      return (
        <>
          <HomeworkTemplateCreateScreen
            mode="edit"
            variant="template"
            draft={createHomeworkEditorDraftFromTemplate(homeworkDetailTemplate)}
            submitting={false}
            readOnly
            readOnlyAssignments={homeworkDetailAssignments}
            readOnlyAssignmentsCount={homeworkDetailTemplate.issuedAssignmentsCount ?? 0}
            students={students}
            onDraftChange={() => undefined}
            onSubmit={() => Promise.resolve({ success: true })}
            onReadOnlyEdit={() => {
              handleRequestTemplateEdit(homeworkDetailTemplate);
            }}
            onBack={() => navigateBackInHistory()}
            onOpenMobileSidebar={onOpenMobileSidebar}
          />
          {cancelIssueDialog}
          {deleteTemplateDialog}
          {editTemplateCopyDialog}
        </>
      );
    }

    return (
      <>
        {teacherView}
        {cancelIssueDialog}
        {deleteTemplateDialog}
        {editTemplateCopyDialog}
      </>
    );
  }

  if (hasStudentAssignmentId) {
    return (
      <StudentHomeworkDetailView
        assignment={studentDetailAssignment}
        submissions={studentDetailSubmissions}
        loading={studentDetailLoading}
        submitting={studentDetailSubmitting}
        requestError={studentDetailError}
        onBack={() => navigateBackInHistory()}
        onRefresh={() => {
          void loadStudentDetail();
        }}
        onStartAttempt={handleStudentDetailStartAttempt}
        onSubmitPayload={handleStudentDetailSubmit}
      />
    );
  }

  return (
    <StudentHomeworksView
      assignments={assignments}
      summary={studentSummary}
      filter={studentFilter}
      loading={loadingStudentList}
      loadingMore={loadingStudentListMore}
      hasMore={studentHasMore}
      onFilterChange={(next) => {
        setStudentFilter(next);
        setStudentNextOffset(null);
      }}
      onRefresh={() => {
        void loadStudentList({ append: false });
      }}
      onLoadMore={() => {
        if (studentNextOffset === null) return;
        void loadStudentList({ append: true });
      }}
      onOpenAssignment={(assignment) => navigate(`/homeworks/assignments/${assignment.id}`)}
    />
  );
};

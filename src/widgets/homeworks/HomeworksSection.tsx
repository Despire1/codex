import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ActivityFeedItem,
  HomeworkAssignment,
  HomeworkReviewDraft,
  HomeworkSubmission,
  HomeworkTemplate,
} from '../../entities/types';
import { getLatestSubmission } from '../../entities/homework-submission/model/lib/submissionState';
import { api, isApiRequestError } from '../../shared/api/client';
import { useUnsavedChanges } from '../../shared/lib/unsavedChanges';
import { useToast } from '../../shared/lib/toast';
import { StudentHomeworkDetailView, StudentHomeworkSubmitPayload } from '../../features/homework-submit/ui/StudentHomeworkDetailView';
import {
  createInitialTemplateEditorDraft,
  createTemplateEditorDraftFromTemplate,
} from '../../features/homework-template-editor/model/lib/blocks';
import { HomeworkTemplateEditorDraft } from '../../features/homework-template-editor/model/types';
import {
  HomeworkTemplateCreateScreen,
  HomeworkTemplateCreateSubmitResult,
} from '../../features/homework-template-editor/ui/HomeworkTemplateCreateScreen';
import { HomeworkReviewScreen } from '../../features/homework-review/ui/HomeworkReviewScreen';
import { StudentHomeworksView } from './student/StudentHomeworksView';
import { TeacherHomeworksView } from './teacher/TeacherHomeworksView';
import {
  StudentHomeworkFilter,
  StudentHomeworkSummary,
  TeacherAssignModalRequest,
  TeacherAssignmentCreatePayload,
  TeacherAssignmentsSummary,
  TeacherBulkAction,
  TeacherHomeworkProblemFilter,
  TeacherHomeworkSort,
  TeacherHomeworkStudentOption,
  TeacherHomeworkTab,
  TeacherTemplateUpsertPayload,
} from './types';
import { toggleHomeworkTemplateFavoriteTags, isHomeworkTemplateFavorite } from './teacher/model/lib/templatePresentation';

interface HomeworksSectionProps {
  mode: 'teacher' | 'student';
}

type HomeworksNavigationState = {
  openAssignModal?: boolean;
  studentId?: number | null;
  lessonId?: number | null;
};

const TEACHER_PAGE_SIZE = 10;
const STUDENT_PAGE_SIZE = 20;
const REVIEW_UNSAVED_ENTRY_KEY = 'homeworks-review';
const REVIEW_DRAFT_STORAGE_PREFIX = 'homework-review-draft-v1';

const buildReviewDraftStorageKey = (assignmentId: number, submissionId: number) =>
  `${REVIEW_DRAFT_STORAGE_PREFIX}:${assignmentId}:${submissionId}`;

const saveReviewDraftToStorage = (assignmentId: number, draft: HomeworkReviewDraft) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(buildReviewDraftStorageKey(assignmentId, draft.submissionId), JSON.stringify(draft));
};

const readReviewDraftFromStorage = (
  assignmentId: number,
  submissionId: number,
): HomeworkReviewDraft | null => {
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
};

export const HomeworksSection: FC<HomeworksSectionProps> = ({ mode }) => {
  const { showToast } = useToast();
  const { setEntry, clearEntry } = useUnsavedChanges();
  const navigate = useNavigate();
  const location = useLocation();
  const { assignmentId: assignmentIdParam } = useParams<{ assignmentId?: string }>();
  const assignmentId = assignmentIdParam ? Number(assignmentIdParam) : Number.NaN;
  const hasStudentAssignmentId = mode === 'student' && Number.isFinite(assignmentId) && assignmentId > 0;
  const hasTeacherReviewAssignmentId =
    mode === 'teacher' &&
    Number.isFinite(assignmentId) &&
    assignmentId > 0 &&
    /^\/homeworks\/review\/\d+\/?$/.test(location.pathname);
  const isTeacherTemplateCreateRoute = mode === 'teacher' && /^\/homeworks\/templates\/new\/?$/.test(location.pathname);
  const teacherTemplateEditRouteMatch =
    mode === 'teacher' ? location.pathname.match(/^\/homeworks\/templates\/(\d+)\/edit\/?$/) : null;
  const editingTemplateId = teacherTemplateEditRouteMatch ? Number(teacherTemplateEditRouteMatch[1]) : null;
  const isTeacherTemplateEditRoute =
    mode === 'teacher' &&
    typeof editingTemplateId === 'number' &&
    Number.isFinite(editingTemplateId) &&
    editingTemplateId > 0;
  const isTeacherTemplateEditorRoute = isTeacherTemplateCreateRoute || isTeacherTemplateEditRoute;

  const [templates, setTemplates] = useState<HomeworkTemplate[]>([]);
  const [assignments, setAssignments] = useState<HomeworkAssignment[]>([]);
  const [students, setStudents] = useState<TeacherHomeworkStudentOption[]>([]);
  const [teacherSummary, setTeacherSummary] = useState<TeacherAssignmentsSummary>(emptyTeacherSummary);
  const [studentSummary, setStudentSummary] = useState<StudentHomeworkSummary>(emptySummary);

  const [activeTab, setActiveTab] = useState<TeacherHomeworkTab>('inbox');
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
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);

  const [loadingStudentList, setLoadingStudentList] = useState(false);
  const [loadingStudentListMore, setLoadingStudentListMore] = useState(false);

  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
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
  const [reviewHasUnsavedDraft, setReviewHasUnsavedDraft] = useState(false);

  const [detailAssignment, setDetailAssignment] = useState<HomeworkAssignment | null>(null);
  const [detailSubmissions, setDetailSubmissions] = useState<HomeworkSubmission[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [homeworkActivityItems, setHomeworkActivityItems] = useState<ActivityFeedItem[]>([]);
  const [homeworkActivityLoading, setHomeworkActivityLoading] = useState(false);
  const [homeworkActivityHasUnread, setHomeworkActivityHasUnread] = useState(false);

  const [createTemplateDraft, setCreateTemplateDraft] = useState<HomeworkTemplateEditorDraft>(
    createInitialTemplateEditorDraft(),
  );
  const [templateEditorLoading, setTemplateEditorLoading] = useState(false);
  const [templateEditorError, setTemplateEditorError] = useState<string | null>(null);

  const [studentDetailAssignment, setStudentDetailAssignment] = useState<HomeworkAssignment | null>(null);
  const [studentDetailSubmissions, setStudentDetailSubmissions] = useState<HomeworkSubmission[]>([]);
  const [studentDetailLoading, setStudentDetailLoading] = useState(false);
  const [studentDetailSubmitting, setStudentDetailSubmitting] = useState(false);
  const [studentDetailError, setStudentDetailError] = useState<string | null>(null);

  const [teacherInitialized, setTeacherInitialized] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  useEffect(() => {
    if (mode !== 'teacher') return;
    if (isTeacherTemplateCreateRoute) {
      setCreateTemplateDraft(createInitialTemplateEditorDraft());
      setTemplateEditorLoading(false);
      setTemplateEditorError(null);
    } else if (!isTeacherTemplateEditorRoute) {
      setTemplateEditorLoading(false);
      setTemplateEditorError(null);
    }
  }, [isTeacherTemplateCreateRoute, isTeacherTemplateEditorRoute, mode]);

  useEffect(() => {
    if (mode !== 'teacher') return;
    if (!isTeacherTemplateEditRoute || editingTemplateId === null) {
      return;
    }

    const existingTemplate = templates.find((template) => template.id === editingTemplateId);
    if (existingTemplate) {
      setCreateTemplateDraft(createTemplateEditorDraftFromTemplate(existingTemplate));
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
          setTemplateEditorError('Шаблон не найден');
          return;
        }
        setCreateTemplateDraft(createTemplateEditorDraftFromTemplate(targetTemplate));
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load template for edit screen', error);
        if (isCancelled) return;
        setTemplateEditorError('Не удалось загрузить шаблон');
      })
      .finally(() => {
        if (isCancelled) return;
        setTemplateEditorLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [editingTemplateId, isTeacherTemplateEditRoute, mode, templates]);

  useEffect(() => {
    if (mode !== 'teacher') return;
    const state = (location.state ?? null) as HomeworksNavigationState | null;
    if (!state || !state.openAssignModal) return;
    const requestedStudentId =
      typeof state.studentId === 'number' && Number.isFinite(state.studentId) ? state.studentId : null;
    const requestedLessonId =
      typeof state.lessonId === 'number' && Number.isFinite(state.lessonId) ? state.lessonId : null;

    if (requestedStudentId !== null) {
      setSelectedStudentId(requestedStudentId);
    }
    setAssignModalRequest({
      requestId: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      open: true,
      studentId: requestedStudentId,
      lessonId: requestedLessonId,
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
          });
        });
        if (response.nextOffset === null) break;
        offset = response.nextOffset;
      }
      setStudents(result);
    } catch (error) {
      // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
      console.error('Failed to load homework templates', error);
      setTemplatesError('Не удалось загрузить шаблоны');
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  const loadTeacherSummary = useCallback(async (studentId = selectedStudentId) => {
    setLoadingSummary(true);
    setSummaryError(null);
    try {
      const response = await api.getHomeworkAssignmentsSummaryV2({ studentId: studentId ?? undefined });
      setTeacherSummary(response);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load homework summary', error);
      setSummaryError('Не удалось загрузить сводку');
    } finally {
      setLoadingSummary(false);
    }
  }, [selectedStudentId]);

  const fetchTeacherAssignments = useCallback(async (options: {
    offset: number;
    append: boolean;
    tab?: TeacherHomeworkTab;
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

    try {
      const response = await api.listHomeworkAssignmentsV2({
        tab: targetTab,
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
      // eslint-disable-next-line no-console
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
  }, [activeTab, debouncedSearchQuery, problemFilters, selectedStudentId, sortBy]);

  const loadTeacherActivityUnread = useCallback(async () => {
    try {
      const unread = await api.getActivityFeedUnreadStatus();
      setHomeworkActivityHasUnread(unread.hasUnread);
    } catch (error) {
      // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
      console.error('Failed to mark homework activity feed as seen', error);
    }
  }, []);

  const loadStudentList = useCallback(async (options?: { append?: boolean }) => {
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
      // eslint-disable-next-line no-console
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
  }, [studentFilter, studentNextOffset]);

  const loadStudentDetail = useCallback(async () => {
    if (!hasStudentAssignmentId) return;
    setStudentDetailLoading(true);
    setStudentDetailError(null);
    try {
      const response = await api.getStudentHomeworkAssignmentDetailV2(assignmentId);
      setStudentDetailAssignment(response.assignment);
      setStudentDetailSubmissions(response.submissions);
    } catch (error) {
      // eslint-disable-next-line no-console
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
        ? latestSubmission.reviewDraft ??
          readReviewDraftFromStorage(targetAssignmentId, latestSubmission.id)
        : null;

      setReviewAssignment(response.assignment);
      setReviewSubmissions(response.submissions);
      setReviewInitialDraft(initialDraft);
      setReviewCurrentDraft(initialDraft);
      setReviewHasUnsavedDraft(false);
    } catch (error) {
      // eslint-disable-next-line no-console
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
      return;
    }
    if (isTeacherTemplateEditorRoute) return;
    if (teacherInitialized) return;

    let isMounted = true;
    void Promise.allSettled([
      loadTeacherStudents(),
      loadTeacherTemplates(),
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
    loadTeacherStudents,
    loadTeacherSummary,
    loadTeacherTemplates,
    mode,
    teacherInitialized,
  ]);

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
      // eslint-disable-next-line no-console
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
      title: 'Вы точно хотите выйти?',
      message: 'Домашнее задание проверяется. Вы можете сохранить проверку и выйти.',
      confirmText: 'Сохранить и выйти',
      cancelText: 'Остаться на проверке',
      cancelKeepsEditing: true,
      onSave: saveReviewDraft,
      onSaveErrorMessage: 'Не удалось сохранить проверку',
    });

    return () => {
      clearEntry(REVIEW_UNSAVED_ENTRY_KEY);
    };
  }, [
    clearEntry,
    hasTeacherReviewAssignmentId,
    mode,
    saveReviewDraft,
    setEntry,
  ]);

  const buildTemplateUpsertPayload = useCallback(
    (draftValue: HomeworkTemplateEditorDraft): TeacherTemplateUpsertPayload => ({
      title: draftValue.title,
      tags: draftValue.tagsText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      subject: draftValue.subject.trim() || null,
      level: draftValue.level.trim() || null,
      blocks: draftValue.blocks,
    }),
    [],
  );

  const resolveTemplateSubmitFailure = useCallback(
    (error: unknown): HomeworkTemplateCreateSubmitResult => {
      if (
        isApiRequestError(error) &&
        error.status === 400 &&
        Array.isArray(error.issues) &&
        error.issues.length > 0
      ) {
        return {
          success: false,
          issues: error.issues,
        };
      }

      const fallbackMessage =
        isApiRequestError(error) && error.message
          ? error.message
          : 'Не удалось сохранить шаблон';
      showToast({ message: fallbackMessage, variant: 'error' });
      return { success: false };
    },
    [showToast],
  );

  const handleCreateTemplateFromScreen = useCallback(async (): Promise<HomeworkTemplateCreateSubmitResult> => {
    const payload = buildTemplateUpsertPayload(createTemplateDraft);
    setSubmittingTemplate(true);
    try {
      await api.createHomeworkTemplateV2({
        title: payload.title.trim(),
        tags: payload.tags,
        subject: payload.subject ?? null,
        level: payload.level ?? null,
        blocks: payload.blocks,
      });
      showToast({ message: 'Шаблон создан', variant: 'success' });
      await loadTeacherTemplates();
      return { success: true };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to create homework template', error);
      return resolveTemplateSubmitFailure(error);
    } finally {
      setSubmittingTemplate(false);
    }
  }, [buildTemplateUpsertPayload, createTemplateDraft, loadTeacherTemplates, resolveTemplateSubmitFailure, showToast]);

  const handleUpdateTemplateFromScreen = useCallback(async (): Promise<HomeworkTemplateCreateSubmitResult> => {
    if (!isTeacherTemplateEditRoute || editingTemplateId === null) {
      showToast({ message: 'Шаблон не найден', variant: 'error' });
      return { success: false };
    }

    const payload = buildTemplateUpsertPayload(createTemplateDraft);
    setSubmittingTemplate(true);
    try {
      await api.updateHomeworkTemplateV2(editingTemplateId, {
        title: payload.title.trim(),
        tags: payload.tags,
        subject: payload.subject ?? null,
        level: payload.level ?? null,
        blocks: payload.blocks,
      });
      showToast({ message: 'Шаблон обновлен', variant: 'success' });
      await loadTeacherTemplates();
      return { success: true };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to update homework template', error);
      return resolveTemplateSubmitFailure(error);
    } finally {
      setSubmittingTemplate(false);
    }
  }, [
    buildTemplateUpsertPayload,
    createTemplateDraft,
    editingTemplateId,
    isTeacherTemplateEditRoute,
    loadTeacherTemplates,
    resolveTemplateSubmitFailure,
    showToast,
  ]);

  const handleDuplicateTemplate = useCallback(
    async (template: HomeworkTemplate) => {
      setSubmittingTemplate(true);
      try {
        await api.createHomeworkTemplateV2({
          title: `${template.title} (копия)`,
          tags: template.tags,
          subject: template.subject ?? null,
          level: template.level ?? null,
          blocks: template.blocks,
        });
        showToast({ message: 'Шаблон продублирован', variant: 'success' });
        await loadTeacherTemplates();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to duplicate homework template', error);
        showToast({ message: 'Не удалось продублировать шаблон', variant: 'error' });
      } finally {
        setSubmittingTemplate(false);
      }
    },
    [loadTeacherTemplates, showToast],
  );

  const handleArchiveTemplate = useCallback(
    async (template: HomeworkTemplate) => {
      setSubmittingTemplate(true);
      try {
        await api.updateHomeworkTemplateV2(template.id, { isArchived: true });
        showToast({ message: 'Шаблон перенесён в архив', variant: 'success' });
        await loadTeacherTemplates();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to archive homework template', error);
        showToast({ message: 'Не удалось архивировать шаблон', variant: 'error' });
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
        showToast({ message: 'Шаблон восстановлен из архива', variant: 'success' });
        await loadTeacherTemplates();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to restore homework template', error);
        showToast({ message: 'Не удалось восстановить шаблон', variant: 'error' });
      } finally {
        setSubmittingTemplate(false);
      }
    },
    [loadTeacherTemplates, showToast],
  );

  const handleToggleTemplateFavorite = useCallback(async (template: HomeworkTemplate) => {
    setSubmittingTemplate(true);
    try {
      const nextTags = toggleHomeworkTemplateFavoriteTags(template.tags, !isHomeworkTemplateFavorite(template));
      await api.updateHomeworkTemplateV2(template.id, { tags: nextTags });
      await loadTeacherTemplates();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to toggle template favorite', error);
      showToast({ message: 'Не удалось обновить избранное', variant: 'error' });
    } finally {
      setSubmittingTemplate(false);
    }
  }, [loadTeacherTemplates, showToast]);

  const handleCreateAssignment = useCallback(
    async (payload: TeacherAssignmentCreatePayload) => {
      if (!payload.studentId) {
        showToast({ message: 'Выберите ученика', variant: 'error' });
        return false;
      }

      const status = payload.sendNow ? 'SENT' : payload.sendMode === 'AUTO_AFTER_LESSON_DONE' ? 'SCHEDULED' : 'DRAFT';
      const targetTab: TeacherHomeworkTab = payload.sendNow
        ? 'in_progress'
        : payload.sendMode === 'AUTO_AFTER_LESSON_DONE'
          ? 'scheduled'
          : 'draft';
      const targetStudentId = payload.studentId;

      setSubmittingAssignment(true);
      try {
        await api.createHomeworkAssignmentV2({
          studentId: payload.studentId,
          lessonId: payload.lessonId ?? undefined,
          templateId: payload.templateId ?? undefined,
          title: payload.title?.trim() || undefined,
          sendMode: payload.sendMode,
          status,
          deadlineAt: payload.deadlineAt,
        });

        showToast({
          message: payload.sendNow ? 'Домашка выдана ученику' : 'Домашка сохранена',
          variant: 'success',
        });

        setActiveTab(targetTab);
        setSelectedStudentId(targetStudentId);
        await Promise.all([
          fetchTeacherAssignments({
            offset: 0,
            append: false,
            tab: targetTab,
            studentId: targetStudentId,
          }),
          loadTeacherSummary(targetStudentId),
        ]);

        return true;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to create homework assignment', error);
        showToast({ message: 'Не удалось создать домашку', variant: 'error' });
        return false;
      } finally {
        setSubmittingAssignment(false);
      }
    },
    [fetchTeacherAssignments, loadTeacherSummary, showToast],
  );

  const handleSendAssignmentNow = useCallback(
    async (assignment: HomeworkAssignment) => {
      try {
        await api.updateHomeworkAssignmentV2(assignment.id, {
          status: 'SENT',
          sentAt: new Date().toISOString(),
        });
        showToast({ message: 'Домашка отправлена ученику', variant: 'success' });
        await Promise.all([fetchTeacherAssignments({ offset: 0, append: false }), loadTeacherSummary()]);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to send assignment now', error);
        showToast({ message: 'Не удалось отправить домашку', variant: 'error' });
      }
    },
    [fetchTeacherAssignments, loadTeacherSummary, showToast],
  );

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
        // eslint-disable-next-line no-console
        console.error('Failed to remind assignment', error);
        showToast({ message: 'Не удалось отправить напоминание', variant: 'error' });
      }
    },
    [fetchTeacherAssignments, loadTeacherActivityUnread, showToast],
  );

  const handleDeleteAssignment = useCallback(
    async (assignment: HomeworkAssignment) => {
      try {
        await api.deleteHomeworkAssignmentV2(assignment.id);
        showToast({ message: 'Домашка удалена', variant: 'success' });
        await Promise.all([fetchTeacherAssignments({ offset: 0, append: false }), loadTeacherSummary()]);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to delete assignment', error);
        showToast({ message: 'Не удалось удалить домашку', variant: 'error' });
      }
    },
    [fetchTeacherAssignments, loadTeacherSummary, showToast],
  );

  const handleFixConfigError = useCallback(
    async (assignment: HomeworkAssignment) => {
      try {
        await api.updateHomeworkAssignmentV2(assignment.id, {
          sendMode: 'MANUAL',
        });
        showToast({ message: 'Ошибка настройки исправлена', variant: 'success' });
        await Promise.all([fetchTeacherAssignments({ offset: 0, append: false }), loadTeacherSummary()]);
      } catch (error) {
        // eslint-disable-next-line no-console
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
          loadTeacherActivityUnread(),
        ]);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to run bulk action', error);
        showToast({ message: 'Не удалось выполнить массовое действие', variant: 'error' });
      }
    },
    [fetchTeacherAssignments, loadTeacherActivityUnread, loadTeacherSummary, showToast],
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

  const handleOpenDetail = useCallback(async (assignment: HomeworkAssignment) => {
    setDetailAssignment(assignment);
    setDetailLoading(true);
    try {
      const response = await api.listHomeworkSubmissionsV2(assignment.id);
      setDetailSubmissions(response.items);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load submissions for detail', error);
      setDetailSubmissions([]);
      showToast({ message: 'Не удалось загрузить детали', variant: 'error' });
    } finally {
      setDetailLoading(false);
    }
  }, [showToast]);

  const handleSubmitReview = useCallback(
    async (payload: {
      action: 'REVIEWED' | 'RETURNED';
      submissionId: number;
      autoScore: number | null;
      manualScore: number | null;
      finalScore: number | null;
      teacherComment: string | null;
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
        // eslint-disable-next-line no-console
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

        void Promise.allSettled([loadStudentDetail(), loadStudentList({ append: false })]);

        showToast({
          message: payload.submit ? 'Домашка отправлена' : 'Черновик сохранён',
          variant: 'success',
        });
        return true;
      } catch (error) {
        // eslint-disable-next-line no-console
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
        message: 'Таймер запущен',
        variant: 'success',
      });
      return true;
    } catch (error) {
      // eslint-disable-next-line no-console
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
        loadingSummary={loadingSummary}
        loadingStudents={loadingStudents}
        assignmentsError={assignmentsError}
        templatesError={templatesError}
        summaryError={summaryError}
        studentsError={studentsError}
        submittingTemplate={submittingTemplate}
        submittingAssignment={submittingAssignment}
        reviewAssignment={reviewAssignment}
        reviewSubmissions={reviewSubmissions}
        reviewLoading={reviewLoading}
        reviewSubmitting={reviewSubmitting}
        detailAssignment={detailAssignment}
        detailSubmissions={detailSubmissions}
        detailLoading={detailLoading}
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
        onOpenCreateTemplateScreen={() => navigate('/homeworks/templates/new')}
        onOpenEditTemplateScreen={(templateId) => navigate(`/homeworks/templates/${templateId}/edit`)}
        onDuplicateTemplate={handleDuplicateTemplate}
        onArchiveTemplate={handleArchiveTemplate}
        onRestoreTemplate={handleRestoreTemplate}
        onToggleTemplateFavorite={handleToggleTemplateFavorite}
        onCreateAssignment={handleCreateAssignment}
        onSendAssignmentNow={handleSendAssignmentNow}
        onRemindAssignment={handleRemindAssignment}
        onDeleteAssignment={handleDeleteAssignment}
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
        onCloseDetail={() => {
          setDetailAssignment(null);
          setDetailSubmissions([]);
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
            loadTeacherTemplates(),
            loadTeacherStudents(),
          ]);
        }}
        onLoadHomeworkActivity={() => {
          void loadTeacherActivityFeed();
        }}
        onMarkHomeworkActivitySeen={markTeacherActivitySeen}
      />
    ),
    [
      activeTab,
      assignments,
      assignmentsError,
      assignmentsNextOffset,
      assignModalRequest,
      clearEntry,
      detailAssignment,
      detailLoading,
      detailSubmissions,
      fetchTeacherAssignments,
      handleArchiveTemplate,
      handleRestoreTemplate,
      handleBulkAction,
      handleCreateAssignment,
      handleDeleteAssignment,
      handleDuplicateTemplate,
      handleFixConfigError,
      handleOpenDetail,
      handleOpenReview,
      handleRemindAssignment,
      handleSendAssignmentNow,
      handleStartReviewQueue,
      handleSubmitReview,
      handleToggleTemplateFavorite,
      hasMoreAssignments,
      homeworkActivityHasUnread,
      homeworkActivityItems,
      homeworkActivityLoading,
      loadTeacherActivityFeed,
      loadTeacherStudents,
      loadTeacherSummary,
      loadTeacherTemplates,
      loadingAssignments,
      loadingMoreAssignments,
      loadingStudents,
      loadingSummary,
      loadingTemplates,
      markTeacherActivitySeen,
      navigate,
      problemFilters,
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

  if (mode === 'teacher') {
    if (hasTeacherReviewAssignmentId) {
      return (
        <HomeworkReviewScreen
          assignment={reviewAssignment}
          submissions={reviewSubmissions}
          initialDraft={reviewInitialDraft}
          loading={reviewLoading}
          requestError={reviewError}
          submitting={reviewSubmitting}
          onBack={() => {
            navigate('/homeworks');
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
      );
    }

    if (isTeacherTemplateEditorRoute) {
      if (isTeacherTemplateEditRoute && templateEditorLoading) {
        return <section>Загрузка шаблона...</section>;
      }

      if (isTeacherTemplateEditRoute && templateEditorError) {
        return (
          <section>
            <p>{templateEditorError}</p>
            <button type="button" onClick={() => navigate('/homeworks')}>
              Назад
            </button>
          </section>
        );
      }

      return (
        <HomeworkTemplateCreateScreen
          mode={isTeacherTemplateEditRoute ? 'edit' : 'create'}
          draft={createTemplateDraft}
          submitting={submittingTemplate}
          onDraftChange={setCreateTemplateDraft}
          onSubmit={isTeacherTemplateEditRoute ? handleUpdateTemplateFromScreen : handleCreateTemplateFromScreen}
          onBack={() => navigate('/homeworks')}
        />
      );
    }
    return teacherView;
  }

  if (hasStudentAssignmentId) {
    return (
      <StudentHomeworkDetailView
        assignment={studentDetailAssignment}
        submissions={studentDetailSubmissions}
        loading={studentDetailLoading}
        submitting={studentDetailSubmitting}
        requestError={studentDetailError}
        onBack={() => navigate('/homeworks')}
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
      onOpenAssignment={(assignment) => navigate(`/homeworks/${assignment.id}`)}
    />
  );
};

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { HomeworkAssignment, HomeworkSubmission, HomeworkTemplate } from '../../entities/types';
import { TeacherAssignmentBucket } from '../../entities/homework-assignment/model/lib/assignmentBuckets';
import { api } from '../../shared/api/client';
import { useToast } from '../../shared/lib/toast';
import { StudentHomeworkDetailView, StudentHomeworkSubmitPayload } from '../../features/homework-submit/ui/StudentHomeworkDetailView';
import { createInitialTemplateEditorDraft } from '../../features/homework-template-editor/model/lib/blocks';
import { HomeworkTemplateEditorDraft } from '../../features/homework-template-editor/model/types';
import { HomeworkTemplateCreateScreen } from '../../features/homework-template-editor/ui/HomeworkTemplateCreateScreen';
import { StudentHomeworksView } from './student/StudentHomeworksView';
import { TeacherHomeworksView } from './teacher/TeacherHomeworksView';
import {
  StudentHomeworkFilter,
  StudentHomeworkSummary,
  TeacherAssignmentCreatePayload,
  TeacherAssignmentsSummary,
  TeacherHomeworkStudentOption,
  TeacherTemplateUpsertPayload,
} from './types';

interface HomeworksSectionProps {
  mode: 'teacher' | 'student';
}

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
};

export const HomeworksSection: FC<HomeworksSectionProps> = ({ mode }) => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { assignmentId: assignmentIdParam } = useParams<{ assignmentId?: string }>();
  const assignmentId = assignmentIdParam ? Number(assignmentIdParam) : Number.NaN;
  const hasStudentAssignmentId = mode === 'student' && Number.isFinite(assignmentId) && assignmentId > 0;
  const isTeacherTemplateCreateRoute = mode === 'teacher' && /^\/homeworks\/templates\/new\/?$/.test(location.pathname);

  const [templates, setTemplates] = useState<HomeworkTemplate[]>([]);
  const [assignments, setAssignments] = useState<HomeworkAssignment[]>([]);
  const [students, setStudents] = useState<TeacherHomeworkStudentOption[]>([]);
  const [teacherSummary, setTeacherSummary] = useState<TeacherAssignmentsSummary>(emptyTeacherSummary);
  const [studentSummary, setStudentSummary] = useState<StudentHomeworkSummary>(emptySummary);
  const [studentFilter, setStudentFilter] = useState<StudentHomeworkFilter>('active');

  const [activeBucket, setActiveBucket] = useState<TeacherAssignmentBucket>('sent');
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [deadlineFrom, setDeadlineFrom] = useState('');
  const [deadlineTo, setDeadlineTo] = useState('');
  const [showArchivedTemplates, setShowArchivedTemplates] = useState(false);

  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingStudentList, setLoadingStudentList] = useState(false);

  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [studentsError, setStudentsError] = useState<string | null>(null);

  const [submittingTemplate, setSubmittingTemplate] = useState(false);
  const [submittingAssignment, setSubmittingAssignment] = useState(false);

  const [reviewAssignment, setReviewAssignment] = useState<HomeworkAssignment | null>(null);
  const [reviewSubmissions, setReviewSubmissions] = useState<HomeworkSubmission[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [createTemplateDraft, setCreateTemplateDraft] = useState<HomeworkTemplateEditorDraft>(
    createInitialTemplateEditorDraft(),
  );

  const [studentDetailAssignment, setStudentDetailAssignment] = useState<HomeworkAssignment | null>(null);
  const [studentDetailSubmissions, setStudentDetailSubmissions] = useState<HomeworkSubmission[]>([]);
  const [studentDetailLoading, setStudentDetailLoading] = useState(false);
  const [studentDetailSubmitting, setStudentDetailSubmitting] = useState(false);
  const [studentDetailError, setStudentDetailError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTeacherTemplateCreateRoute) return;
    setCreateTemplateDraft(createInitialTemplateEditorDraft());
  }, [isTeacherTemplateCreateRoute]);

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
      const response = await api.listHomeworkTemplatesV2({ includeArchived: showArchivedTemplates });
      setTemplates(response.items);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load homework templates', error);
      setTemplatesError('Не удалось загрузить шаблоны');
    } finally {
      setLoadingTemplates(false);
    }
  }, [showArchivedTemplates]);

  const loadTeacherAssignments = useCallback(async (
    options?: {
      bucket?: TeacherAssignmentBucket;
      studentId?: number | null;
      deadlineFrom?: string;
      deadlineTo?: string;
    },
  ) => {
    const targetBucket = options?.bucket ?? activeBucket;
    const targetStudentId = options?.studentId ?? selectedStudentId;
    const targetDeadlineFrom = options?.deadlineFrom ?? deadlineFrom;
    const targetDeadlineTo = options?.deadlineTo ?? deadlineTo;
    setLoadingAssignments(true);
    setAssignmentsError(null);
    try {
      const response = await api.listHomeworkAssignmentsV2({
        bucket: targetBucket,
        studentId: targetStudentId ?? undefined,
        limit: 100,
        offset: 0,
      });

      const deadlineFromDate = targetDeadlineFrom ? new Date(`${targetDeadlineFrom}T00:00:00`) : null;
      const deadlineToDate = targetDeadlineTo ? new Date(`${targetDeadlineTo}T23:59:59`) : null;
      const filteredItems = response.items.filter((item) => {
        if (!item.deadlineAt) return !deadlineFromDate && !deadlineToDate;
        const deadlineDate = new Date(item.deadlineAt);
        if (Number.isNaN(deadlineDate.getTime())) return false;
        if (deadlineFromDate && deadlineDate < deadlineFromDate) return false;
        if (deadlineToDate && deadlineDate > deadlineToDate) return false;
        return true;
      });
      setAssignments(filteredItems);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load homework assignments', error);
      setAssignmentsError('Не удалось загрузить выданные домашки');
    } finally {
      setLoadingAssignments(false);
    }
  }, [activeBucket, deadlineFrom, deadlineTo, selectedStudentId]);

  const loadTeacherSummary = useCallback(async (options?: { studentId?: number | null }) => {
    const targetStudentId = options?.studentId ?? selectedStudentId;
    setLoadingSummary(true);
    setSummaryError(null);
    try {
      const response = await api.getHomeworkAssignmentsSummaryV2({ studentId: targetStudentId ?? undefined });
      setTeacherSummary(response);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load homework summary', error);
      setSummaryError('Не удалось загрузить сводку');
    } finally {
      setLoadingSummary(false);
    }
  }, [selectedStudentId]);

  const loadTeacherData = useCallback(async () => {
    const jobs = [loadTeacherStudents(), loadTeacherTemplates(), loadTeacherAssignments(), loadTeacherSummary()];
    await Promise.allSettled(jobs);
  }, [loadTeacherAssignments, loadTeacherStudents, loadTeacherSummary, loadTeacherTemplates]);

  const loadStudentList = useCallback(async () => {
    setLoadingStudentList(true);
    try {
      const [summaryData, assignmentsData] = await Promise.all([
        api.getStudentHomeworkSummaryV2(),
        api.listStudentHomeworkAssignmentsV2({ filter: studentFilter, limit: 100, offset: 0 }),
      ]);
      setStudentSummary(summaryData);
      setAssignments(assignmentsData.items);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load student homework list', error);
      setStudentSummary(emptySummary);
      setAssignments([]);
    } finally {
      setLoadingStudentList(false);
    }
  }, [studentFilter]);

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

  useEffect(() => {
    if (mode === 'teacher') {
      void loadTeacherData();
      return;
    }
    if (hasStudentAssignmentId) {
      void loadStudentDetail();
      return;
    }
    void loadStudentList();
  }, [hasStudentAssignmentId, loadStudentDetail, loadStudentList, loadTeacherData, mode]);

  const handleCreateTemplate = useCallback(
    async (payload: TeacherTemplateUpsertPayload) => {
      const normalizedTitle = payload.title.trim();
      if (!normalizedTitle) {
        showToast({ message: 'Введите название шаблона', variant: 'error' });
        return false;
      }
      setSubmittingTemplate(true);
      try {
        await api.createHomeworkTemplateV2({
          title: normalizedTitle,
          tags: payload.tags,
          subject: payload.subject ?? null,
          level: payload.level ?? null,
          blocks: payload.blocks,
        });
        showToast({ message: 'Шаблон создан', variant: 'success' });
        await loadTeacherTemplates();
        return true;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to create homework template', error);
        showToast({ message: 'Не удалось создать шаблон', variant: 'error' });
        return false;
      } finally {
        setSubmittingTemplate(false);
      }
    },
    [loadTeacherTemplates, showToast],
  );

  const handleUpdateTemplate = useCallback(
    async (templateId: number, payload: TeacherTemplateUpsertPayload) => {
      const normalizedTitle = payload.title.trim();
      if (!normalizedTitle) {
        showToast({ message: 'Введите название шаблона', variant: 'error' });
        return false;
      }
      setSubmittingTemplate(true);
      try {
        await api.updateHomeworkTemplateV2(templateId, {
          title: normalizedTitle,
          tags: payload.tags,
          subject: payload.subject ?? null,
          level: payload.level ?? null,
          blocks: payload.blocks,
        });
        showToast({ message: 'Шаблон обновлен', variant: 'success' });
        await loadTeacherTemplates();
        return true;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to update homework template', error);
        showToast({ message: 'Не удалось обновить шаблон', variant: 'error' });
        return false;
      } finally {
        setSubmittingTemplate(false);
      }
    },
    [loadTeacherTemplates, showToast],
  );

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
        showToast({ message: 'Шаблон удалён из активных', variant: 'success' });
        await loadTeacherTemplates();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to archive homework template', error);
        showToast({ message: 'Не удалось удалить шаблон', variant: 'error' });
      } finally {
        setSubmittingTemplate(false);
      }
    },
    [loadTeacherTemplates, showToast],
  );

  const handleCreateTemplateFromScreen = useCallback(async () => {
    const payload: TeacherTemplateUpsertPayload = {
      title: createTemplateDraft.title,
      tags: createTemplateDraft.tagsText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      subject: createTemplateDraft.subject.trim() || null,
      level: createTemplateDraft.level.trim() || null,
      blocks: createTemplateDraft.blocks,
    };
    return handleCreateTemplate(payload);
  }, [createTemplateDraft, handleCreateTemplate]);

  const handleCreateAssignment = useCallback(
    async (payload: TeacherAssignmentCreatePayload) => {
      if (!payload.studentId) {
        showToast({ message: 'Выберите ученика', variant: 'error' });
        return false;
      }

      const status = payload.sendNow ? 'SENT' : payload.sendMode === 'AUTO_AFTER_LESSON_DONE' ? 'SCHEDULED' : 'DRAFT';
      const targetBucket: TeacherAssignmentBucket = payload.sendNow ? 'sent' : 'draft';
      const targetStudentId = payload.studentId;
      setSubmittingAssignment(true);
      try {
        await api.createHomeworkAssignmentV2({
          studentId: payload.studentId,
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
        setActiveBucket(targetBucket);
        setSelectedStudentId(targetStudentId);
        setDeadlineFrom('');
        setDeadlineTo('');
        await Promise.all([
          loadTeacherAssignments({
            bucket: targetBucket,
            studentId: targetStudentId,
            deadlineFrom: '',
            deadlineTo: '',
          }),
          loadTeacherSummary({ studentId: targetStudentId }),
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
    [loadTeacherAssignments, loadTeacherSummary, showToast],
  );

  const handleSendAssignmentNow = useCallback(
    async (assignment: HomeworkAssignment) => {
      try {
        await api.updateHomeworkAssignmentV2(assignment.id, {
          status: 'SENT',
          sentAt: new Date().toISOString(),
        });
        showToast({ message: 'Домашка отправлена ученику', variant: 'success' });
        setActiveBucket('sent');
        await Promise.all([loadTeacherAssignments({ bucket: 'sent' }), loadTeacherSummary()]);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to send assignment now', error);
        showToast({ message: 'Не удалось отправить домашку', variant: 'error' });
      }
    },
    [loadTeacherAssignments, loadTeacherSummary, showToast],
  );

  const handleOpenReview = useCallback(async (assignment: HomeworkAssignment) => {
    setReviewAssignment(assignment);
    setReviewLoading(true);
    try {
      const response = await api.listHomeworkSubmissionsV2(assignment.id);
      setReviewSubmissions(response.items);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load submissions for review', error);
      showToast({ message: 'Не удалось загрузить попытки', variant: 'error' });
      setReviewSubmissions([]);
    } finally {
      setReviewLoading(false);
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
      try {
        await api.reviewHomeworkAssignmentV2(reviewAssignment.id, payload);
        showToast({
          message: payload.action === 'REVIEWED' ? 'Домашка проверена' : 'Домашка возвращена на доработку',
          variant: 'success',
        });
        setReviewAssignment(null);
        setReviewSubmissions([]);
        await Promise.all([loadTeacherAssignments(), loadTeacherSummary()]);
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
    [loadTeacherAssignments, loadTeacherSummary, reviewAssignment, showToast],
  );

  const handleStudentDetailSubmit = useCallback(
    async (payload: StudentHomeworkSubmitPayload) => {
      if (!studentDetailAssignment) return false;
      setStudentDetailSubmitting(true);
      setStudentDetailError(null);
      try {
        await api.createHomeworkSubmissionV2(studentDetailAssignment.id, payload);
        await loadStudentDetail();
        await loadStudentList();
        showToast({
          message: payload.submit ? 'Домашка отправлена' : 'Черновик сохранён',
          variant: 'success',
        });
        return true;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to submit homework payload', error);
        setStudentDetailError(payload.submit ? 'Не удалось отправить домашку' : 'Не удалось сохранить черновик');
        return false;
      } finally {
        setStudentDetailSubmitting(false);
      }
    },
    [loadStudentDetail, loadStudentList, showToast, studentDetailAssignment],
  );

  const teacherView = useMemo(
    () => (
      <TeacherHomeworksView
        assignments={assignments}
        templates={templates}
        students={students}
        summary={teacherSummary}
        activeBucket={activeBucket}
        selectedStudentId={selectedStudentId}
        deadlineFrom={deadlineFrom}
        deadlineTo={deadlineTo}
        showArchivedTemplates={showArchivedTemplates}
        loadingAssignments={loadingAssignments}
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
        onBucketChange={setActiveBucket}
        onSelectedStudentIdChange={setSelectedStudentId}
        onDeadlineFromChange={setDeadlineFrom}
        onDeadlineToChange={setDeadlineTo}
        onShowArchivedTemplatesChange={setShowArchivedTemplates}
        onOpenCreateTemplateScreen={() => navigate('/homeworks/templates/new')}
        onUpdateTemplate={handleUpdateTemplate}
        onDuplicateTemplate={handleDuplicateTemplate}
        onArchiveTemplate={handleArchiveTemplate}
        onCreateAssignment={handleCreateAssignment}
        onSendAssignmentNow={handleSendAssignmentNow}
        onOpenReview={(assignment) => {
          void handleOpenReview(assignment);
        }}
        onCloseReview={() => {
          setReviewAssignment(null);
          setReviewSubmissions([]);
        }}
        onSubmitReview={handleSubmitReview}
        onRefresh={() => {
          void loadTeacherData();
        }}
      />
    ),
    [
      activeBucket,
      assignments,
      assignmentsError,
      deadlineFrom,
      deadlineTo,
      handleArchiveTemplate,
      handleCreateAssignment,
      handleDuplicateTemplate,
      handleOpenReview,
      handleSendAssignmentNow,
      handleSubmitReview,
      handleUpdateTemplate,
      loadTeacherData,
      loadingAssignments,
      loadingStudents,
      loadingSummary,
      loadingTemplates,
      navigate,
      reviewAssignment,
      reviewLoading,
      reviewSubmissions,
      reviewSubmitting,
      selectedStudentId,
      showArchivedTemplates,
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
    if (isTeacherTemplateCreateRoute) {
      return (
        <HomeworkTemplateCreateScreen
          draft={createTemplateDraft}
          submitting={submittingTemplate}
          onDraftChange={setCreateTemplateDraft}
          onSubmit={handleCreateTemplateFromScreen}
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
      onFilterChange={setStudentFilter}
      onRefresh={() => {
        void loadStudentList();
      }}
      onOpenAssignment={(assignment) => navigate(`/homeworks/${assignment.id}`)}
    />
  );
};

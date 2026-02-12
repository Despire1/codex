import { HomeworkAssignment, HomeworkBlock, HomeworkSubmission, HomeworkTemplate } from '../../entities/types';
import { TeacherAssignmentBucket } from '../../entities/homework-assignment/model/lib/assignmentBuckets';
import { HomeworkAssignmentsSummary } from '../../shared/api/client';
import { StudentHomeworkSubmitPayload } from '../../features/homework-submit/ui/StudentHomeworkDetailView';

export type StudentHomeworkFilter = 'active' | 'overdue' | 'submitted' | 'reviewed';

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
  templateId?: number | null;
  title?: string;
  sendMode: HomeworkAssignment['sendMode'];
  sendNow: boolean;
  deadlineAt: string | null;
};

export type TeacherAssignmentsSummary = HomeworkAssignmentsSummary;

export interface TeacherHomeworksViewModel {
  assignments: HomeworkAssignment[];
  templates: HomeworkTemplate[];
  students: TeacherHomeworkStudentOption[];
  summary: TeacherAssignmentsSummary;
  activeBucket: TeacherAssignmentBucket;
  selectedStudentId: number | null;
  deadlineFrom: string;
  deadlineTo: string;
  showArchivedTemplates: boolean;
  loadingAssignments: boolean;
  loadingTemplates: boolean;
  loadingSummary: boolean;
  loadingStudents: boolean;
  assignmentsError: string | null;
  templatesError: string | null;
  summaryError: string | null;
  studentsError: string | null;
  submittingTemplate: boolean;
  submittingAssignment: boolean;
  reviewAssignment: HomeworkAssignment | null;
  reviewSubmissions: HomeworkSubmission[];
  reviewLoading: boolean;
  reviewSubmitting: boolean;
  onBucketChange: (bucket: TeacherAssignmentBucket) => void;
  onSelectedStudentIdChange: (studentId: number | null) => void;
  onDeadlineFromChange: (value: string) => void;
  onDeadlineToChange: (value: string) => void;
  onShowArchivedTemplatesChange: (value: boolean) => void;
  onOpenCreateTemplateScreen: () => void;
  onUpdateTemplate: (templateId: number, payload: TeacherTemplateUpsertPayload) => Promise<boolean>;
  onDuplicateTemplate: (template: HomeworkTemplate) => Promise<void>;
  onArchiveTemplate: (template: HomeworkTemplate) => Promise<void>;
  onCreateAssignment: (payload: TeacherAssignmentCreatePayload) => Promise<boolean>;
  onSendAssignmentNow: (assignment: HomeworkAssignment) => Promise<void>;
  onOpenReview: (assignment: HomeworkAssignment) => void;
  onCloseReview: () => void;
  onSubmitReview: (payload: {
    action: 'REVIEWED' | 'RETURNED';
    submissionId: number;
    autoScore: number | null;
    manualScore: number | null;
    finalScore: number | null;
    teacherComment: string | null;
  }) => Promise<boolean>;
  onRefresh: () => void;
}

export interface StudentHomeworksViewModel {
  assignments: HomeworkAssignment[];
  summary: StudentHomeworkSummary;
  filter: StudentHomeworkFilter;
  loading: boolean;
  onFilterChange: (next: StudentHomeworkFilter) => void;
  onRefresh: () => void;
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

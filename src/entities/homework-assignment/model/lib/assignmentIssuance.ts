import { HomeworkAssignment, HomeworkAssignmentStatus, HomeworkSubmissionStatus } from '../../../types';

const CANCELLABLE_ASSIGNMENT_STATUSES: HomeworkAssignmentStatus[] = ['SENT', 'SCHEDULED', 'OVERDUE'];
const STUDENT_VISIBLE_ASSIGNMENT_STATUSES: HomeworkAssignmentStatus[] = [
  'SENT',
  'SUBMITTED',
  'IN_REVIEW',
  'RETURNED',
  'REVIEWED',
  'OVERDUE',
];

export const canCancelHomeworkAssignmentIssueByStatus = (status: HomeworkAssignmentStatus) =>
  CANCELLABLE_ASSIGNMENT_STATUSES.includes(status);

export const canCancelHomeworkAssignmentIssue = (
  assignment: Pick<HomeworkAssignment, 'status' | 'latestSubmissionStatus'>,
) =>
  canCancelHomeworkAssignmentIssueByStatus(assignment.status) &&
  (assignment.latestSubmissionStatus === null ||
    assignment.latestSubmissionStatus === undefined ||
    assignment.latestSubmissionStatus === 'DRAFT');

export const hasRealHomeworkSubmissionStatus = (status: HomeworkSubmissionStatus | null | undefined) =>
  status === 'SUBMITTED' || status === 'REVIEWED';

export const isHomeworkAssignmentVisibleToStudent = (status: HomeworkAssignmentStatus) =>
  STUDENT_VISIBLE_ASSIGNMENT_STATUSES.includes(status);

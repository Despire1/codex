import { HomeworkAssignment, HomeworkAssignmentStatus } from '../../../types';
import {
  canCancelHomeworkAssignmentIssue as canCancelHomeworkAssignmentIssueByWorkflow,
  hasRealHomeworkSubmissionStatus,
  isHomeworkAssignmentVisibleToStudent,
} from './workflow';

export const canCancelHomeworkAssignmentIssueByStatus = (status: HomeworkAssignmentStatus) =>
  status === 'SCHEDULED' || status === 'SENT' || status === 'OVERDUE' || status === 'RETURNED';

export const canCancelHomeworkAssignmentIssue = (
  assignment: Pick<HomeworkAssignment, 'status' | 'latestSubmissionStatus'>,
) =>
  canCancelHomeworkAssignmentIssueByWorkflow(assignment) &&
  (assignment.latestSubmissionStatus === null ||
    assignment.latestSubmissionStatus === undefined ||
    assignment.latestSubmissionStatus === 'DRAFT');

export { hasRealHomeworkSubmissionStatus, isHomeworkAssignmentVisibleToStudent };

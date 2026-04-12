import { HomeworkAssignment, HomeworkSubmission } from '../../../types';
import { resolveHomeworkAssignmentWorkflow } from '../../../homework-assignment/model/lib/workflow';

export const getLatestSubmission = (submissions: HomeworkSubmission[]) =>
  submissions.slice().sort((a, b) => {
    if (b.attemptNo !== a.attemptNo) return b.attemptNo - a.attemptNo;
    return b.id - a.id;
  })[0] ?? null;

export const canStudentEditSubmission = (assignment: HomeworkAssignment) =>
  resolveHomeworkAssignmentWorkflow(assignment).canStudentEdit;

export const canStudentSubmitNow = (assignment: HomeworkAssignment) =>
  canStudentEditSubmission(assignment);

export const isSubmissionReadonly = (assignment: HomeworkAssignment) =>
  !canStudentEditSubmission(assignment);

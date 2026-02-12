import { HomeworkAssignment, HomeworkSubmission } from '../../../types';

export const getLatestSubmission = (submissions: HomeworkSubmission[]) =>
  submissions.slice().sort((a, b) => {
    if (b.attemptNo !== a.attemptNo) return b.attemptNo - a.attemptNo;
    return b.id - a.id;
  })[0] ?? null;

export const canStudentEditSubmission = (assignment: HomeworkAssignment) =>
  assignment.status === 'SENT' || assignment.status === 'RETURNED' || assignment.status === 'OVERDUE';

export const canStudentSubmitNow = (assignment: HomeworkAssignment) =>
  canStudentEditSubmission(assignment);

export const isSubmissionReadonly = (assignment: HomeworkAssignment) =>
  !canStudentEditSubmission(assignment);


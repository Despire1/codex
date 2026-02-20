import { HomeworkAssignment } from '../../../types';

export type TeacherAssignmentBucket = 'draft' | 'sent' | 'review' | 'reviewed' | 'overdue';

export type TeacherAssignmentBucketItem = {
  id: TeacherAssignmentBucket;
  label: string;
};

export const TEACHER_ASSIGNMENT_BUCKETS: TeacherAssignmentBucketItem[] = [
  { id: 'draft', label: 'Черновики' },
  { id: 'sent', label: 'Отправленные' },
  { id: 'review', label: 'На проверке' },
  { id: 'reviewed', label: 'Проверенные' },
  { id: 'overdue', label: 'Просроченные' },
];

export const ASSIGNMENT_STATUS_LABELS: Record<HomeworkAssignment['status'], string> = {
  DRAFT: 'Черновик',
  SCHEDULED: 'Запланирована',
  SENT: 'Выдана',
  SUBMITTED: 'Сдана',
  IN_REVIEW: 'На проверке',
  RETURNED: 'На доработке',
  REVIEWED: 'Проверена',
  OVERDUE: 'Просрочена',
};

export const SEND_MODE_LABELS: Record<HomeworkAssignment['sendMode'], string> = {
  MANUAL: 'Вручную',
  AUTO_AFTER_LESSON_DONE: 'После завершения урока',
};

export const resolveAssignmentEffectiveStatus = (assignment: HomeworkAssignment, now = new Date()) => {
  if ((assignment.status === 'SENT' || assignment.status === 'RETURNED') && assignment.deadlineAt) {
    const deadlineDate = new Date(assignment.deadlineAt);
    if (!Number.isNaN(deadlineDate.getTime()) && deadlineDate.getTime() < now.getTime()) {
      return 'OVERDUE' as const;
    }
  }
  return assignment.status;
};

export const assignmentBelongsToBucket = (
  assignment: HomeworkAssignment,
  bucket: TeacherAssignmentBucket,
  now = new Date(),
) => {
  const status = resolveAssignmentEffectiveStatus(assignment, now);
  if (bucket === 'draft') return status === 'DRAFT' || status === 'SCHEDULED';
  if (bucket === 'sent') return status === 'SENT' || status === 'RETURNED';
  if (bucket === 'review') return status === 'SUBMITTED' || status === 'IN_REVIEW';
  if (bucket === 'reviewed') return status === 'REVIEWED';
  if (bucket === 'overdue') return status === 'OVERDUE';
  return false;
};

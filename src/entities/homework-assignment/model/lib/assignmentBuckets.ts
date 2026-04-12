import { HomeworkAssignment } from '../../../types';
import {
  assignmentBelongsToBucket as assignmentBelongsToWorkflowBucket,
  HomeworkAssignmentBucketId,
  resolveHomeworkAssignmentViewStatus,
} from './workflow';

export type TeacherAssignmentBucket = HomeworkAssignmentBucketId;

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

export const resolveAssignmentEffectiveStatus = (assignment: HomeworkAssignment, now = new Date()) =>
  resolveHomeworkAssignmentViewStatus(assignment, now);

export const assignmentBelongsToBucket = (
  assignment: HomeworkAssignment,
  bucket: TeacherAssignmentBucket,
  now = new Date(),
) => assignmentBelongsToWorkflowBucket(assignment, bucket, now);

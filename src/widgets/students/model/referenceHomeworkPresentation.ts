import { HomeworkAssignment, HomeworkAssignmentStatus, HomeworkSubmissionStatus } from '../../../entities/types';
import { resolveHomeworkAssignmentViewStatus, resolveHomeworkAssignmentWorkflow } from '../../../entities/homework-assignment/model/lib/workflow';
import { formatInTimeZone } from '../../../shared/lib/timezoneDates';
import { ru } from 'date-fns/locale';

const submissionStatusLabels: Record<HomeworkSubmissionStatus, string> = {
  DRAFT: 'Черновик ответа',
  SUBMITTED: 'Ответ отправлен',
  REVIEWED: 'Проверено',
};

const assignmentStatusLabels: Record<HomeworkAssignmentStatus, string> = {
  DRAFT: 'Черновик',
  SCHEDULED: 'Запланирована',
  SENT: 'Выдана',
  SUBMITTED: 'Сдана',
  IN_REVIEW: 'На проверке',
  RETURNED: 'На доработке',
  REVIEWED: 'Проверена',
  OVERDUE: 'Просрочена',
};

export const resolveStudentProfileHomeworkEffectiveStatus = (
  assignment: HomeworkAssignment,
  now = new Date(),
): HomeworkAssignmentStatus => resolveHomeworkAssignmentViewStatus(assignment, now);

export const resolveStudentProfileHomeworkStatusLabel = (assignment: HomeworkAssignment, now = new Date()) =>
  assignmentStatusLabels[resolveStudentProfileHomeworkEffectiveStatus(assignment, now)];

export const resolveStudentProfileHomeworkTone = (assignment: HomeworkAssignment, now = new Date()) => {
  const status = resolveStudentProfileHomeworkEffectiveStatus(assignment, now);
  if (status === 'REVIEWED') return 'done' as const;
  if (status === 'SUBMITTED' || status === 'IN_REVIEW') return 'progress' as const;
  if (status === 'DRAFT' || status === 'SCHEDULED') return 'muted' as const;
  return 'scheduled' as const;
};

export const resolveStudentProfileHomeworkDeadlineLabel = (assignment: HomeworkAssignment, timeZone: string) => {
  if (!assignment.deadlineAt) {
    return 'Без дедлайна';
  }

  return `Срок: ${formatInTimeZone(assignment.deadlineAt, 'd MMMM yyyy', {
    locale: ru,
    timeZone,
  })}`;
};

export const resolveStudentProfileHomeworkMetaLabel = (assignment: HomeworkAssignment) => {
  const workflow = resolveHomeworkAssignmentWorkflow(assignment);
  if (workflow.lateState === 'LATE') {
    return 'Сдано после срока';
  }
  if (assignment.latestSubmissionStatus) {
    return submissionStatusLabels[assignment.latestSubmissionStatus];
  }

  if (assignment.lessonStartAt) {
    return 'Привязано к занятию';
  }

  if (assignment.sendMode === 'AUTO_AFTER_LESSON_DONE') {
    return 'Выдача после завершения урока';
  }
  if (assignment.sendMode === 'SCHEDULED') {
    return 'Выдача по расписанию';
  }
  return 'Выдача вручную';
};

export const canRemindStudentProfileHomework = (assignment: HomeworkAssignment, now = new Date()) => {
  const status = resolveStudentProfileHomeworkEffectiveStatus(assignment, now);
  return status === 'SENT' || status === 'RETURNED' || status === 'OVERDUE';
};

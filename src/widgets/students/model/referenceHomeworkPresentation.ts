import { HomeworkAssignment, HomeworkAssignmentStatus, HomeworkSubmissionStatus } from '../../../entities/types';
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
): HomeworkAssignmentStatus => {
  if ((assignment.status === 'SENT' || assignment.status === 'RETURNED') && assignment.deadlineAt) {
    const deadlineDate = new Date(assignment.deadlineAt);
    if (!Number.isNaN(deadlineDate.getTime()) && deadlineDate.getTime() < now.getTime()) {
      return 'OVERDUE';
    }
  }

  return assignment.status;
};

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
  if (assignment.latestSubmissionStatus) {
    return submissionStatusLabels[assignment.latestSubmissionStatus];
  }

  if (assignment.lessonStartAt) {
    return 'Привязано к занятию';
  }

  return assignment.sendMode === 'AUTO_AFTER_LESSON_DONE' ? 'Выдача после завершения урока' : 'Выдача вручную';
};

export const canRemindStudentProfileHomework = (assignment: HomeworkAssignment, now = new Date()) => {
  const status = resolveStudentProfileHomeworkEffectiveStatus(assignment, now);
  return status === 'SENT' || status === 'RETURNED' || status === 'OVERDUE';
};

import { format } from 'date-fns';
import { Homework, HomeworkStatus, Lesson } from '../../entities/types';

export const normalizeLesson = (lesson: any): Lesson => ({
  ...lesson,
  startAt: typeof lesson.startAt === 'string' ? lesson.startAt : new Date(lesson.startAt).toISOString(),
  recurrenceUntil: lesson.recurrenceUntil
    ? typeof lesson.recurrenceUntil === 'string'
      ? lesson.recurrenceUntil
      : new Date(lesson.recurrenceUntil).toISOString()
    : lesson.recurrenceUntil ?? null,
  isRecurring: Boolean(lesson.isRecurring),
  recurrenceGroupId: lesson.recurrenceGroupId ?? null,
  recurrenceWeekdays: lesson.recurrenceWeekdays
    ? Array.isArray(lesson.recurrenceWeekdays)
      ? lesson.recurrenceWeekdays.map((value: any) => Number(value)).filter((v: number) => !Number.isNaN(v))
      : (() => {
          try {
            const parsed = JSON.parse(lesson.recurrenceWeekdays);
            return Array.isArray(parsed)
              ? parsed.map((value: any) => Number(value)).filter((v: number) => !Number.isNaN(v))
              : null;
          } catch (error) {
            return null;
          }
        })()
    : null,
});

const resolveStatus = (homework: any): HomeworkStatus => {
  const status = typeof homework.status === 'string' ? homework.status.toUpperCase() : null;
  if (status === 'ACTIVE' || status === 'SENT') return 'ASSIGNED';
  if (status === 'NEW') return 'DRAFT';
  if (status && ['DRAFT', 'ASSIGNED', 'IN_PROGRESS', 'DONE'].includes(status)) {
    return status as HomeworkStatus;
  }
  return homework.isDone ? 'DONE' : 'ASSIGNED';
};

const normalizeTimeSpent = (value: any): number | null => {
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) return null;
  if (numericValue < 0) return null;
  return Math.round(numericValue);
};

export const normalizeHomework = (homework: any): Homework => {
  let attachments: any[] = [];
  if (Array.isArray(homework.attachments)) {
    attachments = homework.attachments;
  } else if (typeof homework.attachments === 'string') {
    try {
      attachments = JSON.parse(homework.attachments) ?? [];
    } catch (error) {
      attachments = [];
    }
  }

  return {
    ...homework,
    status: resolveStatus(homework),
    isDone: homework.isDone ?? homework.status === 'DONE',
    attachments,
    timeSpentMinutes: normalizeTimeSpent(homework.timeSpentMinutes),
    deadline: homework.deadline
      ? typeof homework.deadline === 'string'
        ? homework.deadline.slice(0, 10)
        : new Date(homework.deadline).toISOString().slice(0, 10)
    : null,
    createdAt: typeof homework.createdAt === 'string' ? homework.createdAt : new Date(homework.createdAt).toISOString(),
    updatedAt: typeof homework.updatedAt === 'string' ? homework.updatedAt : new Date(homework.updatedAt).toISOString(),
    lastReminderAt: homework.lastReminderAt
      ? typeof homework.lastReminderAt === 'string'
        ? homework.lastReminderAt
        : new Date(homework.lastReminderAt).toISOString()
      : null,
    completedAt: homework.completedAt
      ? typeof homework.completedAt === 'string'
        ? homework.completedAt
        : new Date(homework.completedAt).toISOString()
      : null,
    takenAt: homework.takenAt
      ? typeof homework.takenAt === 'string'
        ? homework.takenAt
        : new Date(homework.takenAt).toISOString()
      : null,
    takenByStudentId: typeof homework.takenByStudentId === 'number' ? homework.takenByStudentId : null,
  };
};

export const todayISO = () => format(new Date(), 'yyyy-MM-dd');

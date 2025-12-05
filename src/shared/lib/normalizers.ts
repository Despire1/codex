import { format } from 'date-fns';
import { Homework, Lesson } from '../../entities/types';

export const normalizeLesson = (lesson: any): Lesson => ({
  ...lesson,
  startAt: typeof lesson.startAt === 'string' ? lesson.startAt : new Date(lesson.startAt).toISOString(),
  recurrenceUntil: lesson.recurrenceUntil
    ? typeof lesson.recurrenceUntil === 'string'
      ? lesson.recurrenceUntil
      : new Date(lesson.recurrenceUntil).toISOString()
    : lesson.recurrenceUntil ?? null,
  isRecurring: Boolean(lesson.isRecurring),
});

export const normalizeHomework = (homework: any): Homework => ({
  ...homework,
  deadline: homework.deadline
    ? (typeof homework.deadline === 'string'
        ? homework.deadline.slice(0, 10)
        : new Date(homework.deadline).toISOString().slice(0, 10))
    : undefined,
});

export const todayISO = () => format(new Date(), 'yyyy-MM-dd');

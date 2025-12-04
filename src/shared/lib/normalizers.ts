import { format } from 'date-fns';
import { Homework, Lesson } from '../../entities/types';

export const normalizeLesson = (lesson: any): Lesson => ({
  ...lesson,
  startAt: typeof lesson.startAt === 'string' ? lesson.startAt : new Date(lesson.startAt).toISOString(),
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

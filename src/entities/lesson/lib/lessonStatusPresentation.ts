import type { Lesson } from '../../types';
import type { LessonParticipantLike } from './lessonDetails';

export type LessonStatusTone = 'scheduled' | 'completed' | 'canceled';
export type LessonPaymentTone = 'unpaid' | 'partial' | 'paid';

export const resolveLessonStatusLabel = (lesson: Lesson) => {
  if (lesson.status === 'COMPLETED') return 'Проведён';
  if (lesson.status === 'CANCELED') return 'Отменён';
  return 'Запланирован';
};

export const resolveLessonStatusTone = (lesson: Lesson): LessonStatusTone => {
  if (lesson.status === 'COMPLETED') return 'completed';
  if (lesson.status === 'CANCELED') return 'canceled';
  return 'scheduled';
};

export const resolveLessonPaymentStatusLabel = (
  lesson: Lesson,
  participants: LessonParticipantLike[],
) => {
  const source =
    participants.length > 0
      ? participants.map((participant) => Boolean(participant.isPaid))
      : [Boolean(lesson.isPaid)];
  const paidCount = source.filter(Boolean).length;

  if (paidCount === 0) return 'Не оплачено';
  if (paidCount === source.length) return 'Оплачено';
  return 'Частично оплачено';
};

export const resolveLessonPaymentTone = (
  lesson: Lesson,
  participants: LessonParticipantLike[],
): LessonPaymentTone => {
  const source =
    participants.length > 0
      ? participants.map((participant) => Boolean(participant.isPaid))
      : [Boolean(lesson.isPaid)];
  const paidCount = source.filter(Boolean).length;

  if (paidCount === 0) return 'unpaid';
  if (paidCount === source.length) return 'paid';
  return 'partial';
};

export const resolveLessonCancelActionCopy = (lesson: Lesson | null) => {
  const isCompleted = lesson?.status === 'COMPLETED';

  return {
    title: isCompleted ? 'Перевести урок в отменённые?' : 'Отменить урок?',
    confirmText: isCompleted ? 'Перевести в отменённые' : 'Отменить урок',
    actionLabel: isCompleted ? 'Перевести в отменённые' : 'Отменить урок',
    cancelText: isCompleted ? 'Назад' : 'Не отменять',
  };
};

const WEEKDAY_LABELS_LONG: Record<number, string> = {
  0: 'воскресенье',
  1: 'понедельник',
  2: 'вторник',
  3: 'среда',
  4: 'четверг',
  5: 'пятница',
  6: 'суббота',
};

export const resolveLessonRecurrenceLabel = (lesson: Lesson) => {
  const weekdays = (lesson.recurrenceWeekdays ?? []).filter((day): day is number => Number.isInteger(day));
  if (weekdays.length === 0) return null;

  const labels = weekdays
    .map((day) => WEEKDAY_LABELS_LONG[day])
    .filter((label): label is string => Boolean(label));

  if (labels.length === 0) return 'Повторяющееся занятие';
  return `Еженедельно - ${labels.join(', ')}`;
};

import type { Lesson } from '../../types';

export const LESSON_HISTORY_LOCK_REASON =
  'Урок уже оплачен или проведён. Чтобы не переписать историю, изменение недоступно.';

export const resolveLessonFullyPaid = (lesson: Lesson) => {
  if (lesson.participants && lesson.participants.length > 0) {
    return lesson.participants.every((participant) => Boolean(participant.isPaid));
  }
  return Boolean(lesson.isPaid);
};

export const resolveLessonHasPaidParticipant = (lesson: Lesson) => {
  if (lesson.participants && lesson.participants.length > 0) {
    return lesson.participants.some((participant) => Boolean(participant.isPaid));
  }
  return Boolean(lesson.isPaid);
};

export const resolveLessonHistoryLocked = (lesson: Lesson) =>
  lesson.status === 'COMPLETED' || resolveLessonFullyPaid(lesson);

export const resolveLessonMutationDisabledReason = (lesson: Lesson) =>
  resolveLessonHistoryLocked(lesson) ? LESSON_HISTORY_LOCK_REASON : null;

export const isVisibleLesson = (lesson: Lesson) => !lesson.isSuppressed;

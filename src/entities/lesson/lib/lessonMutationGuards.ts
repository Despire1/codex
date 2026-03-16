import type { Lesson } from '../../types';

export const LESSON_DANGEROUS_MUTATION_LOCK_REASON =
  'Изменение этого урока потребует дополнительного подтверждения.';

export const LESSON_COMPLETED_LIMITED_EDIT_NOTICE =
  'Урок уже проведён или оплачен. При сохранении покажем предупреждение и, если нужно, предложим вернуть оплату на баланс.';

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

export const resolveLessonAllowsLimitedMetadataEdit = (lesson: Lesson) =>
  lesson.status === 'COMPLETED' || resolveLessonHasPaidParticipant(lesson);

export const resolveLessonHistoryLocked = (lesson: Lesson) =>
  lesson.status === 'COMPLETED' || resolveLessonHasPaidParticipant(lesson);

export const resolveLessonEditDisabledReason = (_lesson: Lesson) => null;

export const resolveLessonMutationDisabledReason = (_lesson: Lesson) => null;

export const resolveLessonDeleteDisabledReason = (_lesson: Lesson) => null;

export const resolveLessonLimitedEditNotice = (lesson: Lesson) =>
  resolveLessonAllowsLimitedMetadataEdit(lesson) ? LESSON_COMPLETED_LIMITED_EDIT_NOTICE : null;

export const isVisibleLesson = (lesson: Lesson) => !lesson.isSuppressed;

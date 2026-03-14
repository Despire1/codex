import type { Lesson } from '../../types';

export const LESSON_DANGEROUS_MUTATION_LOCK_REASON =
  'Урок уже проведён или оплачен. Перенос недоступен, чтобы не переписать историю.';

export const LESSON_DELETE_LOCK_REASON =
  'Проведённый или оплаченный урок нельзя удалить. Если урок не состоялся, используйте отмену.';

export const LESSON_COMPLETED_LIMITED_EDIT_NOTICE =
  'Урок уже проведён или оплачен. Можно изменить только безопасные поля: дата, время, ученики и повтор серии недоступны.';

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

export const resolveLessonMutationDisabledReason = (lesson: Lesson) =>
  resolveLessonHistoryLocked(lesson) ? LESSON_DANGEROUS_MUTATION_LOCK_REASON : null;

export const resolveLessonDeleteDisabledReason = (lesson: Lesson) =>
  lesson.status === 'COMPLETED' || resolveLessonHasPaidParticipant(lesson)
    ? LESSON_DELETE_LOCK_REASON
    : null;

export const resolveLessonLimitedEditNotice = (lesson: Lesson) =>
  resolveLessonAllowsLimitedMetadataEdit(lesson) ? LESSON_COMPLETED_LIMITED_EDIT_NOTICE : null;

export const isVisibleLesson = (lesson: Lesson) => !lesson.isSuppressed;

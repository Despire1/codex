import type { Lesson, LinkedStudent } from '../../../entities/types';

const resolveSingleName = (studentId: number, linkedStudentsById: Map<number, LinkedStudent>): string => {
  const link = linkedStudentsById.get(studentId);
  return link?.link.customName || link?.username || `Ученик #${studentId}`;
};

/**
 * Возвращает упорядоченный список studentId для урока, не дублируя primary
 * studentId, если он уже в participants.
 */
const collectParticipantIds = (lesson: Lesson): number[] => {
  const ids: number[] = [];
  const seen = new Set<number>();
  if (lesson.participants && lesson.participants.length > 0) {
    for (const p of lesson.participants) {
      if (!seen.has(p.studentId)) {
        ids.push(p.studentId);
        seen.add(p.studentId);
      }
    }
  } else if (lesson.studentId != null) {
    ids.push(lesson.studentId);
    seen.add(lesson.studentId);
  }
  // primary studentId должен быть первым, если он есть
  if (lesson.studentId != null && seen.has(lesson.studentId)) {
    return [lesson.studentId, ...ids.filter((id) => id !== lesson.studentId)];
  }
  return ids;
};

export const resolveLessonParticipantNames = (
  lesson: Lesson,
  linkedStudentsById: Map<number, LinkedStudent>,
): string[] => {
  const ids = collectParticipantIds(lesson);
  return ids.map((id) => resolveSingleName(id, linkedStudentsById));
};

/**
 * Формирует строку имён для отрисовки в чипе/блоке. Если участников много и
 * `maxVisible` не покрывает их все — добавляет «+N» в конец.
 */
export const resolveLessonNamesText = (
  lesson: Lesson,
  linkedStudentsById: Map<number, LinkedStudent>,
  maxVisible = 2,
): string => {
  const names = resolveLessonParticipantNames(lesson, linkedStudentsById);
  if (names.length === 0) return `Ученик #${lesson.studentId ?? '?'}`;
  if (names.length <= maxVisible) return names.join(', ');
  const visible = names.slice(0, maxVisible).join(', ');
  return `${visible} +${names.length - maxVisible}`;
};

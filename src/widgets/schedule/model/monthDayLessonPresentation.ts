import { LessonParticipantLike } from '../../../entities/lesson/lib/lessonDetails';
import { HomeworkAssignment, Lesson } from '../../../entities/types';

const SUBJECT_BY_COLOR: Record<NonNullable<Lesson['color']>, string> = {
  blue: 'Английский язык',
  peach: 'Математика',
  rose: 'Физика',
  mint: 'Программирование',
  sand: 'Химия',
  lavender: 'История',
};

export const resolveMonthDayLessonSubject = (lesson: Lesson, participantsCount: number) => {
  if (lesson.color) {
    return SUBJECT_BY_COLOR[lesson.color];
  }

  return participantsCount > 1 ? 'Групповое занятие' : 'Индивидуальное занятие';
};

const resolveMonthDayLessonLevel = (participants: LessonParticipantLike[]) => {
  if (participants.length !== 1) return null;
  const student = participants[0]?.student;

  if (!student || !('link' in student)) return null;

  const level = student.link?.studentLevel?.trim();
  return level || null;
};

export const resolveMonthDayLessonSubtitle = (lesson: Lesson, participants: LessonParticipantLike[]) => {
  const subject = resolveMonthDayLessonSubject(lesson, participants.length);
  const level = resolveMonthDayLessonLevel(participants);

  return level ? `${subject} • ${level}` : subject;
};

export const resolveMonthDayHomeworkTitle = (assignment: HomeworkAssignment) => {
  const directTitle = assignment.title?.trim();
  if (directTitle) return directTitle;

  const templateTitle = assignment.templateTitle?.trim();
  if (templateTitle) return templateTitle;

  return 'Домашнее задание';
};

export const resolveMonthDayHomeworkSummary = (assignments: HomeworkAssignment[]) => {
  const ordered = [...assignments].sort((left, right) => {
    const leftTimestamp = new Date(left.updatedAt || left.createdAt).getTime();
    const rightTimestamp = new Date(right.updatedAt || right.createdAt).getTime();
    return rightTimestamp - leftTimestamp;
  });

  return {
    primaryAssignment: ordered[0] ?? null,
    extraCount: Math.max(ordered.length - 1, 0),
  };
};

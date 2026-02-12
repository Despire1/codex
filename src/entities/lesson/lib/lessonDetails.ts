import type { Lesson, LessonParticipant, LinkedStudent } from '../../types';

export type LessonParticipantLike = Partial<LessonParticipant> & {
  studentId: number;
  isPaid: boolean;
  student?: LessonParticipant['student'] | LinkedStudent;
};

const resolveParticipantLinkPrice = (student?: LessonParticipantLike['student']) => {
  if (!student || !('link' in student)) return null;
  return student.link?.pricePerLesson ?? null;
};

export const buildParticipants = (
  lesson: Lesson,
  linkedStudentsById: Map<number, LinkedStudent>,
): LessonParticipantLike[] =>
  lesson.participants && lesson.participants.length > 0
    ? lesson.participants
    : [
        {
          studentId: lesson.studentId,
          isPaid: lesson.isPaid,
          student: linkedStudentsById.get(lesson.studentId),
        },
      ];

export const resolveLessonPrice = (lesson: Lesson, participants: LessonParticipantLike[]) => {
  const participant = participants[0];
  return participant?.price ?? resolveParticipantLinkPrice(participant?.student) ?? lesson.price ?? null;
};

export const resolveLessonPaid = (lesson: Lesson, participants: LessonParticipantLike[]) => {
  if (participants.length === 0) return Boolean(lesson.isPaid);
  return participants.every((participant) => Boolean(participant?.isPaid));
};

export const getParticipantName = (
  participant: LessonParticipantLike,
  linkedStudentsById: Map<number, LinkedStudent>,
) => {
  const linkedStudent = linkedStudentsById.get(participant?.studentId);
  const participantStudent = participant?.student as { username?: string | null } | undefined;
  return (
    linkedStudent?.link?.customName ??
    participantStudent?.username ??
    'Ученик'
  );
};

export const getLessonLabel = (
  participants: LessonParticipantLike[],
  linkedStudentsById: Map<number, LinkedStudent>,
) => {
  const names = participants
    .map((participant) => getParticipantName(participant, linkedStudentsById))
    .filter((name) => name);
  return names.length > 0 ? names.join(', ') : 'Урок';
};

export const isLessonInSeries = (lesson: Lesson) => Boolean(lesson.isRecurring && lesson.recurrenceGroupId);

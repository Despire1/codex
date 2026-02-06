import type { Lesson, LessonParticipant, LinkedStudent } from '../../types';

export type LessonParticipantLike = Partial<LessonParticipant> & {
  studentId: number;
  isPaid: boolean;
  student?: LinkedStudent;
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
  return participant?.price ?? participant?.student?.link?.pricePerLesson ?? lesson.price ?? null;
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
  return (
    linkedStudent?.link?.customName ??
    participant?.student?.username ??
    participant?.student?.name ??
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

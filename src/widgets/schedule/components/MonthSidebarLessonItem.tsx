import { addMinutes, format } from 'date-fns';
import type { FC } from 'react';
import { MeetingLinkIcon } from '../../../icons/MaterialIcons';
import type { Lesson, LinkedStudent } from '../../../entities/types';
import { toZonedDate } from '../../../shared/lib/timezoneDates';
import { buildParticipants, getLessonLabel } from '../../../entities/lesson/lib/lessonDetails';
import styles from './MonthSidebarLessonItem.module.css';

interface MonthSidebarLessonItemProps {
  lesson: Lesson;
  linkedStudentsById: Map<number, LinkedStudent>;
  timeZone: string;
  onClick: () => void;
}

const SUBJECT_BY_COLOR: Record<NonNullable<Lesson['color']>, string> = {
  blue: 'Английский язык',
  peach: 'Математика',
  rose: 'Физика',
  mint: 'Программирование',
  sand: 'Химия',
  lavender: 'История',
};

const resolveLessonSubject = (lesson: Lesson, participantsCount: number) => {
  if (lesson.color) {
    return SUBJECT_BY_COLOR[lesson.color];
  }

  return participantsCount > 1 ? 'Групповое занятие' : 'Индивидуальное занятие';
};

export const MonthSidebarLessonItem: FC<MonthSidebarLessonItemProps> = ({
  lesson,
  linkedStudentsById,
  timeZone,
  onClick,
}) => {
  const participants = buildParticipants(lesson, linkedStudentsById);
  const lessonLabel = getLessonLabel(participants, linkedStudentsById);
  const subjectLabel = resolveLessonSubject(lesson, participants.length);

  const startDate = toZonedDate(lesson.startAt, timeZone);
  const endDate = addMinutes(startDate, lesson.durationMinutes);
  const timeLabel = `${format(startDate, 'HH:mm')} - ${format(endDate, 'HH:mm')}`;

  return (
    <button type="button" className={styles.card} onClick={onClick}>
      <div className={styles.headerRow}>
        <h3 className={styles.title}>{lessonLabel}</h3>
        {lesson.meetingLink ? <MeetingLinkIcon className={styles.meetingIcon} /> : null}
      </div>
      <p className={styles.subject}>{subjectLabel}</p>
      <span className={styles.time}>{timeLabel}</span>
    </button>
  );
};

import { FC, useEffect, useMemo, useState } from 'react';
import { addMinutes, format } from 'date-fns';
import ru from 'date-fns/locale/ru';
import { api } from '../../../shared/api/client';
import type { Lesson, LinkedStudent } from '../../../entities/types';
import { buildParticipants, getLessonLabel } from '../../../entities/lesson/lib/lessonDetails';
import { toUtcDateFromTimeZone, toZonedDate } from '../../../shared/lib/timezoneDates';
import styles from './LessonDayTimeline.module.css';

interface LessonDayTimelineProps {
  date: string;
  startTime: string;
  endTime: string;
  timeZone: string;
  excludeLessonId: number | null;
  linkedStudents: LinkedStudent[];
}

const parseTimeToMinutes = (value: string): number | null => {
  const [hh, mm] = value.split(':').map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
};

const lessonsOverlap = (startA: number, endA: number, startB: number, endB: number): boolean =>
  startA < endB && startB < endA;

export const LessonDayTimeline: FC<LessonDayTimelineProps> = ({
  date,
  startTime,
  endTime,
  timeZone,
  excludeLessonId,
  linkedStudents,
}) => {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(false);

  const linkedStudentsById = useMemo(
    () => new Map(linkedStudents.map((student) => [student.id, student])),
    [linkedStudents],
  );

  useEffect(() => {
    if (!date) {
      setLessons([]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    const dayStartUtc = toUtcDateFromTimeZone(date, '00:00', timeZone);
    const dayEndUtc = toUtcDateFromTimeZone(date, '23:59', timeZone);
    api
      .listLessonsForRange({ start: dayStartUtc.toISOString(), end: dayEndUtc.toISOString() })
      .then((response) => {
        if (cancelled) return;
        setLessons(response.lessons.filter((lesson) => lesson.id !== excludeLessonId));
      })
      .catch(() => {
        if (!cancelled) setLessons([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, excludeLessonId, timeZone]);

  const draftStart = parseTimeToMinutes(startTime ?? '');
  const draftEnd = parseTimeToMinutes(endTime ?? '');

  if (!date) return null;
  if (loading && lessons.length === 0) return null;
  if (lessons.length === 0) return null;

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>На этот день уже запланировано:</div>
      <ul className={styles.list}>
        {lessons.map((lesson) => {
          const startDate = toZonedDate(lesson.startAt, timeZone);
          const endDate = addMinutes(startDate, lesson.durationMinutes);
          const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
          const endMinutes = endDate.getHours() * 60 + endDate.getMinutes();
          const conflict =
            draftStart !== null && draftEnd !== null && lessonsOverlap(draftStart, draftEnd, startMinutes, endMinutes);
          const participants = buildParticipants(lesson, linkedStudentsById);
          const lessonLabel = getLessonLabel(participants, linkedStudentsById);
          const timeLabel = `${format(startDate, 'HH:mm', { locale: ru })}–${format(endDate, 'HH:mm', { locale: ru })}`;
          return (
            <li key={lesson.id} className={`${styles.item} ${conflict ? styles.itemConflict : ''}`}>
              <span className={styles.itemTime}>{timeLabel}</span>
              <span className={styles.itemTitle}>{lessonLabel}</span>
              {conflict ? <span className={styles.itemConflictTag}>конфликт</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

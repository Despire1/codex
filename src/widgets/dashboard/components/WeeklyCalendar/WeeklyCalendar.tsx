import { addDays, addWeeks, endOfDay, format, isSameDay, isWithinInterval, startOfWeek } from 'date-fns';
import { ru } from 'date-fns/locale';
import { type CSSProperties, type FC, useMemo, useState } from 'react';
import { Lesson, LinkedStudent } from '@/entities/types';
import { getLessonColorTheme } from '@/shared/lib/lessonColors';
import { formatInTimeZone, toZonedDate } from '@/shared/lib/timezoneDates';
import styles from './WeeklyCalendar.module.css';

interface WeeklyCalendarProps {
  lessons: Lesson[];
  linkedStudents: LinkedStudent[];
  timeZone: string;
  className?: string;
}

const dayLabels = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];

const getStudentLabel = (lesson: Lesson, linkedStudents: LinkedStudent[]) => {
  if (lesson.participants && lesson.participants.length > 1) {
    const names = lesson.participants
      .map((participant) =>
        linkedStudents.find((student) => student.id === participant.studentId)?.link.customName,
      )
      .filter(Boolean);
    return names.length > 0 ? names.join(', ') : 'Группа';
  }
  return linkedStudents.find((student) => student.id === lesson.studentId)?.link.customName || 'Ученик';
};

export const WeeklyCalendar: FC<WeeklyCalendarProps> = ({ lessons, linkedStudents, timeZone, className }) => {
  const [weekOffset, setWeekOffset] = useState(0);
  const todayZoned = useMemo(() => toZonedDate(new Date(), timeZone), [timeZone]);
  const baseWeekStart = useMemo(() => startOfWeek(todayZoned, { weekStartsOn: 1 }), [todayZoned]);
  const weekStart = useMemo(() => addWeeks(baseWeekStart, weekOffset), [baseWeekStart, weekOffset]);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const weekInterval = useMemo(
    () => ({
      start: weekStart,
      end: endOfDay(weekEnd),
    }),
    [weekEnd, weekStart],
  );

  const weekLabel = useMemo(() => {
    const startLabel = format(weekStart, 'd', { locale: ru });
    const endLabel = format(weekEnd, 'd MMMM yyyy', { locale: ru });
    return `${startLabel} - ${endLabel}`;
  }, [weekEnd, weekStart]);

  const lessonsByDay = useMemo(() => {
    const map = new Map<string, Lesson[]>();
    lessons.forEach((lesson) => {
      if (lesson.status === 'CANCELED') return;
      const lessonDate = toZonedDate(lesson.startAt, timeZone);
      if (!isWithinInterval(lessonDate, weekInterval)) return;
      const key = format(lessonDate, 'yyyy-MM-dd');
      const current = map.get(key) ?? [];
      current.push(lesson);
      map.set(key, current);
    });

    map.forEach((dayLessons) => {
      dayLessons.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    });

    return map;
  }, [lessons, timeZone, weekInterval]);

  return (
    <section className={[styles.root, className].filter(Boolean).join(' ')}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Расписание на неделю</h2>
          <p className={styles.subtitle}>{weekLabel}</p>
        </div>
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.controlButton}
            aria-label="Предыдущая неделя"
            onClick={() => setWeekOffset((prev) => prev - 1)}
          >
            <svg viewBox="0 0 320 512" aria-hidden="true" focusable="false">
              <path
                fill="currentColor"
                d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l192 192c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L77.3 256 246.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-192 192z"
              />
            </svg>
          </button>
          <button
            type="button"
            className={styles.controlButton}
            aria-label="Следующая неделя"
            onClick={() => setWeekOffset((prev) => prev + 1)}
          >
            <svg viewBox="0 0 320 512" aria-hidden="true" focusable="false">
              <path
                fill="currentColor"
                d="M310.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L242.7 256 73.4 86.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l192 192z"
              />
            </svg>
          </button>
        </div>
      </header>

      <div className={styles.grid}>
        {dayLabels.map((label, index) => {
          const date = addDays(weekStart, index);
          const dayNumber = format(date, 'd');
          const dayKey = format(date, 'yyyy-MM-dd');
          const dayLessons = lessonsByDay.get(dayKey) ?? [];
          const isActive = isSameDay(date, todayZoned);
          const isWeekend = index === 6;

          return (
            <div className={styles.day} key={label}>
              <div className={[styles.dayLabel, isActive ? styles.dayLabelActive : ''].filter(Boolean).join(' ')}>
                {label}
              </div>
              <div
                className={[
                  styles.dayCard,
                  isActive ? styles.dayCardActive : '',
                  isWeekend ? styles.dayCardWeekend : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className={[styles.dayNumber, isActive ? styles.dayNumberActive : ''].filter(Boolean).join(' ')}>
                  {dayNumber}
                </div>
                {isWeekend && dayLessons.length === 0 ? (
                  <div className={styles.weekendLabel}>Выходной</div>
                ) : (
                  <div className={styles.lessonList}>
                    {dayLessons.map((lesson) => {
                      const theme = getLessonColorTheme(lesson.color);
                      const lessonStyle = {
                        '--lesson-bg': theme.background,
                        '--lesson-border': theme.border,
                        '--lesson-text': theme.hoverBackground,
                      } as CSSProperties;
                      return (
                        <div key={lesson.id} className={styles.lesson} style={lessonStyle}>
                          <div className={styles.lessonTime}>
                            {formatInTimeZone(lesson.startAt, 'HH:mm', { timeZone })}
                          </div>
                          <div className={styles.lessonStudent}>{getStudentLabel(lesson, linkedStudents)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

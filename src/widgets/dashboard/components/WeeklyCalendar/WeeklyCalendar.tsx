import { addDays, addWeeks, format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { type FC, useMemo, useState } from 'react';
import styles from './WeeklyCalendar.module.css';

interface WeeklyCalendarProps {
  className?: string;
}

interface LessonEntry {
  time: string;
  student: string;
  tone: 'indigo' | 'green' | 'purple' | 'orange';
}

const dayLabels = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];

const lessonsByDay: Record<number, LessonEntry[]> = {
  0: [
    { time: '09:00', student: 'А. Смирнова', tone: 'indigo' },
    { time: '14:00', student: 'Е. Петрова', tone: 'green' },
  ],
  1: [
    { time: '11:00', student: 'М. Соколов', tone: 'purple' },
    { time: '16:00', student: 'О. Кузнецова', tone: 'orange' },
  ],
  2: [
    { time: '09:00', student: 'А. Смирнова', tone: 'indigo' },
    { time: '11:00', student: 'Д. Иванов', tone: 'green' },
    { time: '14:00', student: 'Е. Петрова', tone: 'purple' },
  ],
  3: [
    { time: '10:00', student: 'С. Волков', tone: 'indigo' },
    { time: '16:00', student: 'М. Новикова', tone: 'orange' },
  ],
  4: [
    { time: '09:00', student: 'Д. Иванов', tone: 'green' },
    { time: '14:00', student: 'А. Морозов', tone: 'purple' },
    { time: '18:00', student: 'О. Кузнецова', tone: 'indigo' },
  ],
  5: [{ time: '10:00', student: 'А. Смирнова', tone: 'indigo' }],
  6: [],
};

const toneClassName: Record<LessonEntry['tone'], string> = {
  indigo: styles.lessonIndigo,
  green: styles.lessonGreen,
  purple: styles.lessonPurple,
  orange: styles.lessonOrange,
};

export const WeeklyCalendar: FC<WeeklyCalendarProps> = ({ className }) => {
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = useMemo(() => addWeeks(new Date(2025, 0, 16), weekOffset), [weekOffset]);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const weekLabel = useMemo(() => {
    const startLabel = format(weekStart, 'd', { locale: ru });
    const endLabel = format(weekEnd, 'd MMMM yyyy', { locale: ru });
    return `${startLabel} - ${endLabel}`;
  }, [weekEnd, weekStart]);

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
          const lessons = lessonsByDay[index] ?? [];
          const isActive = index === 2;
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
                {isWeekend ? (
                  <div className={styles.weekendLabel}>Выходной</div>
                ) : (
                  <div className={styles.lessonList}>
                    {lessons.map((lesson) => (
                      <div key={`${lesson.time}-${lesson.student}`} className={[styles.lesson, toneClassName[lesson.tone]].join(' ')}>
                        <div className={styles.lessonTime}>{lesson.time}</div>
                        <div className={styles.lessonStudent}>{lesson.student}</div>
                      </div>
                    ))}
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

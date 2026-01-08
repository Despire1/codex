import { addMinutes, format, isToday, isTomorrow, parseISO } from 'date-fns';
import { type FC, useMemo } from 'react';
import { Lesson, LinkedStudent } from '../../entities/types';
import controls from '../../shared/styles/controls.module.css';
import styles from './DashboardSection.module.css';

interface DashboardSectionProps {
  lessons: Lesson[];
  linkedStudents: LinkedStudent[];
  onAddStudent: () => void;
  onCreateLesson: () => void;
  onOpenSchedule: () => void;
  onOpenStudents: () => void;
  onOpenLesson: (lesson: Lesson) => void;
}

const getStudentLabel = (lesson: Lesson, linkedStudents: LinkedStudent[]) => {
  if (lesson.participants && lesson.participants.length > 1) {
    const names = lesson.participants
      .map((participant) =>
        participant.student?.username ||
        linkedStudents.find((student) => student.id === participant.studentId)?.link.customName,
      )
      .filter(Boolean);
    return names.length > 0 ? names.join(', ') : 'Группа';
  }
  return linkedStudents.find((student) => student.id === lesson.studentId)?.link.customName || 'Ученик';
};

export const DashboardSection: FC<DashboardSectionProps> = ({
  lessons,
  linkedStudents,
  onAddStudent,
  onCreateLesson,
  onOpenSchedule,
  onOpenStudents,
  onOpenLesson,
}) => {
  const now = new Date();

  const attentionLessons = useMemo(
    () =>
      lessons.filter((lesson) => {
        const start = parseISO(lesson.startAt);
        const end = addMinutes(start, lesson.durationMinutes);
        const isPast = end.getTime() < now.getTime();
        const needsAction = lesson.status !== 'COMPLETED' || (lesson.status === 'COMPLETED' && !lesson.isPaid);
        return isPast && needsAction;
      }),
    [lessons, now],
  );

  const todayLessons = useMemo(
    () => lessons.filter((lesson) => isToday(parseISO(lesson.startAt)) && lesson.status !== 'CANCELED'),
    [lessons],
  );

  const todayUpcomingLesson = useMemo(() => {
    return todayLessons
      .filter((lesson) => lesson.status === 'SCHEDULED' && parseISO(lesson.startAt).getTime() >= now.getTime())
      .sort((a, b) => parseISO(a.startAt).getTime() - parseISO(b.startAt).getTime())[0];
  }, [now, todayLessons]);

  const upcomingLessons = useMemo(() => {
    return lessons
      .filter((lesson) => {
        if (lesson.status !== 'SCHEDULED') return false;
        const date = parseISO(lesson.startAt);
        return date.getTime() >= now.getTime() && (isToday(date) || isTomorrow(date));
      })
      .sort((a, b) => parseISO(a.startAt).getTime() - parseISO(b.startAt).getTime());
  }, [lessons, now]);

  const upcomingLessonCards = upcomingLessons.slice(0, 5);

  const unpaidLessons = useMemo(
    () => lessons.filter((lesson) => lesson.status === 'COMPLETED' && !lesson.isPaid),
    [lessons],
  );

  const unpaidSummary = useMemo(() => {
    const studentIds = new Set<number>();
    const total = unpaidLessons.reduce((sum, lesson) => {
      if (lesson.participants && lesson.participants.length > 0) {
        lesson.participants.forEach((participant) => studentIds.add(participant.studentId));
        const participantsTotal = lesson.participants.reduce((subTotal, participant) => subTotal + participant.price, 0);
        return sum + participantsTotal;
      } else {
        studentIds.add(lesson.studentId);
        const price = typeof lesson.price === 'number' ? lesson.price : 0;
        return sum + price;
      }
    }, 0);
    return {
      total,
      lessonCount: unpaidLessons.length,
      studentCount: studentIds.size,
    };
  }, [unpaidLessons]);

  return (
    <section className={styles.grid}>
      {attentionLessons.length > 0 && (
        <div className={`${styles.card} ${styles.attentionCard}`}>
          <div className={styles.cardHeader}>Требует внимания</div>
          <div className={styles.attentionBody}>
            <div className={styles.attentionMain}>{attentionLessons.length} прошедших занятий без действий</div>
            <div className={styles.attentionNote}>Не отмечено проведение или оплата</div>
          </div>
          <button className={controls.secondaryButton} onClick={onOpenSchedule}>
            Разобрать
          </button>
        </div>
      )}

      <div className={styles.card}>
        <div className={styles.cardHeader}>Сегодня</div>
        {todayLessons.length === 0 ? (
          <p className={styles.muted}>Занятий нет</p>
        ) : (
          <div className={styles.todaySummary}>
            <div className={styles.todayCount}>{todayLessons.length} занятий</div>
            <div className={styles.todayMeta}>
              {todayUpcomingLesson
                ? `Первое — в ${format(parseISO(todayUpcomingLesson.startAt), 'HH:mm')}`
                : 'Все занятия на сегодня уже прошли'}
            </div>
          </div>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>Ближайшие уроки</div>
        {upcomingLessonCards.length === 0 ? (
          <p className={styles.muted}>Нет ближайших занятий</p>
        ) : (
          <div className={styles.lessonList}>
            {upcomingLessonCards.map((lesson) => {
              const date = parseISO(lesson.startAt);
              const label = isToday(date) ? 'Сегодня' : 'Завтра';
              return (
                <button
                  key={lesson.id}
                  type="button"
                  className={styles.lessonCard}
                  onClick={() => onOpenLesson(lesson)}
                >
                  <div className={styles.lessonDay}>{label}</div>
                  <div className={styles.lessonTimeRow}>
                    {format(date, 'HH:mm')} · {lesson.durationMinutes} мин
                  </div>
                  <div className={styles.lessonStudent}>{getStudentLabel(lesson, linkedStudents)}</div>
                </button>
              );
            })}
          </div>
        )}
        {upcomingLessons.length > 5 && (
          <button className={styles.inlineAction} onClick={onOpenSchedule}>
            Открыть расписание
          </button>
        )}
      </div>

      {unpaidSummary.lessonCount > 0 && (
        <button type="button" className={`${styles.card} ${styles.unpaidCard}`} onClick={onOpenStudents}>
          <div className={styles.cardHeader}>Неоплаченные занятия</div>
          <div className={styles.unpaidSummary}>
            {unpaidSummary.studentCount} учеников · {unpaidSummary.lessonCount} занятий · {unpaidSummary.total} ₽
          </div>
        </button>
      )}

      <div className={styles.card}>
        <div className={styles.cardHeader}>Быстрые действия</div>
        <div className={styles.actionsRow}>
          <button className={controls.secondaryButton} onClick={onAddStudent}>
            Добавить ученика
          </button>
          <button className={controls.secondaryButton} onClick={onCreateLesson}>
            Создать урок
          </button>
        </div>
      </div>
    </section>
  );
};

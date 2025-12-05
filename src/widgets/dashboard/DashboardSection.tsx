import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { type FC } from 'react';
import { Homework, Lesson, LinkedStudent } from '../../entities/types';
import controls from '../../shared/styles/controls.module.css';
import styles from './DashboardSection.module.css';

interface DashboardSectionProps {
  upcomingLessons: Lesson[];
  linkedStudents: LinkedStudent[];
  unpaidLessons: number;
  pendingHomeworks: Homework[];
  onAddStudent: () => void;
  onCreateLesson: () => void;
  onRemindHomework: () => void;
  onCompleteLesson: (lessonId: number) => void;
  onTogglePaid: (lessonId: number) => void;
}

export const DashboardSection: FC<DashboardSectionProps> = ({
  upcomingLessons,
  linkedStudents,
  unpaidLessons,
  pendingHomeworks,
  onAddStudent,
  onCreateLesson,
  onRemindHomework,
  onCompleteLesson,
  onTogglePaid,
}) => {
  const renderLessonRow = (lesson: Lesson) => {
    const student = linkedStudents.find((s) => s.id === lesson.studentId);
    const date = parseISO(lesson.startAt);
    const label = isToday(date)
      ? 'Сегодня'
      : isTomorrow(date)
      ? 'Завтра'
      : format(date, 'd MMM', { locale: ru });

    return (
      <div key={lesson.id} className={styles.lessonRow}>
        <div>
          <div className={styles.lessonTime}>{label}</div>
          <div className={styles.lessonTitle}>
            {student?.link.customName || 'Ученик'} • {format(date, 'HH:mm')} ({lesson.durationMinutes} мин)
          </div>
          <div className={styles.lessonMeta}>
            {lesson.status === 'SCHEDULED' ? 'Запланировано' : lesson.status === 'COMPLETED' ? 'Завершено' : 'Отменено'} ·{' '}
            {lesson.isPaid ? 'Оплачено' : 'Не оплачено'}
          </div>
        </div>
        <div className={styles.lessonActions}>
          {lesson.status !== 'COMPLETED' && (
            <button className={controls.smallButton} onClick={() => onCompleteLesson(lesson.id)}>
              Завершить
            </button>
          )}
          <button className={controls.smallButton} onClick={() => onTogglePaid(lesson.id)}>
            {lesson.isPaid ? 'Не опл.' : 'Оплачено'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <section className={styles.grid}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>Ближайшие уроки</div>
        {upcomingLessons.length === 0 && <p className={styles.muted}>Нет запланированных уроков</p>}
        {upcomingLessons.map((lesson) => renderLessonRow(lesson))}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>Быстрые действия</div>
        <div className={styles.actionsRow}>
          <button className={controls.secondaryButton} onClick={onAddStudent}>
            Добавить ученика
          </button>
          <button className={controls.secondaryButton} onClick={onCreateLesson}>
            Создать урок
          </button>
          <button className={controls.secondaryButton} onClick={onRemindHomework}>
            Напомнить о ДЗ
          </button>
        </div>
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{linkedStudents.length}</div>
            <div className={styles.statLabel}>Ученики</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{unpaidLessons}</div>
            <div className={styles.statLabel}>Неоплачено</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{pendingHomeworks.filter((hw) => !hw.isDone).length}</div>
            <div className={styles.statLabel}>Домашки</div>
          </div>
        </div>
      </div>
    </section>
  );
};

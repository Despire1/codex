import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { FC } from 'react';
import styles from './UnpaidLessonsPopoverContent.module.css';

export interface UnpaidStudentGroup {
  studentId: number;
  studentName: string;
  total: number;
  lessons: { id: number; startAt: string }[];
}

interface UnpaidLessonsPopoverContentProps {
  groups: UnpaidStudentGroup[];
  onOpenStudent: (studentId: number) => void;
}

export const UnpaidLessonsPopoverContent: FC<UnpaidLessonsPopoverContentProps> = ({ groups, onOpenStudent }) => {
  return (
    <div className={styles.root}>
      <div className={styles.title}>Неоплаченные занятия</div>
      {groups.length === 0 ? (
        <div className={styles.empty}>Нет неоплаченных занятий</div>
      ) : (
        <div className={styles.list}>
          {groups.map((group) => {
            const lessonCount = group.lessons.length;
            const visibleLessons = group.lessons.slice(0, 3);
            const remaining = lessonCount - visibleLessons.length;

            return (
              <div key={group.studentId} className={styles.group}>
                <div className={styles.groupHeader}>
                  <div className={styles.groupName}>{group.studentName}</div>
                  <div className={styles.groupMeta}>
                    {lessonCount} занятий · {group.total} ₽
                  </div>
                </div>
                <div className={styles.groupLessons}>
                  {visibleLessons.map((lesson) => (
                    <div key={lesson.id} className={styles.lessonRow}>
                      {format(parseISO(lesson.startAt), 'd MMM, HH:mm', { locale: ru })}
                    </div>
                  ))}
                  {remaining > 0 && <div className={styles.lessonMore}>и ещё {remaining}</div>}
                </div>
                <button type="button" className={styles.openStudent} onClick={() => onOpenStudent(group.studentId)}>
                  Открыть ученика
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

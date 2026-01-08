import { formatInTimeZone } from '../../../shared/lib/timezoneDates';
import { ru } from 'date-fns/locale';
import { FC } from 'react';
import { pluralizeRu } from '../../../shared/lib/pluralizeRu';
import styles from './UnpaidLessonsPopoverContent.module.css';
import { useTimeZone } from '../../../shared/lib/timezoneContext';

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
  const timeZone = useTimeZone();
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
                    {pluralizeRu(lessonCount, { one: 'занятие', few: 'занятия', many: 'занятий' })} · {group.total} ₽
                  </div>
                </div>
                <div className={styles.groupLessons}>
                  {visibleLessons.map((lesson) => (
                    <div key={lesson.id} className={styles.lessonRow}>
                      {formatInTimeZone(lesson.startAt, 'd MMM, HH:mm', { locale: ru, timeZone })}
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

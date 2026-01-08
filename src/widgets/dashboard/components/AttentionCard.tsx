import { formatInTimeZone } from '../../../shared/lib/timezoneDates';
import { ru } from 'date-fns/locale';
import { FC } from 'react';
import { Lesson } from '../../../entities/types';
import { pluralizeRu } from '../../../shared/lib/pluralizeRu';
import controls from '../../../shared/styles/controls.module.css';
import styles from './AttentionCard.module.css';
import { useTimeZone } from '../../../shared/lib/timezoneContext';

export interface AttentionItem {
  id: string;
  lesson: Lesson;
  studentId: number;
  studentName: string;
  needsCompletion: boolean;
  needsPayment: boolean;
}

interface AttentionCardProps {
  items: AttentionItem[];
  isOpen: boolean;
  onToggle: () => void;
  onCompleteLesson: (lessonId: number) => void;
  onTogglePaid: (lessonId: number, studentId?: number) => void;
  className?: string;
}

export const AttentionCard: FC<AttentionCardProps> = ({
  items,
  isOpen,
  onToggle,
  onCompleteLesson,
  onTogglePaid,
  className,
}) => {
  const timeZone = useTimeZone();
  return (
    <div className={`${styles.root} ${className ?? ''}`.trim()}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <div className={styles.title}>Требует внимания</div>
          <span className={styles.badge}>Важно</span>
        </div>
        <button type="button" className={`${controls.smallButton} ${styles.toggle}`} onClick={onToggle}>
          {isOpen ? 'Скрыть' : 'Показать'}
        </button>
      </div>
      <div className={styles.summary}>
        <div className={styles.summaryMain}>
          {pluralizeRu(items.length, { one: 'занятие', few: 'занятия', many: 'занятий' })} без действий
        </div>
        <div className={styles.summaryNote}>Не отмечено проведение или оплата</div>
      </div>
      {isOpen && (
        <div className={styles.list}>
          {items.map((item) => {
            const timeLabel = formatInTimeZone(item.lesson.startAt, 'd MMM, HH:mm', { locale: ru, timeZone });
            const shouldUseParticipant = (item.lesson.participants?.length ?? 0) > 0;

            return (
              <div key={item.id} className={styles.item}>
                <div className={styles.itemInfo}>
                  <div className={styles.itemStudent}>{item.studentName}</div>
                  <div className={styles.itemMeta}>
                    {timeLabel} · {item.lesson.durationMinutes} мин
                  </div>
                </div>
                <div className={styles.itemActions}>
                  {item.needsCompletion && (
                    <button
                      type="button"
                      className={controls.smallButton}
                      onClick={() => onCompleteLesson(item.lesson.id)}
                    >
                      Отметить проведённым
                    </button>
                  )}
                  {item.needsPayment && (
                    <button
                      type="button"
                      className={controls.smallButton}
                      onClick={() =>
                        onTogglePaid(item.lesson.id, shouldUseParticipant ? item.studentId : undefined)
                      }
                    >
                      Отметить оплату
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

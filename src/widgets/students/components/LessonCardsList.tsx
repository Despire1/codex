import { FC } from 'react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { MoreHorizIcon } from '../../../icons/MaterialIcons';
import { Lesson } from '../../../entities/types';
import controls from '../../../shared/styles/controls.module.css';
import { Badge } from '../../../shared/ui/Badge/Badge';
import styles from '../StudentsSection.module.css';
import { SelectedStudent } from '../types';

interface LessonCardsListProps {
  lessons: Lesson[];
  selectedStudent: SelectedStudent | null;
  selectedStudentId: number | null;
  editableLessonStatusId: number | null;
  onStartEditLessonStatus: (lessonId: number) => void;
  onStopEditLessonStatus: () => void;
  onLessonStatusChange: (lessonId: number, status: Lesson['status']) => void;
  onOpenLessonActions: (lessonId: number) => void;
  getLessonStatusLabel: (status: Lesson['status']) => string;
}

const getLessonPriceLabel = (
  lesson: Lesson,
  selectedStudent: SelectedStudent | null,
  selectedStudentId: number | null,
) => {
  const participant = lesson.participants?.find((entry) => entry.studentId === selectedStudentId);
  const hasPrice =
    participant?.price != null || selectedStudent?.pricePerLesson != null || lesson.price != null;
  const resolvedPrice = participant?.price ?? selectedStudent?.pricePerLesson ?? lesson.price ?? 0;
  return hasPrice ? `${resolvedPrice} ₽` : '—';
};

export const LessonCardsList: FC<LessonCardsListProps> = ({
  lessons,
  selectedStudent,
  selectedStudentId,
  editableLessonStatusId,
  onStartEditLessonStatus,
  onStopEditLessonStatus,
  onLessonStatusChange,
  onOpenLessonActions,
  getLessonStatusLabel,
}) => {
  return (
    <div className={styles.lessonCardsList}>
      {lessons.map((lesson) => {
        const participant = lesson.participants?.find((entry) => entry.studentId === selectedStudentId);
        const isPaid = participant?.isPaid ?? lesson.isPaid;
        const isPastLesson = parseISO(lesson.startAt) < new Date();
        const priceLabel = getLessonPriceLabel(lesson, selectedStudent, selectedStudentId);

        return (
          <div key={lesson.id} className={styles.lessonCard}>
            <div className={styles.lessonCardHeader}>
              <div className={styles.lessonCardTitle}>
                {format(parseISO(lesson.startAt), 'd MMM yyyy, HH:mm', { locale: ru })}
              </div>
              <button
                type="button"
                className={controls.iconButton}
                aria-label="Быстрые действия"
                title="Быстрые действия"
                onClick={() => onOpenLessonActions(lesson.id)}
              >
                <MoreHorizIcon width={18} height={18} />
              </button>
            </div>
            <div className={styles.lessonCardBadges}>
              {editableLessonStatusId === lesson.id ? (
                <select
                  className={`${styles.lessonStatusSelect} ${styles.lessonStatusSelectCompact}`}
                  value={lesson.status}
                  autoFocus
                  onChange={(event) => onLessonStatusChange(lesson.id, event.target.value as Lesson['status'])}
                  onBlur={onStopEditLessonStatus}
                >
                  {!isPastLesson && <option value="SCHEDULED">Запланирован</option>}
                  <option value="COMPLETED">Проведён</option>
                  <option value="CANCELED">Отменён</option>
                </select>
              ) : (
                <button
                  type="button"
                  className={`${styles.lessonStatusTrigger} ${styles.lessonStatusChip}`}
                  onClick={() => onStartEditLessonStatus(lesson.id)}
                >
                  {getLessonStatusLabel(lesson.status)}
                </button>
              )}
              <Badge
                label={isPaid ? 'Оплачено' : 'Не оплачено'}
                variant={isPaid ? 'paid' : 'unpaid'}
                className={`${styles.paymentBadge} ${styles.lessonCardBadge}`}
              />
            </div>
            <div className={styles.lessonCardMeta}>
              <div className={styles.lessonCardMetaItem}>
                <span>Длительность:</span> {lesson.durationMinutes} мин
              </div>
              <div className={`${styles.lessonCardMetaItem} ${styles.lessonCardPrice}`}>
                <span>Цена:</span> {priceLabel}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

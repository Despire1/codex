import { FC } from 'react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import {
  DeleteOutlineIcon,
  DoneOutlinedIcon,
  EventRepeatOutlinedIcon,
  PaidOutlinedIcon,
} from '../../../icons/MaterialIcons';
import { Lesson } from '../../../entities/types';
import controls from '../../../shared/styles/controls.module.css';
import { Badge } from '../../../shared/ui/Badge/Badge';
import styles from '../StudentsSection.module.css';
import { SelectedStudent } from '../types';

interface LessonsTabProps {
  studentLessons: Lesson[];
  selectedStudent: SelectedStudent | null;
  selectedStudentId: number | null;
  editableLessonStatusId: number | null;
  onStartEditLessonStatus: (lessonId: number) => void;
  onStopEditLessonStatus: () => void;
  onLessonStatusChange: (lessonId: number, status: Lesson['status']) => void;
  onCreateLesson: (studentId?: number) => void;
  onCompleteLesson: (lessonId: number) => void;
  onTogglePaid: (lessonId: number, studentId?: number) => void;
  onEditLesson: (lesson: Lesson) => void;
  onDeleteLesson: (lessonId: number) => void;
  getLessonStatusLabel: (status: Lesson['status']) => string;
}

export const LessonsTab: FC<LessonsTabProps> = ({
  studentLessons,
  selectedStudent,
  selectedStudentId,
  editableLessonStatusId,
  onStartEditLessonStatus,
  onStopEditLessonStatus,
  onLessonStatusChange,
  onCreateLesson,
  onCompleteLesson,
  onTogglePaid,
  onEditLesson,
  onDeleteLesson,
  getLessonStatusLabel,
}) => {
  return (
    <div className={styles.card}>
      <div className={styles.homeworkHeader}>
        <div>
          <div className={styles.priceLabel}>Занятия</div>
          <div className={styles.subtleLabel}>Список уроков для ученика</div>
        </div>
        <button
          className={controls.secondaryButton}
          onClick={() => onCreateLesson(selectedStudentId ?? undefined)}
        >
          + Урок
        </button>
      </div>

      <div className={styles.lessonTableWrapper}>
        {studentLessons.length ? (
          <TableContainer className={styles.lessonTableContainer}>
            <Table size="small" aria-label="Список занятий ученика">
              <TableHead>
                <TableRow>
                  <TableCell>Дата и время</TableCell>
                  <TableCell>Длительность</TableCell>
                  <TableCell>Статус занятия</TableCell>
                  <TableCell>Статус оплаты</TableCell>
                  <TableCell align="right">Цена</TableCell>
                  <TableCell align="right">Быстрые действия</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {studentLessons.map((lesson) => {
                  const participant = lesson.participants?.find((p) => p.studentId === selectedStudentId);
                  const resolvedPrice =
                    participant?.price ?? selectedStudent?.pricePerLesson ?? lesson.price ?? 0;
                  const isPaid = participant?.isPaid ?? lesson.isPaid;

                  return (
                    <TableRow key={lesson.id} hover className={styles.lessonTableRow}>
                      <TableCell>
                        <div className={styles.lessonDateCell}>
                          <div className={styles.lessonTitle}>
                            {format(parseISO(lesson.startAt), 'd MMM yyyy, HH:mm', { locale: ru })}
                          </div>
                          <div className={styles.lessonMeta}>#{lesson.id}</div>
                        </div>
                      </TableCell>
                      <TableCell className={styles.monoCell}>{lesson.durationMinutes} мин</TableCell>
                      <TableCell>
                        <div className={styles.lessonStatusRow}>
                          <span className={styles.metaLabel}>Статус:</span>
                          {editableLessonStatusId === lesson.id ? (
                            <select
                              className={styles.lessonStatusSelect}
                              value={lesson.status}
                              autoFocus
                              onChange={(event) =>
                                onLessonStatusChange(lesson.id, event.target.value as Lesson['status'])
                              }
                              onBlur={onStopEditLessonStatus}
                            >
                              <option value="SCHEDULED">Запланирован</option>
                              <option value="COMPLETED">Проведён</option>
                              <option value="CANCELED">Отменён</option>
                            </select>
                          ) : (
                            <button
                              type="button"
                              className={styles.lessonStatusTrigger}
                              onClick={() => onStartEditLessonStatus(lesson.id)}
                            >
                              {getLessonStatusLabel(lesson.status)}
                            </button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          label={isPaid ? 'Оплачено' : 'Не оплачено'}
                          variant={isPaid ? 'paid' : 'unpaid'}
                          className={styles.paymentBadge}
                        />
                      </TableCell>
                      <TableCell align="right" className={styles.monoCell}>
                        {resolvedPrice} ₽
                      </TableCell>
                      <TableCell align="right">
                        <div className={styles.iconActions}>
                          <button
                            className={controls.iconButton}
                            aria-label="Отметить проведённым"
                            title="Отметить проведённым"
                            onClick={() => onCompleteLesson(lesson.id)}
                          >
                            <DoneOutlinedIcon width={18} height={18} />
                          </button>
                          <button
                            className={controls.iconButton}
                            aria-label="Отметить оплату"
                            title="Отметить оплату"
                            onClick={() => onTogglePaid(lesson.id, selectedStudentId ?? undefined)}
                          >
                            <PaidOutlinedIcon width={18} height={18} />
                          </button>
                          <button
                            className={controls.iconButton}
                            aria-label="Перенести"
                            title="Перенести"
                            onClick={() => onEditLesson(lesson)}
                          >
                            <EventRepeatOutlinedIcon width={18} height={18} />
                          </button>
                          <button
                            className={controls.iconButton}
                            aria-label="Удалить"
                            title="Удалить"
                            onClick={() => onDeleteLesson(lesson.id)}
                          >
                            <DeleteOutlineIcon width={18} height={18} />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <div className={styles.emptyState}>
            <p>Пока нет занятий. Добавьте урок.</p>
            <button
              className={controls.secondaryButton}
              onClick={() => onCreateLesson(selectedStudentId ?? undefined)}
            >
              + Урок
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { MoreHorizIcon } from '../../../icons/MaterialIcons';
import { Lesson, LessonDateRange, LessonPaymentFilter, LessonStatusFilter } from '../../../entities/types';
import controls from '../../../shared/styles/controls.module.css';
import { Badge } from '../../../shared/ui/Badge/Badge';
import styles from '../StudentsSection.module.css';
import { LessonQuickActionsPopover } from './LessonQuickActionsPopover';
import { LessonDeleteConfirmModal } from './LessonDeleteConfirmModal';
import { SelectedStudent } from '../types';
import { LessonFiltersPopover } from './LessonFiltersPopover';

interface LessonsTabProps {
  studentLessons: Lesson[];
  selectedStudent: SelectedStudent | null;
  selectedStudentId: number | null;
  editableLessonStatusId: number | null;
  lessonPaymentFilter: LessonPaymentFilter;
  lessonStatusFilter: LessonStatusFilter;
  lessonDateRange: LessonDateRange;
  lessonListLoading: boolean;
  onLessonPaymentFilterChange: (filter: LessonPaymentFilter) => void;
  onLessonStatusFilterChange: (filter: LessonStatusFilter) => void;
  onLessonDateRangeChange: (range: LessonDateRange) => void;
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
  lessonPaymentFilter,
  lessonStatusFilter,
  lessonDateRange,
  lessonListLoading,
  onLessonPaymentFilterChange,
  onLessonStatusFilterChange,
  onLessonDateRangeChange,
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
  const [openLessonMenuId, setOpenLessonMenuId] = useState<number | null>(null);
  const [lessonToDelete, setLessonToDelete] = useState<Lesson | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!datePickerOpen) return undefined;

    const handleOutside = (event: MouseEvent) => {
      if (!datePickerRef.current) return;
      if (!datePickerRef.current.contains(event.target as Node)) {
        setDatePickerOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [datePickerOpen]);

  const parseDateValue = (value?: string) => {
    if (!value) return undefined;
    const parsed = parseISO(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  };

  const selectedRange = useMemo(
    () => ({
      from: parseDateValue(lessonDateRange.from),
      to: parseDateValue(lessonDateRange.to),
    }),
    [lessonDateRange.from, lessonDateRange.to],
  );

  const formatRangeLabel = () => {
    const from = selectedRange.from;
    const to = selectedRange.to;
    if (from && to) {
      return `${format(from, 'dd.MM.yyyy')} — ${format(to, 'dd.MM.yyyy')}`;
    }
    if (from) {
      return `С ${format(from, 'dd.MM.yyyy')}`;
    }
    if (to) {
      return `До ${format(to, 'dd.MM.yyyy')}`;
    }
    return 'Все';
  };

  const handleCloseLessonMenu = useCallback(() => {
    setOpenLessonMenuId(null);
  }, []);

  const handleCloseDeleteModal = useCallback(() => {
    setLessonToDelete(null);
  }, []);

  return (
    <div className={`${styles.card} ${styles.tabCard}`}>
      <div className={styles.homeworkHeader}>
        <div>
          <div className={styles.priceLabel}>Занятия</div>
          <div className={styles.subtleLabel}>Список уроков для ученика</div>
        </div>
        <div className={styles.lessonHeaderActions}>
          <LessonFiltersPopover
            lessonPaymentFilter={lessonPaymentFilter}
            lessonStatusFilter={lessonStatusFilter}
            lessonDateRange={lessonDateRange}
            onLessonPaymentFilterChange={onLessonPaymentFilterChange}
            onLessonStatusFilterChange={onLessonStatusFilterChange}
            onLessonDateRangeChange={onLessonDateRangeChange}
          />
          <button
            className={controls.primaryButton}
            onClick={() => onCreateLesson(selectedStudentId ?? undefined)}
          >
            + Урок
          </button>
        </div>
      </div>

      <div className={styles.lessonFilters}>
        <div className={styles.lessonFilterGroup}>
          <span className={styles.lessonFilterLabel}>Оплата:</span>
          {[
            { id: 'all', label: 'Все' },
            { id: 'paid', label: 'Оплачены' },
            { id: 'unpaid', label: 'Не оплачены' },
          ].map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={`${styles.filterChip} ${
                lessonPaymentFilter === filter.id ? styles.activeChip : ''
              }`}
              onClick={() => onLessonPaymentFilterChange(filter.id as LessonPaymentFilter)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className={styles.lessonFilterGroup}>
          <span className={styles.lessonFilterLabel}>Статус:</span>
          {[
            { id: 'all', label: 'Все' },
            { id: 'completed', label: 'Проведены' },
            { id: 'not_completed', label: 'Не проведены' },
          ].map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={`${styles.filterChip} ${
                lessonStatusFilter === filter.id ? styles.activeChip : ''
              }`}
              onClick={() => onLessonStatusFilterChange(filter.id as LessonStatusFilter)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className={styles.lessonDateFilter}>
          <span className={styles.lessonFilterLabel}>Период:</span>
          <div className={styles.lessonDatePicker} ref={datePickerRef}>
            <button
              type="button"
              className={styles.lessonDateButton}
              onClick={() => setDatePickerOpen((prev) => !prev)}
            >
              {formatRangeLabel()}
            </button>
            {(lessonDateRange.from || lessonDateRange.to) && (
              <button
                type="button"
                className={styles.lessonDateClear}
                onClick={() =>
                  onLessonDateRangeChange({
                    ...lessonDateRange,
                    from: '',
                    to: '',
                  })
                }
                aria-label="Сбросить период"
              >
                ×
              </button>
            )}
            {datePickerOpen && (
              <div className={styles.lessonDatePopover}>
                <DayPicker
                  mode="range"
                  selected={selectedRange}
                  onSelect={(range) => {
                    onLessonDateRangeChange({
                      ...lessonDateRange,
                      from: range?.from ? format(range.from, 'yyyy-MM-dd') : '',
                      to: range?.to ? format(range.to, 'yyyy-MM-dd') : '',
                    });
                    if (range?.from && range?.to) {
                      setDatePickerOpen(false);
                    }
                  }}
                  weekStartsOn={1}
                  locale={ru}
                  numberOfMonths={2}
                />
              </div>
            )}
          </div>
          <div className={styles.lessonTimeFields}>
            <label className={styles.lessonTimeField}>
              <span>С</span>
              <input
                type="time"
                value={lessonDateRange.fromTime}
                onChange={(event) =>
                  onLessonDateRangeChange({ ...lessonDateRange, fromTime: event.target.value })
                }
                className={styles.lessonTimeInput}
              />
            </label>
            <label className={styles.lessonTimeField}>
              <span>По</span>
              <input
                type="time"
                value={lessonDateRange.toTime}
                onChange={(event) =>
                  onLessonDateRangeChange({ ...lessonDateRange, toTime: event.target.value })
                }
                className={styles.lessonTimeInput}
              />
            </label>
          </div>
        </div>
      </div>

      <div className={`${styles.lessonTableWrapper} ${styles.tabContentScroll}`}>
        {lessonListLoading && studentLessons.length === 0 ? (
          <div className={styles.listLoader}>
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className={`${styles.skeletonCard} ${styles.skeletonLessonRow}`} />
            ))}
          </div>
        ) : studentLessons.length ? (
          <TableContainer className={styles.lessonTableContainer}>
            {lessonListLoading && (
              <div className={styles.loadingRow}>Обновляем список...</div>
            )}
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
                        <div className={styles.moreActionsWrapper}>
                          <button
                            className={controls.iconButton}
                            aria-label="Быстрые действия"
                            title="Быстрые действия"
                            onClick={() =>
                              setOpenLessonMenuId((prev) => (prev === lesson.id ? null : lesson.id))
                            }
                          >
                            <MoreHorizIcon width={18} height={18} />
                          </button>
                          {openLessonMenuId === lesson.id && (
                            <LessonQuickActionsPopover
                              onClose={handleCloseLessonMenu}
                              actions={[
                                {
                                  label: 'Отметить проведённым',
                                  onClick: () => onCompleteLesson(lesson.id),
                                },
                                {
                                  label: 'Отметить оплату',
                                  onClick: () => onTogglePaid(lesson.id, selectedStudentId ?? undefined),
                                },
                                {
                                  label: 'Перенести',
                                  onClick: () => onEditLesson(lesson),
                                },
                                {
                                  label: 'Удалить',
                                  onClick: () => setLessonToDelete(lesson),
                                  variant: 'danger',
                                },
                              ]}
                            />
                          )}
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
      <LessonDeleteConfirmModal
        open={Boolean(lessonToDelete)}
        lessonId={lessonToDelete?.id}
        onClose={handleCloseDeleteModal}
        onConfirm={() => {
          if (!lessonToDelete) return;
          onDeleteLesson(lessonToDelete.id);
          setLessonToDelete(null);
        }}
      />
    </div>
  );
};

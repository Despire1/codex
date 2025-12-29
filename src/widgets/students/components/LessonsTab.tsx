import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { FilterAltOutlinedIcon, MoreHorizIcon } from '../../../icons/MaterialIcons';
import {
  Lesson,
  LessonDateRange,
  LessonPaymentFilter,
  LessonSortOrder,
  LessonStatusFilter,
} from '../../../entities/types';
import controls from '../../../shared/styles/controls.module.css';
import { Badge } from '../../../shared/ui/Badge/Badge';
import { AdaptivePopover } from '../../../shared/ui/AdaptivePopover/AdaptivePopover';
import { BottomSheet } from '../../../shared/ui/BottomSheet/BottomSheet';
import styles from '../StudentsSection.module.css';
import { LessonQuickActionsPopover } from './LessonQuickActionsPopover';
import { LessonDeleteConfirmModal } from './LessonDeleteConfirmModal';
import { SelectedStudent } from '../types';
import { LessonFiltersPopover } from './LessonFiltersPopover';
import { LessonCardsList } from './LessonCardsList';
import { LessonFiltersSheet } from './LessonFiltersSheet';

interface LessonsTabProps {
  studentLessons: Lesson[];
  selectedStudent: SelectedStudent | null;
  selectedStudentId: number | null;
  editableLessonStatusId: number | null;
  lessonPaymentFilter: LessonPaymentFilter;
  lessonStatusFilter: LessonStatusFilter;
  lessonDateRange: LessonDateRange;
  lessonListLoading: boolean;
  lessonSortOrder: LessonSortOrder;
  onLessonPaymentFilterChange: (filter: LessonPaymentFilter) => void;
  onLessonStatusFilterChange: (filter: LessonStatusFilter) => void;
  onLessonDateRangeChange: (range: LessonDateRange) => void;
  onLessonSortOrderChange: (order: LessonSortOrder) => void;
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
  lessonSortOrder,
  onLessonPaymentFilterChange,
  onLessonStatusFilterChange,
  onLessonDateRangeChange,
  onLessonSortOrderChange,
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
  const [openLessonSheetId, setOpenLessonSheetId] = useState<number | null>(null);
  const [lessonToDelete, setLessonToDelete] = useState<Lesson | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };

    setIsMobile(mediaQuery.matches);
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else {
      mediaQuery.addListener(handleChange);
    }

    return () => {
      if (mediaQuery.addEventListener) {
        mediaQuery.removeEventListener('change', handleChange);
      } else {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, []);

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

  const sortedLessons = useMemo(() => {
    const sorted = [...studentLessons].sort((a, b) => a.startAt.localeCompare(b.startAt));
    return lessonSortOrder === 'desc' ? sorted.reverse() : sorted;
  }, [lessonSortOrder, studentLessons]);

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

  const handleCloseLessonSheet = useCallback(() => {
    setOpenLessonSheetId(null);
  }, []);

  const handleCloseDeleteModal = useCallback(() => {
    setLessonToDelete(null);
  }, []);

  const handleToggleDateSort = useCallback(() => {
    onLessonSortOrderChange(lessonSortOrder === 'asc' ? 'desc' : 'asc');
  }, [lessonSortOrder, onLessonSortOrderChange]);

  const isFilterActive = useMemo(() => {
    return (
      lessonPaymentFilter !== 'all' ||
      lessonStatusFilter !== 'all' ||
      Boolean(lessonDateRange.from) ||
      Boolean(lessonDateRange.to) ||
      lessonDateRange.fromTime !== '00:00' ||
      lessonDateRange.toTime !== '23:59'
    );
  }, [
    lessonDateRange.from,
    lessonDateRange.fromTime,
    lessonDateRange.to,
    lessonDateRange.toTime,
    lessonPaymentFilter,
    lessonStatusFilter,
  ]);

  const filterSummary = useMemo(() => {
    const chunks: string[] = [];
    if (lessonPaymentFilter !== 'all') {
      chunks.push(`Оплата: ${lessonPaymentFilter === 'paid' ? 'оплачены' : 'не оплачены'}`);
    }
    if (lessonStatusFilter !== 'all') {
      chunks.push(`Статус: ${lessonStatusFilter === 'completed' ? 'проведены' : 'не проведены'}`);
    }
    if (lessonDateRange.from || lessonDateRange.to) {
      chunks.push(`Период: ${formatRangeLabel()}`);
    }
    if (lessonSortOrder === 'asc') {
      chunks.push('Сортировка: старые сверху');
    }
    return chunks.join(' · ');
  }, [lessonDateRange.from, lessonDateRange.to, lessonPaymentFilter, lessonSortOrder, lessonStatusFilter]);

  const clearFilters = () => {
    onLessonPaymentFilterChange('all');
    onLessonStatusFilterChange('all');
    onLessonDateRangeChange({
      from: '',
      to: '',
      fromTime: '00:00',
      toTime: '23:59',
    });
    onLessonSortOrderChange('desc');
  };

  const actionSheetLesson = useMemo(
    () => sortedLessons.find((lesson) => lesson.id === openLessonSheetId) ?? null,
    [openLessonSheetId, sortedLessons],
  );

  const lessonActions = useMemo(() => {
    if (!actionSheetLesson) return [];
    return [
      {
        label: 'Отметить проведённым',
        onClick: () => onCompleteLesson(actionSheetLesson.id),
      },
      {
        label: 'Отметить оплату',
        onClick: () => onTogglePaid(actionSheetLesson.id, selectedStudentId ?? undefined),
      },
      {
        label: 'Перенести',
        onClick: () => onEditLesson(actionSheetLesson),
      },
      {
        label: 'Удалить',
        onClick: () => setLessonToDelete(actionSheetLesson),
        variant: 'danger' as const,
      },
    ];
  }, [actionSheetLesson, onCompleteLesson, onEditLesson, onTogglePaid, selectedStudentId]);

  return (
    <div className={`${styles.card} ${styles.tabCard}`}>
      <div className={styles.homeworkHeader}>
        <div className={styles.lessonsActions}>
          <div className={styles.priceLabel}>Занятия</div>
          {isMobile ? (
            <button
              type="button"
              className={controls.iconButton}
              onClick={() => setFiltersSheetOpen(true)}
              aria-label="Фильтры списка занятий"
            >
              <span className={styles.filterIconWrapper}>
                <FilterAltOutlinedIcon width={18} height={18} />
                {isFilterActive && <span className={styles.filterDot} aria-hidden />}
              </span>
            </button>
          ) : (
            <LessonFiltersPopover
              lessonPaymentFilter={lessonPaymentFilter}
              lessonStatusFilter={lessonStatusFilter}
              lessonDateRange={lessonDateRange}
              onLessonPaymentFilterChange={onLessonPaymentFilterChange}
              onLessonStatusFilterChange={onLessonStatusFilterChange}
              onLessonDateRangeChange={onLessonDateRangeChange}
            />
          )}
        </div>
        {!isMobile && (
          <div className={styles.lessonHeaderActions}>
            <button
              className={controls.primaryButton}
              onClick={() => onCreateLesson(selectedStudentId ?? undefined)}
            >
              + Урок
            </button>
          </div>
        )}
      </div>
      {isMobile && isFilterActive && (
        <div className={styles.lessonFilterSummary}>
          <span>{`Фильтры: ${filterSummary || 'активны'}`}</span>
          <button type="button" className={styles.lessonFilterClear} onClick={clearFilters}>
            Очистить
          </button>
        </div>
      )}

      <div className={`${styles.lessonTableWrapper} ${styles.tabContentScroll}`}>
        {lessonListLoading && studentLessons.length === 0 ? (
          <div className={styles.listLoader}>
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className={`${styles.skeletonCard} ${styles.skeletonLessonRow} ${
                  isMobile ? styles.skeletonLessonCard : ''
                }`}
              />
            ))}
          </div>
        ) : studentLessons.length ? (
          isMobile ? (
            <LessonCardsList
              lessons={sortedLessons}
              selectedStudent={selectedStudent}
              selectedStudentId={selectedStudentId}
              editableLessonStatusId={editableLessonStatusId}
              onStartEditLessonStatus={onStartEditLessonStatus}
              onStopEditLessonStatus={onStopEditLessonStatus}
              onLessonStatusChange={onLessonStatusChange}
              onOpenLessonActions={(lessonId) => setOpenLessonSheetId(lessonId)}
              getLessonStatusLabel={getLessonStatusLabel}
            />
          ) : (
            <TableContainer className={styles.lessonTableContainer}>
              {lessonListLoading && (
                <div className={styles.loadingRow}>Обновляем список...</div>
              )}
              <Table size="small" aria-label="Список занятий ученика">
                <TableHead>
                  <TableRow>
                    <TableCell>
                      <button
                        type="button"
                        className={styles.lessonSortButton}
                        onClick={handleToggleDateSort}
                        aria-label={`Сортировать по дате ${lessonSortOrder === 'asc' ? 'по убыванию' : 'по возрастанию'}`}
                      >
                        <span>Дата и время</span>
                        <span className={styles.lessonSortIcon} aria-hidden>
                          {lessonSortOrder === 'asc' ? '↑' : '↓'}
                        </span>
                      </button>
                    </TableCell>
                    <TableCell>Длительность</TableCell>
                    <TableCell>Статус занятия</TableCell>
                    <TableCell>Статус оплаты</TableCell>
                    <TableCell align="right">Цена</TableCell>
                    <TableCell align="right">Быстрые действия</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedLessons.map((lesson) => {
                    const participant = lesson.participants?.find((p) => p.studentId === selectedStudentId);
                    const hasPrice =
                      participant?.price != null ||
                      selectedStudent?.pricePerLesson != null ||
                      lesson.price != null;
                    const resolvedPrice =
                      participant?.price ?? selectedStudent?.pricePerLesson ?? lesson.price ?? 0;
                    const isPaid = participant?.isPaid ?? lesson.isPaid;
                    const isPastLesson = parseISO(lesson.startAt) < new Date();

                    return (
                      <TableRow key={lesson.id} hover className={styles.lessonTableRow}>
                        <TableCell>
                          <div className={styles.lessonDateCell}>
                            <div className={styles.lessonTitle}>
                              {format(parseISO(lesson.startAt), 'd MMM yyyy, HH:mm', { locale: ru })}
                            </div>
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
                                {!isPastLesson && <option value="SCHEDULED">Запланирован</option>}
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
                          {hasPrice ? `${resolvedPrice} ₽` : '—'}
                        </TableCell>
                        <TableCell align="right">
                          <div className={styles.moreActionsWrapper}>
                            <AdaptivePopover
                              isOpen={openLessonMenuId === lesson.id}
                              onClose={handleCloseLessonMenu}
                              side="bottom"
                              align="end"
                              trigger={
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
                              }
                            >
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
                            </AdaptivePopover>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )
        ) : (
          <div className={styles.emptyState}>
            {isFilterActive ? (
              <>
                <p>По выбранным фильтрам ничего не найдено</p>
                <button type="button" className={controls.secondaryButton} onClick={clearFilters}>
                  Сбросить фильтры
                </button>
              </>
            ) : (
              <>
                <p>Пока нет занятий. Добавьте урок.</p>
                <button
                  className={controls.secondaryButton}
                  onClick={() => onCreateLesson(selectedStudentId ?? undefined)}
                >
                  + Урок
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {isMobile && (
        <button
          type="button"
          className={styles.lessonFab}
          onClick={() => onCreateLesson(selectedStudentId ?? undefined)}
        >
          + Урок
        </button>
      )}
      <LessonFiltersSheet
        open={filtersSheetOpen}
        lessonPaymentFilter={lessonPaymentFilter}
        lessonStatusFilter={lessonStatusFilter}
        lessonDateRange={lessonDateRange}
        lessonSortOrder={lessonSortOrder}
        onApply={({ lessonPaymentFilter, lessonStatusFilter, lessonDateRange, lessonSortOrder }) => {
          onLessonPaymentFilterChange(lessonPaymentFilter);
          onLessonStatusFilterChange(lessonStatusFilter);
          onLessonDateRangeChange(lessonDateRange);
          onLessonSortOrderChange(lessonSortOrder);
        }}
        onClose={() => setFiltersSheetOpen(false)}
      />
      <BottomSheet open={Boolean(openLessonSheetId)} onClose={handleCloseLessonSheet}>
        {actionSheetLesson && (
          <div className={styles.lessonActionSheet}>
            <div className={styles.lessonActionSheetHeader}>
              {format(parseISO(actionSheetLesson.startAt), 'd MMM yyyy, HH:mm', { locale: ru })}
            </div>
            <div className={styles.lessonActionSheetButtons}>
              {lessonActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className={`${styles.lessonActionSheetButton} ${
                    action.variant === 'danger' ? styles.lessonActionSheetDanger : ''
                  }`}
                  onClick={() => {
                    action.onClick();
                    handleCloseLessonSheet();
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </BottomSheet>
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

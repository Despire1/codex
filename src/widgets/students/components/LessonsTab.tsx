import { FC, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { format, startOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { LinkIcon, MoreHorizIcon } from '../../../icons/MaterialIcons';
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
import styles from '../StudentsSection.module.css';
import { LessonQuickActionsPopover } from './LessonQuickActionsPopover';
import { LessonDeleteConfirmModal } from './LessonDeleteConfirmModal';
import { SelectedStudent } from '../types';
import { LessonFiltersPopover } from './LessonFiltersPopover';
import { LessonActionsSheet } from './LessonActionsSheet';
import { useTimeZone } from '../../../shared/lib/timezoneContext';
import { formatInTimeZone, toUtcDateFromDate, toZonedDate } from '../../../shared/lib/timezoneDates';

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
  autoConfirmLessons: boolean;
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
  autoConfirmLessons,
}) => {
  const [openLessonMenuId, setOpenLessonMenuId] = useState<number | null>(null);
  const [lessonToDelete, setLessonToDelete] = useState<Lesson | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [isLessonsMobile, setIsLessonsMobile] = useState(false);
  const [activeLessonActions, setActiveLessonActions] = useState<Lesson | null>(null);
  const [isLessonSheetOpen, setIsLessonSheetOpen] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const timeZone = useTimeZone();

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const handleChange = (event: MediaQueryListEvent) => {
      setIsLessonsMobile(event.matches);
    };

    setIsLessonsMobile(mediaQuery.matches);
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

  useEffect(() => {
    if (isLessonSheetOpen) return undefined;
    if (!activeLessonActions) return undefined;
    const timer = window.setTimeout(() => {
      setActiveLessonActions(null);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [activeLessonActions, isLessonSheetOpen]);

  const parseDateValue = (value?: string) => {
    if (!value) return undefined;
    const parsed = toUtcDateFromDate(value, timeZone);
    return Number.isNaN(parsed.getTime()) ? undefined : toZonedDate(parsed, timeZone);
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

  const handleCloseDeleteModal = useCallback(() => {
    setLessonToDelete(null);
  }, []);

  const handleToggleDateSort = useCallback(() => {
    onLessonSortOrderChange(lessonSortOrder === 'asc' ? 'desc' : 'asc');
  }, [lessonSortOrder, onLessonSortOrderChange]);

  const getLessonDerivedData = useCallback(
    (lesson: Lesson) => {
      const participant = lesson.participants?.find((p) => p.studentId === selectedStudentId);
      const resolvedPrice = participant?.price ?? selectedStudent?.link.pricePerLesson ?? lesson.price;
      const isPaid = participant?.isPaid ?? lesson.isPaid;
      const lessonDate = startOfDay(toZonedDate(lesson.startAt, timeZone));
      const today = startOfDay(toZonedDate(new Date(), timeZone));
      const isPastLesson = lessonDate.getTime() < today.getTime();
      return { participant, resolvedPrice, isPaid, isPastLesson };
    },
    [selectedStudent?.link.pricePerLesson, selectedStudentId, timeZone],
  );

  const activeLessonDerived = useMemo(
    () => (activeLessonActions ? getLessonDerivedData(activeLessonActions) : null),
    [activeLessonActions, getLessonDerivedData],
  );

  const formatPriceLabel = (price?: number | null) =>
    price === undefined || price === null ? '—' : `${price} ₽`;

  const getRecurrenceLabel = (lesson: Lesson) =>
    lesson.isRecurring || lesson.recurrenceGroupId ? 'Повторяющееся' : 'Одиночное';

  const isAwaitingConfirmation = useCallback(
    (lesson: Lesson) => {
      if (autoConfirmLessons) return false;
      if (lesson.status !== 'SCHEDULED') return false;
      const lessonEnd = new Date(lesson.startAt).getTime() + lesson.durationMinutes * 60_000;
      return lessonEnd < Date.now();
    },
    [autoConfirmLessons],
  );

  const handleOpenMeetingLink = useCallback((event: MouseEvent<HTMLButtonElement>, meetingLink: string) => {
    event.stopPropagation();
    window.open(meetingLink, '_blank', 'noopener,noreferrer');
  }, []);

  const renderMeetingLinkButton = useCallback(
    (lesson: Lesson, className?: string) => {
      if (!lesson.meetingLink) return null;
      return (
        <button
          type="button"
          className={`${styles.lessonMeetingLinkButton} ${className ?? ''}`}
          onClick={(event) => handleOpenMeetingLink(event, lesson.meetingLink as string)}
          aria-label="Открыть ссылку на занятие"
          data-testid={`lesson-item-open-link-${lesson.id}`}
        >
          <LinkIcon width={12} height={12} />
        </button>
      );
    },
    [handleOpenMeetingLink],
  );

  const renderLessonActions = (lesson: Lesson, isPaid: boolean) => {
    if (isLessonsMobile) {
      return (
        <button
          className={controls.iconButton}
          aria-label="Быстрые действия"
          title="Быстрые действия"
          onClick={() => {
            setActiveLessonActions(lesson);
            setIsLessonSheetOpen(true);
          }}
        >
          <MoreHorizIcon width={18} height={18} />
        </button>
      );
    }

    return (
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
            onClick={() => setOpenLessonMenuId((prev) => (prev === lesson.id ? null : lesson.id))}
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
              label: isPaid ? 'Отменить оплату' : 'Отметить оплату',
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
    );
  };

  return (
    <div className={`${styles.card} ${styles.tabCard}`}>
      <div className={styles.homeworkHeader}>
        <div className={styles.lessonsActions}>
          <div className={styles.priceLabel}>Занятия</div>
          <LessonFiltersPopover
              lessonPaymentFilter={lessonPaymentFilter}
              lessonStatusFilter={lessonStatusFilter}
              lessonDateRange={lessonDateRange}
              onLessonPaymentFilterChange={onLessonPaymentFilterChange}
              onLessonStatusFilterChange={onLessonStatusFilterChange}
              onLessonDateRangeChange={onLessonDateRangeChange}
          />
        </div>
        <div className={styles.lessonHeaderActions}>
          <button
            className={controls.primaryButton}
            onClick={() => onCreateLesson(selectedStudentId ?? undefined)}
          >
            + Урок
          </button>
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
          isLessonsMobile ? (
            <div className={styles.lessonCardList}>
              {lessonListLoading && <div className={styles.loadingRow}>Обновляем список...</div>}
              {sortedLessons.map((lesson) => {
                const { resolvedPrice, isPaid, isPastLesson } = getLessonDerivedData(lesson);
                const awaitingConfirmation = isAwaitingConfirmation(lesson);

                return (
                  <article key={lesson.id} className={styles.lessonCard}>
                    <div className={styles.lessonCardHeader}>
                      <div className={styles.lessonCardDate}>
                        <span>{formatInTimeZone(lesson.startAt, 'd MMM yyyy, HH:mm', { locale: ru, timeZone })}</span>
                        {renderMeetingLinkButton(lesson)}
                      </div>
                      <div className={styles.lessonCardActions}>{renderLessonActions(lesson, isPaid)}</div>
                    </div>
                    <div className={styles.lessonCardStatuses}>
                      {editableLessonStatusId === lesson.id ? (
                        <select
                          className={styles.lessonStatusSelectMobile}
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
                          className={styles.lessonStatusChip}
                          onClick={() => onStartEditLessonStatus(lesson.id)}
                        >
                          {getLessonStatusLabel(lesson.status)}
                        </button>
                      )}
                      {awaitingConfirmation && (
                        <Badge
                          label="Ожидает подтверждения"
                          variant="pending"
                          className={styles.lessonPendingBadge}
                        />
                      )}
                      <Badge
                        label={isPaid ? 'Оплачено' : 'Не оплачено'}
                        variant={isPaid ? 'paid' : 'unpaid'}
                        className={styles.lessonPaymentChip}
                        onClick={() => onTogglePaid(lesson.id, selectedStudentId ?? undefined)}
                        title="Отметить оплату"
                      />
                      <span className={styles.lessonRecurrenceTag}>{getRecurrenceLabel(lesson)}</span>
                    </div>
                    <div className={styles.lessonCardMeta}>
                      <div className={styles.lessonCardMetaItem}>
                        <span className={styles.lessonCardMetaLabel}>Длительность</span>
                        <span className={styles.lessonCardMetaValue}>{lesson.durationMinutes} мин</span>
                      </div>
                      <div className={styles.lessonCardMetaItem}>
                        <span className={styles.lessonCardMetaLabel}>Цена</span>
                        <span className={styles.lessonCardMetaValue}>{formatPriceLabel(resolvedPrice)}</span>
                      </div>
                      <div className={styles.lessonCardMetaItem}>
                        <span className={styles.lessonCardMetaLabel}>Тип занятия</span>
                        <span className={styles.lessonCardMetaValue}>{getRecurrenceLabel(lesson)}</span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
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
                    <TableCell>Тип</TableCell>
                    <TableCell>Статус оплаты</TableCell>
                    <TableCell align="right">Цена</TableCell>
                    <TableCell align="right">Быстрые действия</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedLessons.map((lesson) => {
                    const { resolvedPrice, isPaid, isPastLesson } = getLessonDerivedData(lesson);
                    const awaitingConfirmation = isAwaitingConfirmation(lesson);

                    return (
                      <TableRow key={lesson.id} hover className={styles.lessonTableRow}>
                        <TableCell>
                          <div className={styles.lessonDateCell}>
                            <div className={styles.lessonTitleRow}>
                              <div className={styles.lessonTitle}>
                                {formatInTimeZone(lesson.startAt, 'd MMM yyyy, HH:mm', { locale: ru, timeZone })}
                              </div>
                              {renderMeetingLinkButton(lesson, styles.lessonMeetingLinkInline)}
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
                            {awaitingConfirmation && (
                              <Badge
                                label="Ожидает подтверждения"
                                variant="pending"
                                className={styles.lessonPendingBadge}
                              />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={styles.lessonRecurrenceTag}>{getRecurrenceLabel(lesson)}</span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            label={isPaid ? 'Оплачено' : 'Не оплачено'}
                            variant={isPaid ? 'paid' : 'unpaid'}
                            className={styles.paymentBadge}
                            onClick={() => onTogglePaid(lesson.id, selectedStudentId ?? undefined)}
                            title="Отметить оплату"
                          />
                        </TableCell>
                        <TableCell align="right" className={styles.monoCell}>
                          {formatPriceLabel(resolvedPrice)}
                        </TableCell>
                        <TableCell align="right">
                          <div className={styles.moreActionsWrapper}>{renderLessonActions(lesson, isPaid)}</div>
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
      <LessonActionsSheet
        lesson={activeLessonActions}
        isOpen={isLessonSheetOpen}
        isPaid={activeLessonDerived?.isPaid ?? false}
        resolvedPrice={activeLessonDerived?.resolvedPrice}
        onClose={() => setIsLessonSheetOpen(false)}
        onComplete={() => {
          if (!activeLessonActions) return;
          onCompleteLesson(activeLessonActions.id);
        }}
        onTogglePaid={() => {
          if (!activeLessonActions) return;
          onTogglePaid(activeLessonActions.id, selectedStudentId ?? undefined);
        }}
        onEdit={() => {
          if (!activeLessonActions) return;
          onEditLesson(activeLessonActions);
        }}
        onDelete={() => {
          if (!activeLessonActions) return;
          setLessonToDelete(activeLessonActions);
        }}
      />
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

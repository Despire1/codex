import { addDays, addWeeks, endOfDay, format, isSameDay, isWithinInterval, startOfWeek } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { FC, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DndContext, DragOverlay, pointerWithin, useDraggable, useDroppable } from '@dnd-kit/core';
import { isLessonInSeries } from '@/entities/lesson/lib/lessonDetails';
import { resolveLessonCancelActionCopy } from '@/entities/lesson/lib/lessonStatusPresentation';
import type { Lesson, LinkedStudent } from '@/entities/types';
import { useLessonActions } from '@/features/lessons/model/useLessonActions';
import type {
  LessonCancelRefundMode,
  LessonModalFocus,
  LessonMutationPreview,
  LessonSeriesScope,
} from '@/features/lessons/model/types';
import { LessonCancelDialog } from '@/features/lessons/ui/LessonCancelDialog/LessonCancelDialog';
import { LessonPopover } from '@/features/lessons/ui/LessonPopover/LessonPopover';
import { LessonRestoreDialog } from '@/features/lessons/ui/LessonRestoreDialog/LessonRestoreDialog';
import { SeriesScopeDialog } from '@/features/lessons/ui/SeriesScopeDialog/SeriesScopeDialog';
import { api } from '@/shared/api/client';
import { toZonedDate } from '@/shared/lib/timezoneDates';
import { useToast } from '@/shared/lib/toast';
import { normalizeWeekdayList } from '@/shared/lib/weekdays';
import { AnchoredPopover } from '@/shared/ui/AnchoredPopover/AnchoredPopover';
import { CoffeeIcon } from '@/icons/MaterialIcons';
import { WeekLessonCard } from './WeekLessonCard';
import {
  dayDroppableId,
  isLessonDraggable,
  NAV_NEXT_DROPPABLE_ID,
  NAV_NEXT_EDGE_DROPPABLE_ID,
  NAV_PREV_DROPPABLE_ID,
  NAV_PREV_EDGE_DROPPABLE_ID,
  useWeeklyCalendarDnd,
} from './useWeeklyCalendarDnd';
import styles from './WeeklyCalendarReference.module.css';

interface WeeklyCalendarReferenceProps {
  lessons: Lesson[];
  linkedStudents: LinkedStudent[];
  timeZone: string;
  weekendWeekdays: number[];
  isLoading?: boolean;
  onCreateLesson: (date: Date) => void;
  onOpenLessonDay: (lesson: Lesson) => void;
  onWeekRangeChange?: (start: Date, end: Date) => void;
  className?: string;
}

const DAY_LABELS = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
const SINGLE_CLICK_DELAY = 200;

type PendingScopeAction =
  | {
      type: 'cancel';
      lesson: Lesson;
      refundMode?: LessonCancelRefundMode;
      previews?: Partial<Record<LessonSeriesScope, LessonMutationPreview>>;
    }
  | {
      type: 'restore';
      lesson: Lesson;
      previews?: Partial<Record<LessonSeriesScope, LessonMutationPreview>>;
    };

const resolveCancelDialogCopy = (lesson: Lesson | null) => {
  const copy = resolveLessonCancelActionCopy(lesson);
  return {
    title: copy.title.replace('?', ''),
    confirmText: copy.confirmText,
  };
};

interface DraggableWeekLessonCardProps {
  lesson: Lesson;
  linkedStudentsById: Map<number, LinkedStudent>;
  timeZone: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  onDoubleClick: (event: MouseEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

const DraggableWeekLessonCard: FC<DraggableWeekLessonCardProps> = ({
  lesson,
  linkedStudentsById,
  timeZone,
  onClick,
  onDoubleClick,
  onKeyDown,
}) => {
  const dragLocked = !isLessonDraggable(lesson);
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: lesson.id,
    disabled: dragLocked,
  });

  return (
    <WeekLessonCard
      lesson={lesson}
      linkedStudentsById={linkedStudentsById}
      timeZone={timeZone}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      dragHandle={{
        setNodeRef,
        attributes,
        listeners,
        isDragging,
        dragLocked,
      }}
    />
  );
};

interface DayDropZoneProps {
  dayKey: string;
  className: string;
  isDragActive: boolean;
  onClick?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  role?: string;
  tabIndex?: number;
  children: ReactNode;
}

const DayDropZone: FC<DayDropZoneProps> = ({
  dayKey,
  className,
  isDragActive,
  onClick,
  onKeyDown,
  role,
  tabIndex,
  children,
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: dayDroppableId(dayKey) });
  return (
    <div
      ref={setNodeRef}
      role={role}
      tabIndex={tabIndex}
      className={[className, isDragActive ? styles.dayDropZoneDragActive : '', isOver ? styles.dayDropZoneOver : '']
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
};

interface NavDroppableButtonProps {
  droppableId: typeof NAV_PREV_DROPPABLE_ID | typeof NAV_NEXT_DROPPABLE_ID;
  ariaLabel: string;
  onClick: () => void;
  isActive: boolean;
  children: ReactNode;
}

const NavDroppableButton: FC<NavDroppableButtonProps> = ({ droppableId, ariaLabel, onClick, isActive, children }) => {
  const { setNodeRef } = useDroppable({ id: droppableId });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={[styles.navButton, isActive ? styles.navButtonDragActive : ''].filter(Boolean).join(' ')}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {children}
    </button>
  );
};

interface EdgeNavZoneProps {
  droppableId: typeof NAV_PREV_EDGE_DROPPABLE_ID | typeof NAV_NEXT_EDGE_DROPPABLE_ID;
  side: 'left' | 'right';
  isActive: boolean;
}

const EdgeNavZone: FC<EdgeNavZoneProps> = ({ droppableId, side, isActive }) => {
  const { setNodeRef } = useDroppable({ id: droppableId });
  return (
    <div
      ref={setNodeRef}
      aria-hidden
      className={[
        styles.edgeNavZone,
        side === 'left' ? styles.edgeNavZoneLeft : styles.edgeNavZoneRight,
        isActive ? styles.edgeNavZoneActive : '',
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
};

export const WeeklyCalendarReference: FC<WeeklyCalendarReferenceProps> = ({
  lessons,
  linkedStudents,
  timeZone,
  weekendWeekdays,
  isLoading = false,
  onCreateLesson,
  onOpenLessonDay: _onOpenLessonDay,
  onWeekRangeChange,
  className,
}) => {
  const [weekOffset, setWeekOffset] = useState(0);
  const [lessonPopover, setLessonPopover] = useState<{ lesson: Lesson; anchorEl: HTMLElement } | null>(null);
  const [cancelDialogLesson, setCancelDialogLesson] = useState<Lesson | null>(null);
  const [restoreDialogLesson, setRestoreDialogLesson] = useState<Lesson | null>(null);
  const [scopeDialog, setScopeDialog] = useState<PendingScopeAction | null>(null);
  const clickTimerRef = useRef<number | null>(null);
  const linkedStudentsById = useMemo(
    () => new Map(linkedStudents.map((student) => [student.id, student])),
    [linkedStudents],
  );
  const weekendSet = useMemo(() => new Set(normalizeWeekdayList(weekendWeekdays)), [weekendWeekdays]);
  const {
    openLessonModal,
    cancelLesson,
    restoreLesson,
    requestDeleteLessonFromList,
    togglePaid,
    rescheduleLessonByDrag,
  } = useLessonActions();
  const { showToast } = useToast();

  const todayZoned = useMemo(() => toZonedDate(new Date(), timeZone), [timeZone]);
  const baseWeekStart = useMemo(() => startOfWeek(todayZoned, { weekStartsOn: 1 }), [todayZoned]);
  const weekStart = useMemo(() => addWeeks(baseWeekStart, weekOffset), [baseWeekStart, weekOffset]);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const weekInterval = useMemo(
    () => ({
      start: weekStart,
      end: endOfDay(weekEnd),
    }),
    [weekEnd, weekStart],
  );
  const weekStartKey = useMemo(() => format(weekStart, 'yyyy-MM-dd'), [weekStart]);

  useEffect(() => {
    onWeekRangeChange?.(weekStart, weekEnd);
  }, [onWeekRangeChange, weekEnd, weekStart]);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) {
        window.clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!lessonPopover) return;
    const exists = lessons.some((lesson) => lesson.id === lessonPopover.lesson.id);
    if (!exists) setLessonPopover(null);
  }, [lessons, lessonPopover]);

  useEffect(() => {
    setLessonPopover(null);
  }, [weekStart]);

  const weekLabel = useMemo(() => {
    const startLabel = format(weekStart, 'd', { locale: ru });
    const endLabel = format(weekEnd, 'd MMMM yyyy', { locale: ru });
    return `${startLabel} - ${endLabel}`;
  }, [weekEnd, weekStart]);

  const lessonsByDay = useMemo(() => {
    const map = new Map<string, Lesson[]>();

    lessons.forEach((lesson) => {
      const lessonDate = toZonedDate(lesson.startAt, timeZone);
      if (!isWithinInterval(lessonDate, weekInterval)) return;
      const dayKey = format(lessonDate, 'yyyy-MM-dd');
      const dayLessons = map.get(dayKey) ?? [];
      dayLessons.push(lesson);
      map.set(dayKey, dayLessons);
    });

    map.forEach((dayLessons) => {
      dayLessons.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    });

    return map;
  }, [lessons, timeZone, weekInterval]);

  const activeLesson = useMemo(() => {
    if (!lessonPopover) return null;
    const stored = lessonPopover.lesson;
    const refreshed = lessons.find((lesson) => lesson.id === stored.id && lesson.startAt === stored.startAt);
    return refreshed ?? stored;
  }, [lessonPopover, lessons]);

  const handleDayKeyDown =
    (date: Date, disabled = false) =>
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      onCreateLesson(date);
    };

  const openLessonEditModal = (lesson: Lesson, focus: LessonModalFocus) => {
    const start = toZonedDate(lesson.startAt, timeZone);
    openLessonModal(format(start, 'yyyy-MM-dd'), format(start, 'HH:mm'), lesson, {
      focus,
      skipNavigation: true,
    });
  };

  const openLessonPopoverForLesson = (lesson: Lesson, anchorEl: HTMLElement) => {
    setLessonPopover({ lesson, anchorEl });
  };

  const closeLessonPopover = () => setLessonPopover(null);

  const handleLessonClick = (lesson: Lesson) => (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
    }
    const anchorEl = event.currentTarget;
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      openLessonPopoverForLesson(lesson, anchorEl);
    }, SINGLE_CLICK_DELAY);
  };

  const handleLessonDoubleClick = (lesson: Lesson) => (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    closeLessonPopover();
    openLessonEditModal(lesson, 'full');
  };

  const handleLessonKeyDown = (lesson: Lesson) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      openLessonPopoverForLesson(lesson, event.currentTarget);
    }
  };

  const handleCancelLesson = (lesson: Lesson) => {
    closeLessonPopover();
    setCancelDialogLesson(lesson);
  };

  const handleRestoreLesson = (lesson: Lesson) => {
    closeLessonPopover();
    setRestoreDialogLesson(lesson);
  };

  const handleConfirmCancel = (refundMode?: LessonCancelRefundMode) => {
    if (!cancelDialogLesson) return;
    const target = cancelDialogLesson;
    setCancelDialogLesson(null);
    if (isLessonInSeries(target)) {
      void Promise.all(
        (['SINGLE', 'FOLLOWING'] as LessonSeriesScope[]).map(async (scope) => {
          const data = await api.previewLessonMutation(target.id, { action: 'CANCEL', scope });
          return [scope, data.preview] as const;
        }),
      )
        .then((entries) => {
          setScopeDialog({
            type: 'cancel',
            lesson: target,
            refundMode,
            previews: Object.fromEntries(entries) as Partial<Record<LessonSeriesScope, LessonMutationPreview>>,
          });
        })
        .catch(() => {
          setScopeDialog({ type: 'cancel', lesson: target, refundMode });
        });
      return;
    }
    void cancelLesson(target, 'SINGLE', refundMode);
  };

  const handleConfirmRestore = () => {
    if (!restoreDialogLesson) return;
    const target = restoreDialogLesson;
    setRestoreDialogLesson(null);
    if (isLessonInSeries(target)) {
      void Promise.all(
        (['SINGLE', 'FOLLOWING'] as LessonSeriesScope[]).map(async (scope) => {
          const data = await api.previewLessonMutation(target.id, { action: 'RESTORE', scope });
          return [scope, data.preview] as const;
        }),
      )
        .then((entries) => {
          setScopeDialog({
            type: 'restore',
            lesson: target,
            previews: Object.fromEntries(entries) as Partial<Record<LessonSeriesScope, LessonMutationPreview>>,
          });
        })
        .catch(() => {
          setScopeDialog({ type: 'restore', lesson: target });
        });
      return;
    }
    void restoreLesson(target, 'SINGLE');
  };

  const handleScopeConfirm = (scope: LessonSeriesScope) => {
    if (!scopeDialog) return;
    const payload = scopeDialog;
    setScopeDialog(null);
    if (payload.type === 'cancel') {
      void cancelLesson(payload.lesson, scope, payload.refundMode);
      return;
    }
    if (payload.type === 'restore') {
      void restoreLesson(payload.lesson, scope);
    }
  };

  const handleWeekOffsetChange = (nextOffset: number) => {
    if (nextOffset === weekOffset) return;
    setWeekOffset(nextOffset);
  };

  const shouldShowWeekLoading = isLoading;

  const {
    sensors,
    activeLesson: dragActiveLesson,
    activeLessonId: dragActiveLessonId,
    navHoverTarget,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  } = useWeeklyCalendarDnd({
    lessons,
    timeZone,
    weekendWeekdays,
    onPrevWeek: () => handleWeekOffsetChange(weekOffset - 1),
    onNextWeek: () => handleWeekOffsetChange(weekOffset + 1),
    onReschedule: (lesson, newStartAt) => {
      void rescheduleLessonByDrag(lesson, newStartAt);
    },
    onWeekendDrop: () => {
      showToast({ message: 'В этот день у вас выходной' });
    },
  });

  const isDragActive = dragActiveLessonId !== null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <section
        className={[styles.root, isDragActive ? styles.rootDragActive : '', className].filter(Boolean).join(' ')}
      >
        {isDragActive ? (
          <>
            <EdgeNavZone droppableId={NAV_PREV_EDGE_DROPPABLE_ID} side="left" isActive={navHoverTarget === 'prev'} />
            <EdgeNavZone droppableId={NAV_NEXT_EDGE_DROPPABLE_ID} side="right" isActive={navHoverTarget === 'next'} />
          </>
        ) : null}
        {dragActiveLesson
          ? createPortal(
              <div className={styles.dragKeepAlive} aria-hidden>
                <DraggableWeekLessonCard
                  lesson={dragActiveLesson}
                  linkedStudentsById={linkedStudentsById}
                  timeZone={timeZone}
                  onClick={() => undefined}
                  onDoubleClick={() => undefined}
                  onKeyDown={() => undefined}
                />
              </div>,
              document.body,
            )
          : null}
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <div className={styles.iconWrap} aria-hidden>
              <svg viewBox="0 0 448 512" focusable="false">
                <path
                  fill="currentColor"
                  d="M152 24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H64C28.7 64 0 92.7 0 128v16 48V448c0 35.3 28.7 64 64 64H384c35.3 0 64-28.7 64-64V192 144 128c0-35.3-28.7-64-64-64H344V24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H152V24zM48 192H400V448c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192z"
                />
              </svg>
            </div>
            <div>
              <h2 className={styles.title}>Расписание на неделю</h2>
              <p className={styles.subtitle}>{weekLabel}</p>
            </div>
          </div>

          <div className={styles.controls}>
            <NavDroppableButton
              droppableId={NAV_PREV_DROPPABLE_ID}
              ariaLabel="Предыдущая неделя"
              onClick={() => handleWeekOffsetChange(weekOffset - 1)}
              isActive={navHoverTarget === 'prev'}
            >
              <svg viewBox="0 0 320 512" focusable="false">
                <path
                  fill="currentColor"
                  d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l192 192c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L77.3 256 246.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-192 192z"
                />
              </svg>
            </NavDroppableButton>
            <NavDroppableButton
              droppableId={NAV_NEXT_DROPPABLE_ID}
              ariaLabel="Следующая неделя"
              onClick={() => handleWeekOffsetChange(weekOffset + 1)}
              isActive={navHoverTarget === 'next'}
            >
              <svg viewBox="0 0 320 512" focusable="false">
                <path
                  fill="currentColor"
                  d="M310.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L242.7 256 73.4 86.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l192 192z"
                />
              </svg>
            </NavDroppableButton>
            <button type="button" className={styles.todayButton} onClick={() => handleWeekOffsetChange(0)}>
              Сегодня
            </button>
          </div>
        </header>

        <div className={styles.grid} key={weekStartKey}>
          {DAY_LABELS.map((label, index) => {
            const date = addDays(weekStart, index);
            const dayKey = format(date, 'yyyy-MM-dd');
            const dayLessons = lessonsByDay.get(dayKey) ?? [];
            const shouldShowLoading = shouldShowWeekLoading;
            const isToday = isSameDay(date, todayZoned);
            const isEmpty = dayLessons.length === 0;
            const isWeekend = weekendSet.has(date.getDay());
            const canCreateOnDay = !isWeekend;

            return (
              <article className={styles.dayColumn} key={dayKey}>
                <header className={styles.dayHeader}>
                  <p className={[styles.dayLabel, isToday ? styles.dayLabelToday : ''].filter(Boolean).join(' ')}>
                    {label}
                  </p>
                  <div className={[styles.dayNumber, isToday ? styles.dayNumberToday : ''].filter(Boolean).join(' ')}>
                    {format(date, 'd')}
                  </div>
                </header>

                {shouldShowLoading ? (
                  <div className={styles.loadingState} aria-hidden>
                    <span className={[styles.loadingLine, styles.loadingLineWide].join(' ')} />
                    <span className={[styles.loadingLine, styles.loadingLineMedium].join(' ')} />
                    <span className={[styles.loadingLine, styles.loadingLineShort].join(' ')} />
                  </div>
                ) : isEmpty ? (
                  isWeekend ? (
                    <DayDropZone dayKey={dayKey} className={styles.weekendState} isDragActive={isDragActive}>
                      <div className={styles.weekendIconWrap} aria-hidden>
                        <CoffeeIcon />
                      </div>
                      <p className={styles.weekendTitle}>Выходной</p>
                      <p className={styles.weekendSubtitle}>Отдыхайте!</p>
                    </DayDropZone>
                  ) : (
                    <DayDropZone
                      dayKey={dayKey}
                      className={styles.emptyState}
                      isDragActive={isDragActive}
                      role="button"
                      tabIndex={0}
                      onClick={() => onCreateLesson(date)}
                      onKeyDown={handleDayKeyDown(date, !canCreateOnDay)}
                    >
                      <div className={styles.emptyIconWrap}>
                        <svg viewBox="0 0 448 512" focusable="false">
                          <path
                            fill="currentColor"
                            d="M256 80c0-17.7-14.3-32-32-32s-32 14.3-32 32V224H48c-17.7 0-32 14.3-32 32s14.3 32 32 32H192V432c0 17.7 14.3 32 32 32s32-14.3 32-32V288H400c17.7 0 32-14.3 32-32s-14.3-32-32-32H256V80z"
                          />
                        </svg>
                      </div>
                      <p className={styles.emptyTitle}>Нет уроков</p>
                      <p className={styles.emptySubtitle}>Нажмите, чтобы добавить</p>
                    </DayDropZone>
                  )
                ) : (
                  <DayDropZone
                    dayKey={dayKey}
                    className={[styles.lessonZone, isToday ? styles.lessonZoneToday : ''].filter(Boolean).join(' ')}
                    isDragActive={isDragActive}
                    role={canCreateOnDay ? 'button' : undefined}
                    tabIndex={canCreateOnDay ? 0 : -1}
                    onClick={canCreateOnDay ? () => onCreateLesson(date) : undefined}
                    onKeyDown={handleDayKeyDown(date, !canCreateOnDay)}
                  >
                    <div className={styles.lessonList}>
                      {dayLessons.map((lesson) =>
                        lesson.id === dragActiveLessonId ? (
                          <WeekLessonCard
                            key={lesson.id}
                            lesson={lesson}
                            linkedStudentsById={linkedStudentsById}
                            timeZone={timeZone}
                            dragHandle={{
                              setNodeRef: () => undefined,
                              attributes: {},
                              isDragging: true,
                            }}
                          />
                        ) : (
                          <DraggableWeekLessonCard
                            key={lesson.id}
                            lesson={lesson}
                            linkedStudentsById={linkedStudentsById}
                            timeZone={timeZone}
                            onClick={handleLessonClick(lesson)}
                            onDoubleClick={handleLessonDoubleClick(lesson)}
                            onKeyDown={handleLessonKeyDown(lesson)}
                          />
                        ),
                      )}
                    </div>
                  </DayDropZone>
                )}
              </article>
            );
          })}
        </div>

        <AnchoredPopover
          isOpen={Boolean(activeLesson && lessonPopover)}
          anchorEl={lessonPopover?.anchorEl ?? null}
          onClose={closeLessonPopover}
          side="bottom"
          align="center"
          className={styles.lessonPopover}
        >
          {activeLesson && (
            <LessonPopover
              lesson={activeLesson}
              linkedStudentsById={linkedStudentsById}
              timeZone={timeZone}
              onEditFull={() => {
                closeLessonPopover();
                openLessonEditModal(activeLesson, 'full');
              }}
              onDelete={() => {
                closeLessonPopover();
                requestDeleteLessonFromList(activeLesson);
              }}
              onCancel={() => handleCancelLesson(activeLesson)}
              onRestore={() => handleRestoreLesson(activeLesson)}
              onTogglePaid={(studentId) => {
                void togglePaid(activeLesson.id, studentId);
              }}
              onClose={closeLessonPopover}
            />
          )}
        </AnchoredPopover>

        <LessonCancelDialog
          open={Boolean(cancelDialogLesson)}
          lesson={cancelDialogLesson}
          linkedStudentsById={linkedStudentsById}
          timeZone={timeZone}
          onClose={() => setCancelDialogLesson(null)}
          onConfirm={handleConfirmCancel}
        />

        <LessonRestoreDialog
          open={Boolean(restoreDialogLesson)}
          lesson={restoreDialogLesson}
          linkedStudentsById={linkedStudentsById}
          timeZone={timeZone}
          onClose={() => setRestoreDialogLesson(null)}
          onConfirm={handleConfirmRestore}
        />

        <SeriesScopeDialog
          open={Boolean(scopeDialog)}
          title={
            scopeDialog?.type === 'cancel'
              ? resolveCancelDialogCopy(scopeDialog.lesson).title
              : scopeDialog?.type === 'restore'
                ? 'Восстановить урок'
                : undefined
          }
          confirmText={
            scopeDialog?.type === 'cancel' ? resolveCancelDialogCopy(scopeDialog.lesson).confirmText : 'Восстановить'
          }
          previews={scopeDialog?.previews}
          onClose={() => setScopeDialog(null)}
          onConfirm={handleScopeConfirm}
        />
      </section>
      <DragOverlay dropAnimation={null}>
        {dragActiveLesson ? (
          <WeekLessonCard
            lesson={dragActiveLesson}
            linkedStudentsById={linkedStudentsById}
            timeZone={timeZone}
            dragHandle={{
              setNodeRef: () => {},
              attributes: {},
              isDragging: false,
              asOverlay: true,
            }}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

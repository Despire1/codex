import { addDays, addWeeks, endOfDay, format, isSameDay, isWithinInterval, startOfWeek } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { FC, KeyboardEvent, MouseEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { isLessonInSeries } from '@/entities/lesson/lib/lessonDetails';
import type { Lesson, LinkedStudent } from '@/entities/types';
import { useLessonActions } from '@/features/lessons/model/useLessonActions';
import type { LessonCancelRefundMode, LessonModalFocus, LessonSeriesScope } from '@/features/lessons/model/types';
import { LessonCancelDialog } from '@/features/lessons/ui/LessonCancelDialog/LessonCancelDialog';
import { LessonPopover } from '@/features/lessons/ui/LessonPopover/LessonPopover';
import { LessonRestoreDialog } from '@/features/lessons/ui/LessonRestoreDialog/LessonRestoreDialog';
import { SeriesScopeDialog } from '@/features/lessons/ui/SeriesScopeDialog/SeriesScopeDialog';
import { toZonedDate } from '@/shared/lib/timezoneDates';
import { AnchoredPopover } from '@/shared/ui/AnchoredPopover/AnchoredPopover';
import { WeekLessonCard } from './WeekLessonCard';
import styles from './WeeklyCalendarReference.module.css';

interface WeeklyCalendarReferenceProps {
  lessons: Lesson[];
  linkedStudents: LinkedStudent[];
  timeZone: string;
  isLoading?: boolean;
  onCreateLesson: (date: Date) => void;
  onOpenLessonDay: (lesson: Lesson) => void;
  onWeekRangeChange?: (start: Date, end: Date) => void;
  className?: string;
}

const DAY_LABELS = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
const SINGLE_CLICK_DELAY = 200;

type PendingScopeAction =
  | { type: 'cancel'; lesson: Lesson; refundMode?: LessonCancelRefundMode }
  | { type: 'restore'; lesson: Lesson };

export const WeeklyCalendarReference: FC<WeeklyCalendarReferenceProps> = ({
  lessons,
  linkedStudents,
  timeZone,
  isLoading = false,
  onCreateLesson,
  onOpenLessonDay: _onOpenLessonDay,
  onWeekRangeChange,
  className,
}) => {
  const [weekOffset, setWeekOffset] = useState(0);
  const [pendingWeekStartKey, setPendingWeekStartKey] = useState<string | null>(null);
  const [pendingWeekLoadStarted, setPendingWeekLoadStarted] = useState(false);
  const [lessonPopover, setLessonPopover] = useState<{ lessonId: number; anchorEl: HTMLElement } | null>(null);
  const [cancelDialogLesson, setCancelDialogLesson] = useState<Lesson | null>(null);
  const [restoreDialogLesson, setRestoreDialogLesson] = useState<Lesson | null>(null);
  const [scopeDialog, setScopeDialog] = useState<PendingScopeAction | null>(null);
  const clickTimerRef = useRef<number | null>(null);
  const linkedStudentsById = useMemo(
    () => new Map(linkedStudents.map((student) => [student.id, student])),
    [linkedStudents],
  );
  const { openLessonModal, openRescheduleModal, cancelLesson, restoreLesson } = useLessonActions();

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
    if (!pendingWeekStartKey || pendingWeekStartKey !== weekStartKey) return;
    if (isLoading) {
      if (!pendingWeekLoadStarted) {
        setPendingWeekLoadStarted(true);
      }
      return;
    }
    if (pendingWeekLoadStarted) {
      setPendingWeekStartKey(null);
      setPendingWeekLoadStarted(false);
    }
  }, [isLoading, pendingWeekLoadStarted, pendingWeekStartKey, weekStartKey]);

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
    const exists = lessons.some((lesson) => lesson.id === lessonPopover.lessonId);
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
    return lessons.find((lesson) => lesson.id === lessonPopover.lessonId) ?? null;
  }, [lessonPopover, lessons]);

  const handleDayKeyDown = (date: Date) => (event: KeyboardEvent<HTMLDivElement>) => {
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

  const openRescheduleLessonModal = (lesson: Lesson) => {
    openRescheduleModal(lesson, { skipNavigation: true });
  };

  const openLessonPopoverForLesson = (lesson: Lesson, anchorEl: HTMLElement) => {
    setLessonPopover({ lessonId: lesson.id, anchorEl });
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
      setScopeDialog({ type: 'cancel', lesson: target, refundMode });
      return;
    }
    void cancelLesson(target, 'SINGLE', refundMode);
  };

  const handleConfirmRestore = () => {
    if (!restoreDialogLesson) return;
    const target = restoreDialogLesson;
    setRestoreDialogLesson(null);
    if (isLessonInSeries(target)) {
      setScopeDialog({ type: 'restore', lesson: target });
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
    setWeekOffset(nextOffset);
    if (!onWeekRangeChange) return;
    const nextWeekStart = addWeeks(baseWeekStart, nextOffset);
    setPendingWeekStartKey(format(nextWeekStart, 'yyyy-MM-dd'));
    setPendingWeekLoadStarted(false);
  };

  const shouldShowWeekLoading = isLoading || pendingWeekStartKey === weekStartKey;

  return (
    <section className={[styles.root, className].filter(Boolean).join(' ')}>
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
          <button
            type="button"
            className={styles.navButton}
            aria-label="Предыдущая неделя"
            onClick={() => handleWeekOffsetChange(weekOffset - 1)}
          >
            <svg viewBox="0 0 320 512" focusable="false">
              <path
                fill="currentColor"
                d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l192 192c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L77.3 256 246.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-192 192z"
              />
            </svg>
          </button>
          <button
            type="button"
            className={styles.navButton}
            aria-label="Следующая неделя"
            onClick={() => handleWeekOffsetChange(weekOffset + 1)}
          >
            <svg viewBox="0 0 320 512" focusable="false">
              <path
                fill="currentColor"
                d="M310.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L242.7 256 73.4 86.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l192 192z"
              />
            </svg>
          </button>
          <button type="button" className={styles.todayButton} onClick={() => handleWeekOffsetChange(0)}>
            Сегодня
          </button>
        </div>
      </header>

      <div className={styles.grid}>
        {DAY_LABELS.map((label, index) => {
          const date = addDays(weekStart, index);
          const dayKey = format(date, 'yyyy-MM-dd');
          const dayLessons = lessonsByDay.get(dayKey) ?? [];
          const shouldShowLoading = shouldShowWeekLoading;
          const isToday = isSameDay(date, todayZoned);
          const isEmpty = dayLessons.length === 0;
          const isSunday = index === DAY_LABELS.length - 1;

          return (
            <article className={styles.dayColumn} key={dayKey}>
              <header className={styles.dayHeader}>
                <p className={[styles.dayLabel, isToday ? styles.dayLabelToday : ''].filter(Boolean).join(' ')}>
                  {label}
                </p>
                <div
                  className={[styles.dayNumber, isToday ? styles.dayNumberToday : ''].filter(Boolean).join(' ')}
                >
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
                isSunday ? (
                  <div className={styles.weekendState}>
                    <div className={styles.weekendIconWrap} aria-hidden>
                      <svg viewBox="0 0 512 512" focusable="false">
                        <path
                          fill="currentColor"
                          d="M88 0C74.7 0 64 10.7 64 24c0 38.9 23.4 59.4 39.1 73.1l1.1 1C120.5 112.3 128 119.9 128 136c0 13.3 10.7 24 24 24s24-10.7 24-24c0-38.9-23.4-59.4-39.1-73.1l-1.1-1C119.5 47.7 112 40.1 112 24c0-13.3-10.7-24-24-24zM32 192c-17.7 0-32 14.3-32 32V416c0 53 43 96 96 96H288c53 0 96-43 96-96h16c61.9 0 112-50.1 112-112s-50.1-112-112-112H352 32zm352 64h16c26.5 0 48 21.5 48 48s-21.5 48-48 48H384V256zM224 24c0-13.3-10.7-24-24-24s-24 10.7-24 24c0 38.9 23.4 59.4 39.1 73.1l1.1 1C232.5 112.3 240 119.9 240 136c0 13.3 10.7 24 24 24s24-10.7 24-24c0-38.9-23.4-59.4-39.1-73.1l-1.1-1C231.5 47.7 224 40.1 224 24z"
                        />
                      </svg>
                    </div>
                    <p className={styles.weekendTitle}>Выходной</p>
                    <p className={styles.weekendSubtitle}>Отдыхайте!</p>
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    className={styles.emptyState}
                    onClick={() => onCreateLesson(date)}
                    onKeyDown={handleDayKeyDown(date)}
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
                  </div>
                )
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  className={[styles.lessonZone, isToday ? styles.lessonZoneToday : ''].filter(Boolean).join(' ')}
                  onClick={() => onCreateLesson(date)}
                  onKeyDown={handleDayKeyDown(date)}
                >
                  <div className={styles.lessonList}>
                    {dayLessons.map((lesson) => (
                      <WeekLessonCard
                        key={lesson.id}
                        lesson={lesson}
                        linkedStudentsById={linkedStudentsById}
                        timeZone={timeZone}
                        onClick={handleLessonClick(lesson)}
                        onDoubleClick={handleLessonDoubleClick(lesson)}
                        onKeyDown={handleLessonKeyDown(lesson)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <AnchoredPopover
        isOpen={Boolean(activeLesson && lessonPopover)}
        anchorEl={lessonPopover?.anchorEl ?? null}
        onClose={closeLessonPopover}
        side="right"
        align="start"
        className={styles.lessonPopover}
      >
        {activeLesson && (
          <LessonPopover
            lesson={activeLesson}
            linkedStudentsById={linkedStudentsById}
            timeZone={timeZone}
            onReschedule={() => {
              closeLessonPopover();
              openRescheduleLessonModal(activeLesson);
            }}
            onEditFull={() => {
              closeLessonPopover();
              openLessonEditModal(activeLesson, 'full');
            }}
            onCancel={() => handleCancelLesson(activeLesson)}
            onRestore={() => handleRestoreLesson(activeLesson)}
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
        onClose={() => setScopeDialog(null)}
        onConfirm={handleScopeConfirm}
      />
    </section>
  );
};

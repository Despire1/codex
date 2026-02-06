import { addDays, addWeeks, endOfDay, format, isSameDay, isWithinInterval, startOfWeek } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  type CSSProperties,
  type FC,
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Lesson, LinkedStudent } from '@/entities/types';
import { LessonChip } from '@/entities/lesson/ui/LessonChip/LessonChip';
import { isLessonInSeries } from '@/entities/lesson/lib/lessonDetails';
import { useLessonActions } from '@/features/lessons/model/useLessonActions';
import type { LessonCancelRefundMode, LessonSeriesScope, LessonModalFocus } from '@/features/lessons/model/types';
import { LessonPopover } from '@/features/lessons/ui/LessonPopover/LessonPopover';
import { LessonCancelDialog } from '@/features/lessons/ui/LessonCancelDialog/LessonCancelDialog';
import { LessonRestoreDialog } from '@/features/lessons/ui/LessonRestoreDialog/LessonRestoreDialog';
import { SeriesScopeDialog } from '@/features/lessons/ui/SeriesScopeDialog/SeriesScopeDialog';
import { AnchoredPopover } from '@/shared/ui/AnchoredPopover/AnchoredPopover';
import { toZonedDate } from '@/shared/lib/timezoneDates';
import { DayOverflowPopover } from './DayOverflowPopover';
import styles from './WeeklyCalendar.module.css';

interface WeeklyCalendarProps {
  lessons: Lesson[];
  linkedStudents: LinkedStudent[];
  timeZone: string;
  onCreateLesson: (date: Date) => void;
  onOpenLessonDay: (lesson: Lesson) => void;
  onWeekRangeChange?: (start: Date, end: Date) => void;
  className?: string;
}

type PendingScopeAction =
  | { type: 'cancel'; lesson: Lesson; refundMode?: LessonCancelRefundMode }
  | { type: 'restore'; lesson: Lesson };

const dayLabels = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
const SINGLE_CLICK_DELAY = 200;
const LESSON_ROW_HEIGHT = 44;
const LESSON_ROW_GAP = 8;
const MAX_VISIBLE_LESSONS = 10;

export const WeeklyCalendar: FC<WeeklyCalendarProps> = ({
  lessons,
  linkedStudents,
  timeZone,
  onCreateLesson,
  onOpenLessonDay,
  onWeekRangeChange,
  className,
}) => {
  const [weekOffset, setWeekOffset] = useState(0);
  const [lessonPopover, setLessonPopover] = useState<{ lessonId: number; anchorEl: HTMLElement } | null>(null);
  const [overflowPopover, setOverflowPopover] = useState<{ dayKey: string; anchorEl: HTMLElement } | null>(null);
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
    const exists = lessons.some((lesson) => lesson.id === lessonPopover.lessonId);
    if (!exists) setLessonPopover(null);
  }, [lessons, lessonPopover]);

  useEffect(() => {
    setLessonPopover(null);
    setOverflowPopover(null);
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
      const key = format(lessonDate, 'yyyy-MM-dd');
      const current = map.get(key) ?? [];
      current.push(lesson);
      map.set(key, current);
    });

    map.forEach((dayLessons) => {
      dayLessons.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    });

    return map;
  }, [lessons, timeZone, weekInterval]);

  const weekDayKeys = useMemo(
    () => dayLabels.map((_, index) => format(addDays(weekStart, index), 'yyyy-MM-dd')),
    [weekStart],
  );

  const maxCount = useMemo(
    () => Math.max(0, ...weekDayKeys.map((key) => (lessonsByDay.get(key) ?? []).length)),
    [lessonsByDay, weekDayKeys],
  );
  const visibleCapacity = Math.min(maxCount, MAX_VISIBLE_LESSONS);
  const listMinHeight =
    visibleCapacity > 0 ? visibleCapacity * LESSON_ROW_HEIGHT + (visibleCapacity - 1) * LESSON_ROW_GAP : 0;

  const activeLesson = useMemo(() => {
    if (!lessonPopover) return null;
    return lessons.find((lesson) => lesson.id === lessonPopover.lessonId) ?? null;
  }, [lessonPopover, lessons]);

  const overflowLessons = useMemo(() => {
    if (!overflowPopover) return [];
    const dayLessons = lessonsByDay.get(overflowPopover.dayKey) ?? [];
    return dayLessons.slice(visibleCapacity);
  }, [lessonsByDay, overflowPopover, visibleCapacity]);

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
    setOverflowPopover(null);
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
    setOverflowPopover(null);
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

  const dayCardStyle = {
    '--lesson-row-height': `${LESSON_ROW_HEIGHT}px`,
    '--lesson-row-gap': `${LESSON_ROW_GAP}px`,
    '--lesson-list-min-height': `${listMinHeight}px`,
  } as CSSProperties;

  return (
    <section className={[styles.root, className].filter(Boolean).join(' ')}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Расписание на неделю</h2>
          <p className={styles.subtitle}>{weekLabel}</p>
        </div>
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.controlButton}
            aria-label="Предыдущая неделя"
            onClick={() => setWeekOffset((prev) => prev - 1)}
          >
            <svg viewBox="0 0 320 512" aria-hidden="true" focusable="false">
              <path
                fill="currentColor"
                d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l192 192c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L77.3 256 246.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-192 192z"
              />
            </svg>
          </button>
          <button
            type="button"
            className={styles.controlButton}
            aria-label="Следующая неделя"
            onClick={() => setWeekOffset((prev) => prev + 1)}
          >
            <svg viewBox="0 0 320 512" aria-hidden="true" focusable="false">
              <path
                fill="currentColor"
                d="M310.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5 12.5-32.8 12.5-45.3 0s12.5-32.8 0-45.3L242.7 256 73.4 86.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l192 192z"
              />
            </svg>
          </button>
        </div>
      </header>

      <div className={styles.grid}>
        {dayLabels.map((label, index) => {
          const date = addDays(weekStart, index);
          const dayNumber = format(date, 'd');
          const dayKey = format(date, 'yyyy-MM-dd');
          const dayLessons = lessonsByDay.get(dayKey) ?? [];
          const visibleLessons = dayLessons.slice(0, visibleCapacity);
          const hiddenCount = dayLessons.length - visibleLessons.length;
          const isActive = isSameDay(date, todayZoned);
          const isEmpty = dayLessons.length === 0;

          return (
            <div className={styles.day} key={label}>
              <div className={[styles.dayLabel, isActive ? styles.dayLabelActive : ''].filter(Boolean).join(' ')}>
                {label}
              </div>
              <div
                role="button"
                tabIndex={0}
                className={[
                  styles.dayCard,
                  isActive ? styles.dayCardActive : '',
                  styles.dayCardInteractive,
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onCreateLesson(date)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onCreateLesson(date);
                  }
                }}
                style={dayCardStyle}
              >
                <div className={[styles.dayNumber, isActive ? styles.dayNumberActive : ''].filter(Boolean).join(' ')}>
                  {dayNumber}
                </div>
                {isEmpty ? (
                  <div className={styles.emptyState}>
                    <span className={styles.emptyIcon}>+</span>
                  </div>
                ) : (
                  <div className={styles.lessonList}>
                    {visibleLessons.map((lesson) => (
                      <LessonChip
                        key={lesson.id}
                        lesson={lesson}
                        linkedStudentsById={linkedStudentsById}
                        timeZone={timeZone}
                        onClick={handleLessonClick(lesson)}
                        onDoubleClick={handleLessonDoubleClick(lesson)}
                        onKeyDown={handleLessonKeyDown(lesson)}
                      />
                    ))}
                    {hiddenCount > 0 && (
                      <button
                        type="button"
                        className={styles.moreButton}
                        onClick={(event) => {
                          event.stopPropagation();
                          setLessonPopover(null);
                          setOverflowPopover({ dayKey, anchorEl: event.currentTarget });
                        }}
                      >
                        Ещё {hiddenCount}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AnchoredPopover
        isOpen={Boolean(activeLesson && lessonPopover)}
        anchorEl={lessonPopover?.anchorEl ?? null}
        onClose={closeLessonPopover}
        side="right"
        align="start"
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

      <DayOverflowPopover
        isOpen={Boolean(overflowPopover)}
        anchorEl={overflowPopover?.anchorEl ?? null}
        lessons={overflowLessons}
        linkedStudentsById={linkedStudentsById}
        timeZone={timeZone}
        onClose={() => setOverflowPopover(null)}
        onSelectLesson={(lesson) => {
          const anchor = overflowPopover?.anchorEl;
          setOverflowPopover(null);
          if (anchor) {
            openLessonPopoverForLesson(lesson, anchor);
          }
        }}
      />

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

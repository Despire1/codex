import {
  type DragEvent as ReactDragEvent,
  type FC,
  type MouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { addMonths, endOfMonth, format, isSameDay, startOfMonth, startOfWeek } from 'date-fns';
import type { Lesson, LinkedStudent } from '../../../entities/types';
import { toZonedDate } from '../../../shared/lib/timezoneDates';
import { resolveLessonExplicitColorStyle, resolveLessonThemeKey } from '../lib/lessonThemes';
import { resolveLessonNamesText } from '../lib/lessonParticipants';
import { WEEKDAYS_SHORT, formatTime, pad2 } from '../lib/formatHelpers';
import { isLessonInSeries } from '../../../entities/lesson/lib/lessonDetails';
import { SeriesGlyph } from './SeriesGlyph';
import styles from '../ScheduleSectionV2.module.css';

interface MonthViewProps {
  anchor: Date;
  lessons: Lesson[];
  linkedStudentsById: Map<number, LinkedStudent>;
  timeZone: string;
  todayZoned: Date;
  /** Дни недели, помеченные как выходные (0=вс…6=сб). Drop в такие ячейки запрещён. */
  weekendWeekdays?: number[];
  onLessonClick: (lesson: Lesson) => void;
  onEmptyDayClick: (dayIso: string) => void;
  /** DnD: вызывается при отпускании урока в другую ячейку дня. */
  onLessonDropOnDay?: (lesson: Lesson, targetDayIso: string) => void;
}

const themeClassMap: Record<string, string> = {
  'c-1': styles.themeC1,
  'c-2': styles.themeC2,
  'c-3': styles.themeC3,
  'c-4': styles.themeC4,
  'c-5': styles.themeC5,
  'c-6': styles.themeC6,
  'c-7': styles.themeC7,
  'c-8': styles.themeC8,
};

const resolveStatusClass = (lesson: Lesson) => {
  if (lesson.status === 'COMPLETED') return styles.statusCompleted;
  if (lesson.status === 'CANCELED') return styles.statusCanceled;
  return '';
};

const resolveLessonName = (lesson: Lesson, linkedStudentsById: Map<number, LinkedStudent>) =>
  resolveLessonNamesText(lesson, linkedStudentsById, 1);

export const MonthView: FC<MonthViewProps> = ({
  anchor,
  lessons,
  linkedStudentsById,
  timeZone,
  todayZoned,
  weekendWeekdays,
  onLessonClick,
  onEmptyDayClick,
  onLessonDropOnDay,
}) => {
  const draggedRef = useRef<Lesson | null>(null);
  const [dragOverDayIso, setDragOverDayIso] = useState<string | null>(null);
  const weekendSet = useMemo(() => new Set(weekendWeekdays ?? []), [weekendWeekdays]);
  const monthStart = useMemo(() => startOfMonth(anchor), [anchor]);
  const gridStart = useMemo(() => startOfWeek(monthStart, { weekStartsOn: 1 }), [monthStart]);

  /**
   * Реальное число строк сетки (5 или 6) для текущего месяца.
   * Нужно для fit-режима без скролла: лишний 6-й ряд не рендерим,
   * остальные растягиваются на 1fr высоты карточки.
   */
  const weeks = useMemo(() => {
    const firstDow = (monthStart.getDay() + 6) % 7; // 0 = пн, 6 = вс
    const daysInMonth = endOfMonth(monthStart).getDate();
    return Math.ceil((firstDow + daysInMonth) / 7);
  }, [monthStart]);

  const days = useMemo(() => {
    const arr: Date[] = [];
    const total = weeks * 7;
    for (let i = 0; i < total; i += 1) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [gridStart, weeks]);

  const lessonsByDay = useMemo(() => {
    const map = new Map<string, Lesson[]>();
    lessons.forEach((lesson) => {
      const z = toZonedDate(lesson.startAt, timeZone);
      const key = format(z, 'yyyy-MM-dd');
      const list = map.get(key) ?? [];
      list.push(lesson);
      map.set(key, list);
    });
    map.forEach((list) => list.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()));
    return map;
  }, [lessons, timeZone]);

  const [moreOpen, setMoreOpen] = useState<{
    dayIso: string;
    items: Lesson[];
    rect: DOMRect;
  } | null>(null);

  /**
   * Динамический расчёт capacity ячейки: сколько чипов влезет по высоте без переполнения.
   * В fit-режиме все строки grid одинаковой высоты, так что измеряем grid целиком и chip-семпл,
   * затем вычисляем сколько таких чипов помещается. ResizeObserver обновляет capacity при
   * изменении высоты карточки (resize окна, переключение sidebar и т.п.).
   */
  const gridRef = useRef<HTMLDivElement>(null);
  const [chipsCapacity, setChipsCapacity] = useState<number>(3);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const compute = () => {
      const cellHeight = grid.clientHeight / weeks;
      if (cellHeight <= 0) return;
      const sample =
        grid.querySelector<HTMLElement>(`.${styles.monthChip}`) ??
        grid.querySelector<HTMLElement>(`.${styles.monthMore}`);
      const chipHeight = sample ? sample.getBoundingClientRect().height : 18;
      // Геометрия ячейки (в синхроне с CSS .monthCell):
      //   padding-top 6 + padding-bottom 8 = 14
      //   monthCellHead ≈ 24 (height круглого dayNum) + flex column gap 4 = 28
      const headerWithGap = 28;
      const cellPaddingV = 14;
      const chipGap = 3;
      const chipsContainerH = cellHeight - cellPaddingV - headerWithGap;
      const slotH = chipHeight + chipGap;
      if (slotH <= 0) return;
      const cap = Math.max(1, Math.floor((chipsContainerH + chipGap) / slotH));
      setChipsCapacity((prev) => (prev === cap ? prev : cap));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(grid);
    return () => ro.disconnect();
  }, [weeks, lessons.length]);

  useEffect(() => {
    const reset = () => {
      draggedRef.current = null;
      setDragOverDayIso(null);
    };
    window.addEventListener('dragend', reset);
    window.addEventListener('drop', reset);
    return () => {
      window.removeEventListener('dragend', reset);
      window.removeEventListener('drop', reset);
    };
  }, []);

  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    const onDocClick = (e: globalThis.MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current && !popRef.current.contains(t)) {
        setMoreOpen(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMoreOpen(null);
        return;
      }
      if (e.key !== 'Tab' || !popRef.current) return;
      const focusables = popRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKey);
    // Автофокус на первый элемент списка после открытия
    const focusFirst = popRef.current?.querySelector<HTMLElement>('ul button');
    focusFirst?.focus();
    return () => {
      window.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  const handleMore = useCallback((e: MouseEvent<HTMLButtonElement>, dayIso: string, items: Lesson[]) => {
    e.stopPropagation();
    const rect = (e.currentTarget.closest(`.${styles.monthCell}`) as HTMLElement | null)?.getBoundingClientRect();
    if (!rect) return;
    setMoreOpen({ dayIso, items, rect });
  }, []);

  const baseMax = chipsCapacity;

  return (
    <section className={styles.card}>
      <div className={styles.monthWeekdays}>
        {WEEKDAYS_SHORT.slice(1)
          .concat(WEEKDAYS_SHORT[0])
          .map((label, idx) => (
            <span key={label} className={idx >= 5 ? styles.weekend : ''}>
              {label}
            </span>
          ))}
      </div>
      <div
        ref={gridRef}
        className={styles.monthGrid}
        style={{ ['--sv2-month-rows' as string]: weeks } as Record<string, string | number>}
      >
        {days.map((date) => {
          const isOther = date.getMonth() !== monthStart.getMonth();
          const dow = date.getDay(); // 0 = вс
          const isWeekend = weekendSet.size > 0 ? weekendSet.has(dow) : dow === 0 || dow === 6;
          const isToday = isSameDay(date, todayZoned);
          const dayIso = format(date, 'yyyy-MM-dd');
          const dayLessons = lessonsByDay.get(dayIso) ?? [];
          const hasMore = dayLessons.length > baseMax;
          const visibleCount = hasMore ? baseMax - 1 : baseMax;
          const visible = dayLessons.slice(0, visibleCount);
          const moreCount = dayLessons.length - visibleCount;

          const isDragOver = dragOverDayIso === dayIso;
          return (
            <div
              role="button"
              tabIndex={0}
              key={dayIso}
              className={[
                styles.monthCell,
                isOther ? styles.monthCellOther : '',
                isWeekend ? styles.monthCellWeekend : '',
                isToday ? styles.monthCellToday : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onEmptyDayClick(dayIso)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onEmptyDayClick(dayIso);
                }
              }}
              onDragOver={(e: ReactDragEvent<HTMLDivElement>) => {
                if (!draggedRef.current || !onLessonDropOnDay) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverDayIso !== dayIso) setDragOverDayIso(dayIso);
              }}
              onDragLeave={() => {
                if (dragOverDayIso === dayIso) setDragOverDayIso(null);
              }}
              onDrop={(e: ReactDragEvent<HTMLDivElement>) => {
                const lesson = draggedRef.current;
                draggedRef.current = null;
                setDragOverDayIso(null);
                if (!lesson || !onLessonDropOnDay) return;
                e.preventDefault();
                onLessonDropOnDay(lesson, dayIso);
              }}
              style={isDragOver ? { outline: '2px solid var(--sv2-accent-primary)', outlineOffset: -2 } : undefined}
            >
              <div className={styles.monthCellHead}>
                <span className={styles.monthCellNum}>{date.getDate()}</span>
                {dayLessons.length > 0 ? <span className={styles.monthCellCount}>{dayLessons.length} ур.</span> : null}
              </div>
              <div className={styles.monthChips}>
                {visible.map((lesson) => {
                  const z = toZonedDate(lesson.startAt, timeZone);
                  const themeKey = resolveLessonThemeKey(lesson);
                  const explicitColorStyle = resolveLessonExplicitColorStyle(lesson);
                  const isDraggable = lesson.status !== 'CANCELED' && lesson.status !== 'COMPLETED';
                  return (
                    <button
                      key={lesson.id}
                      type="button"
                      draggable={isDraggable}
                      onDragStart={(e) => {
                        if (!isDraggable) {
                          e.preventDefault();
                          return;
                        }
                        draggedRef.current = lesson;
                        e.dataTransfer.effectAllowed = 'move';
                        try {
                          e.dataTransfer.setData('text/plain', String(lesson.id));
                        } catch {
                          /* noop */
                        }
                      }}
                      onDragEnd={() => {
                        draggedRef.current = null;
                        setDragOverDayIso(null);
                      }}
                      className={[
                        styles.monthChip,
                        explicitColorStyle ? '' : themeClassMap[themeKey],
                        resolveStatusClass(lesson),
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={explicitColorStyle}
                      onClick={(e) => {
                        e.stopPropagation();
                        onLessonClick(lesson);
                      }}
                    >
                      <span className={styles.chipTime}>{formatTime(z)}</span>
                      <span className={styles.chipName}>{resolveLessonName(lesson, linkedStudentsById)}</span>
                      {isLessonInSeries(lesson) ? (
                        <SeriesGlyph className={styles.seriesGlyph} aria-label="Повторяющийся" />
                      ) : null}
                    </button>
                  );
                })}
                {hasMore ? (
                  <button type="button" className={styles.monthMore} onClick={(e) => handleMore(e, dayIso, dayLessons)}>
                    + ещё {moreCount}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {moreOpen
        ? (() => {
            const popW = 280;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            let left = moreOpen.rect.left + moreOpen.rect.width / 2 - popW / 2;
            if (left + popW > vw - 12) left = vw - popW - 12;
            if (left < 12) left = 12;
            const approxH = 64 + Math.min(moreOpen.items.length, 7) * 40 + 12;
            let top = moreOpen.rect.bottom + 6;
            if (top + approxH > vh - 12) top = Math.max(12, moreOpen.rect.top - approxH - 6);

            const popDate = new Date(moreOpen.dayIso);
            const isPopToday = isSameDay(popDate, todayZoned);
            const wd = WEEKDAYS_SHORT[popDate.getDay()];
            return (
              <div
                ref={popRef}
                className={`${styles.dayPop} ${styles.dayPopOpen}`}
                style={{ left, top }}
                role="dialog"
                aria-modal="true"
              >
                <header className={styles.dayPopHead}>
                  <div className={styles.dayPopDate}>
                    <span className={`${styles.dayPopNum} ${isPopToday ? styles.dayPopNumToday : ''}`}>
                      {popDate.getDate()}
                    </span>
                    <span className={styles.dayPopWd}>{wd}</span>
                  </div>
                  <button
                    type="button"
                    className={styles.dayPopClose}
                    aria-label="Закрыть"
                    onClick={() => setMoreOpen(null)}
                  >
                    ×
                  </button>
                </header>
                <ul className={styles.dayPopList}>
                  {moreOpen.items.map((lesson) => {
                    const z = toZonedDate(lesson.startAt, timeZone);
                    const themeKey = resolveLessonThemeKey(lesson);
                    const explicitColorStyle = resolveLessonExplicitColorStyle(lesson);
                    return (
                      <li key={lesson.id}>
                        <button
                          type="button"
                          className={[
                            styles.dayPopItem,
                            explicitColorStyle ? '' : themeClassMap[themeKey],
                            resolveStatusClass(lesson),
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          style={explicitColorStyle}
                          onClick={() => {
                            setMoreOpen(null);
                            onLessonClick(lesson);
                          }}
                        >
                          <span className={styles.dayPopDot} />
                          <span className={styles.dayPopTime}>
                            {pad2(z.getHours())}:{pad2(z.getMinutes())}
                          </span>
                          <span className={styles.dayPopName}>{resolveLessonName(lesson, linkedStudentsById)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })()
        : null}
    </section>
  );
};

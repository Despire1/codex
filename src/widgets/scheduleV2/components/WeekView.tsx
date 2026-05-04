import {
  type DragEvent as ReactDragEvent,
  type FC,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { addDays, format, isSameDay, startOfWeek } from 'date-fns';
import type { Lesson, LinkedStudent } from '../../../entities/types';
import { toZonedDate } from '../../../shared/lib/timezoneDates';
import { resolveLessonExplicitColorStyle, resolveLessonThemeKey } from '../lib/lessonThemes';
import { resolveLessonNamesText } from '../lib/lessonParticipants';
import { WEEKDAYS_SHORT, formatTime, pad2 } from '../lib/formatHelpers';
import { isLessonInSeries } from '../../../entities/lesson/lib/lessonDetails';
import { SeriesGlyph } from './SeriesGlyph';
import styles from '../ScheduleSectionV2.module.css';

interface WeekViewProps {
  anchor: Date;
  lessons: Lesson[];
  linkedStudentsById: Map<number, LinkedStudent>;
  timeZone: string;
  todayZoned: Date;
  nowMinutes: number;
  hourStart?: number;
  hourEnd?: number;
  rowHeight?: number;
  /** Дни недели, помеченные как выходные (0=вс…6=сб). Drop в такие колонки запрещён. */
  weekendWeekdays?: number[];
  onLessonClick: (lesson: Lesson) => void;
  /**
   * DnD: drop на конкретное время внутри другого/того же дня недели.
   * `minutesFromDayStart` — координата по Y, переведённая в минуты от 00:00 (а не от hourStart).
   */
  onLessonDropOnSlot?: (lesson: Lesson, targetDayIso: string, minutesFromDayStart: number) => void;
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
  resolveLessonNamesText(lesson, linkedStudentsById, 2);

const resolveTopicLine = (lesson: Lesson) => lesson.topic ?? '';

export const WeekView: FC<WeekViewProps> = ({
  anchor,
  lessons,
  linkedStudentsById,
  timeZone,
  todayZoned,
  nowMinutes,
  hourStart = 8,
  hourEnd = 21,
  rowHeight = 48,
  weekendWeekdays,
  onLessonClick,
  onLessonDropOnSlot,
}) => {
  const weekendSet = useMemo(() => new Set(weekendWeekdays ?? []), [weekendWeekdays]);
  const draggedRef = useRef<Lesson | null>(null);
  const [dropPreview, setDropPreview] = useState<{ dayIso: string; topPx: number } | null>(null);

  useEffect(() => {
    const reset = () => {
      draggedRef.current = null;
      setDropPreview(null);
    };
    window.addEventListener('dragend', reset);
    window.addEventListener('drop', reset);
    return () => {
      window.removeEventListener('dragend', reset);
      window.removeEventListener('drop', reset);
    };
  }, []);

  const computeMinutesFromY = (clientY: number, body: HTMLDivElement) => {
    const rect = body.getBoundingClientRect();
    const offsetY = clientY - rect.top + body.scrollTop;
    return hourStart * 60 + (offsetY / rowHeight) * 60;
  };
  const ws = useMemo(() => startOfWeek(anchor, { weekStartsOn: 1 }), [anchor]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(ws, i)), [ws]);

  const lessonsByDay = useMemo(() => {
    const map = new Map<string, Lesson[]>();
    lessons.forEach((lesson) => {
      const z = toZonedDate(lesson.startAt, timeZone);
      const key = format(z, 'yyyy-MM-dd');
      const list = map.get(key) ?? [];
      list.push(lesson);
      map.set(key, list);
    });
    return map;
  }, [lessons, timeZone]);

  // Раскладка пересекающихся уроков по колонкам (interval-graph coloring).
  // Возвращает Map<lessonId, { col, numCols }> — где col это индекс колонки в кластере
  // пересечения, а numCols — общее число колонок в этом кластере.
  const layoutsByDay = useMemo(() => {
    const result = new Map<string, Map<number, { col: number; numCols: number }>>();
    lessonsByDay.forEach((items, dayIso) => {
      const sorted = [...items].sort((a, b) => {
        const ta = new Date(a.startAt).getTime();
        const tb = new Date(b.startAt).getTime();
        if (ta !== tb) return ta - tb;
        return b.durationMinutes - a.durationMinutes;
      });
      const dayLayout = new Map<number, { col: number; numCols: number }>();
      let cluster: { id: number; endsAt: number; col: number }[] = [];
      let clusterEndsAt = 0;
      const flush = () => {
        if (cluster.length === 0) return;
        const numCols = Math.max(...cluster.map((c) => c.col + 1), 1);
        cluster.forEach((c) => dayLayout.set(c.id, { col: c.col, numCols }));
        cluster = [];
        clusterEndsAt = 0;
      };
      sorted.forEach((lesson) => {
        const startMs = new Date(lesson.startAt).getTime();
        const endMs = startMs + lesson.durationMinutes * 60_000;
        if (cluster.length > 0 && startMs >= clusterEndsAt) flush();
        const usedCols = new Set(cluster.filter((c) => c.endsAt > startMs).map((c) => c.col));
        let col = 0;
        while (usedCols.has(col)) col += 1;
        cluster.push({ id: lesson.id, endsAt: endMs, col });
        clusterEndsAt = Math.max(clusterEndsAt, endMs);
      });
      flush();
      result.set(dayIso, dayLayout);
    });
    return result;
  }, [lessonsByDay]);

  const hours = useMemo(
    () => Array.from({ length: hourEnd - hourStart + 1 }, (_, i) => hourStart + i),
    [hourStart, hourEnd],
  );
  const bodyMinHeight = (hourEnd - hourStart + 1) * rowHeight;

  const nowOffsetPx =
    nowMinutes >= hourStart * 60 && nowMinutes <= hourEnd * 60 + 60
      ? ((nowMinutes - hourStart * 60) / 60) * rowHeight
      : null;

  const gridRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const pxPerMin = rowHeight / 60;
    let targetMinAbs = 9 * 60;
    if (lessons.length > 0) {
      const minutesList = lessons.map((l) => {
        const z = toZonedDate(l.startAt, timeZone);
        return z.getHours() * 60 + z.getMinutes();
      });
      const minStartAbs = Math.min(...minutesList);
      targetMinAbs = Math.max(hourStart * 60, minStartAbs - 30);
    } else if (days.some((d) => isSameDay(d, todayZoned))) {
      targetMinAbs = Math.max(hourStart * 60, nowMinutes - 60);
    }
    const offsetMinFromStart = targetMinAbs - hourStart * 60;
    el.scrollTop = Math.max(0, offsetMinFromStart * pxPerMin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  return (
    <section className={styles.card}>
      <div
        ref={gridRef}
        className={styles.weekGrid}
        style={{ ['--sv2-row-h' as string]: `${rowHeight}px` } as Record<string, string>}
      >
        <div className={styles.weekColTimes}>
          <div className={styles.weekDayHead} style={{ visibility: 'hidden' }}>
            <div className={styles.weekDayLabel}>·</div>
            <div className={styles.weekDayNum}>·</div>
          </div>
          {hours.map((h) => (
            <div key={h} className={styles.weekTimeCell}>
              {pad2(h)}:00
            </div>
          ))}
        </div>

        {days.map((date, idx) => {
          const isToday = isSameDay(date, todayZoned);
          const dayIso = format(date, 'yyyy-MM-dd');
          const dayLessons = lessonsByDay.get(dayIso) ?? [];
          const isWeekend = weekendSet.has(date.getDay());
          return (
            <div key={dayIso} className={`${styles.weekDayCol} ${isToday ? styles.weekDayColToday : ''}`}>
              <div className={styles.weekDayHead}>
                <div className={styles.weekDayLabel}>{WEEKDAYS_SHORT[(idx + 1) % 7]}</div>
                <div className={styles.weekDayNum}>{date.getDate()}</div>
              </div>
              <div
                className={styles.weekDayBody}
                style={{ minHeight: bodyMinHeight }}
                onDragOver={(e: ReactDragEvent<HTMLDivElement>) => {
                  if (!draggedRef.current || !onLessonDropOnSlot) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  const minutes = computeMinutesFromY(e.clientY, e.currentTarget);
                  const snapped = Math.round(minutes / 15) * 15;
                  const topPx = ((snapped - hourStart * 60) / 60) * rowHeight;
                  setDropPreview({ dayIso, topPx });
                }}
                onDragLeave={() => {
                  if (dropPreview?.dayIso === dayIso) setDropPreview(null);
                }}
                onDrop={(e: ReactDragEvent<HTMLDivElement>) => {
                  const lesson = draggedRef.current;
                  draggedRef.current = null;
                  setDropPreview(null);
                  if (!lesson || !onLessonDropOnSlot) return;
                  e.preventDefault();
                  const minutes = computeMinutesFromY(e.clientY, e.currentTarget);
                  onLessonDropOnSlot(lesson, dayIso, minutes);
                }}
              >
                {isToday && nowOffsetPx !== null ? (
                  <span className={styles.nowLine} style={{ top: nowOffsetPx }} aria-hidden />
                ) : null}
                {dropPreview?.dayIso === dayIso ? (
                  <span
                    style={{
                      position: 'absolute',
                      left: 4,
                      right: 4,
                      top: dropPreview.topPx,
                      height: 0,
                      borderTop: '2px dashed var(--sv2-accent-primary)',
                      pointerEvents: 'none',
                    }}
                    aria-hidden
                  />
                ) : null}
                {dayLessons.map((lesson) => {
                  const z = toZonedDate(lesson.startAt, timeZone);
                  const startMinFromAnchor = (z.getHours() - hourStart) * 60 + z.getMinutes();
                  if (startMinFromAnchor < 0) return null;
                  const top = (startMinFromAnchor / 60) * rowHeight;
                  const height = Math.max((lesson.durationMinutes / 60) * rowHeight - 2, 28);
                  const themeKey = resolveLessonThemeKey(lesson);
                  const explicitColorStyle = resolveLessonExplicitColorStyle(lesson);
                  const isDraggable = lesson.status !== 'CANCELED' && lesson.status !== 'COMPLETED';
                  const layout = layoutsByDay.get(dayIso)?.get(lesson.id);
                  const numCols = layout?.numCols ?? 1;
                  const col = layout?.col ?? 0;
                  const gapPx = 2;
                  const leftPct = (col / numCols) * 100;
                  const widthPct = 100 / numCols;
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
                        setDropPreview(null);
                      }}
                      className={[
                        styles.weekBlock,
                        explicitColorStyle ? '' : themeClassMap[themeKey],
                        resolveStatusClass(lesson),
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{
                        ...(explicitColorStyle ?? {}),
                        top,
                        height,
                        left: `calc(${leftPct}% + ${col === 0 ? 0 : gapPx / 2}px)`,
                        width: `calc(${widthPct}% - ${col === 0 || col === numCols - 1 ? gapPx / 2 : gapPx}px)`,
                        right: 'auto',
                      }}
                      onClick={() => onLessonClick(lesson)}
                    >
                      <span className={styles.wbTime}>{formatTime(z)}</span>
                      <span className={styles.wbName}>{resolveLessonName(lesson, linkedStudentsById)}</span>
                      {resolveTopicLine(lesson) ? (
                        <span className={styles.wbSub}>{resolveTopicLine(lesson)}</span>
                      ) : null}
                      {isLessonInSeries(lesson) ? (
                        <SeriesGlyph className={styles.weekBlockSeries} aria-label="Повторяющийся" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

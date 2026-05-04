import {
  type DragEvent as ReactDragEvent,
  type FC,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { addMinutes, format, isSameDay } from 'date-fns';
import type { Lesson, LinkedStudent } from '../../../entities/types';
import { toZonedDate } from '../../../shared/lib/timezoneDates';
import { resolveLessonExplicitColorStyle, resolveLessonThemeKey } from '../lib/lessonThemes';
import { resolveLessonNamesText } from '../lib/lessonParticipants';
import { WEEKDAYS_FULL, MONTHS_GENITIVE, formatTimeRange, pad2 } from '../lib/formatHelpers';
import { isLessonInSeries } from '../../../entities/lesson/lib/lessonDetails';
import { SeriesGlyph } from './SeriesGlyph';
import styles from '../ScheduleSectionV2.module.css';

interface DayViewProps {
  anchor: Date;
  lessons: Lesson[];
  linkedStudentsById: Map<number, LinkedStudent>;
  timeZone: string;
  todayZoned: Date;
  nowMinutes: number;
  hourStart?: number;
  hourEnd?: number;
  rowHeight?: number;
  /** Дни недели, помеченные как выходные (0=вс…6=сб). Drop в выходной запрещён. */
  weekendWeekdays?: number[];
  onLessonClick: (lesson: Lesson) => void;
  /** DnD: drop на конкретное время внутри активного дня. */
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

const pluralize = (count: number) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} урок`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} урока`;
  return `${count} уроков`;
};

export const DayView: FC<DayViewProps> = ({
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
  const dayIso = format(anchor, 'yyyy-MM-dd');
  const isToday = isSameDay(anchor, todayZoned);
  const isWeekend = (weekendWeekdays ?? []).includes(anchor.getDay());

  const draggedRef = useRef<Lesson | null>(null);
  const [dropPreviewTop, setDropPreviewTop] = useState<number | null>(null);

  useEffect(() => {
    const reset = () => {
      draggedRef.current = null;
      setDropPreviewTop(null);
    };
    window.addEventListener('dragend', reset);
    window.addEventListener('drop', reset);
    return () => {
      window.removeEventListener('dragend', reset);
      window.removeEventListener('drop', reset);
    };
  }, []);

  // В DayView высота ряда удвоена (rowHeight * 2 в layout), значит шаг 60min = rowHeight*2 px.
  const computeMinutesFromY = (clientY: number, body: HTMLDivElement) => {
    const rect = body.getBoundingClientRect();
    const offsetY = clientY - rect.top + body.scrollTop;
    return hourStart * 60 + (offsetY / (rowHeight * 2)) * 60;
  };

  const dayLessons = useMemo(() => {
    return lessons
      .filter((lesson) => {
        const z = toZonedDate(lesson.startAt, timeZone);
        return format(z, 'yyyy-MM-dd') === dayIso;
      })
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }, [lessons, timeZone, dayIso]);

  const hours = useMemo(
    () => Array.from({ length: hourEnd - hourStart + 1 }, (_, i) => hourStart + i),
    [hourStart, hourEnd],
  );
  const bodyMinHeight = (hourEnd - hourStart + 1) * rowHeight * 2;

  const nowOffsetPx =
    isToday && nowMinutes >= hourStart * 60 && nowMinutes <= hourEnd * 60 + 60
      ? ((nowMinutes - hourStart * 60) / 60) * rowHeight * 2
      : null;

  const gridRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const pxPerMin = (rowHeight * 2) / 60;
    let targetMinAbs = 9 * 60;
    if (dayLessons.length > 0) {
      const minutesList = dayLessons.map((l) => {
        const z = toZonedDate(l.startAt, timeZone);
        return z.getHours() * 60 + z.getMinutes();
      });
      const minStartAbs = Math.min(...minutesList);
      targetMinAbs = Math.max(hourStart * 60, minStartAbs - 30);
    } else if (isToday) {
      targetMinAbs = Math.max(hourStart * 60, nowMinutes - 60);
    }
    const offsetMinFromStart = targetMinAbs - hourStart * 60;
    el.scrollTop = Math.max(0, offsetMinFromStart * pxPerMin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayIso]);

  return (
    <section className={styles.card}>
      <div className={styles.dayWrap}>
        <div className={styles.dayHeader}>
          <h2 className={styles.dayTitle}>
            {WEEKDAYS_FULL[anchor.getDay()]}, {anchor.getDate()} {MONTHS_GENITIVE[anchor.getMonth()]}
          </h2>
          <span className={styles.dayMeta}>{dayLessons.length ? pluralize(dayLessons.length) : 'Нет уроков'}</span>
        </div>

        <div ref={gridRef} className={styles.dayGrid}>
          <div className={styles.dayTimes}>
            {hours.map((h) => (
              <div key={h} className={styles.dayTimeRow}>
                {pad2(h)}:00
              </div>
            ))}
          </div>
          <div
            className={styles.dayBody}
            style={{ minHeight: bodyMinHeight }}
            onDragOver={(e: ReactDragEvent<HTMLDivElement>) => {
              if (!draggedRef.current || !onLessonDropOnSlot) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              const minutes = computeMinutesFromY(e.clientY, e.currentTarget);
              const snapped = Math.round(minutes / 15) * 15;
              const topPx = ((snapped - hourStart * 60) / 60) * rowHeight * 2;
              setDropPreviewTop(topPx);
            }}
            onDragLeave={() => setDropPreviewTop(null)}
            onDrop={(e: ReactDragEvent<HTMLDivElement>) => {
              const lesson = draggedRef.current;
              draggedRef.current = null;
              setDropPreviewTop(null);
              if (!lesson || !onLessonDropOnSlot) return;
              e.preventDefault();
              const minutes = computeMinutesFromY(e.clientY, e.currentTarget);
              onLessonDropOnSlot(lesson, dayIso, minutes);
            }}
          >
            {nowOffsetPx !== null ? <span className={styles.nowLine} style={{ top: nowOffsetPx }} aria-hidden /> : null}
            {dropPreviewTop !== null ? (
              <span
                style={{
                  position: 'absolute',
                  left: 8,
                  right: 8,
                  top: dropPreviewTop,
                  height: 0,
                  borderTop: '2px dashed var(--sv2-accent-primary)',
                  pointerEvents: 'none',
                }}
                aria-hidden
              />
            ) : null}
            {dayLessons.map((lesson) => {
              const z = toZonedDate(lesson.startAt, timeZone);
              const end = addMinutes(z, lesson.durationMinutes);
              const startMinFromAnchor = (z.getHours() - hourStart) * 60 + z.getMinutes();
              if (startMinFromAnchor < 0) return null;
              const top = (startMinFromAnchor / 60) * rowHeight * 2 + 6;
              const height = Math.max((lesson.durationMinutes / 60) * rowHeight * 2 - 12, 56);
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
                    setDropPreviewTop(null);
                  }}
                  className={[
                    styles.dayBlock,
                    explicitColorStyle ? '' : themeClassMap[themeKey],
                    resolveStatusClass(lesson),
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ ...(explicitColorStyle ?? {}), top, height }}
                  onClick={() => onLessonClick(lesson)}
                >
                  <span className={styles.dbTime}>{formatTimeRange(z, lesson.durationMinutes)}</span>
                  <span className={styles.dbName}>{resolveLessonName(lesson, linkedStudentsById)}</span>
                  {lesson.topic ? <span className={styles.dbSub}>{lesson.topic}</span> : null}
                  {isLessonInSeries(lesson) ? (
                    <SeriesGlyph className={styles.dayBlockSeries} aria-label="Повторяющийся" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

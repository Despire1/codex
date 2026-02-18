import { FC } from 'react';
import { type MobileDashboardDayTimelineItem, type MobileDashboardWeekDay } from '../../model/mobileDashboardPresentation';
import styles from './MobileDashboardSchedule.module.css';

interface MobileDashboardScheduleProps {
  mode: 'day' | 'week';
  dayTimeline: MobileDashboardDayTimelineItem[];
  weekTimeline: MobileDashboardWeekDay[];
  onOpenLesson: (lessonId: number) => void;
  onOpenSchedule: () => void;
}

export const MobileDashboardSchedule: FC<MobileDashboardScheduleProps> = ({
  mode,
  dayTimeline,
  weekTimeline,
  onOpenLesson,
  onOpenSchedule,
}) => {
  const highlightedLessonId = dayTimeline.find((item) => !item.isPast)?.lesson.id ?? null;

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>{mode === 'day' ? 'Расписание сегодня' : 'Расписание недели'}</h3>
        <button type="button" className={styles.openButton} onClick={onOpenSchedule}>
          Открыть
        </button>
      </div>

      {mode === 'day' ? (
        dayTimeline.length === 0 ? (
          <p className={styles.empty}>На сегодня уроков нет.</p>
        ) : (
          <div className={styles.dayTimelineList}>
            {dayTimeline.map((item, index) => (
              <button
                key={item.lesson.id}
                type="button"
                className={`${styles.dayItem} ${item.isPast ? styles.dayItemPast : ''} ${
                  highlightedLessonId === item.lesson.id ? styles.dayItemHighlight : ''
                }`}
                onClick={() => onOpenLesson(item.lesson.id)}
              >
                <div className={styles.timelineCol}>
                  <span
                    className={`${styles.time} ${highlightedLessonId === item.lesson.id ? styles.timeHighlight : ''}`}
                  >
                    {item.startTimeLabel}
                  </span>
                  {index < dayTimeline.length - 1 ? <span className={styles.timelineLine} aria-hidden /> : null}
                  {highlightedLessonId === item.lesson.id ? <span className={styles.timelineDot} aria-hidden /> : null}
                </div>
                <div className={styles.info}>
                  <div className={styles.topRow}>
                    <div className={styles.name}>{item.studentLabel}</div>
                    <span className={`${styles.badge} ${styles[`badge_${item.badgeTone}`]}`}>{item.badgeLabel}</span>
                  </div>
                  <div className={styles.metaRow}>
                    <span className={styles.subtitle}>{item.subtitle}</span>
                    <span className={styles.rangeLabel}>{item.timeLabel}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )
      ) : (
        <div className={styles.weekList}>
          {weekTimeline.filter((day) => day.items.length > 0).length === 0 ? (
            <p className={styles.empty}>На этой неделе занятий нет.</p>
          ) : (
            weekTimeline
              .filter((day) => day.items.length > 0)
              .map((day) => {
                const firstItem = day.items[0];
                return (
                  <button
                    key={day.key}
                    type="button"
                    className={`${styles.weekRow} ${day.isToday ? styles.weekRowToday : ''}`}
                    onClick={() => onOpenLesson(firstItem.lesson.id)}
                  >
                    <div className={styles.weekLabel}>{day.label}</div>
                    <div className={styles.weekMeta}>
                      {day.items.length} {day.items.length === 1 ? 'урок' : day.items.length < 5 ? 'урока' : 'уроков'}
                      {' • '}
                      {firstItem.timeLabel}
                    </div>
                  </button>
                );
              })
          )}
        </div>
      )}
    </section>
  );
};

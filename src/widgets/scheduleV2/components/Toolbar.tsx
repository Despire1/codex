import { type FC } from 'react';
import {
  CalendarDayReferenceIcon,
  CalendarMonthIcon,
  CalendarWeekReferenceIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '../../../icons/MaterialIcons';
import styles from '../ScheduleSectionV2.module.css';

export type ScheduleV2View = 'day' | 'week' | 'month';

interface ToolbarProps {
  view: ScheduleV2View;
  onChangeView: (view: ScheduleV2View) => void;
  periodLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export const Toolbar: FC<ToolbarProps> = ({ view, onChangeView, periodLabel, onPrev, onNext, onToday }) => {
  return (
    <header className={styles.toolbar}>
      <div className={styles.tbLeft}>
        <div className={styles.nav}>
          <button type="button" className={styles.navBtn} aria-label="Назад" onClick={onPrev}>
            <ChevronLeftIcon width={14} height={14} />
          </button>
          <button type="button" className={styles.navBtn} aria-label="Вперёд" onClick={onNext}>
            <ChevronRightIcon width={14} height={14} />
          </button>
        </div>
        <button type="button" className={styles.todayBtn} onClick={onToday}>
          Сегодня
        </button>
        <h2 className={styles.period}>{periodLabel}</h2>
      </div>

      <div className={styles.tbRight}>
        <div className={styles.viewToggle} role="tablist" aria-label="Вид календаря">
          {(['month', 'week', 'day'] as ScheduleV2View[]).map((v) => {
            const Icon =
              v === 'month' ? CalendarMonthIcon : v === 'week' ? CalendarWeekReferenceIcon : CalendarDayReferenceIcon;
            const label = v === 'month' ? 'Месяц' : v === 'week' ? 'Неделя' : 'День';
            return (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                aria-pressed={view === v}
                className={`${styles.viewBtn} ${view === v ? styles.viewBtnActive : ''}`}
                onClick={() => onChangeView(v)}
              >
                <Icon width={14} height={14} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};

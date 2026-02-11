import { FC, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityFeedItem } from '../../../entities/types';
import { useTimeZone } from '../../../shared/lib/timezoneContext';
import controls from '../../../shared/styles/controls.module.css';
import { ActivityFeedTimelineItem } from './ActivityFeedTimelineItem';
import styles from './ActivityFeedCard.module.css';

const DEFAULT_PREVIEW_COUNT = 5;

interface ActivityFeedCardProps {
  items: ActivityFeedItem[];
  loading: boolean;
  activeFiltersCount: number;
  onResetFilters: () => void;
  onOpen: () => void;
}

export const ActivityFeedCard: FC<ActivityFeedCardProps> = ({
  items,
  loading,
  activeFiltersCount,
  onResetFilters,
  onOpen,
}) => {
  const timeZone = useTimeZone();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const measureListRef = useRef<HTMLDivElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(DEFAULT_PREVIEW_COUNT);

  const recalculateVisibleCount = useCallback(() => {
    if (!viewportRef.current || !measureListRef.current || items.length === 0) return;
    const availableHeight = viewportRef.current.clientHeight;
    if (availableHeight <= 0) return;

    const rows = Array.from(measureListRef.current.querySelectorAll<HTMLElement>('[data-feed-measure-row="true"]'));
    if (rows.length === 0) return;

    let usedHeight = 0;
    let nextCount = 0;

    for (const row of rows) {
      const rowHeight = row.offsetHeight;
      if (nextCount > 0 && usedHeight + rowHeight > availableHeight + 1) break;
      usedHeight += rowHeight;
      nextCount += 1;
    }

    const clampedCount = Math.max(1, Math.min(nextCount, items.length));
    setVisibleCount((prev) => (prev === clampedCount ? prev : clampedCount));
  }, [items.length]);

  useLayoutEffect(() => {
    recalculateVisibleCount();
  }, [items, loading, recalculateVisibleCount]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => recalculateVisibleCount());
    if (rootRef.current) observer.observe(rootRef.current);
    if (viewportRef.current) observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, [recalculateVisibleCount]);

  const previewItems = items.slice(0, Math.max(1, Math.min(visibleCount, items.length)));

  return (
    <div className={styles.root} ref={rootRef}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <div className={styles.title}>Лента активности</div>
          {activeFiltersCount > 0 && (
            <span className={styles.filtersBadge}>Фильтры: {activeFiltersCount}</span>
          )}
        </div>
        <div className={styles.actions}>
          {activeFiltersCount > 0 && (
            <button type="button" className={controls.smallButton} onClick={onResetFilters}>
              Сбросить
            </button>
          )}
          <button type="button" className={controls.secondaryButton} onClick={onOpen}>
            Вся история
          </button>
        </div>
      </div>

      {loading ? (
        <div className={styles.state}>Загрузка…</div>
      ) : previewItems.length === 0 ? (
        <div className={styles.state}>Пока нет событий.</div>
      ) : (
        <>
          <div className={styles.listViewport} ref={viewportRef}>
            <div className={styles.list}>
              {previewItems.map((item, index) => (
                <ActivityFeedTimelineItem
                  key={item.id}
                  item={item}
                  timeZone={timeZone}
                  isLast={index === previewItems.length - 1}
                />
              ))}
            </div>
          </div>

          <div className={styles.measurement} aria-hidden>
            <div className={styles.list} ref={measureListRef}>
              {items.map((item, index) => (
                <div key={`measure-${item.id}-${index}`} data-feed-measure-row="true">
                  <ActivityFeedTimelineItem
                    item={item}
                    timeZone={timeZone}
                    isLast={index === items.length - 1}
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

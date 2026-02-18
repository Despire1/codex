import { FC, ReactNode, UIEvent, useEffect, useRef } from 'react';
import { ActivityFeedItem } from '../../../entities/types';
import { useTimeZone } from '../../../shared/lib/timezoneContext';
import controls from '../../../shared/styles/controls.module.css';
import { ActivityFeedTimelineItem } from './ActivityFeedTimelineItem';
import styles from './ActivityFeedFullscreen.module.css';

interface ActivityFeedFullscreenProps {
  items: ActivityFeedItem[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  headerTitle?: string;
  headerAction?: ReactNode;
  fitContainer?: boolean;
  autoLoadMoreOnScroll?: boolean;
}

export const ActivityFeedFullscreen: FC<ActivityFeedFullscreenProps> = ({
  items,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  headerTitle,
  headerAction,
  fitContainer = false,
  autoLoadMoreOnScroll = false,
}) => {
  const timeZone = useTimeZone();
  const autoLoadLockRef = useRef(false);

  useEffect(() => {
    if (!autoLoadMoreOnScroll || loadingMore) return;
    autoLoadLockRef.current = false;
  }, [autoLoadMoreOnScroll, loadingMore, items.length]);

  const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!autoLoadMoreOnScroll || !hasMore || loading || loadingMore) return;
    const element = event.currentTarget;
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (remaining <= 72) {
      if (autoLoadLockRef.current) return;
      autoLoadLockRef.current = true;
      onLoadMore();
    }
  };

  return (
    <div className={`${styles.root} ${fitContainer ? styles.rootFit : ''}`.trim()}>
      {(headerTitle || headerAction) && (
        <div className={styles.header}>
          {headerTitle ? <h3 className={styles.title}>{headerTitle}</h3> : <span />}
          {headerAction}
        </div>
      )}

      {loading ? (
        <div className={`${styles.state} ${fitContainer ? styles.stateFit : ''}`.trim()}>Загрузка…</div>
      ) : items.length === 0 ? (
        <div className={`${styles.state} ${fitContainer ? styles.stateFit : ''}`.trim()}>
          Событий по выбранным фильтрам нет.
        </div>
      ) : (
        <div
          className={`${styles.list} ${fitContainer ? styles.listFit : ''}`.trim()}
          onScroll={autoLoadMoreOnScroll ? handleListScroll : undefined}
        >
          {items.map((item, index) => (
            <ActivityFeedTimelineItem
              key={item.id}
              item={item}
              timeZone={timeZone}
              isLast={index === items.length - 1}
            />
          ))}
          {autoLoadMoreOnScroll && loadingMore ? <div className={styles.loadingMoreState}>Загрузка…</div> : null}
        </div>
      )}

      {hasMore && !loading && !autoLoadMoreOnScroll && (
        <button
          type="button"
          className={`${controls.secondaryButton} ${fitContainer ? styles.loadMoreButton : ''}`.trim()}
          onClick={onLoadMore}
          disabled={loadingMore}
        >
          {loadingMore ? 'Загрузка…' : 'Загрузить ещё'}
        </button>
      )}
    </div>
  );
};

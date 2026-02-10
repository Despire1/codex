import { type FC, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, DashboardIcon } from '../../icons/MaterialIcons';
import { sidebarNavItems, type SidebarNavItem } from './model/navigation';
import styles from './Sidebar.module.css';

const SIDEBAR_COLLAPSED_KEY = 'tb_sidebar_collapsed';
const HOVER_EXPAND_DELAY_MS = 2000;
const HOVER_COLLAPSE_DELAY_MS = 1000;

interface SidebarProps {
  pathname: string;
  onNavigate: (item: SidebarNavItem) => void;
  onToggleCollapsed?: (collapsed: boolean) => void;
  onHoverPreviewChange?: (expanded: boolean) => void;
  items?: SidebarNavItem[];
}

const readCollapsedState = () => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
};

const saveCollapsedState = (collapsed: boolean) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  } catch {
    // ignore persistence errors
  }
};

const isModifiedNavigationEvent = (event: MouseEvent<HTMLAnchorElement>) =>
  event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;

const isItemActive = (item: SidebarNavItem, pathname: string) => {
  if (item.match === 'prefix') {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }
  return pathname === item.href;
};

export const Sidebar: FC<SidebarProps> = ({
  pathname,
  onNavigate,
  onToggleCollapsed,
  onHoverPreviewChange,
  items = sidebarNavItems,
}) => {
  const [manualCollapsed, setManualCollapsed] = useState(readCollapsedState);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const expandTimerRef = useRef<number | null>(null);
  const collapseTimerRef = useRef<number | null>(null);
  const isCollapsed = manualCollapsed && !hoverExpanded;
  const primaryItems = useMemo(() => items.filter((item) => item.section === 'primary'), [items]);
  const settingsItems = useMemo(() => items.filter((item) => item.section === 'settings'), [items]);

  const clearExpandTimer = useCallback(() => {
    if (expandTimerRef.current === null) return;
    window.clearTimeout(expandTimerRef.current);
    expandTimerRef.current = null;
  }, []);

  const clearCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current === null) return;
    window.clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearExpandTimer();
      clearCollapseTimer();
    };
  }, [clearCollapseTimer, clearExpandTimer]);

  useEffect(() => {
    if (manualCollapsed) return;
    clearExpandTimer();
    clearCollapseTimer();
    setHoverExpanded(false);
  }, [clearCollapseTimer, clearExpandTimer, manualCollapsed]);

  const onItemClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, item: SidebarNavItem) => {
      if (isModifiedNavigationEvent(event)) return;
      event.preventDefault();
      onNavigate(item);
    },
    [onNavigate],
  );

  const onMouseEnterSidebar = useCallback(() => {
    clearCollapseTimer();
    if (!manualCollapsed || hoverExpanded) return;
    clearExpandTimer();
    expandTimerRef.current = window.setTimeout(() => {
      expandTimerRef.current = null;
      setHoverExpanded((prev) => {
        if (prev) return prev;
        onHoverPreviewChange?.(true);
        return true;
      });
    }, HOVER_EXPAND_DELAY_MS);
  }, [clearCollapseTimer, clearExpandTimer, hoverExpanded, manualCollapsed, onHoverPreviewChange]);

  const onMouseLeaveSidebar = useCallback(() => {
    clearExpandTimer();
    if (!manualCollapsed || !hoverExpanded) return;
    clearCollapseTimer();
    collapseTimerRef.current = window.setTimeout(() => {
      collapseTimerRef.current = null;
      setHoverExpanded((prev) => {
        if (!prev) return prev;
        onHoverPreviewChange?.(false);
        return false;
      });
    }, HOVER_COLLAPSE_DELAY_MS);
  }, [clearCollapseTimer, clearExpandTimer, hoverExpanded, manualCollapsed, onHoverPreviewChange]);

  const onToggle = useCallback(() => {
    clearExpandTimer();
    clearCollapseTimer();
    setHoverExpanded((prev) => {
      if (!prev) return prev;
      onHoverPreviewChange?.(false);
      return false;
    });
    setManualCollapsed((prev) => {
      const next = !prev;
      saveCollapsedState(next);
      onToggleCollapsed?.(next);
      return next;
    });
  }, [clearCollapseTimer, clearExpandTimer, onHoverPreviewChange, onToggleCollapsed]);

  const renderItem = (item: SidebarNavItem) => {
    const active = isItemActive(item, pathname);
    const hasBadgeCount = typeof item.badgeCount === 'number';
    const hasBadge = hasBadgeCount || item.hasUnreadDot;

    return (
      <a
        key={item.id}
        href={item.href}
        className={`${styles.navLink} ${active ? styles.navLinkActive : ''}`}
        onClick={(event) => onItemClick(event, item)}
        aria-current={active ? 'page' : undefined}
        title={isCollapsed ? item.label : undefined}
      >
        <span className={styles.navIcon} aria-hidden>
          <item.icon width={20} height={20} />
        </span>
        <span className={styles.navLabel}>{item.label}</span>
        {!isCollapsed && hasBadgeCount && <span className={styles.navBadge}>{item.badgeCount}</span>}
        {!isCollapsed && !hasBadgeCount && item.hasUnreadDot && <span className={styles.navDot} aria-hidden />}
        {isCollapsed && hasBadge && <span className={styles.navCollapsedIndicator} aria-hidden />}
      </a>
    );
  };

  return (
    <aside
      className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}
      aria-label="Навигация по разделам"
      onMouseEnter={onMouseEnterSidebar}
      onMouseLeave={onMouseLeaveSidebar}
    >
      <div className={styles.brand}>
        <span className={styles.brandLogo} aria-hidden>
          <DashboardIcon width={20} height={20} />
        </span>
        <span className={styles.brandText}>TeacherBot</span>
      </div>

      <div className={styles.navScroll}>
        <nav className={styles.navSection} aria-label="Основная навигация">
          {primaryItems.map(renderItem)}
        </nav>

        {settingsItems.length > 0 ? (
          <>
            <div className={styles.sectionDivider} />
            <nav className={styles.navSection} aria-label="Настройки">
              {settingsItems.map(renderItem)}
            </nav>
          </>
        ) : null}
      </div>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.toggleButton}
          onClick={onToggle}
          aria-label={manualCollapsed ? 'Развернуть меню' : 'Свернуть меню'}
        >
          <span className={styles.toggleIcon} aria-hidden>
            {manualCollapsed ? <ChevronRightIcon width={18} height={18} /> : <ChevronLeftIcon width={18} height={18} />}
          </span>
          <span className={styles.toggleLabel}>{manualCollapsed ? 'Развернуть' : 'Свернуть'}</span>
        </button>
      </div>
    </aside>
  );
};

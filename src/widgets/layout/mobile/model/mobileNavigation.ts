import type { ComponentType, SVGProps } from 'react';
import type { AppTab, TabId } from '@/app/tabs';
import {
  AnalyticsIcon,
  BookOpenIcon,
  CalendarIcon,
  ChartPieIcon,
  SettingsIcon,
  UserGroupIcon,
} from '@/icons/MaterialIcons';

export type MobileNavPlacement = 'drawer' | 'tabbar';

export interface MobileNavItem {
  id: TabId;
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  placement: MobileNavPlacement;
  order: number;
  badgeCount?: number;
  hasUnreadDot?: boolean;
}

interface BuildMobileNavigationParams {
  tabs: readonly AppTab[];
  isStudentRole: boolean;
  homeworksBadgeCount?: number;
}

const iconByTab: Partial<Record<TabId, MobileNavItem['icon']>> = {
  dashboard: ChartPieIcon,
  students: UserGroupIcon,
  schedule: CalendarIcon,
  homeworks: BookOpenIcon,
  analytics: AnalyticsIcon,
  settings: SettingsIcon,
};

const teacherDrawerOrder: Record<TabId, number> = {
  dashboard: 10,
  schedule: 20,
  students: 30,
  homeworks: 40,
  analytics: 50,
  settings: 60,
};

const studentDrawerOrder: Record<TabId, number> = {
  dashboard: 10,
  homeworks: 20,
  settings: 30,
  students: 40,
  schedule: 50,
  analytics: 60,
};

const teacherTabbarOrder: Partial<Record<TabId, number>> = {
  dashboard: 10,
  schedule: 20,
  homeworks: 30,
  students: 40,
};

const studentTabbarOrder: Partial<Record<TabId, number>> = {
  dashboard: 10,
  homeworks: 20,
  settings: 30,
};

const toSafeBadgeCount = (value: number | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.min(99, Math.round(value));
};

export const buildMobileNavigation = ({
  tabs,
  isStudentRole,
  homeworksBadgeCount,
}: BuildMobileNavigationParams): MobileNavItem[] => {
  const drawerOrder = isStudentRole ? studentDrawerOrder : teacherDrawerOrder;
  const tabbarOrder = isStudentRole ? studentTabbarOrder : teacherTabbarOrder;
  const normalizedHomeworkBadge = toSafeBadgeCount(homeworksBadgeCount);

  return tabs
    .flatMap<MobileNavItem>((tab) => {
      const icon = iconByTab[tab.id] ?? tab.icon;
      const base = {
        id: tab.id,
        label: tab.label,
        href: tab.path,
        icon,
      } as const;

      const drawerItem: MobileNavItem = {
        ...base,
        placement: 'drawer',
        order: drawerOrder[tab.id] ?? 999,
      };

      if (tab.id === 'homeworks') {
        drawerItem.badgeCount = normalizedHomeworkBadge;
      }

      const tabbarPriority = tabbarOrder[tab.id];
      if (typeof tabbarPriority !== 'number') {
        return [drawerItem];
      }

      const tabbarItem: MobileNavItem = {
        ...base,
        placement: 'tabbar',
        order: tabbarPriority,
      };

      if (tab.id === 'homeworks') {
        tabbarItem.badgeCount = normalizedHomeworkBadge;
      }

      return [drawerItem, tabbarItem];
    })
    .sort((left, right) => {
      if (left.placement !== right.placement) {
        return left.placement === 'drawer' ? -1 : 1;
      }
      if (left.order !== right.order) {
        return left.order - right.order;
      }
      return left.label.localeCompare(right.label, 'ru');
    });
};

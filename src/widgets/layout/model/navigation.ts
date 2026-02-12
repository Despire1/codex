import type { ComponentType, SVGProps } from 'react';
import { tabs, type AppTab, type TabId } from '../../../app/tabs';

export type SidebarNavSection = 'primary' | 'settings';
export type SidebarNavMatch = 'exact' | 'prefix';

export interface SidebarNavItem {
  id: TabId;
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  section: SidebarNavSection;
  match: SidebarNavMatch;
  badgeCount?: number;
  hasUnreadDot?: boolean;
}

const sectionByTab: Record<TabId, SidebarNavSection> = {
  dashboard: 'primary',
  students: 'primary',
  schedule: 'primary',
  homeworks: 'primary',
  analytics: 'primary',
  settings: 'settings',
};

const matchByTab: Record<TabId, SidebarNavMatch> = {
  dashboard: 'exact',
  students: 'exact',
  schedule: 'exact',
  homeworks: 'exact',
  analytics: 'exact',
  settings: 'prefix',
};

export const buildSidebarNavItems = (tabItems: readonly AppTab[]): SidebarNavItem[] =>
  tabItems.map((tab) => ({
    id: tab.id,
    label: tab.label,
    href: tab.path,
    icon: tab.icon,
    section: sectionByTab[tab.id],
    match: matchByTab[tab.id],
  }));

export const sidebarNavItems: SidebarNavItem[] = buildSidebarNavItems(tabs);

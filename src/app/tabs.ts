import { AnalyticsIcon, DashboardIcon, EventNoteIcon, PeopleIcon, SettingsIcon } from '../icons/MaterialIcons';

export const tabs = [
  { id: 'dashboard', label: 'Главная', icon: DashboardIcon, path: '/dashboard' },
  { id: 'students', label: 'Ученики', icon: PeopleIcon, path: '/students' },
  { id: 'schedule', label: 'Расписание', icon: EventNoteIcon, path: '/schedule' },
  { id: 'analytics', label: 'Аналитика', icon: AnalyticsIcon, path: '/analytics' },
  { id: 'settings', label: 'Настройки', icon: SettingsIcon, path: '/settings' },
] as const;

export type TabId = (typeof tabs)[number]['id'];

export const tabPathById: Record<TabId, string> = tabs.reduce(
  (acc, tab) => ({ ...acc, [tab.id]: tab.path }),
  {} as Record<TabId, string>,
);

export const tabIdByPath: Record<string, TabId> = tabs.reduce(
  (acc, tab) => ({ ...acc, [tab.path]: tab.id }),
  {} as Record<string, TabId>,
);

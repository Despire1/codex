import {
  AnalyticsIcon,
  DashboardIcon,
  EventNoteIcon,
  PeopleIcon,
  SettingsIcon,
  TaskAltIcon,
} from '../icons/MaterialIcons';

export const teacherTabs = [
  { id: 'dashboard', label: 'Главная', icon: DashboardIcon, path: '/dashboard' },
  { id: 'students', label: 'Ученики', icon: PeopleIcon, path: '/students' },
  { id: 'schedule', label: 'Расписание', icon: EventNoteIcon, path: '/schedule' },
  { id: 'homeworks', label: 'Домашки', icon: TaskAltIcon, path: '/homeworks' },
  { id: 'analytics', label: 'Аналитика', icon: AnalyticsIcon, path: '/analytics' },
  { id: 'settings', label: 'Настройки', icon: SettingsIcon, path: '/settings' },
] as const;

export const studentTabs = [
  { id: 'dashboard', label: 'Главная', icon: DashboardIcon, path: '/dashboard' },
  { id: 'homeworks', label: 'Домашки', icon: TaskAltIcon, path: '/homeworks' },
  { id: 'settings', label: 'Настройки', icon: SettingsIcon, path: '/settings' },
] as const;

export const tabs = teacherTabs;

export type TabId = (typeof teacherTabs)[number]['id'];
export type AppRole = 'TEACHER' | 'STUDENT';
export type AppTab = (typeof teacherTabs)[number];

export const getTabsByRole = (role: AppRole): AppTab[] =>
  (role === 'STUDENT' ? studentTabs : teacherTabs).map((tab) => ({ ...tab }));

export const tabPathById: Record<TabId, string> = teacherTabs.reduce(
  (acc, tab) => ({ ...acc, [tab.id]: tab.path }),
  {} as Record<TabId, string>,
);

export const tabIdByPath: Record<string, TabId> = teacherTabs.reduce(
  (acc, tab) => ({ ...acc, [tab.path]: tab.id }),
  {} as Record<string, TabId>,
);

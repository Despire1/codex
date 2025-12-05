import { DashboardIcon, EventNoteIcon, PeopleIcon, SettingsIcon } from '../icons/MaterialIcons';

export const tabs = [
  { id: 'dashboard', label: 'Главная', icon: DashboardIcon },
  { id: 'students', label: 'Ученики', icon: PeopleIcon },
  { id: 'schedule', label: 'Расписание', icon: EventNoteIcon },
  { id: 'settings', label: 'Настройки', icon: SettingsIcon },
] as const;

export type TabId = (typeof tabs)[number]['id'];

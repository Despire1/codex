export const SETTINGS_TABS = [
  { id: 'profile', label: 'Профиль' },
  { id: 'schedule', label: 'Расписание' },
  { id: 'notifications', label: 'Уведомления' },
  { id: 'security', label: 'Доступ и безопасность' },
] as const;

export type SettingsTabId = (typeof SETTINGS_TABS)[number]['id'];

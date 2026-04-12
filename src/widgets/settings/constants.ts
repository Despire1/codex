export const SETTINGS_TABS = [
  { id: 'profile', label: 'Аккаунт' },
  { id: 'schedule', label: 'Учебный процесс' },
  { id: 'notifications', label: 'Уведомления' },
  { id: 'security', label: 'Безопасность' },
] as const;

export type SettingsTabId = (typeof SETTINGS_TABS)[number]['id'];

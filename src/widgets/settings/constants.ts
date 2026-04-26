export const SETTINGS_TABS = [
  { id: 'profile', label: 'Аккаунт', hidden: false },
  { id: 'schedule', label: 'Учебный процесс', hidden: false },
  { id: 'notifications', label: 'Уведомления', hidden: false },
  { id: 'appearance', label: 'Внешний вид', hidden: true },
  { id: 'security', label: 'Безопасность', hidden: false },
] as const;

export type SettingsTabId = (typeof SETTINGS_TABS)[number]['id'];

export const VISIBLE_SETTINGS_TABS = SETTINGS_TABS.filter((tab) => !tab.hidden);

import { isThemeMode, ThemeMode } from '../model/types';

export const THEME_STORAGE_KEY = 'app_theme_mode';

export const readStoredThemeMode = (): ThemeMode | null => {
  if (typeof localStorage === 'undefined') return null;
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(value) ? value : null;
  } catch {
    return null;
  }
};

export const writeStoredThemeMode = (mode: ThemeMode) => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // ignore quota / privacy errors
  }
};

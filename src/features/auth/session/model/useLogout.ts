import { useCallback, useState } from 'react';
import { api } from '../../../../shared/api/client';

const PRESERVED_LOCAL_STORAGE_KEYS = new Set<string>([
  'app_theme_mode',
  'tb_sidebar_collapsed',
  'tb_changelog_last_seen',
  'teacherbot_pwa_notifications_prompt_seen_v1',
]);

const wipeAccountStorage = () => {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && !PRESERVED_LOCAL_STORAGE_KEYS.has(key)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  } catch (_error) {
    // Safari private mode etc.
  }
  try {
    window.sessionStorage.clear();
  } catch (_error) {
    // ignore
  }
};

type UseLogoutOptions = {
  redirectTo?: string;
  onAfterLogout?: () => void;
};

export const useLogout = ({ redirectTo = '/auth/login', onAfterLogout }: UseLogoutOptions = {}) => {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const logout = useCallback(async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try {
      await Promise.allSettled([api.logout(), api.cancelTelegramDeepLinkLogin()]);
    } catch (error) {
      console.error('Logout request failed', error);
    }

    wipeAccountStorage();

    onAfterLogout?.();

    if (typeof window !== 'undefined') {
      window.location.replace(redirectTo);
    }
  }, [isLoggingOut, onAfterLogout, redirectTo]);

  return { logout, isLoggingOut };
};

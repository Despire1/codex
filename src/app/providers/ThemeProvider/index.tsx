import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import type { TelegramWindow } from '@/shared/telegram/types';
import type { RootState } from '../StoreProvider/config/store';
import { applyTheme } from '@/entities/theme/lib/applyTheme';
import { getMediaQueryColorScheme, getTelegramColorScheme } from '@/entities/theme/lib/resolveSystemTheme';
import type { ResolvedTheme, ThemeMode } from '@/entities/theme/model/types';

const resolveTheme = (mode: ThemeMode, system: ResolvedTheme): ResolvedTheme => {
  if (mode === 'light' || mode === 'dark') return mode;
  return system;
};

const subscribeMediaQuery = (handler: (next: ResolvedTheme) => void) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = (event: MediaQueryListEvent) => handler(event.matches ? 'dark' : 'light');
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }
  // Safari < 14
  mql.addListener(onChange);
  return () => mql.removeListener(onChange);
};

const subscribeTelegramTheme = (handler: () => void) => {
  if (typeof window === 'undefined') return undefined;
  const tg = (window as TelegramWindow).Telegram?.WebApp;
  if (!tg || typeof tg.onEvent !== 'function') return undefined;
  tg.onEvent('themeChanged', handler);
  return () => {
    tg.offEvent?.('themeChanged', handler);
  };
};

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const mode = useSelector((state: RootState) => state.theme.mode);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(
    () => getTelegramColorScheme() ?? getMediaQueryColorScheme(),
  );

  useEffect(() => {
    const refreshSystem = () => {
      setSystemTheme(getTelegramColorScheme() ?? getMediaQueryColorScheme());
    };
    const offMql = subscribeMediaQuery((next) => {
      setSystemTheme(getTelegramColorScheme() ?? next);
    });
    const offTg = subscribeTelegramTheme(refreshSystem);
    return () => {
      offMql?.();
      offTg?.();
    };
  }, []);

  const resolved = useMemo(() => resolveTheme(mode, systemTheme), [mode, systemTheme]);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  return <>{children}</>;
};

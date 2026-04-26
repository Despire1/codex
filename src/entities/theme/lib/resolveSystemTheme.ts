import type { TelegramWebApp, TelegramWindow } from '@/shared/telegram/types';
import { ResolvedTheme } from '../model/types';

const getTelegramWebApp = (): TelegramWebApp | null => {
  if (typeof window === 'undefined') return null;
  return (window as TelegramWindow).Telegram?.WebApp ?? null;
};

const isInsideTelegram = (tg: TelegramWebApp): boolean => {
  // Telegram WebApp скрипт всегда подгружен в index.html, поэтому объект
  // доступен и в обычном браузере. Доверяем colorScheme только если приложение
  // реально открыто как Mini App — initData непустой.
  return Boolean(tg.initData && tg.initData.length > 0);
};

export const getTelegramColorScheme = (): ResolvedTheme | null => {
  const tg = getTelegramWebApp();
  if (!tg || !isInsideTelegram(tg)) return null;
  if (tg.colorScheme === 'dark' || tg.colorScheme === 'light') return tg.colorScheme;
  return null;
};

export const getMediaQueryColorScheme = (): ResolvedTheme => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const resolveSystemTheme = (): ResolvedTheme => {
  return getTelegramColorScheme() ?? getMediaQueryColorScheme();
};

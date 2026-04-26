import type { TelegramWindow } from './types';

const getHapticFeedback = () => {
  if (typeof window === 'undefined') return null;
  return (window as unknown as TelegramWindow).Telegram?.WebApp?.HapticFeedback ?? null;
};

export const hapticImpact = (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'light') => {
  const haptics = getHapticFeedback();
  haptics?.impactOccurred?.(style);
};

export const hapticNotify = (type: 'error' | 'success' | 'warning') => {
  const haptics = getHapticFeedback();
  haptics?.notificationOccurred?.(type);
};

export const hapticSelection = () => {
  const haptics = getHapticFeedback();
  haptics?.selectionChanged?.();
};

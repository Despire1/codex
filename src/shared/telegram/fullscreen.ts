import { isDesktopPlatform, isMobilePlatform } from './platform';
import { type TelegramWindow } from './types';

const isDev = import.meta.env.DEV;

const trackEvent = (event: string, payload: Record<string, unknown>) => {
  const analytics = (window as unknown as TelegramWindow).analytics;
  if (analytics?.track) {
    analytics.track(event, payload);
  }
};

const normalizeReason = (reason: unknown): string => {
  if (typeof reason === 'string') {
    return reason;
  }

  if (typeof reason === 'object' && reason !== null && 'reason' in reason) {
    const value = (reason as { reason?: unknown }).reason;
    if (typeof value === 'string') {
      return value;
    }
  }

  if (typeof reason === 'undefined') {
    return 'UNKNOWN';
  }

  try {
    return JSON.stringify(reason);
  } catch {
    return 'UNKNOWN';
  }
};

const logDev = (message: string, payload?: unknown) => {
  if (!isDev) {
    return;
  }

  if (typeof payload === 'undefined') {
    console.log(message);
  } else {
    console.log(message, payload);
  }
};

const warnDev = (message: string, payload?: unknown) => {
  if (!isDev) {
    return;
  }

  if (typeof payload === 'undefined') {
    console.warn(message);
  } else {
    console.warn(message, payload);
  }
};

const setBodyFlag = (className: string, enabled: boolean) => {
  if (typeof document === 'undefined') {
    return;
  }

  document.body.classList.toggle(className, enabled);
};

export const initTelegramFullscreen = () => {
  const tg = (window as unknown as TelegramWindow).Telegram?.WebApp;

  if (!tg) {
    return;
  }

  const isMobile = isMobilePlatform(tg.platform);
  const isDesktop = isDesktopPlatform(tg.platform);

  tg.ready();
  tg.expand();
  if (isMobile && typeof tg.disableVerticalSwipes === 'function') {
    try {
      tg.disableVerticalSwipes();
    } catch (error) {
      warnDev('Telegram disableVerticalSwipes failed', { error });
    }
  }

  const handleFullscreenChanged = () => {
    const isFullscreen = Boolean(tg.isFullscreen);
    setBodyFlag('tg-fullscreen', isFullscreen);
    trackEvent('tg_fullscreen_changed', { isFullscreen });
    logDev('Telegram fullscreen state changed', { isFullscreen });
  };

  const handleFullscreenFailed = (reason?: unknown) => {
    const normalizedReason = normalizeReason(reason);
    setBodyFlag('tg-fullscreen', false);
    trackEvent('tg_fullscreen_failed', { reason: normalizedReason });
    warnDev('Telegram fullscreen request failed', { reason: normalizedReason });
    tg.expand();
  };

  if (typeof tg.onEvent === 'function') {
    tg.onEvent('fullscreenChanged', handleFullscreenChanged);
    tg.onEvent('fullscreenFailed', handleFullscreenFailed);
  }

  setBodyFlag('tg-fullscreen', Boolean(tg.isFullscreen));

  if ((isMobile || isDesktop) && typeof tg.requestFullscreen === 'function' && !tg.isFullscreen) {
    try {
      tg.requestFullscreen();
    } catch (error) {
      handleFullscreenFailed(error);
    }
  }

  return () => {
    if (typeof tg.offEvent === 'function') {
      tg.offEvent('fullscreenChanged', handleFullscreenChanged);
      tg.offEvent('fullscreenFailed', handleFullscreenFailed);
    }
    setBodyFlag('tg-fullscreen', false);
  };
};

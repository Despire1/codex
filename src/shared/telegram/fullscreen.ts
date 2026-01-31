type TelegramWebApp = {
  ready: () => void;
  expand: () => void;
  requestFullscreen?: () => void;
  onEvent?: (event: string, handler: (payload?: unknown) => void) => void;
  isFullscreen?: boolean;
};

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
  analytics?: {
    track?: (event: string, payload?: Record<string, unknown>) => void;
  };
};

const isDev = import.meta.env.DEV;

const trackEvent = (event: string, payload: Record<string, unknown>) => {
  const analytics = (window as TelegramWindow).analytics;
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

export const initTelegramFullscreen = () => {
  const tg = (window as TelegramWindow).Telegram?.WebApp;

  if (!tg) {
    return;
  }

  tg.ready();
  tg.expand();

  const handleFullscreenChanged = () => {
    const isFullscreen = Boolean(tg.isFullscreen);
    trackEvent('tg_fullscreen_changed', { isFullscreen });
    logDev('Telegram fullscreen state changed', { isFullscreen });
  };

  const handleFullscreenFailed = (reason?: unknown) => {
    const normalizedReason = normalizeReason(reason);
    trackEvent('tg_fullscreen_failed', { reason: normalizedReason });
    warnDev('Telegram fullscreen request failed', { reason: normalizedReason });
    tg.expand();
  };

  if (typeof tg.onEvent === 'function') {
    tg.onEvent('fullscreenChanged', handleFullscreenChanged);
    tg.onEvent('fullscreenFailed', handleFullscreenFailed);
  }

  if (typeof tg.requestFullscreen === 'function') {
    try {
      tg.requestFullscreen();
    } catch (error) {
      handleFullscreenFailed(error);
    }
  }
};

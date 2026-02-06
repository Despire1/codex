import { isMobilePlatform } from './platform';
import { type TelegramWebApp, type TelegramWindow } from './types';

type Insets = { top?: number; right?: number; bottom?: number; left?: number };

const toPx = (value: unknown) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  const safe = Number.isFinite(numeric) ? numeric : 0;
  return `${Math.max(0, Math.round(safe))}px`;
};

const resolveInsets = (webApp: TelegramWebApp) => {
  const content: Insets = webApp.contentSafeAreaInset ?? {};
  const system: Insets = webApp.safeAreaInset ?? {};

  return {
    top: content.top ?? system.top ?? 0,
    right: content.right ?? system.right ?? 0,
    bottom: content.bottom ?? system.bottom ?? 0,
    left: content.left ?? system.left ?? 0,
  };
};

const applyInsets = (root: HTMLElement, webApp: TelegramWebApp) => {
  const insets = resolveInsets(webApp);
  const viewportHeight = typeof webApp.viewportHeight === 'number' ? webApp.viewportHeight : window.innerHeight;
  const viewportStableHeight =
    typeof webApp.viewportStableHeight === 'number' ? webApp.viewportStableHeight : window.innerHeight;
  const platform = String(webApp.platform ?? '').toLowerCase();
  const minTop = platform === 'ios' ? 44 : 0;
  const topExtra = platform === 'ios' ? Math.max(0, minTop - (insets.top ?? 0)) : 0;

  root.style.setProperty('--app-safe-top', toPx(insets.top));
  root.style.setProperty('--app-safe-top-extra', toPx(topExtra));
  root.style.setProperty('--app-safe-right', toPx(insets.right));
  root.style.setProperty('--app-safe-bottom', toPx(insets.bottom));
  root.style.setProperty('--app-safe-left', toPx(insets.left));
  root.style.setProperty('--app-vh', toPx(viewportHeight));
  root.style.setProperty('--app-vh-stable', toPx(viewportStableHeight));
};

const resetInsets = (root: HTMLElement) => {
  root.style.setProperty('--app-safe-top', '0px');
  root.style.setProperty('--app-safe-top-extra', '0px');
  root.style.setProperty('--app-safe-right', '0px');
  root.style.setProperty('--app-safe-bottom', '0px');
  root.style.setProperty('--app-safe-left', '0px');
  root.style.setProperty('--app-vh', '100vh');
  root.style.setProperty('--app-vh-stable', '100vh');
};

export const initTelegramLayoutInsetsMobileOnly = (root: HTMLElement = document.documentElement) => {
  const tg = (window as TelegramWindow).Telegram?.WebApp;
  if (!tg) {
    return () => undefined;
  }

  const platform = String(tg.platform ?? '');
  const platformLower = platform.toLowerCase();
  const isMobile = isMobilePlatform(platformLower);

  if (!isMobile) {
    root.classList.add('tg-desktop');
    root.classList.remove('tg-mobile');
    root.classList.remove('tg-ios');
    root.classList.remove('tg-android');
    resetInsets(root);
    return () => undefined;
  }

  root.classList.add('tg-mobile');
  root.classList.remove('tg-desktop');
  root.classList.toggle('tg-ios', platformLower === 'ios');
  root.classList.toggle('tg-android', platformLower === 'android');

  let rafId = 0;
  const schedule = () => {
    if (rafId) {
      return;
    }
    rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      applyInsets(root, tg);
    });
  };

  tg.ready?.();
  applyInsets(root, tg);

  tg.onEvent?.('safeAreaChanged', schedule);
  tg.onEvent?.('contentSafeAreaChanged', schedule);
  tg.onEvent?.('viewportChanged', schedule);

  return () => {
    if (rafId) {
      window.cancelAnimationFrame(rafId);
    }
    tg.offEvent?.('safeAreaChanged', schedule);
    tg.offEvent?.('contentSafeAreaChanged', schedule);
    tg.offEvent?.('viewportChanged', schedule);
    root.classList.remove('tg-mobile');
    root.classList.remove('tg-desktop');
    root.classList.remove('tg-ios');
    root.classList.remove('tg-android');
  };
};

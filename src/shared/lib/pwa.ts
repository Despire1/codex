type IOSNavigator = Navigator & {
  standalone?: boolean;
};

const STANDALONE_MEDIA_QUERY = '(display-mode: standalone)';
const APPLE_MOBILE_DEVICE_PATTERN = /iPad|iPhone|iPod/i;
const APPLE_DESKTOP_TOUCH_PATTERN = /Mac/i;

export const isStandaloneDisplayMode = () => {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.(STANDALONE_MEDIA_QUERY).matches) return true;
  return (window.navigator as IOSNavigator).standalone === true;
};

export const isAppleStandaloneWebApp = () => {
  if (typeof window === 'undefined') return false;

  const navigator = window.navigator as IOSNavigator;
  const userAgent = navigator.userAgent ?? '';
  const platform = navigator.platform ?? '';
  const isAppleMobileDevice =
    APPLE_MOBILE_DEVICE_PATTERN.test(userAgent) ||
    (APPLE_DESKTOP_TOUCH_PATTERN.test(platform) && navigator.maxTouchPoints > 1);

  return isAppleMobileDevice && isStandaloneDisplayMode();
};


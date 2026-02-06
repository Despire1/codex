const MOBILE_PLATFORMS = new Set(['ios', 'android']);
const DESKTOP_PLATFORMS = new Set(['tdesktop', 'macos', 'windows', 'linux', 'web', 'weba']);

export const isMobilePlatform = (platform?: string) => {
  if (!platform) {
    return false;
  }

  return MOBILE_PLATFORMS.has(platform.toLowerCase());
};

export const isDesktopPlatform = (platform?: string) => {
  if (!platform) {
    return false;
  }

  return DESKTOP_PLATFORMS.has(platform.toLowerCase());
};

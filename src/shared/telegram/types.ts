export type TelegramSafeAreaInset = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

export type TelegramHapticFeedback = {
  impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
  notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
  selectionChanged?: () => void;
};

export type TelegramThemeParams = {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
};

export type TelegramWebApp = {
  ready: () => void;
  expand: () => void;
  requestFullscreen?: () => void;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  isVerticalSwipesEnabled?: boolean;
  onEvent?: (event: string, handler: (payload?: unknown) => void) => void;
  offEvent?: (event: string, handler: (payload?: unknown) => void) => void;
  isFullscreen?: boolean;
  platform?: string;
  initData?: string;
  colorScheme?: 'light' | 'dark';
  themeParams?: TelegramThemeParams;
  HapticFeedback?: TelegramHapticFeedback;
  safeAreaInset?: TelegramSafeAreaInset;
  contentSafeAreaInset?: TelegramSafeAreaInset;
  viewportHeight?: number;
  viewportStableHeight?: number;
};

export type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
  analytics?: {
    track?: (event: string, payload?: Record<string, unknown>) => void;
  };
};

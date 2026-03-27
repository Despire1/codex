import { isStandaloneDisplayMode } from './pwa';

const NOTIFICATION_PROMPT_SEEN_KEY = 'teacherbot_pwa_notifications_prompt_seen_v1';
const TEST_NOTIFICATION_TAG = 'teacherbot-pwa-test';

export type PwaNotificationPermission = NotificationPermission | 'unsupported';

const getNotificationAssetUrl = (pathname: string) => {
  if (typeof window === 'undefined') return pathname;
  return new URL(pathname, window.location.origin).toString();
};

export const isPwaNotificationSupported = () => {
  if (typeof window === 'undefined') return false;
  return 'Notification' in window && 'serviceWorker' in navigator && window.isSecureContext;
};

export const getPwaNotificationPermission = (): PwaNotificationPermission => {
  if (!isPwaNotificationSupported()) return 'unsupported';
  return Notification.permission;
};

export const shouldPromptForPwaNotifications = () => {
  if (!isStandaloneDisplayMode()) return false;
  if (!isPwaNotificationSupported()) return false;
  if (getPwaNotificationPermission() !== 'default') return false;

  try {
    return window.localStorage.getItem(NOTIFICATION_PROMPT_SEEN_KEY) !== 'true';
  } catch {
    return true;
  }
};

export const markPwaNotificationPromptSeen = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(NOTIFICATION_PROMPT_SEEN_KEY, 'true');
  } catch {
    // ignore storage failures
  }
};

export const requestPwaNotificationPermission = async (): Promise<PwaNotificationPermission> => {
  if (!isPwaNotificationSupported()) return 'unsupported';
  return Notification.requestPermission();
};

export const showPwaTestNotification = async () => {
  if (!isPwaNotificationSupported()) {
    return { ok: false as const, reason: 'unsupported' as const };
  }

  if (Notification.permission !== 'granted') {
    return { ok: false as const, reason: 'permission' as const };
  }

  const icon = getNotificationAssetUrl('/apple-touch-icon.png');
  const targetUrl = `${window.location.origin}/dashboard`;
  const options: NotificationOptions = {
    body: 'TeacherBot подключен. Уведомления на этом устройстве работают.',
    icon,
    badge: icon,
    tag: TEST_NOTIFICATION_TAG,
    requireInteraction: false,
    data: { url: targetUrl },
  };

  const registration = await navigator.serviceWorker.ready.catch(() => null);
  if (registration) {
    await registration.showNotification('Тестовое уведомление TeacherBot', options);
    return { ok: true as const };
  }

  new Notification('Тестовое уведомление TeacherBot', options);
  return { ok: true as const };
};

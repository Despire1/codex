import { api } from '../api/client';
import { getPwaRouteMode, isStandaloneDisplayMode } from './pwa';
import type { PwaPushSubscriptionPayload } from './pwaPush';

const NOTIFICATION_PROMPT_SEEN_KEY = 'teacherbot_pwa_notifications_prompt_seen_v1';
const TEST_NOTIFICATION_TAG_PREFIX = 'teacherbot-pwa-test';

export type PwaNotificationPermission = NotificationPermission | 'unsupported';

type PwaNotificationChannelResult =
  | {
      ok: true;
      transport: 'push' | 'local';
      configured: boolean;
    }
  | {
      ok: false;
      reason: 'unsupported' | 'permission' | 'subscription' | 'server';
      error?: string;
    };

const getNotificationAssetUrl = (pathname: string) => {
  if (typeof window === 'undefined') return pathname;
  return new URL(pathname, window.location.origin).toString();
};

const buildTestNotificationTag = () => `${TEST_NOTIFICATION_TAG_PREFIX}-${Date.now()}`;

const urlBase64ToUint8Array = (value: string) => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
};

const serializePushSubscription = (subscription: PushSubscription): PwaPushSubscriptionPayload | null => {
  const data = subscription.toJSON();
  const endpoint = typeof data.endpoint === 'string' ? data.endpoint.trim() : '';
  const p256dh = typeof data.keys?.p256dh === 'string' ? data.keys.p256dh.trim() : '';
  const auth = typeof data.keys?.auth === 'string' ? data.keys.auth.trim() : '';

  if (!endpoint || !p256dh || !auth) return null;

  return {
    endpoint,
    expirationTime: data.expirationTime ?? null,
    keys: {
      p256dh,
      auth,
    },
  };
};

// TEA-388: на iOS Safari Web Push доступен только в standalone PWA (>=16.4).
// Если открыто в обычном Safari-табе — Push API хоть и присутствует, не работает,
// поэтому отказываем в подписке заранее.
const isLikelyIos = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) && !(window as { MSStream?: unknown }).MSStream;
};

export const isPwaNotificationSupported = () => {
  if (typeof window === 'undefined') return false;
  const baseSupported =
    'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window && window.isSecureContext;
  if (!baseSupported) return false;
  if (isLikelyIos() && !isStandaloneDisplayMode()) return false;
  return true;
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
    tag: buildTestNotificationTag(),
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

const getReadyServiceWorkerRegistration = async () => {
  const registration = await navigator.serviceWorker.ready.catch(() => null);
  if (!registration || !('pushManager' in registration)) {
    return null;
  }

  return registration;
};

const ensureSavedPushSubscription = async (forceRefresh = false): Promise<PwaPushSubscriptionPayload | null> => {
  const config = await api.getPwaPushConfig();
  if (!config.enabled || !config.publicKey) {
    return null;
  }

  const registration = await getReadyServiceWorkerRegistration();
  if (!registration) {
    throw new Error('push_manager_unavailable');
  }

  let subscription = await registration.pushManager.getSubscription();
  if (forceRefresh && subscription) {
    const payload = serializePushSubscription(subscription);
    if (payload) {
      await api.removePwaPushSubscription({ endpoint: payload.endpoint }).catch(() => undefined);
    }
    await subscription.unsubscribe().catch(() => undefined);
    subscription = null;
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey),
    });
  }

  const payload = serializePushSubscription(subscription);
  if (!payload) {
    return null;
  }

  await api.savePwaPushSubscription({
    subscription: payload,
    routeMode: getPwaRouteMode(),
    userAgent: navigator.userAgent ?? '',
  });

  return payload;
};

export const ensurePwaNotificationChannel = async (): Promise<PwaNotificationChannelResult> => {
  if (!isPwaNotificationSupported()) {
    return { ok: false, reason: 'unsupported' };
  }

  if (Notification.permission !== 'granted') {
    return { ok: false, reason: 'permission' };
  }

  const config = await api.getPwaPushConfig();
  if (!config.enabled || !config.publicKey) {
    return {
      ok: true,
      transport: 'local',
      configured: false,
    };
  }

  try {
    const payload = await ensureSavedPushSubscription();
    if (!payload) {
      return { ok: false, reason: 'subscription' };
    }

    return {
      ok: true,
      transport: 'push',
      configured: true,
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'server',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const syncPwaPushSubscription = async () => {
  const result = await ensurePwaNotificationChannel();
  return result.ok && result.transport === 'push';
};

export const sendPwaTestNotification = async (): Promise<PwaNotificationChannelResult> => {
  const channel = await ensurePwaNotificationChannel();
  if (!channel.ok) return channel;

  if (channel.transport === 'push') {
    const sendServerTest = async () => api.sendPwaPushTest();
    let result = await sendServerTest();
    if (result.status === 'sent') {
      return channel;
    }

    if (result.reason === 'no_subscription' || result.status === 'failed') {
      try {
        const refreshedPayload = await ensureSavedPushSubscription(true);
        if (!refreshedPayload) {
          return {
            ok: false,
            reason: 'subscription',
          };
        }
      } catch (error) {
        return {
          ok: false,
          reason: 'server',
          error: error instanceof Error ? error.message : String(error),
        };
      }

      result = await sendServerTest();
      if (result.status === 'sent') {
        return channel;
      }
    }

    if (result.status === 'failed') {
      return {
        ok: false,
        reason: 'server',
        error: result.error,
      };
    }

    if (result.reason !== 'not_configured') {
      return {
        ok: false,
        reason: 'subscription',
      };
    }
  }

  const localResult = await showPwaTestNotification();
  if (localResult.ok) {
    return {
      ok: true,
      transport: 'local',
      configured: false,
    };
  }

  return {
    ok: false,
    reason: localResult.reason === 'permission' ? 'permission' : 'unsupported',
  };
};

import prisma from './prismaClient';
import { resolveStudentTelegramId } from './studentContacts';
import type {
  PwaPushConfigResponse,
  PwaPushRouteMode,
  PwaPushSubscriptionPayload,
  WebPushNotificationPayload,
} from '../shared/lib/pwaPush';

const WEB_PUSH_PUBLIC_KEY = (process.env.WEB_PUSH_PUBLIC_KEY ?? '').trim();
const WEB_PUSH_PRIVATE_KEY = (process.env.WEB_PUSH_PRIVATE_KEY ?? '').trim();
const WEB_PUSH_SUBJECT = (process.env.WEB_PUSH_SUBJECT ?? '').trim();
const DEFAULT_NOTIFICATION_ICON_PATH = '/apple-touch-icon.png';
const DEFAULT_NOTIFICATION_PATH = '/dashboard';

type WebPushRuntime = {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
  sendNotification: (
    subscription: {
      endpoint: string;
      keys: {
        p256dh: string;
        auth: string;
      };
    },
    payload?: string,
    options?: {
      TTL?: number;
      urgency?: 'very-low' | 'low' | 'normal' | 'high';
    },
  ) => Promise<unknown>;
};

let hasConfiguredWebPush = false;
let webPushRuntime: WebPushRuntime | null | undefined;
let webPushRuntimePromise: Promise<WebPushRuntime | null> | null = null;
let hasLoggedMissingWebPushPackage = false;

const getWebPushConfigReason = (): PwaPushConfigResponse['reason'] | undefined => {
  if (!WEB_PUSH_PUBLIC_KEY) return 'missing_public_key';
  if (!WEB_PUSH_PRIVATE_KEY) return 'missing_private_key';
  if (!WEB_PUSH_SUBJECT) return 'missing_subject';
  return undefined;
};

const isWebPushConfigurationValid = () => {
  const reason = getWebPushConfigReason();
  if (reason) return false;
  return true;
};

const loadWebPushRuntime = async (): Promise<WebPushRuntime | null> => {
  if (webPushRuntime !== undefined) {
    return webPushRuntime;
  }

  if (!webPushRuntimePromise) {
    webPushRuntimePromise = import('web-push')
      .then((module) => {
        const runtime = (module.default ?? module) as WebPushRuntime;
        webPushRuntime = runtime;
        return runtime;
      })
      .catch((error) => {
        webPushRuntime = null;
        if (!hasLoggedMissingWebPushPackage) {
          hasLoggedMissingWebPushPackage = true;
          console.warn('web-push package is unavailable. PWA push channel disabled.', error);
        }
        return null;
      })
      .finally(() => {
        webPushRuntimePromise = null;
      });
  }

  return webPushRuntimePromise;
};

const ensureWebPushRuntimeConfigured = async () => {
  if (!isWebPushConfigurationValid()) return null;

  const runtime = await loadWebPushRuntime();
  if (!runtime) return null;

  if (!hasConfiguredWebPush) {
    runtime.setVapidDetails(WEB_PUSH_SUBJECT, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY);
    hasConfiguredWebPush = true;
  }

  return runtime;
};

const normalizeRouteMode = (routeMode?: string | null): PwaPushRouteMode =>
  routeMode === 'hash' ? 'hash' : 'history';

const normalizeNotificationPath = (path?: string) => {
  if (!path || !path.trim()) return DEFAULT_NOTIFICATION_PATH;
  return path.startsWith('/') ? path : `/${path}`;
};

const buildStoredNotificationPayload = (
  payload: WebPushNotificationPayload,
  routeMode: PwaPushRouteMode,
) => ({
  title: payload.title,
  body: payload.body,
  path: normalizeNotificationPath(payload.path),
  routeMode,
  tag: payload.tag,
  iconPath: payload.iconPath ?? DEFAULT_NOTIFICATION_ICON_PATH,
  badgePath: payload.badgePath ?? DEFAULT_NOTIFICATION_ICON_PATH,
});

const resolveUserByTelegramUserId = async (telegramUserId: bigint) =>
  prisma.user.findUnique({
    where: { telegramUserId },
    select: { id: true },
  });

const resolveUserIdByStudentId = async (studentId: number) => {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      username: true,
      telegramId: true,
      isActivated: true,
    },
  });
  if (!student) return null;

  const telegramUserId = await resolveStudentTelegramId(student);
  if (!telegramUserId) return null;

  const user = await resolveUserByTelegramUserId(telegramUserId);
  return user?.id ?? null;
};

const markSubscriptionSuccess = async (subscriptionId: number) => {
  await prisma.webPushSubscription.update({
    where: { id: subscriptionId },
    data: {
      lastSuccessAt: new Date(),
      lastErrorAt: null,
      lastErrorText: null,
    },
  });
};

const markSubscriptionFailure = async (subscriptionId: number, errorText: string) => {
  await prisma.webPushSubscription.update({
    where: { id: subscriptionId },
    data: {
      lastErrorAt: new Date(),
      lastErrorText: errorText,
    },
  });
};

const extractWebPushErrorStatus = (error: unknown) => {
  if (!error || typeof error !== 'object') return null;
  const candidate = error as { statusCode?: unknown; statusCodeNumber?: unknown };
  if (typeof candidate.statusCode === 'number') return candidate.statusCode;
  if (typeof candidate.statusCodeNumber === 'number') return candidate.statusCodeNumber;
  return null;
};

export const getWebPushPublicConfig = (): PwaPushConfigResponse => {
  const reason = getWebPushConfigReason();
  if (reason) {
    return {
      enabled: false,
      publicKey: null,
      reason,
    };
  }

  return {
    enabled: true,
    publicKey: WEB_PUSH_PUBLIC_KEY,
  };
};

export const isWebPushConfigured = () => isWebPushConfigurationValid();

export const upsertWebPushSubscription = async (
  userId: number,
  payload: {
    subscription: PwaPushSubscriptionPayload;
    routeMode: PwaPushRouteMode;
    userAgent?: string | null;
  },
) => {
  const subscription = payload.subscription;
  return prisma.webPushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    update: {
      userId,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      routeMode: payload.routeMode,
      userAgent: payload.userAgent ?? null,
      lastErrorAt: null,
      lastErrorText: null,
    },
    create: {
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      routeMode: payload.routeMode,
      userAgent: payload.userAgent ?? null,
    },
  });
};

export const deleteWebPushSubscription = async (userId: number, endpoint: string) => {
  await prisma.webPushSubscription.deleteMany({
    where: {
      userId,
      endpoint,
    },
  });
};

export const hasWebPushSubscriptionsForUser = async (userId: number) => {
  const count = await prisma.webPushSubscription.count({ where: { userId } });
  return count > 0;
};

export const hasWebPushSubscriptionsForTeacher = async (teacherId: bigint) => {
  const user = await resolveUserByTelegramUserId(teacherId);
  if (!user) return false;
  return hasWebPushSubscriptionsForUser(user.id);
};

export const hasWebPushSubscriptionsForStudent = async (studentId: number) => {
  const userId = await resolveUserIdByStudentId(studentId);
  if (!userId) return false;
  return hasWebPushSubscriptionsForUser(userId);
};

export const sendWebPushToUser = async (userId: number, payload: WebPushNotificationPayload) => {
  const runtime = await ensureWebPushRuntimeConfigured();
  if (!runtime) {
    return {
      status: 'skipped' as const,
      reason: 'not_configured' as const,
    };
  }

  const subscriptions = await prisma.webPushSubscription.findMany({
    where: { userId },
    select: {
      id: true,
      endpoint: true,
      p256dh: true,
      auth: true,
      routeMode: true,
    },
  });

  if (subscriptions.length === 0) {
    return {
      status: 'skipped' as const,
      reason: 'no_subscription' as const,
    };
  }

  const results = await Promise.all(
    subscriptions.map(async (subscription) => {
      const notificationPayload = buildStoredNotificationPayload(
        payload,
        normalizeRouteMode(subscription.routeMode),
      );

      try {
        await runtime.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify(notificationPayload),
          {
            TTL: 60 * 5,
            urgency: 'high',
          },
        );
        await markSubscriptionSuccess(subscription.id);
        return { status: 'sent' as const };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const statusCode = extractWebPushErrorStatus(error);
        if (statusCode === 404 || statusCode === 410) {
          await prisma.webPushSubscription.deleteMany({
            where: { id: subscription.id },
          });
        } else {
          await markSubscriptionFailure(subscription.id, message);
        }
        return { status: 'failed' as const, error: message };
      }
    }),
  );

  const sentCount = results.filter((result) => result.status === 'sent').length;
  if (sentCount > 0) {
    return {
      status: 'sent' as const,
      sentCount,
    };
  }

  return {
    status: 'failed' as const,
    error: results
      .flatMap((result) => (result.status === 'failed' ? [result.error] : []))
      .join('; ') || 'web_push_failed',
  };
};

export const sendWebPushToTeacher = async (teacherId: bigint, payload: WebPushNotificationPayload) => {
  const user = await resolveUserByTelegramUserId(teacherId);
  if (!user) {
    return {
      status: 'skipped' as const,
      reason: 'no_subscription' as const,
    };
  }

  return sendWebPushToUser(user.id, payload);
};

export const sendWebPushToStudent = async (studentId: number, payload: WebPushNotificationPayload) => {
  const userId = await resolveUserIdByStudentId(studentId);
  if (!userId) {
    return {
      status: 'skipped' as const,
      reason: 'no_subscription' as const,
    };
  }

  return sendWebPushToUser(userId, payload);
};

export const buildWebPushTextNotificationPayload = (payload: {
  text: string;
  defaultTitle: string;
  path?: string;
  tag?: string;
}) => {
  const lines = payload.text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const title = lines[0] ?? payload.defaultTitle;
  const body = lines.length > 1 ? lines.slice(1).join('\n') : undefined;

  return {
    title,
    body,
    path: normalizeNotificationPath(payload.path),
    tag: payload.tag,
    iconPath: DEFAULT_NOTIFICATION_ICON_PATH,
    badgePath: DEFAULT_NOTIFICATION_ICON_PATH,
  } satisfies WebPushNotificationPayload;
};

import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { User } from '@prisma/client';
import prisma from '../../prismaClient';
import { buildCookie, getRequestIp, isLocalhostRequest, isSecureRequest, parseCookies } from '../lib/http';
import { notifyLoginFromNewDevice } from './securityAlerts';

type LocalDevUserConfig = {
  telegramUserId: bigint;
  username: string;
  firstName: string;
  lastName: string;
};

type AuthServiceConfig = {
  sessionCookieName: string;
  sessionTtlMinutes: number;
  sessionRenewThresholdMinutes: number;
  localAuthBypass: boolean;
  localDevUser: LocalDevUserConfig;
};

export const SIGNED_OUT_COOKIE_NAME = 'tb_signed_out';

type VerifyTelegramInitDataResult = { ok: true; params: URLSearchParams } | { ok: false; reason: 'signature_invalid' };

type VerifyTelegramLoginDataResult = { ok: true; params: URLSearchParams } | { ok: false; reason: 'signature_invalid' };

type SyncTelegramAuthUserPayload = {
  telegramUserId: bigint;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  photoUrl?: string | null;
  authDate: number;
  replaySkewSec: number;
};

type SyncTelegramAuthUserResult =
  | { ok: true; user: User; isNewUser: boolean }
  | { ok: false; reason: 'auth_date_expired' };

export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export const randomToken = (lengthBytes = 32) => crypto.randomBytes(lengthBytes).toString('base64url');

// Сессия живёт пока пользователь сам не нажмёт «Выйти» (~10 лет cookie/DB).
const DEFAULT_SESSION_TTL_MINUTES = 5_256_000;
const MIN_SESSION_TTL_MINUTES = 10_080;
const MAX_SESSION_TTL_MINUTES = 5_256_000;
const DEFAULT_SESSION_RENEW_THRESHOLD_MINUTES = 10_080;
const MIN_SESSION_RENEW_THRESHOLD_MINUTES = 1_440;

type SessionWithUser = {
  id: number;
  expiresAt: Date;
  ip: string | null;
  userAgent: string | null;
  user: User;
};

const normalizeSessionTtlMinutes = (rawMinutes: number) => {
  if (!Number.isFinite(rawMinutes)) return DEFAULT_SESSION_TTL_MINUTES;
  const normalized = Math.trunc(rawMinutes);
  return Math.min(Math.max(normalized, MIN_SESSION_TTL_MINUTES), MAX_SESSION_TTL_MINUTES);
};

const normalizeSessionRenewThresholdMinutes = (rawMinutes: number, sessionTtlMinutes: number) => {
  const fallback = Math.min(
    DEFAULT_SESSION_RENEW_THRESHOLD_MINUTES,
    Math.max(MIN_SESSION_RENEW_THRESHOLD_MINUTES, Math.floor(sessionTtlMinutes / 4)),
  );
  if (!Number.isFinite(rawMinutes)) {
    return Math.min(fallback, Math.max(60, sessionTtlMinutes - 60));
  }

  const normalized = Math.trunc(rawMinutes);
  return Math.min(Math.max(normalized, MIN_SESSION_RENEW_THRESHOLD_MINUTES), Math.max(60, sessionTtlMinutes - 60));
};

export const verifyTelegramInitData = (initData: string, botToken: string): VerifyTelegramInitDataResult => {
  if (!botToken) {
    return { ok: false, reason: 'signature_invalid' } as const;
  }
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) {
    return { ok: false, reason: 'signature_invalid' } as const;
  }
  params.delete('hash');
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  const actualBuffer = Buffer.from(hash, 'hex');
  if (expectedBuffer.length !== actualBuffer.length) {
    return { ok: false, reason: 'signature_invalid' } as const;
  }
  if (!crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    return { ok: false, reason: 'signature_invalid' } as const;
  }
  return { ok: true, params } as const;
};

export const verifyTelegramLoginData = (
  rawParams: URLSearchParams,
  botToken: string,
): VerifyTelegramLoginDataResult => {
  if (!botToken) {
    return { ok: false, reason: 'signature_invalid' } as const;
  }

  const params = new URLSearchParams(rawParams);
  const hash = params.get('hash');
  if (!hash) {
    return { ok: false, reason: 'signature_invalid' } as const;
  }

  params.delete('hash');
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  const actualBuffer = Buffer.from(hash, 'hex');
  if (expectedBuffer.length !== actualBuffer.length) {
    return { ok: false, reason: 'signature_invalid' } as const;
  }
  if (!crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    return { ok: false, reason: 'signature_invalid' } as const;
  }

  return { ok: true, params } as const;
};

export const syncTelegramAuthUser = async (
  payload: SyncTelegramAuthUserPayload,
): Promise<SyncTelegramAuthUserResult> => {
  const existingUser = await prisma.user.findUnique({ where: { telegramUserId: payload.telegramUserId } });
  if (existingUser?.lastAuthDate && payload.authDate + payload.replaySkewSec < existingUser.lastAuthDate) {
    return { ok: false, reason: 'auth_date_expired' } as const;
  }

  const userData = {
    username: payload.username ?? null,
    firstName: payload.firstName ?? null,
    lastName: payload.lastName ?? null,
    photoUrl: payload.photoUrl ?? null,
    lastAuthDate: payload.authDate,
  };

  const user = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: userData,
      })
    : await prisma.user.create({
        data: {
          telegramUserId: payload.telegramUserId,
          ...userData,
        },
      });

  return { ok: true, user, isNewUser: !existingUser } as const;
};

const resolveLocalDevRole = (): 'TEACHER' | 'STUDENT' => {
  const raw = (process.env.LOCAL_DEV_ROLE ?? '').trim().toUpperCase();
  return raw === 'STUDENT' ? 'STUDENT' : 'TEACHER';
};

const ensureLocalDevUser = async (localDevUser: LocalDevUserConfig) => {
  const desiredRole = resolveLocalDevRole();
  const existing = await prisma.user.findUnique({ where: { telegramUserId: localDevUser.telegramUserId } });
  if (existing) {
    const updates: Record<string, unknown> = {};
    if (!existing.subscriptionStartAt) {
      updates.subscriptionStartAt = new Date();
      updates.subscriptionEndAt = null;
    }
    if (existing.role !== desiredRole) {
      updates.role = desiredRole;
    }
    if (Object.keys(updates).length === 0) return existing;
    return prisma.user.update({ where: { id: existing.id }, data: updates });
  }
  return prisma.user.create({
    data: {
      telegramUserId: localDevUser.telegramUserId,
      username: localDevUser.username,
      firstName: localDevUser.firstName,
      lastName: localDevUser.lastName,
      role: desiredRole,
      subscriptionStartAt: new Date(),
    },
  });
};

export const createAuthService = (config: AuthServiceConfig) => {
  const sessionTtlMinutes = normalizeSessionTtlMinutes(config.sessionTtlMinutes);
  const sessionRenewThresholdMinutes = normalizeSessionRenewThresholdMinutes(
    config.sessionRenewThresholdMinutes,
    sessionTtlMinutes,
  );

  const appendSetCookie = (res: ServerResponse, cookie: string) => {
    const existing = res.getHeader('Set-Cookie');
    if (!existing) {
      res.setHeader('Set-Cookie', cookie);
      return;
    }
    if (Array.isArray(existing)) {
      res.setHeader('Set-Cookie', [...existing, cookie]);
      return;
    }
    res.setHeader('Set-Cookie', [String(existing), cookie]);
  };

  const setSessionCookie = (req: IncomingMessage, res: ServerResponse, token: string, expiresAt: Date) => {
    appendSetCookie(
      res,
      buildCookie(config.sessionCookieName, token, {
        maxAgeSeconds: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
        expiresAt,
        secure: isSecureRequest(req),
      }),
    );
  };

  const clearSessionCookie = (req: IncomingMessage, res: ServerResponse) => {
    appendSetCookie(
      res,
      buildCookie(config.sessionCookieName, '', {
        maxAgeSeconds: 0,
        expiresAt: new Date(0),
        secure: isSecureRequest(req),
      }),
    );
  };

  const clearSignedOutCookie = (req: IncomingMessage, res: ServerResponse) => {
    appendSetCookie(
      res,
      buildCookie(SIGNED_OUT_COOKIE_NAME, '', {
        maxAgeSeconds: 0,
        expiresAt: new Date(0),
        secure: isSecureRequest(req),
      }),
    );
  };

  const hasSignedOutCookie = (req: IncomingMessage) => {
    const cookies = parseCookies(req.headers.cookie);
    return cookies[SIGNED_OUT_COOKIE_NAME] === '1';
  };

  const findActiveSession = async (tokenHash: string) => {
    // Сессия активна пока её явно не отозвали через logout.
    return prisma.session.findFirst({
      where: { tokenHash, revokedAt: null },
      include: { user: true },
    });
  };

  const renewSessionIfNeeded = async (
    req: IncomingMessage,
    res: ServerResponse,
    token: string,
    session: SessionWithUser,
  ) => {
    // Cookie всегда переустанавливаем со свежим max-age, чтобы у пользователя
    // сессия не «протухла» из-за старого TTL.
    const cookieExpiresAt = new Date(Date.now() + sessionTtlMinutes * 60_000);
    setSessionCookie(req, res, token, cookieExpiresAt);

    // В БД expiresAt бампим только когда исходное значение близко к концу —
    // чтобы не делать UPDATE на каждый запрос.
    const remainingMs = session.expiresAt.getTime() - Date.now();
    if (remainingMs > sessionRenewThresholdMinutes * 60_000) {
      return session;
    }

    const renewedSession = await prisma.session.update({
      where: { id: session.id },
      data: {
        expiresAt: cookieExpiresAt,
        ip: getRequestIp(req) || session.ip,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : session.userAgent,
      },
      include: { user: true },
    });
    return renewedSession;
  };

  const createSession = async (userId: number, req: IncomingMessage, res: ServerResponse) => {
    const token = randomToken(32);
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + sessionTtlMinutes * 60_000);
    const ip = getRequestIp(req) || null;
    const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;
    const session = await prisma.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        ip,
        userAgent,
      },
    });
    setSessionCookie(req, res, token, expiresAt);
    clearSignedOutCookie(req, res);

    // Не блокируем ответ — уведомление о новом устройстве уходит в фон.
    void prisma.user
      .findUnique({
        where: { id: userId },
        select: {
          id: true,
          telegramUserId: true,
          securityAlertsEnabled: true,
          securityAlertNewDevice: true,
          securityAlertLogout: true,
          securityAlertSessionRevoke: true,
        },
      })
      .then((user) => {
        if (!user) return;
        return notifyLoginFromNewDevice({ user, sessionId: session.id, ip, userAgent });
      })
      .catch((error) => {
        console.warn('Failed to evaluate new-device alert', error);
      });

    return { expiresAt };
  };

  const getSessionUser = async (req: IncomingMessage) => {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[config.sessionCookieName];
    if (!token) return null;
    const tokenHash = hashToken(token);
    const session = await findActiveSession(tokenHash);
    return session?.user ?? null;
  };

  const resolveSessionUser = async (req: IncomingMessage, res: ServerResponse) => {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[config.sessionCookieName];
    if (token) {
      const tokenHash = hashToken(token);
      const session = await findActiveSession(tokenHash);
      if (session) {
        const activeSession = await renewSessionIfNeeded(req, res, token, session);
        // Обновляем lastSeenAt не чаще раза в минуту — чтобы в настройках
        // безопасности «Последняя активность» реально отражала текущее время.
        const lastSeen = (activeSession as SessionWithUser & { lastSeenAt?: Date }).lastSeenAt;
        if (!lastSeen || Date.now() - new Date(lastSeen).getTime() > 60_000) {
          prisma.session
            .update({
              where: { id: activeSession.id },
              data: { lastSeenAt: new Date() },
            })
            .catch((error) => {
              console.warn('Failed to update session lastSeenAt', error);
            });
        }
        if (config.localAuthBypass && isLocalhostRequest(req)) {
          const desiredRole = resolveLocalDevRole();
          if (activeSession.user.role !== desiredRole) {
            const updated = await prisma.user.update({
              where: { id: activeSession.user.id },
              data: { role: desiredRole },
            });
            return updated;
          }
        }
        return activeSession.user;
      }
      clearSessionCookie(req, res);
    }
    if (!config.localAuthBypass || !isLocalhostRequest(req)) return null;
    if (hasSignedOutCookie(req)) return null;
    const localUser = await ensureLocalDevUser(config.localDevUser);
    await createSession(localUser.id, req, res);
    return localUser;
  };

  const getSessionTokenHash = (req: IncomingMessage) => {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[config.sessionCookieName];
    if (!token) return null;
    return hashToken(token);
  };

  /**
   * Dev-only логин под локальным учителем. Используется кнопкой «Войти как Local teacher»
   * на странице /login во время локальной разработки. Безопасность:
   *   • активен только если NODE_ENV !== 'production' (флаг из переменной окружения),
   *   • дополнительно требует локальный запрос (isLocalhostRequest), чтобы случайно
   *     включённый dev-бандл в проде не давал прямой вход через интернет.
   * Возвращает true, если сессия выдана; false — если условия не соблюдены.
   */
  const loginAsLocalDev = async (
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse,
  ): Promise<boolean> => {
    if (process.env.NODE_ENV === 'production') return false;
    if (!isLocalhostRequest(req)) return false;
    const user = await ensureLocalDevUser(config.localDevUser);
    await createSession(user.id, req, res);
    return true;
  };

  return {
    createSession,
    getSessionTokenHash,
    getSessionUser,
    resolveSessionUser,
    loginAsLocalDev,
  };
};

import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { User } from '@prisma/client';
import prisma from '../../prismaClient';
import { buildCookie, getRequestIp, isLocalhostRequest, isSecureRequest, parseCookies } from '../lib/http';

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

type VerifyTelegramInitDataResult =
  | { ok: true; params: URLSearchParams }
  | { ok: false; reason: 'signature_invalid' };

type VerifyTelegramLoginDataResult =
  | { ok: true; params: URLSearchParams }
  | { ok: false; reason: 'signature_invalid' };

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

const DEFAULT_SESSION_TTL_MINUTES = 43_200;
const MIN_SESSION_TTL_MINUTES = 10_080;
const MAX_SESSION_TTL_MINUTES = 129_600;
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
  return Math.min(
    Math.max(normalized, MIN_SESSION_RENEW_THRESHOLD_MINUTES),
    Math.max(60, sessionTtlMinutes - 60),
  );
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

  const findActiveSession = async (tokenHash: string) => {
    const now = new Date();
    return prisma.session.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
      include: { user: true },
    });
  };

  const renewSessionIfNeeded = async (
    req: IncomingMessage,
    res: ServerResponse,
    token: string,
    session: SessionWithUser,
  ) => {
    const remainingMs = session.expiresAt.getTime() - Date.now();
    if (remainingMs > sessionRenewThresholdMinutes * 60_000) {
      return session;
    }

    const expiresAt = new Date(Date.now() + sessionTtlMinutes * 60_000);
    const renewedSession = await prisma.session.update({
      where: { id: session.id },
      data: {
        expiresAt,
        ip: getRequestIp(req) || session.ip,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : session.userAgent,
      },
      include: { user: true },
    });
    setSessionCookie(req, res, token, expiresAt);
    return renewedSession;
  };

  const createSession = async (userId: number, req: IncomingMessage, res: ServerResponse) => {
    const token = randomToken(32);
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + sessionTtlMinutes * 60_000);
    await prisma.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        ip: getRequestIp(req) || null,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
      },
    });
    setSessionCookie(req, res, token, expiresAt);
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

  return {
    createSession,
    getSessionTokenHash,
    getSessionUser,
    resolveSessionUser,
  };
};

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

const ensureLocalDevUser = async (localDevUser: LocalDevUserConfig) => {
  const existing = await prisma.user.findUnique({ where: { telegramUserId: localDevUser.telegramUserId } });
  if (existing) {
    if (!existing.subscriptionStartAt) {
      return prisma.user.update({
        where: { id: existing.id },
        data: { subscriptionStartAt: new Date(), subscriptionEndAt: null },
      });
    }
    return existing;
  }
  return prisma.user.create({
    data: {
      telegramUserId: localDevUser.telegramUserId,
      username: localDevUser.username,
      firstName: localDevUser.firstName,
      lastName: localDevUser.lastName,
      role: 'TEACHER',
      subscriptionStartAt: new Date(),
    },
  });
};

export const createAuthService = (config: AuthServiceConfig) => {
  const createSession = async (userId: number, req: IncomingMessage, res: ServerResponse) => {
    const ttlMinutes = Number.isFinite(config.sessionTtlMinutes) ? config.sessionTtlMinutes : 1440;
    const token = randomToken(32);
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
    await prisma.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        ip: getRequestIp(req) || null,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
      },
    });
    res.setHeader(
      'Set-Cookie',
      buildCookie(config.sessionCookieName, token, {
        maxAgeSeconds: ttlMinutes * 60,
        secure: isSecureRequest(req),
      }),
    );
    return { expiresAt };
  };

  const getSessionUser = async (req: IncomingMessage) => {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[config.sessionCookieName];
    if (!token) return null;
    const tokenHash = hashToken(token);
    const now = new Date();
    const session = await prisma.session.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
      include: { user: true },
    });
    return session?.user ?? null;
  };

  const resolveSessionUser = async (req: IncomingMessage, res: ServerResponse) => {
    const sessionUser = await getSessionUser(req);
    if (sessionUser) return sessionUser;
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

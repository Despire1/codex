import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import prisma from '../../prismaClient';
import { syncTelegramAuthUser } from './auth';

const NONCE_BYTES = 18;
const SECRET_BYTES = 32;
const MAX_USER_AGENT_LENGTH = 256;

const truncateUserAgent = (value: string | null | undefined) => {
  if (!value) return null;
  return value.length > MAX_USER_AGENT_LENGTH ? value.slice(0, MAX_USER_AGENT_LENGTH) : value;
};

const hashSecret = (secret: string) => crypto.createHash('sha256').update(secret).digest('hex');

export const buildLoginPendingCookieValue = (nonce: string, secret: string) => `${nonce}.${secret}`;

export const parseLoginPendingCookieValue = (value: string | undefined) => {
  if (!value) return null;
  const idx = value.indexOf('.');
  if (idx <= 0 || idx === value.length - 1) return null;
  const nonce = value.slice(0, idx);
  const secret = value.slice(idx + 1);
  if (!nonce || !secret) return null;
  return { nonce, secret };
};

const verifySecret = (secret: string, expectedHash: string) => {
  const actual = Buffer.from(hashSecret(secret), 'hex');
  let expected: Buffer;
  try {
    expected = Buffer.from(expectedHash, 'hex');
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
};

export const buildDeepLink = (botUsername: string, nonce: string) =>
  `https://t.me/${botUsername.replace(/^@+/, '')}?start=login_${nonce}`;

export const parseLoginNonceFromStartPayload = (payload: string | null | undefined) => {
  if (!payload) return null;
  const trimmed = payload.trim();
  if (!trimmed.startsWith('login_')) return null;
  const nonce = trimmed.slice('login_'.length);
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(nonce)) return null;
  return nonce;
};

export type CreateDeepLinkAuthServiceConfig = {
  ttlSeconds: number;
};

export const createTelegramDeepLinkAuthService = (config: CreateDeepLinkAuthServiceConfig) => {
  const ttlMs = Math.max(60_000, Math.min(config.ttlSeconds * 1000, 30 * 60_000));

  const startLoginAttempt = async (req: IncomingMessage) => {
    const nonce = crypto.randomBytes(NONCE_BYTES).toString('base64url');
    const secret = crypto.randomBytes(SECRET_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + ttlMs);
    const ipHeader = req.headers['x-forwarded-for'];
    const ip = (() => {
      if (typeof ipHeader === 'string') return ipHeader.split(',')[0]?.trim() || null;
      if (Array.isArray(ipHeader)) return ipHeader[0] || null;
      return req.socket.remoteAddress ?? null;
    })();
    const userAgent = truncateUserAgent(
      typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    );

    await prisma.telegramLoginAttempt.create({
      data: {
        nonce,
        secretHash: hashSecret(secret),
        status: 'pending',
        ip,
        userAgent,
        expiresAt,
      },
    });

    return { nonce, secret, expiresAt };
  };

  const findValidPendingAttempt = async (nonce: string) => {
    const attempt = await prisma.telegramLoginAttempt.findUnique({ where: { nonce } });
    if (!attempt) return null;
    if (attempt.expiresAt.getTime() < Date.now()) return null;
    return attempt;
  };

  const claimAttemptByBot = async (payload: {
    nonce: string;
    telegramUserId: bigint;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    photoUrl?: string | null;
    authDate: number;
    replaySkewSec: number;
  }) => {
    const attempt = await findValidPendingAttempt(payload.nonce);
    if (!attempt || attempt.status !== 'pending') {
      return { ok: false, reason: 'attempt_not_found' as const };
    }

    const synced = await syncTelegramAuthUser({
      telegramUserId: payload.telegramUserId,
      username: payload.username ?? null,
      firstName: payload.firstName ?? null,
      lastName: payload.lastName ?? null,
      photoUrl: payload.photoUrl ?? null,
      authDate: payload.authDate,
      replaySkewSec: payload.replaySkewSec,
    });
    if (!synced.ok) {
      return { ok: false, reason: 'sync_failed' as const };
    }

    await prisma.telegramLoginAttempt.update({
      where: { id: attempt.id },
      data: {
        status: 'claimed',
        telegramUserId: payload.telegramUserId,
        claimedAt: new Date(),
      },
    });

    return { ok: true as const, user: synced.user, isNewUser: synced.isNewUser };
  };

  const consumeClaimedAttempt = async (cookieValue: string | undefined) => {
    const parsed = parseLoginPendingCookieValue(cookieValue);
    if (!parsed) return { status: 'no_attempt' as const };

    const attempt = await prisma.telegramLoginAttempt.findUnique({ where: { nonce: parsed.nonce } });
    if (!attempt) return { status: 'no_attempt' as const };

    if (!verifySecret(parsed.secret, attempt.secretHash)) {
      return { status: 'no_attempt' as const };
    }

    if (attempt.expiresAt.getTime() < Date.now()) {
      return { status: 'expired' as const };
    }

    if (attempt.status === 'consumed') {
      return { status: 'no_attempt' as const };
    }

    if (attempt.status !== 'claimed' || !attempt.telegramUserId) {
      return { status: 'pending' as const };
    }

    const user = await prisma.user.findUnique({ where: { telegramUserId: attempt.telegramUserId } });
    if (!user) {
      return { status: 'expired' as const };
    }

    await prisma.telegramLoginAttempt.update({
      where: { id: attempt.id },
      data: { status: 'consumed', consumedAt: new Date() },
    });

    return { status: 'claimed' as const, user };
  };

  const cancelAttempt = async (cookieValue: string | undefined) => {
    const parsed = parseLoginPendingCookieValue(cookieValue);
    if (!parsed) return;
    const attempt = await prisma.telegramLoginAttempt.findUnique({ where: { nonce: parsed.nonce } });
    if (!attempt) return;
    if (!verifySecret(parsed.secret, attempt.secretHash)) return;
    if (attempt.status === 'consumed') return;
    await prisma.telegramLoginAttempt.update({
      where: { id: attempt.id },
      data: { status: 'consumed', consumedAt: new Date() },
    });
  };

  return {
    startLoginAttempt,
    claimAttemptByBot,
    consumeClaimedAttempt,
    cancelAttempt,
  };
};

export type TelegramDeepLinkAuthService = ReturnType<typeof createTelegramDeepLinkAuthService>;

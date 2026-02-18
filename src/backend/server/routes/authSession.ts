import type { IncomingMessage, ServerResponse } from 'node:http';
import prisma from '../../prismaClient';
import {
  badRequest,
  buildCookie,
  getRequestIp,
  isSecureRequest,
  parseCookies,
  readBody,
  sendJson,
} from '../lib/http';
import { isRateLimited } from '../lib/runtimeLimits';
import { hashToken, verifyTelegramInitData } from '../modules/auth';

type CreateSession = (userId: number, req: IncomingMessage, res: ServerResponse) => Promise<{ expiresAt: Date }>;

type AuthSessionHandlersConfig = {
  createSession: CreateSession;
  sessionCookieName: string;
  telegramBotToken: string;
  telegramInitDataTtlSec: number;
  telegramReplaySkewSec: number;
  rateLimitWebappPerMin: number;
};

export const createAuthSessionHandlers = (config: AuthSessionHandlersConfig) => {
  const handleTelegramWebapp = async (req: IncomingMessage, res: ServerResponse) => {
    const body = await readBody(req);
    const initData = typeof body.initData === 'string' ? body.initData : '';
    if (!initData) return badRequest(res, 'invalid_init_data');

    if (isRateLimited(`webapp:${getRequestIp(req)}`, config.rateLimitWebappPerMin, 60_000)) {
      return sendJson(res, 429, { message: 'rate_limited' });
    }

    const verification = verifyTelegramInitData(initData, config.telegramBotToken);
    if ('reason' in verification) {
      return sendJson(res, 401, { message: verification.reason });
    }

    const authDateRaw = verification.params.get('auth_date');
    const userRaw = verification.params.get('user');
    const authDate = authDateRaw ? Number(authDateRaw) : NaN;
    if (!userRaw || !Number.isFinite(authDate)) {
      return badRequest(res, 'invalid_init_data');
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const initDataTtlSec = Number.isFinite(config.telegramInitDataTtlSec) ? config.telegramInitDataTtlSec : 300;
    if (nowSec - authDate > initDataTtlSec) {
      return sendJson(res, 401, { message: 'auth_date_expired' });
    }

    let telegramUser: any;
    try {
      telegramUser = JSON.parse(userRaw);
    } catch (error) {
      return badRequest(res, 'invalid_init_data');
    }
    if (!telegramUser?.id) {
      return badRequest(res, 'invalid_init_data');
    }

    const telegramUserId = BigInt(telegramUser.id);
    const existingUser = await prisma.user.findUnique({ where: { telegramUserId } });
    const isNewUser = !existingUser;
    const userRecord = existingUser
      ? await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            username: telegramUser.username ?? null,
            firstName: telegramUser.first_name ?? null,
            lastName: telegramUser.last_name ?? null,
            photoUrl: telegramUser.photo_url ?? null,
          },
        })
      : await prisma.user.create({
          data: {
            telegramUserId,
            username: telegramUser.username ?? null,
            firstName: telegramUser.first_name ?? null,
            lastName: telegramUser.last_name ?? null,
            photoUrl: telegramUser.photo_url ?? null,
          },
        });

    const lastAuthDate = existingUser?.lastAuthDate ?? userRecord.lastAuthDate;
    if (lastAuthDate && authDate + config.telegramReplaySkewSec < lastAuthDate) {
      return badRequest(res, 'invalid_init_data');
    }

    await prisma.user.update({
      where: { id: userRecord.id },
      data: { lastAuthDate: authDate },
    });

    const session = await config.createSession(userRecord.id, req, res);
    return sendJson(res, 200, {
      user: userRecord,
      session: { expiresAt: session.expiresAt },
      isNewUser,
    });
  };

  const handleLogout = async (req: IncomingMessage, res: ServerResponse) => {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[config.sessionCookieName];
    if (token) {
      await prisma.session.updateMany({
        where: { tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    res.setHeader(
      'Set-Cookie',
      buildCookie(config.sessionCookieName, '', {
        maxAgeSeconds: 0,
        secure: isSecureRequest(req),
      }),
    );
    return sendJson(res, 200, { status: 'ok' });
  };

  return {
    handleLogout,
    handleTelegramWebapp,
  };
};

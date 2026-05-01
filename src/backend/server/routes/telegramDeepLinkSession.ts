import type { IncomingMessage, ServerResponse } from 'node:http';
import { badRequest, buildCookie, getRequestIp, isSecureRequest, parseCookies, sendJson } from '../lib/http';
import { isRateLimited } from '../lib/runtimeLimits';
import {
  buildDeepLink,
  buildLoginPendingCookieValue,
  type TelegramDeepLinkAuthService,
} from '../modules/telegramDeepLinkAuth';

type CreateSession = (userId: number, req: IncomingMessage, res: ServerResponse) => Promise<{ expiresAt: Date }>;

type Config = {
  service: TelegramDeepLinkAuthService;
  createSession: CreateSession;
  telegramBotUsername: string;
  pendingCookieName: string;
  pendingCookieTtlSec: number;
  ratePerMin: number;
};

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

const buildPendingCookie = (req: IncomingMessage, name: string, value: string, ttlSec: number, expiresAt: Date) =>
  buildCookie(name, value, {
    maxAgeSeconds: ttlSec,
    expiresAt,
    secure: isSecureRequest(req),
  });

const buildClearedPendingCookie = (req: IncomingMessage, name: string) =>
  buildCookie(name, '', {
    maxAgeSeconds: 0,
    expiresAt: new Date(0),
    secure: isSecureRequest(req),
  });

export const createTelegramDeepLinkHandlers = (config: Config) => {
  const normalizedBotUsername = config.telegramBotUsername.trim().replace(/^@+/, '');
  const enabled = Boolean(normalizedBotUsername);

  const handleStart = async (req: IncomingMessage, res: ServerResponse) => {
    if (!enabled) {
      return sendJson(res, 503, { message: 'telegram_login_unavailable' });
    }

    if (isRateLimited(`tg_deeplink_start:${getRequestIp(req)}`, config.ratePerMin, 60_000)) {
      return sendJson(res, 429, { message: 'rate_limited' });
    }

    const { nonce, secret, expiresAt } = await config.service.startLoginAttempt(req);
    const cookieValue = buildLoginPendingCookieValue(nonce, secret);
    appendSetCookie(
      res,
      buildPendingCookie(req, config.pendingCookieName, cookieValue, config.pendingCookieTtlSec, expiresAt),
    );

    return sendJson(res, 200, {
      deepLink: buildDeepLink(normalizedBotUsername, nonce),
      botUsername: normalizedBotUsername,
      expiresAt: expiresAt.toISOString(),
    });
  };

  const handlePoll = async (req: IncomingMessage, res: ServerResponse) => {
    if (!enabled) {
      return sendJson(res, 503, { message: 'telegram_login_unavailable' });
    }

    if (isRateLimited(`tg_deeplink_poll:${getRequestIp(req)}`, Math.max(config.ratePerMin * 6, 120), 60_000)) {
      return sendJson(res, 429, { message: 'rate_limited' });
    }

    const cookies = parseCookies(req.headers.cookie);
    const cookieValue = cookies[config.pendingCookieName];
    if (!cookieValue) {
      return sendJson(res, 200, { status: 'no_attempt' });
    }

    const result = await config.service.consumeClaimedAttempt(cookieValue);
    if (result.status === 'pending') {
      return sendJson(res, 200, { status: 'pending' });
    }

    if (result.status === 'expired') {
      appendSetCookie(res, buildClearedPendingCookie(req, config.pendingCookieName));
      return sendJson(res, 200, { status: 'expired' });
    }

    if (result.status === 'no_attempt') {
      appendSetCookie(res, buildClearedPendingCookie(req, config.pendingCookieName));
      return sendJson(res, 200, { status: 'no_attempt' });
    }

    appendSetCookie(res, buildClearedPendingCookie(req, config.pendingCookieName));
    await config.createSession(result.user.id, req, res);
    return sendJson(res, 200, { status: 'claimed', user: result.user });
  };

  const handleCancel = async (req: IncomingMessage, res: ServerResponse) => {
    const cookies = parseCookies(req.headers.cookie);
    const cookieValue = cookies[config.pendingCookieName];
    if (!cookieValue) {
      return sendJson(res, 200, { status: 'ok' });
    }

    try {
      await config.service.cancelAttempt(cookieValue);
    } catch (error) {
      console.warn('Failed to cancel telegram deep-link attempt', error);
    }

    appendSetCookie(res, buildClearedPendingCookie(req, config.pendingCookieName));
    return sendJson(res, 200, { status: 'ok' });
  };

  const handleConfig = async (_req: IncomingMessage, res: ServerResponse) => {
    if (!enabled) {
      return sendJson(res, 200, { enabled: false, botUsername: null });
    }
    return sendJson(res, 200, { enabled: true, botUsername: normalizedBotUsername });
  };

  return {
    handleStart,
    handlePoll,
    handleCancel,
    handleConfig,
    badRequest,
  };
};

export type TelegramDeepLinkHandlers = ReturnType<typeof createTelegramDeepLinkHandlers>;

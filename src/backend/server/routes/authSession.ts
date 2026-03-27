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
import {
  hashToken,
  syncTelegramAuthUser,
  verifyTelegramInitData,
  verifyTelegramLoginData,
} from '../modules/auth';

type CreateSession = (userId: number, req: IncomingMessage, res: ServerResponse) => Promise<{ expiresAt: Date }>;

type AuthSessionHandlersConfig = {
  appBaseUrl: string;
  createSession: CreateSession;
  sessionCookieName: string;
  telegramBotToken: string;
  telegramBotUsername: string;
  telegramInitDataTtlSec: number;
  telegramReplaySkewSec: number;
  telegramBrowserRedirectUrl: string;
  rateLimitWebappPerMin: number;
  rateLimitBrowserLoginPerMin: number;
};

export const createAuthSessionHandlers = (config: AuthSessionHandlersConfig) => {
  const normalizedBotUsername = config.telegramBotUsername.trim().replace(/^@+/, '');
  const browserLoginEnabled = Boolean(config.telegramBotToken && normalizedBotUsername);
  const normalizedAppBaseUrl = config.appBaseUrl.trim().replace(/\/$/, '');
  const resolveBrowserRedirectUrl = (path: string) => {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return normalizedAppBaseUrl ? `${normalizedAppBaseUrl}${normalizedPath}` : normalizedPath;
  };
  const sendBrowserLoginErrorPage = (res: ServerResponse, statusCode: number, message: string) => {
    const backUrl = resolveBrowserRedirectUrl(config.telegramBrowserRedirectUrl);
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(`<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Вход через Telegram</title>
    <style>
      body { margin: 0; padding: 24px; font-family: sans-serif; background: #f5f7fb; color: #101828; }
      .card { max-width: 520px; margin: 10vh auto 0; padding: 24px; border-radius: 20px; background: #fff; box-shadow: 0 18px 44px rgba(15, 23, 42, 0.1); }
      .badge { display: inline-flex; padding: 8px 12px; border-radius: 999px; background: rgba(34, 197, 94, 0.12); color: #166534; font-size: 13px; font-weight: 700; }
      h1 { margin: 16px 0 12px; font-size: 24px; line-height: 1.15; }
      p { margin: 0 0 18px; color: #475467; line-height: 1.5; }
      a { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 18px; border-radius: 12px; background: #16a34a; color: #fff; text-decoration: none; font-weight: 600; }
    </style>
  </head>
  <body>
    <div class="card">
      <span class="badge">Telegram Login</span>
      <h1>Не удалось завершить вход</h1>
      <p>${message}</p>
      <a href="${backUrl}">Вернуться в приложение</a>
    </div>
  </body>
</html>`);
  };

  const getTelegramBrowserConfig = () => {
    if (browserLoginEnabled) {
      return {
        enabled: true,
        botUsername: normalizedBotUsername,
      } as const;
    }

    return {
      enabled: false,
      botUsername: null,
      reason: config.telegramBotToken ? 'missing_bot_username' : 'missing_bot_token',
    } as const;
  };

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
    const syncedUser = await syncTelegramAuthUser({
      telegramUserId,
      username: telegramUser.username ?? null,
      firstName: telegramUser.first_name ?? null,
      lastName: telegramUser.last_name ?? null,
      photoUrl: telegramUser.photo_url ?? null,
      authDate,
      replaySkewSec: config.telegramReplaySkewSec,
    });
    if (!syncedUser.ok) {
      return badRequest(res, 'invalid_init_data');
    }

    const session = await config.createSession(syncedUser.user.id, req, res);
    return sendJson(res, 200, {
      user: syncedUser.user,
      session: { expiresAt: session.expiresAt },
      isNewUser: syncedUser.isNewUser,
    });
  };

  const handleTelegramBrowserConfig = async (_req: IncomingMessage, res: ServerResponse) => {
    return sendJson(res, 200, getTelegramBrowserConfig());
  };

  const handleTelegramBrowserLogin = async (req: IncomingMessage, res: ServerResponse) => {
    if (!browserLoginEnabled) {
      sendBrowserLoginErrorPage(res, 503, 'Вход через Telegram в браузере пока не настроен.');
      return;
    }

    if (isRateLimited(`browser_login:${getRequestIp(req)}`, config.rateLimitBrowserLoginPerMin, 60_000)) {
      sendBrowserLoginErrorPage(res, 429, 'Слишком много попыток входа. Попробуйте ещё раз через минуту.');
      return;
    }

    const requestUrl = new URL(req.url ?? '/', 'http://localhost');
    const returnToRaw = requestUrl.searchParams.get('return_to');
    const loginParams = new URLSearchParams(requestUrl.searchParams);
    loginParams.delete('return_to');

    const verification = verifyTelegramLoginData(loginParams, config.telegramBotToken);
    if (!verification.ok) {
      sendBrowserLoginErrorPage(res, 401, 'Не удалось подтвердить вход через Telegram.');
      return;
    }

    const telegramUserIdRaw = verification.params.get('id');
    const authDateRaw = verification.params.get('auth_date');
    const authDate = authDateRaw ? Number(authDateRaw) : NaN;
    if (!telegramUserIdRaw || !Number.isFinite(authDate)) {
      sendBrowserLoginErrorPage(res, 400, 'Получены некорректные данные входа.');
      return;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const loginTtlSec = Number.isFinite(config.telegramInitDataTtlSec) ? config.telegramInitDataTtlSec : 300;
    if (nowSec - authDate > loginTtlSec) {
      sendBrowserLoginErrorPage(res, 401, 'Срок подтверждения входа истёк. Попробуйте ещё раз.');
      return;
    }

    let telegramUserId: bigint;
    try {
      telegramUserId = BigInt(telegramUserIdRaw);
    } catch {
      sendBrowserLoginErrorPage(res, 400, 'Получены некорректные данные входа.');
      return;
    }

    const syncedUser = await syncTelegramAuthUser({
      telegramUserId,
      username: verification.params.get('username'),
      firstName: verification.params.get('first_name'),
      lastName: verification.params.get('last_name'),
      photoUrl: verification.params.get('photo_url'),
      authDate,
      replaySkewSec: config.telegramReplaySkewSec,
    });
    if (!syncedUser.ok) {
      sendBrowserLoginErrorPage(res, 400, 'Попробуйте войти ещё раз. Telegram прислал устаревшие данные.');
      return;
    }

    await config.createSession(syncedUser.user.id, req, res);

    const redirectUrl =
      typeof returnToRaw === 'string' &&
      returnToRaw.startsWith('/') &&
      !returnToRaw.startsWith('//') &&
      !returnToRaw.startsWith('/auth/')
        ? resolveBrowserRedirectUrl(returnToRaw)
        : resolveBrowserRedirectUrl(config.telegramBrowserRedirectUrl);

    res.statusCode = 302;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Location', redirectUrl);
    res.end();
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
        expiresAt: new Date(0),
        secure: isSecureRequest(req),
      }),
    );
    return sendJson(res, 200, { status: 'ok' });
  };

  return {
    handleTelegramBrowserConfig,
    handleTelegramBrowserLogin,
    handleLogout,
    handleTelegramWebapp,
  };
};

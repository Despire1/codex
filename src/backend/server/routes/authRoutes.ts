import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from '../lib/http';

type ResolveSessionUser = (req: IncomingMessage, res: ServerResponse) => Promise<unknown | null>;

type AuthSessionHandlers = {
  handleTelegramBrowserConfig: (req: IncomingMessage, res: ServerResponse) => Promise<unknown>;
  handleTelegramBrowserLogin: (req: IncomingMessage, res: ServerResponse) => Promise<unknown>;
  handleLogout: (req: IncomingMessage, res: ServerResponse) => Promise<unknown>;
  handleTelegramWebapp: (req: IncomingMessage, res: ServerResponse) => Promise<unknown>;
};

type TelegramDeepLinkHandlersShape = {
  handleStart: (req: IncomingMessage, res: ServerResponse) => Promise<unknown>;
  handlePoll: (req: IncomingMessage, res: ServerResponse) => Promise<unknown>;
  handleCancel: (req: IncomingMessage, res: ServerResponse) => Promise<unknown>;
  handleConfig: (req: IncomingMessage, res: ServerResponse) => Promise<unknown>;
};

type TryHandleAuthRoutesPayload = {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
  resolveSessionUser: ResolveSessionUser;
  authSessionHandlers: AuthSessionHandlers;
  telegramDeepLinkHandlers?: TelegramDeepLinkHandlersShape;
};

export const tryHandleAuthRoutes = async ({
  req,
  res,
  pathname,
  resolveSessionUser,
  authSessionHandlers,
  telegramDeepLinkHandlers,
}: TryHandleAuthRoutesPayload) => {
  if (req.method === 'GET' && pathname === '/auth/session') {
    const user = await resolveSessionUser(req, res);
    if (!user) {
      sendJson(res, 401, { message: 'unauthorized' });
      return true;
    }
    sendJson(res, 200, { user });
    return true;
  }

  if (req.method === 'POST' && pathname === '/auth/telegram/webapp') {
    await authSessionHandlers.handleTelegramWebapp(req, res);
    return true;
  }

  if (req.method === 'GET' && pathname === '/auth/telegram/browser-config') {
    await authSessionHandlers.handleTelegramBrowserConfig(req, res);
    return true;
  }

  if (req.method === 'GET' && pathname === '/auth/telegram/browser-login') {
    await authSessionHandlers.handleTelegramBrowserLogin(req, res);
    return true;
  }

  if (telegramDeepLinkHandlers) {
    if (req.method === 'GET' && pathname === '/auth/telegram/deep-link/config') {
      await telegramDeepLinkHandlers.handleConfig(req, res);
      return true;
    }
    if (req.method === 'POST' && pathname === '/auth/telegram/deep-link/start') {
      await telegramDeepLinkHandlers.handleStart(req, res);
      return true;
    }
    if (req.method === 'GET' && pathname === '/auth/telegram/deep-link/poll') {
      await telegramDeepLinkHandlers.handlePoll(req, res);
      return true;
    }
    if (req.method === 'POST' && pathname === '/auth/telegram/deep-link/cancel') {
      await telegramDeepLinkHandlers.handleCancel(req, res);
      return true;
    }
  }

  if (req.method === 'POST' && pathname === '/auth/logout') {
    await authSessionHandlers.handleLogout(req, res);
    return true;
  }

  return false;
};

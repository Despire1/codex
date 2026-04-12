import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from '../lib/http';

type ResolveSessionUser = (req: IncomingMessage, res: ServerResponse) => Promise<unknown | null>;

type AuthSessionHandlers = {
  handleTelegramBrowserConfig: (req: IncomingMessage, res: ServerResponse) => Promise<unknown>;
  handleTelegramBrowserLogin: (req: IncomingMessage, res: ServerResponse) => Promise<unknown>;
  handleLogout: (req: IncomingMessage, res: ServerResponse) => Promise<unknown>;
  handleTelegramWebapp: (req: IncomingMessage, res: ServerResponse) => Promise<unknown>;
};

type TryHandleAuthRoutesPayload = {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
  resolveSessionUser: ResolveSessionUser;
  authSessionHandlers: AuthSessionHandlers;
};

export const tryHandleAuthRoutes = async ({
  req,
  res,
  pathname,
  resolveSessionUser,
  authSessionHandlers,
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

  if (req.method === 'POST' && pathname === '/auth/logout') {
    await authSessionHandlers.handleLogout(req, res);
    return true;
  }

  return false;
};

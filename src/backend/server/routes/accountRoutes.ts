import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from '../lib/http';

type AccountRoutesHandlers = {
  exportAccount: (user: unknown) => Promise<unknown>;
};

type TryHandleAccountRoutesPayload = {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
  requireApiUser: () => unknown;
  handlers: AccountRoutesHandlers;
};

export const tryHandleAccountRoutes = async ({
  req,
  res,
  pathname,
  requireApiUser,
  handlers,
}: TryHandleAccountRoutesPayload) => {
  if (req.method === 'GET' && pathname === '/api/account/export') {
    const data = await handlers.exportAccount(requireApiUser());
    sendJson(res, 200, data);
    return true;
  }

  return false;
};

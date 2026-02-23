import type { IncomingMessage, ServerResponse } from 'node:http';
import { badRequest, sendJson } from '../lib/http';

type SessionRoutesHandlers = {
  listSessions: (user: unknown, req: IncomingMessage) => Promise<unknown>;
  revokeOtherSessions: (user: unknown, req: IncomingMessage) => Promise<unknown>;
  revokeSession: (user: unknown, sessionId: number) => Promise<unknown>;
};

type TryHandleSessionRoutesPayload = {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
  requireApiUser: () => unknown;
  handlers: SessionRoutesHandlers;
};

export const tryHandleSessionRoutes = async ({
  req,
  res,
  pathname,
  requireApiUser,
  handlers,
}: TryHandleSessionRoutesPayload) => {
  if (req.method === 'GET' && pathname === '/api/sessions') {
    const data = await handlers.listSessions(requireApiUser(), req);
    sendJson(res, 200, data);
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/sessions/revoke-others') {
    const data = await handlers.revokeOtherSessions(requireApiUser(), req);
    sendJson(res, 200, data);
    return true;
  }

  const sessionRevokeMatch = pathname.match(/^\/api\/sessions\/(\d+)\/revoke$/);
  if (req.method === 'POST' && sessionRevokeMatch) {
    const sessionId = Number(sessionRevokeMatch[1]);
    if (!Number.isFinite(sessionId)) {
      badRequest(res, 'invalid_session_id');
      return true;
    }
    const data = await handlers.revokeSession(requireApiUser(), sessionId);
    sendJson(res, 200, data);
    return true;
  }

  return false;
};

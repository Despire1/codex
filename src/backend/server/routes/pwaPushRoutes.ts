import type { IncomingMessage, ServerResponse } from 'node:http';
import { badRequest, readBody, sendJson } from '../lib/http';
import { isPwaPushRouteMode } from '../../../shared/lib/pwaPush';

type PwaPushRoutesHandlers = {
  getPwaPushConfig: () => unknown;
  savePwaPushSubscription: (user: unknown, req: IncomingMessage, body: Record<string, unknown>) => Promise<unknown>;
  removePwaPushSubscription: (user: unknown, body: Record<string, unknown>) => Promise<unknown>;
  sendPwaPushTest: (user: unknown) => Promise<unknown>;
};

type TryHandlePwaPushRoutesPayload = {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
  requireApiUser: () => unknown;
  handlers: PwaPushRoutesHandlers;
};

const isValidSubscriptionBody = (value: unknown) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  const subscription = payload.subscription;
  if (typeof subscription !== 'object' || subscription === null || Array.isArray(subscription)) return false;
  const normalizedSubscription = subscription as Record<string, unknown>;
  const keys = normalizedSubscription.keys;
  if (typeof keys !== 'object' || keys === null || Array.isArray(keys)) return false;
  const normalizedKeys = keys as Record<string, unknown>;
  if (typeof normalizedSubscription.endpoint !== 'string' || !normalizedSubscription.endpoint.trim()) return false;
  if (typeof normalizedKeys.p256dh !== 'string' || !normalizedKeys.p256dh.trim()) return false;
  if (typeof normalizedKeys.auth !== 'string' || !normalizedKeys.auth.trim()) return false;
  return isPwaPushRouteMode(payload.routeMode);
};

const isValidDeleteBody = (value: unknown) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.endpoint === 'string' && payload.endpoint.trim().length > 0;
};

export const tryHandlePwaPushRoutes = async ({
  req,
  res,
  pathname,
  requireApiUser,
  handlers,
}: TryHandlePwaPushRoutesPayload) => {
  if (req.method === 'GET' && pathname === '/api/pwa-push/config') {
    sendJson(res, 200, handlers.getPwaPushConfig());
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/pwa-push/subscriptions') {
    const body = await readBody(req);
    if (!isValidSubscriptionBody(body)) {
      badRequest(res, 'invalid_subscription');
      return true;
    }

    const data = await handlers.savePwaPushSubscription(requireApiUser(), req, body);
    sendJson(res, 200, data);
    return true;
  }

  if (req.method === 'DELETE' && pathname === '/api/pwa-push/subscriptions') {
    const body = await readBody(req);
    if (!isValidDeleteBody(body)) {
      badRequest(res, 'invalid_subscription');
      return true;
    }

    const data = await handlers.removePwaPushSubscription(requireApiUser(), body);
    sendJson(res, 200, data);
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/pwa-push/test') {
    const data = await handlers.sendPwaPushTest(requireApiUser());
    sendJson(res, 200, data);
    return true;
  }

  return false;
};

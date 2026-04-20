import type { IncomingMessage, ServerResponse } from 'node:http';
import { readBody, sendJson } from '../lib/http';

type TryHandleBillingRoutesPayload = {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
  isAuthorized: (req: IncomingMessage) => boolean;
  handleYookassaWebhook: (payload: Record<string, unknown>) => Promise<void>;
};

export const tryHandleBillingRoutes = async ({
  req,
  res,
  pathname,
  isAuthorized,
  handleYookassaWebhook,
}: TryHandleBillingRoutesPayload) => {
  if (req.method !== 'POST' || pathname !== '/api/yookassa/webhook') {
    return false;
  }

  if (!isAuthorized(req)) {
    console.warn('[yookassa] Unauthorized webhook request rejected');
    sendJson(res, 401, { message: 'unauthorized' });
    return true;
  }

  let payload: Record<string, unknown>;
  try {
    payload = await readBody(req);
  } catch (error) {
    console.error('[yookassa] Invalid webhook payload', error);
    sendJson(res, 200, { ok: true });
    return true;
  }

  await handleYookassaWebhook(payload);
  sendJson(res, 200, { ok: true });
  return true;
};

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { URL } from 'node:url';
import { badRequest, readBody, sendJson } from '../lib/http';

type NotificationTestTemplateType = 'LESSON_REMINDER' | 'PAYMENT_REMINDER';

type NotificationRoutesHandlers = {
  getNotificationChannelStatus: () => unknown;
  listNotificationTestRecipients: (user: unknown, type: NotificationTestTemplateType) => Promise<unknown>;
  sendNotificationTest: (user: unknown, body: Record<string, unknown>) => Promise<unknown>;
};

type TryHandleNotificationRoutesPayload = {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
  url: URL;
  requireApiUser: () => unknown;
  isNotificationTestType: (value: unknown) => value is NotificationTestTemplateType;
  handlers: NotificationRoutesHandlers;
};

export const tryHandleNotificationRoutes = async ({
  req,
  res,
  pathname,
  url,
  requireApiUser,
  isNotificationTestType,
  handlers,
}: TryHandleNotificationRoutesPayload) => {
  if (req.method === 'GET' && pathname === '/api/notifications/channel-status') {
    sendJson(res, 200, handlers.getNotificationChannelStatus());
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/notifications/test-recipients') {
    const type = url.searchParams.get('type');
    if (!isNotificationTestType(type)) {
      badRequest(res, 'invalid_type');
      return true;
    }
    const data = await handlers.listNotificationTestRecipients(requireApiUser(), type);
    sendJson(res, 200, data);
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/notifications/send-test') {
    const body = await readBody(req);
    const data = await handlers.sendNotificationTest(requireApiUser(), body);
    sendJson(res, 200, data);
    return true;
  }

  return false;
};

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { URL } from 'node:url';
import type { ActivityCategory } from '../../../entities/types';
import { readBody, sendJson } from '../lib/http';

type RequestRole = 'TEACHER' | 'STUDENT';

type ActivityFeedRoutesHandlers = {
  parseActivityCategories: (value?: string | null) => ActivityCategory[] | undefined;
  parseQueryDate: (value?: string | null) => Date | undefined;
  getActivityFeedUnreadStatus: (user: unknown) => Promise<unknown>;
  markActivityFeedSeen: (user: unknown, body: Record<string, unknown>) => Promise<unknown>;
  listActivityFeed: (
    user: unknown,
    params: {
      limit: number;
      cursor?: string | null;
      categories?: ActivityCategory[];
      studentId?: number | null;
      from?: Date | null;
      to?: Date | null;
    },
  ) => Promise<unknown>;
};

type TryHandleActivityFeedRoutesPayload = {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
  url: URL;
  role: RequestRole;
  defaultPageSize: number;
  requireApiUser: () => unknown;
  handlers: ActivityFeedRoutesHandlers;
};

export const tryHandleActivityFeedRoutes = async ({
  req,
  res,
  pathname,
  url,
  role,
  defaultPageSize,
  requireApiUser,
  handlers,
}: TryHandleActivityFeedRoutesPayload) => {
  if (req.method === 'GET' && pathname === '/api/activity-feed/unread-status') {
    if (role === 'STUDENT') {
      sendJson(res, 403, { message: 'forbidden' });
      return true;
    }
    const data = await handlers.getActivityFeedUnreadStatus(requireApiUser());
    sendJson(res, 200, data);
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/activity-feed/mark-seen') {
    if (role === 'STUDENT') {
      sendJson(res, 403, { message: 'forbidden' });
      return true;
    }
    const body = await readBody(req);
    const data = await handlers.markActivityFeedSeen(requireApiUser(), body);
    sendJson(res, 200, data);
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/activity-feed') {
    if (role === 'STUDENT') {
      sendJson(res, 403, { message: 'forbidden' });
      return true;
    }
    const limit = Number(url.searchParams.get('limit') ?? defaultPageSize);
    const cursor = url.searchParams.get('cursor');
    const categories = handlers.parseActivityCategories(url.searchParams.get('categories'));
    const studentIdParam = url.searchParams.get('studentId');
    const studentIdRaw = studentIdParam === null ? Number.NaN : Number(studentIdParam);
    const studentId = Number.isFinite(studentIdRaw) && studentIdRaw > 0 ? studentIdRaw : null;
    const from = handlers.parseQueryDate(url.searchParams.get('from'));
    const to = handlers.parseQueryDate(url.searchParams.get('to'));
    const data = await handlers.listActivityFeed(requireApiUser(), {
      limit,
      cursor,
      categories,
      studentId,
      from,
      to,
    });
    sendJson(res, 200, data);
    return true;
  }

  return false;
};

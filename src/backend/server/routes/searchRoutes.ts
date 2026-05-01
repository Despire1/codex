import type { IncomingMessage, ServerResponse } from 'node:http';
import type { URL } from 'node:url';
import { sendJson } from '../lib/http';
import { parseGlobalSearchScope } from '../modules/globalSearch';
import type { GlobalSearchResponse } from '../modules/globalSearch';

type RequestRole = 'TEACHER' | 'STUDENT';

type SearchRoutesHandlers = {
  globalSearch: (
    user: unknown,
    params: { query?: string | null; scope?: ReturnType<typeof parseGlobalSearchScope>; limit?: number },
  ) => Promise<GlobalSearchResponse>;
};

type TryHandleSearchRoutesPayload = {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
  url: URL;
  role: RequestRole;
  requireApiUser: () => unknown;
  handlers: SearchRoutesHandlers;
};

export const tryHandleSearchRoutes = async ({
  req,
  res,
  pathname,
  url,
  role,
  requireApiUser,
  handlers,
}: TryHandleSearchRoutesPayload) => {
  if (req.method === 'GET' && pathname === '/api/search') {
    if (role === 'STUDENT') {
      sendJson(res, 403, { message: 'forbidden' });
      return true;
    }
    const query = url.searchParams.get('query');
    const scope = parseGlobalSearchScope(url.searchParams.get('scope'));
    const limitRaw = url.searchParams.get('limit');
    const limit = limitRaw === null ? undefined : Number(limitRaw);
    const data = await handlers.globalSearch(requireApiUser(), { query, scope, limit });
    sendJson(res, 200, data);
    return true;
  }

  return false;
};

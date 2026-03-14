import type { IncomingMessage, ServerResponse } from 'node:http';
import type { URL } from 'node:url';
import { badRequest, readBody, sendJson } from '../lib/http';

type RequestRole = 'TEACHER' | 'STUDENT';

type ScheduleNoteRoutesHandlers = {
  listScheduleNotes: (user: unknown, params: { start?: string | null; end?: string | null }) => Promise<{ notes: any[] }>;
  createScheduleNote: (user: unknown, body: Record<string, unknown>) => Promise<{ note: unknown }>;
  updateScheduleNote: (user: unknown, noteId: number, body: Record<string, unknown>) => Promise<{ note: unknown }>;
  deleteScheduleNote: (user: unknown, noteId: number) => Promise<{ deletedId: number }>;
};

type TryHandleScheduleNoteRoutesPayload = {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
  url: URL;
  role: RequestRole;
  requireApiUser: () => unknown;
  handlers: ScheduleNoteRoutesHandlers;
};

export const tryHandleScheduleNoteRoutes = async ({
  req,
  res,
  pathname,
  url,
  role,
  requireApiUser,
  handlers,
}: TryHandleScheduleNoteRoutesPayload) => {
  if (req.method === 'GET' && pathname === '/api/schedule-notes') {
    if (role === 'STUDENT') {
      sendJson(res, 403, { message: 'forbidden' });
      return true;
    }
    const data = await handlers.listScheduleNotes(requireApiUser(), {
      start: url.searchParams.get('start'),
      end: url.searchParams.get('end'),
    });
    sendJson(res, 200, data);
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/schedule-notes') {
    if (role === 'STUDENT') {
      sendJson(res, 403, { message: 'forbidden' });
      return true;
    }
    const body = await readBody(req);
    const data = await handlers.createScheduleNote(requireApiUser(), body);
    sendJson(res, 201, data);
    return true;
  }

  const noteMatch = pathname.match(/^\/api\/schedule-notes\/(\d+)$/);
  if (!noteMatch) return false;

  if (role === 'STUDENT') {
    sendJson(res, 403, { message: 'forbidden' });
    return true;
  }

  const noteId = Number(noteMatch[1]);
  if (!Number.isFinite(noteId) || noteId <= 0) {
    badRequest(res, 'invalid_schedule_note_id');
    return true;
  }

  if (req.method === 'PATCH') {
    const body = await readBody(req);
    const data = await handlers.updateScheduleNote(requireApiUser(), noteId, body);
    sendJson(res, 200, data);
    return true;
  }

  if (req.method === 'DELETE') {
    const data = await handlers.deleteScheduleNote(requireApiUser(), noteId);
    sendJson(res, 200, data);
    return true;
  }

  return false;
};

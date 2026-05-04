import type { IncomingMessage, ServerResponse } from 'node:http';
import { badRequest, readBody, sendJson } from '../lib/http';

type ScheduleV2Handlers = {
  getLessonV2: (user: unknown, lessonId: number) => Promise<unknown>;
  updateLessonV2: (user: unknown, lessonId: number, body: Record<string, unknown>) => Promise<unknown>;
  updateSeriesPlan: (user: unknown, seriesId: number, body: Record<string, unknown>) => Promise<unknown>;
  addLessonAttachment: (user: unknown, lessonId: number, body: Record<string, unknown>) => Promise<unknown>;
  removeLessonAttachment: (user: unknown, lessonId: number, attachmentId: string) => Promise<unknown>;
  addSeriesAttachment: (user: unknown, seriesId: number, body: Record<string, unknown>) => Promise<unknown>;
  removeSeriesAttachment: (user: unknown, seriesId: number, attachmentId: string) => Promise<unknown>;
  listSeriesAttachments: (user: unknown, seriesId: number) => Promise<unknown>;
  listStudentTopics: (user: unknown, studentId: number) => Promise<unknown>;
};

type Payload = {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
  role: 'TEACHER' | 'STUDENT';
  requireApiUser: () => unknown;
  handlers: ScheduleV2Handlers;
};

const respondError = (res: ServerResponse, error: unknown) => {
  const status = typeof (error as any)?.statusCode === 'number' ? (error as any).statusCode : 500;
  const message = typeof (error as any)?.message === 'string' ? (error as any).message : 'internal_error';
  const code = typeof (error as any)?.code === 'string' ? (error as any).code : undefined;
  const payload: Record<string, unknown> = { message };
  if (code) payload.code = code;
  sendJson(res, status, payload);
};

export const tryHandleScheduleV2Routes = async ({
  req,
  res,
  pathname,
  role,
  requireApiUser,
  handlers,
}: Payload): Promise<boolean> => {
  if (!pathname.startsWith('/api/v2/schedule/')) return false;

  if (role === 'STUDENT') {
    sendJson(res, 403, { message: 'forbidden' });
    return true;
  }

  // GET /api/v2/schedule/lessons/:id
  // PATCH /api/v2/schedule/lessons/:id
  const lessonMatch = pathname.match(/^\/api\/v2\/schedule\/lessons\/(\d+)$/);
  if (lessonMatch) {
    const lessonId = Number(lessonMatch[1]);
    if (!Number.isFinite(lessonId) || lessonId <= 0) {
      badRequest(res, 'invalid_lesson_id');
      return true;
    }
    if (req.method === 'GET') {
      try {
        const data = await handlers.getLessonV2(requireApiUser(), lessonId);
        sendJson(res, 200, data);
      } catch (error) {
        respondError(res, error);
      }
      return true;
    }
    if (req.method === 'PATCH') {
      const body = await readBody(req);
      try {
        const data = await handlers.updateLessonV2(requireApiUser(), lessonId, body);
        sendJson(res, 200, data);
      } catch (error) {
        respondError(res, error);
      }
      return true;
    }
    return false;
  }

  // POST /api/v2/schedule/lessons/:id/attachments
  const attachmentsMatch = pathname.match(/^\/api\/v2\/schedule\/lessons\/(\d+)\/attachments$/);
  if (attachmentsMatch && req.method === 'POST') {
    const lessonId = Number(attachmentsMatch[1]);
    if (!Number.isFinite(lessonId) || lessonId <= 0) {
      badRequest(res, 'invalid_lesson_id');
      return true;
    }
    const body = await readBody(req);
    try {
      const data = await handlers.addLessonAttachment(requireApiUser(), lessonId, body);
      sendJson(res, 201, data);
    } catch (error) {
      respondError(res, error);
    }
    return true;
  }

  // DELETE /api/v2/schedule/lessons/:id/attachments/:attachmentId
  const attachmentItemMatch = pathname.match(/^\/api\/v2\/schedule\/lessons\/(\d+)\/attachments\/([a-zA-Z0-9-]+)$/);
  if (attachmentItemMatch && req.method === 'DELETE') {
    const lessonId = Number(attachmentItemMatch[1]);
    const attachmentId = attachmentItemMatch[2];
    if (!Number.isFinite(lessonId) || lessonId <= 0) {
      badRequest(res, 'invalid_lesson_id');
      return true;
    }
    try {
      const data = await handlers.removeLessonAttachment(requireApiUser(), lessonId, attachmentId);
      sendJson(res, 200, data);
    } catch (error) {
      respondError(res, error);
    }
    return true;
  }

  // GET /api/v2/schedule/series/:id/attachments
  // POST /api/v2/schedule/series/:id/attachments
  const seriesAttachmentsMatch = pathname.match(/^\/api\/v2\/schedule\/series\/(\d+)\/attachments$/);
  if (seriesAttachmentsMatch) {
    const seriesId = Number(seriesAttachmentsMatch[1]);
    if (!Number.isFinite(seriesId) || seriesId <= 0) {
      badRequest(res, 'invalid_series_id');
      return true;
    }
    if (req.method === 'GET') {
      try {
        const data = await handlers.listSeriesAttachments(requireApiUser(), seriesId);
        sendJson(res, 200, data);
      } catch (error) {
        respondError(res, error);
      }
      return true;
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      try {
        const data = await handlers.addSeriesAttachment(requireApiUser(), seriesId, body);
        sendJson(res, 201, data);
      } catch (error) {
        respondError(res, error);
      }
      return true;
    }
    return false;
  }

  // DELETE /api/v2/schedule/series/:id/attachments/:attachmentId
  const seriesAttachmentItemMatch = pathname.match(
    /^\/api\/v2\/schedule\/series\/(\d+)\/attachments\/([a-zA-Z0-9-]+)$/,
  );
  if (seriesAttachmentItemMatch && req.method === 'DELETE') {
    const seriesId = Number(seriesAttachmentItemMatch[1]);
    const attachmentId = seriesAttachmentItemMatch[2];
    if (!Number.isFinite(seriesId) || seriesId <= 0) {
      badRequest(res, 'invalid_series_id');
      return true;
    }
    try {
      const data = await handlers.removeSeriesAttachment(requireApiUser(), seriesId, attachmentId);
      sendJson(res, 200, data);
    } catch (error) {
      respondError(res, error);
    }
    return true;
  }

  // PUT /api/v2/schedule/series/:id/plan
  const seriesPlanMatch = pathname.match(/^\/api\/v2\/schedule\/series\/(\d+)\/plan$/);
  if (seriesPlanMatch && req.method === 'PUT') {
    const seriesId = Number(seriesPlanMatch[1]);
    if (!Number.isFinite(seriesId) || seriesId <= 0) {
      badRequest(res, 'invalid_series_id');
      return true;
    }
    const body = await readBody(req);
    try {
      const data = await handlers.updateSeriesPlan(requireApiUser(), seriesId, body);
      sendJson(res, 200, data);
    } catch (error) {
      respondError(res, error);
    }
    return true;
  }

  // GET /api/v2/schedule/students/:id/topics
  const topicsMatch = pathname.match(/^\/api\/v2\/schedule\/students\/(\d+)\/topics$/);
  if (topicsMatch && req.method === 'GET') {
    const studentId = Number(topicsMatch[1]);
    if (!Number.isFinite(studentId) || studentId <= 0) {
      badRequest(res, 'invalid_student_id');
      return true;
    }
    try {
      const data = await handlers.listStudentTopics(requireApiUser(), studentId);
      sendJson(res, 200, data);
    } catch (error) {
      respondError(res, error);
    }
    return true;
  }

  return false;
};

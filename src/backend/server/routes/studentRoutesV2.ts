import type { IncomingMessage, ServerResponse } from 'node:http';
import type { URL } from 'node:url';
import { badRequest, readBody, sendJson } from '../lib/http';

type RequestRole = 'TEACHER' | 'STUDENT';

type ListStudentContextV2 = (user: unknown, requestedTeacherId?: number | null, requestedStudentId?: number | null) => Promise<unknown>;
type UpdateStudentPreferencesV2 = (
  user: unknown,
  requestedTeacherId: number | null | undefined,
  requestedStudentId: number | null | undefined,
  body: Record<string, unknown>,
) => Promise<unknown>;
type GetStudentHomeworkSummaryV2 = (
  user: unknown,
  requestedTeacherId?: number | null,
  requestedStudentId?: number | null,
) => Promise<unknown>;
type ListStudentHomeworkAssignmentsV2 = (
  user: unknown,
  requestedTeacherId: number | null | undefined,
  requestedStudentId: number | null | undefined,
  params: { filter?: string | null; limit?: number; offset?: number },
) => Promise<unknown>;
type GetStudentHomeworkAssignmentDetailV2 = (
  user: unknown,
  requestedTeacherId: number | null | undefined,
  requestedStudentId: number | null | undefined,
  assignmentId: number,
) => Promise<unknown>;

type StudentV2Handlers = {
  listStudentContextV2: ListStudentContextV2;
  updateStudentPreferencesV2: UpdateStudentPreferencesV2;
  getStudentHomeworkSummaryV2: GetStudentHomeworkSummaryV2;
  listStudentHomeworkAssignmentsV2: ListStudentHomeworkAssignmentsV2;
  getStudentHomeworkAssignmentDetailV2: GetStudentHomeworkAssignmentDetailV2;
};

type TryHandleStudentV2RoutesPayload = {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
  url: URL;
  role: RequestRole;
  requestedTeacherId: number | null | undefined;
  requestedStudentId: number | null | undefined;
  defaultPageSize: number;
  requireApiUser: () => unknown;
  handlers: StudentV2Handlers;
};

export const tryHandleStudentV2Routes = async ({
  req,
  res,
  pathname,
  url,
  role,
  requestedTeacherId,
  requestedStudentId,
  defaultPageSize,
  requireApiUser,
  handlers,
}: TryHandleStudentV2RoutesPayload) => {
  if (req.method === 'GET' && pathname === '/api/v2/student/context') {
    if (role !== 'STUDENT') {
      sendJson(res, 403, { message: 'forbidden' });
      return true;
    }
    const data = await handlers.listStudentContextV2(requireApiUser(), requestedTeacherId, requestedStudentId);
    sendJson(res, 200, data);
    return true;
  }

  if (req.method === 'PATCH' && pathname === '/api/v2/student/preferences') {
    if (role !== 'STUDENT') {
      sendJson(res, 403, { message: 'forbidden' });
      return true;
    }
    const body = await readBody(req);
    const data = await handlers.updateStudentPreferencesV2(requireApiUser(), requestedTeacherId, requestedStudentId, body);
    sendJson(res, 200, data);
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/v2/student/homework/summary') {
    if (role !== 'STUDENT') {
      sendJson(res, 403, { message: 'forbidden' });
      return true;
    }
    const data = await handlers.getStudentHomeworkSummaryV2(requireApiUser(), requestedTeacherId, requestedStudentId);
    sendJson(res, 200, data);
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/v2/student/homework/assignments') {
    if (role !== 'STUDENT') {
      sendJson(res, 403, { message: 'forbidden' });
      return true;
    }
    const data = await handlers.listStudentHomeworkAssignmentsV2(requireApiUser(), requestedTeacherId, requestedStudentId, {
      filter: url.searchParams.get('filter'),
      limit: Number(url.searchParams.get('limit') ?? defaultPageSize),
      offset: Number(url.searchParams.get('offset') ?? 0),
    });
    sendJson(res, 200, data);
    return true;
  }

  const studentHomeworkAssignmentDetailMatch = pathname.match(/^\/api\/v2\/student\/homework\/assignments\/(\d+)$/);
  if (req.method === 'GET' && studentHomeworkAssignmentDetailMatch) {
    if (role !== 'STUDENT') {
      sendJson(res, 403, { message: 'forbidden' });
      return true;
    }
    const assignmentId = Number(studentHomeworkAssignmentDetailMatch[1]);
    if (!Number.isFinite(assignmentId)) {
      badRequest(res, 'invalid_assignment_id');
      return true;
    }
    const data = await handlers.getStudentHomeworkAssignmentDetailV2(
      requireApiUser(),
      requestedTeacherId,
      requestedStudentId,
      assignmentId,
    );
    sendJson(res, 200, data);
    return true;
  }

  return false;
};

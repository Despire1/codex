import type { IncomingMessage, ServerResponse } from 'node:http';
import type { URL } from 'node:url';
import { badRequest, readBody, sendJson } from '../lib/http';

type RequestRole = 'TEACHER' | 'STUDENT';

type ParseOptionalNumberQueryParam = (value: string | null) => number | null;
type ParseOptionalBooleanQueryParam = (value: string | null) => boolean | null;

type HomeworkRoutesV2Parsers = {
  parseOptionalNumberQueryParam: ParseOptionalNumberQueryParam;
  parseOptionalBooleanQueryParam: ParseOptionalBooleanQueryParam;
};

type HomeworkRoutesV2Handlers = {
  createFilePresignUploadV2: (req: IncomingMessage, body: Record<string, unknown>) => unknown;
  listHomeworkGroupsV2: (user: unknown, params: { includeArchived?: boolean }) => Promise<unknown>;
  createHomeworkGroupV2: (user: unknown, body: Record<string, unknown>) => Promise<unknown>;
  updateHomeworkGroupV2: (user: unknown, groupId: number, body: Record<string, unknown>) => Promise<unknown>;
  deleteHomeworkGroupV2: (user: unknown, groupId: number) => Promise<unknown>;
  listHomeworkTemplatesV2: (
    user: unknown,
    params: { query?: string | null; includeArchived?: boolean },
  ) => Promise<unknown>;
  createHomeworkTemplateV2: (user: unknown, body: Record<string, unknown>) => Promise<unknown>;
  updateHomeworkTemplateV2: (user: unknown, templateId: number, body: Record<string, unknown>) => Promise<unknown>;
  listHomeworkAssignmentsV2: (
    user: unknown,
    params: {
      studentId?: number | null;
      lessonId?: number | null;
      groupId?: number | null;
      ungrouped?: boolean | null;
      status?: string | null;
      bucket?: string | null;
      tab?: string | null;
      q?: string | null;
      sort?: string | null;
      problemFilters?: string | null;
      limit?: number;
      offset?: number;
    },
  ) => Promise<unknown>;
  getHomeworkAssignmentsSummaryV2: (
    user: unknown,
    params: { studentId?: number | null; lessonId?: number | null },
  ) => Promise<unknown>;
  createHomeworkAssignmentV2: (user: unknown, body: Record<string, unknown>) => Promise<unknown>;
  bulkHomeworkAssignmentsV2: (user: unknown, body: Record<string, unknown>) => Promise<unknown>;
  getHomeworkAssignmentV2: (user: unknown, assignmentId: number) => Promise<unknown>;
  updateHomeworkAssignmentV2: (user: unknown, assignmentId: number, body: Record<string, unknown>) => Promise<unknown>;
  deleteHomeworkAssignmentV2: (user: unknown, assignmentId: number) => Promise<unknown>;
  remindHomeworkAssignmentV2: (user: unknown, assignmentId: number) => Promise<unknown>;
  listHomeworkSubmissionsV2: (user: unknown, assignmentId: number) => Promise<unknown>;
  createHomeworkSubmissionV2: (
    user: unknown,
    role: RequestRole,
    assignmentId: number,
    body: Record<string, unknown>,
    requestedTeacherId: number | null | undefined,
    requestedStudentId: number | null | undefined,
  ) => Promise<unknown>;
  openHomeworkReviewSessionV2: (user: unknown, assignmentId: number) => Promise<unknown>;
  saveHomeworkReviewDraftV2: (user: unknown, assignmentId: number, body: Record<string, unknown>) => Promise<unknown>;
  reviewHomeworkAssignmentV2: (user: unknown, assignmentId: number, body: Record<string, unknown>) => Promise<unknown>;
};

type TryHandleHomeworkRoutesV2Payload = {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
  url: URL;
  role: RequestRole;
  requestedTeacherId: number | null | undefined;
  requestedStudentId: number | null | undefined;
  defaultPageSize: number;
  requireApiUser: () => unknown;
  parsers: HomeworkRoutesV2Parsers;
  handlers: HomeworkRoutesV2Handlers;
};

export const tryHandleHomeworkRoutesV2 = async ({
  req,
  res,
  pathname,
  url,
  role,
  requestedTeacherId,
  requestedStudentId,
  defaultPageSize,
  requireApiUser,
  parsers,
  handlers,
}: TryHandleHomeworkRoutesV2Payload) => {
  if (req.method === 'POST' && pathname === '/api/v2/files/presign-upload') {
    const body = await readBody(req);
    const data = handlers.createFilePresignUploadV2(req, body);
    sendJson(res, 200, data);
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/v2/homework/groups') {
    if (role === 'STUDENT') {
      sendJson(res, 403, { message: 'forbidden' });
      return true;
    }
    const data = await handlers.listHomeworkGroupsV2(requireApiUser(), {
      includeArchived: url.searchParams.get('includeArchived') === '1',
    });
    sendJson(res, 200, data);
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/v2/homework/groups') {
    if (role === 'STUDENT') {
      sendJson(res, 403, { message: 'forbidden' });
      return true;
    }
    const body = await readBody(req);
    const data = await handlers.createHomeworkGroupV2(requireApiUser(), body);
    sendJson(res, 201, data);
    return true;
  }

  const homeworkGroupUpdateMatch = pathname.match(/^\/api\/v2\/homework\/groups\/(\d+)$/);
  if (homeworkGroupUpdateMatch) {
    if (role === 'STUDENT') {
      sendJson(res, 403, { message: 'forbidden' });
      return true;
    }
    const groupId = Number(homeworkGroupUpdateMatch[1]);
    if (!Number.isFinite(groupId)) {
      badRequest(res, 'invalid_group_id');
      return true;
    }
    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const data = await handlers.updateHomeworkGroupV2(requireApiUser(), groupId, body);
      sendJson(res, 200, data);
      return true;
    }
    if (req.method === 'DELETE') {
      const data = await handlers.deleteHomeworkGroupV2(requireApiUser(), groupId);
      sendJson(res, 200, data);
      return true;
    }
  }

  if (req.method === 'GET' && pathname === '/api/v2/homework/templates') {
    if (role === 'STUDENT') {
      sendJson(res, 403, { message: 'forbidden' });
      return true;
    }
    const data = await handlers.listHomeworkTemplatesV2(requireApiUser(), {
      query: url.searchParams.get('query'),
      includeArchived: url.searchParams.get('includeArchived') === '1',
    });
    sendJson(res, 200, data);
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/v2/homework/templates') {
    if (role === 'STUDENT') {
      sendJson(res, 403, { message: 'forbidden' });
      return true;
    }
    const body = await readBody(req);
    const data = await handlers.createHomeworkTemplateV2(requireApiUser(), body);
    sendJson(res, 201, data);
    return true;
  }

  const homeworkTemplateUpdateMatch = pathname.match(/^\/api\/v2\/homework\/templates\/(\d+)$/);
  if (req.method === 'PATCH' && homeworkTemplateUpdateMatch) {
    if (role === 'STUDENT') {
      sendJson(res, 403, { message: 'forbidden' });
      return true;
    }
    const templateId = Number(homeworkTemplateUpdateMatch[1]);
    if (!Number.isFinite(templateId)) {
      badRequest(res, 'invalid_template_id');
      return true;
    }
    const body = await readBody(req);
    const data = await handlers.updateHomeworkTemplateV2(requireApiUser(), templateId, body);
    sendJson(res, 200, data);
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/v2/homework/assignments') {
    if (role === 'STUDENT') {
      sendJson(res, 403, { message: 'forbidden' });
      return true;
    }
    const data = await handlers.listHomeworkAssignmentsV2(requireApiUser(), {
      studentId: parsers.parseOptionalNumberQueryParam(url.searchParams.get('studentId')),
      lessonId: parsers.parseOptionalNumberQueryParam(url.searchParams.get('lessonId')),
      groupId: parsers.parseOptionalNumberQueryParam(url.searchParams.get('groupId')),
      ungrouped: parsers.parseOptionalBooleanQueryParam(url.searchParams.get('ungrouped')),
      status: url.searchParams.get('status'),
      bucket: url.searchParams.get('bucket'),
      tab: url.searchParams.get('tab'),
      q: url.searchParams.get('q'),
      sort: url.searchParams.get('sort'),
      problemFilters: url.searchParams.get('problemFilters'),
      limit: Number(url.searchParams.get('limit') ?? defaultPageSize),
      offset: Number(url.searchParams.get('offset') ?? 0),
    });
    sendJson(res, 200, data);
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/v2/homework/assignments/summary') {
    if (role === 'STUDENT') {
      sendJson(res, 403, { message: 'forbidden' });
      return true;
    }
    const data = await handlers.getHomeworkAssignmentsSummaryV2(requireApiUser(), {
      studentId: parsers.parseOptionalNumberQueryParam(url.searchParams.get('studentId')),
      lessonId: parsers.parseOptionalNumberQueryParam(url.searchParams.get('lessonId')),
    });
    sendJson(res, 200, data);
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/v2/homework/assignments') {
    if (role === 'STUDENT') {
      sendJson(res, 403, { message: 'forbidden' });
      return true;
    }
    const body = await readBody(req);
    const data = await handlers.createHomeworkAssignmentV2(requireApiUser(), body);
    sendJson(res, 201, data);
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/v2/homework/assignments/bulk') {
    if (role === 'STUDENT') {
      sendJson(res, 403, { message: 'forbidden' });
      return true;
    }
    const body = await readBody(req);
    const data = await handlers.bulkHomeworkAssignmentsV2(requireApiUser(), body);
    sendJson(res, 200, data);
    return true;
  }

  const homeworkAssignmentUpdateMatch = pathname.match(/^\/api\/v2\/homework\/assignments\/(\d+)$/);
  if (homeworkAssignmentUpdateMatch) {
    if (role === 'STUDENT') {
      sendJson(res, 403, { message: 'forbidden' });
      return true;
    }
    const assignmentId = Number(homeworkAssignmentUpdateMatch[1]);
    if (!Number.isFinite(assignmentId)) {
      badRequest(res, 'invalid_assignment_id');
      return true;
    }
    if (req.method === 'GET') {
      const data = await handlers.getHomeworkAssignmentV2(requireApiUser(), assignmentId);
      sendJson(res, 200, data);
      return true;
    }
    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const data = await handlers.updateHomeworkAssignmentV2(requireApiUser(), assignmentId, body);
      sendJson(res, 200, data);
      return true;
    }
    if (req.method === 'DELETE') {
      const data = await handlers.deleteHomeworkAssignmentV2(requireApiUser(), assignmentId);
      sendJson(res, 200, data);
      return true;
    }
  }

  const homeworkAssignmentRemindMatch = pathname.match(/^\/api\/v2\/homework\/assignments\/(\d+)\/remind$/);
  if (req.method === 'POST' && homeworkAssignmentRemindMatch) {
    if (role === 'STUDENT') {
      sendJson(res, 403, { message: 'forbidden' });
      return true;
    }
    const assignmentId = Number(homeworkAssignmentRemindMatch[1]);
    if (!Number.isFinite(assignmentId)) {
      badRequest(res, 'invalid_assignment_id');
      return true;
    }
    const data = await handlers.remindHomeworkAssignmentV2(requireApiUser(), assignmentId);
    sendJson(res, 200, data);
    return true;
  }

  const homeworkSubmissionsMatch = pathname.match(/^\/api\/v2\/homework\/assignments\/(\d+)\/submissions$/);
  if (homeworkSubmissionsMatch) {
    const assignmentId = Number(homeworkSubmissionsMatch[1]);
    if (!Number.isFinite(assignmentId)) {
      badRequest(res, 'invalid_assignment_id');
      return true;
    }
    if (req.method === 'GET') {
      if (role === 'STUDENT') {
        sendJson(res, 403, { message: 'forbidden' });
        return true;
      }
      const data = await handlers.listHomeworkSubmissionsV2(requireApiUser(), assignmentId);
      sendJson(res, 200, data);
      return true;
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const data = await handlers.createHomeworkSubmissionV2(
        requireApiUser(),
        role,
        assignmentId,
        body,
        requestedTeacherId,
        requestedStudentId,
      );
      sendJson(res, 201, data);
      return true;
    }
  }

  const homeworkReviewMatch = pathname.match(/^\/api\/v2\/homework\/assignments\/(\d+)\/review$/);
  const homeworkReviewSessionMatch = pathname.match(/^\/api\/v2\/homework\/assignments\/(\d+)\/review-session$/);
  if (req.method === 'POST' && homeworkReviewSessionMatch) {
    if (role === 'STUDENT') {
      sendJson(res, 403, { message: 'forbidden' });
      return true;
    }
    const assignmentId = Number(homeworkReviewSessionMatch[1]);
    if (!Number.isFinite(assignmentId)) {
      badRequest(res, 'invalid_assignment_id');
      return true;
    }
    const data = await handlers.openHomeworkReviewSessionV2(requireApiUser(), assignmentId);
    sendJson(res, 200, data);
    return true;
  }

  const homeworkReviewDraftMatch = pathname.match(/^\/api\/v2\/homework\/assignments\/(\d+)\/review-draft$/);
  if (req.method === 'POST' && homeworkReviewDraftMatch) {
    if (role === 'STUDENT') {
      sendJson(res, 403, { message: 'forbidden' });
      return true;
    }
    const assignmentId = Number(homeworkReviewDraftMatch[1]);
    if (!Number.isFinite(assignmentId)) {
      badRequest(res, 'invalid_assignment_id');
      return true;
    }
    const body = await readBody(req);
    const data = await handlers.saveHomeworkReviewDraftV2(requireApiUser(), assignmentId, body);
    sendJson(res, 200, data);
    return true;
  }

  if (req.method === 'POST' && homeworkReviewMatch) {
    if (role === 'STUDENT') {
      sendJson(res, 403, { message: 'forbidden' });
      return true;
    }
    const assignmentId = Number(homeworkReviewMatch[1]);
    if (!Number.isFinite(assignmentId)) {
      badRequest(res, 'invalid_assignment_id');
      return true;
    }
    const body = await readBody(req);
    const data = await handlers.reviewHomeworkAssignmentV2(requireApiUser(), assignmentId, body);
    sendJson(res, 200, data);
    return true;
  }

  return false;
};

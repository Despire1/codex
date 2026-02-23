import type { IncomingMessage, ServerResponse } from 'node:http';
import type { URL } from 'node:url';
import type { HomeworkStatus } from '../../../entities/types';
import { readBody, sendJson } from '../lib/http';

type RequestRole = 'TEACHER' | 'STUDENT';

type StudentRoutesHandlers = {
  resolvePageParams: (url: URL) => { limit: number; offset: number };
  filterHomeworksForRole: (homeworks: any[], role: RequestRole, studentId?: number | null) => any[];
  listStudents: (
    user: unknown,
    query?: string,
    filter?: 'all' | 'debt' | 'overdue',
    limit?: number,
    offset?: number,
  ) => Promise<unknown>;
  searchStudents: (
    user: unknown,
    query?: string,
    filter?: 'all' | 'pendingHomework' | 'noReminder',
  ) => Promise<{
    students: any[];
    links: any[];
    homeworks: any[];
    [key: string]: unknown;
  }>;
  addStudent: (user: unknown, body: Record<string, unknown>) => Promise<unknown>;
  updateStudent: (user: unknown, studentId: number, body: Record<string, unknown>) => Promise<unknown>;
  archiveStudentLink: (user: unknown, studentId: number) => Promise<unknown>;
  listStudentHomeworks: (
    user: unknown,
    studentId: number,
    filter?: HomeworkStatus | 'all' | 'overdue',
    limit?: number,
    offset?: number,
  ) => Promise<{ items: any[]; [key: string]: unknown }>;
  listStudentLessons: (
    user: unknown,
    studentId: number,
    params: {
      payment?: 'all' | 'paid' | 'unpaid';
      status?: 'all' | 'completed' | 'not_completed';
      startFrom?: string;
      startTo?: string;
      sort?: 'asc' | 'desc';
    },
  ) => Promise<unknown>;
  listStudentUnpaidLessons: (user: unknown, studentId: number) => Promise<unknown>;
  listStudentPaymentReminders: (
    user: unknown,
    studentId: number,
    params: { limit?: number; offset?: number },
  ) => Promise<unknown>;
  updateStudentPaymentReminders: (user: unknown, studentId: number, enabled: boolean) => Promise<unknown>;
  toggleAutoReminder: (user: unknown, studentId: number, value: boolean) => Promise<unknown>;
  updatePricePerLesson: (user: unknown, studentId: number, value: number) => Promise<unknown>;
  adjustBalance: (
    user: unknown,
    studentId: number,
    payload: { delta: number; type?: unknown; comment?: unknown; createdAt?: unknown },
  ) => Promise<unknown>;
  listPaymentEventsForStudent: (
    user: unknown,
    studentId: number,
    params: { filter?: string; date?: string },
  ) => Promise<unknown>;
};

type TryHandleStudentRoutesPayload = {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
  url: URL;
  role: RequestRole;
  requestedStudentId: number | null | undefined;
  requireApiUser: () => unknown;
  handlers: StudentRoutesHandlers;
};

export const tryHandleStudentRoutes = async ({
  req,
  res,
  pathname,
  url,
  role,
  requestedStudentId,
  requireApiUser,
  handlers,
}: TryHandleStudentRoutesPayload) => {
  if (req.method === 'GET' && pathname === '/api/students') {
    const { searchParams } = url;
    const query = searchParams.get('query') ?? undefined;
    const filter = (searchParams.get('filter') as 'all' | 'debt' | 'overdue' | null) ?? 'all';
    const { limit, offset } = handlers.resolvePageParams(url);
    const data = await handlers.listStudents(requireApiUser(), query, filter, limit, offset);
    sendJson(res, 200, data);
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/students/search') {
    const { searchParams } = url;
    const query = searchParams.get('query') ?? undefined;
    const filter = (searchParams.get('filter') as 'all' | 'pendingHomework' | 'noReminder' | null) ?? 'all';
    const data = await handlers.searchStudents(requireApiUser(), query, filter);
    const filteredHomeworks = handlers.filterHomeworksForRole(data.homeworks, role, requestedStudentId);
    const filteredLinks =
      role === 'STUDENT' && requestedStudentId
        ? data.links.filter((link) => link.studentId === requestedStudentId)
        : data.links;
    const filteredStudents =
      role === 'STUDENT' && requestedStudentId
        ? data.students.filter((student) => student.id === requestedStudentId)
        : data.students;
    sendJson(res, 200, { ...data, homeworks: filteredHomeworks, links: filteredLinks, students: filteredStudents });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/students') {
    const body = await readBody(req);
    const data = await handlers.addStudent(requireApiUser(), body);
    sendJson(res, 201, data);
    return true;
  }

  const studentUpdateMatch = pathname.match(/^\/api\/students\/(\d+)$/);
  if ((req.method === 'PATCH' || req.method === 'PUT') && studentUpdateMatch) {
    const studentId = Number(studentUpdateMatch[1]);
    const body = await readBody(req);
    const data = await handlers.updateStudent(requireApiUser(), studentId, body);
    sendJson(res, 200, data);
    return true;
  }

  const studentDeleteMatch = pathname.match(/^\/api\/students\/(\d+)$/);
  if (req.method === 'DELETE' && studentDeleteMatch) {
    const studentId = Number(studentDeleteMatch[1]);
    const link = await handlers.archiveStudentLink(requireApiUser(), studentId);
    sendJson(res, 200, { link });
    return true;
  }

  const studentHomeworkListMatch = pathname.match(/^\/api\/students\/(\d+)\/homeworks$/);
  if (req.method === 'GET' && studentHomeworkListMatch) {
    const studentId = Number(studentHomeworkListMatch[1]);
    const { searchParams } = url;
    const filter = (searchParams.get('filter') as HomeworkStatus | 'all' | 'overdue' | null) ?? 'all';
    const { limit, offset } = handlers.resolvePageParams(url);
    const data = await handlers.listStudentHomeworks(requireApiUser(), studentId, filter, limit, offset);
    const filteredHomeworks = handlers.filterHomeworksForRole(data.items, role, requestedStudentId);
    sendJson(res, 200, { ...data, items: filteredHomeworks });
    return true;
  }

  const studentLessonsMatch = pathname.match(/^\/api\/students\/(\d+)\/lessons$/);
  if (req.method === 'GET' && studentLessonsMatch) {
    const studentId = Number(studentLessonsMatch[1]);
    const { searchParams } = url;
    const payment = (searchParams.get('payment') as 'all' | 'paid' | 'unpaid' | null) ?? 'all';
    const status = (searchParams.get('status') as 'all' | 'completed' | 'not_completed' | null) ?? 'all';
    const startFrom = searchParams.get('startFrom') ?? undefined;
    const startTo = searchParams.get('startTo') ?? undefined;
    const sort = (searchParams.get('sort') as 'asc' | 'desc' | null) ?? 'desc';
    const data = await handlers.listStudentLessons(requireApiUser(), studentId, {
      payment,
      status,
      startFrom,
      startTo,
      sort,
    });
    sendJson(res, 200, data);
    return true;
  }

  const studentUnpaidMatch = pathname.match(/^\/api\/students\/(\d+)\/unpaid-lessons$/);
  if (req.method === 'GET' && studentUnpaidMatch) {
    const studentId = Number(studentUnpaidMatch[1]);
    const data = await handlers.listStudentUnpaidLessons(requireApiUser(), studentId);
    sendJson(res, 200, data);
    return true;
  }

  const studentRemindersMatch = pathname.match(/^\/api\/students\/(\d+)\/payment-reminders$/);
  if (studentRemindersMatch) {
    const studentId = Number(studentRemindersMatch[1]);
    if (req.method === 'GET') {
      const limit = Number(url.searchParams.get('limit') ?? 10);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const data = await handlers.listStudentPaymentReminders(requireApiUser(), studentId, { limit, offset });
      sendJson(res, 200, data);
      return true;
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const enabled = Boolean((body as any)?.enabled);
      const data = await handlers.updateStudentPaymentReminders(requireApiUser(), studentId, enabled);
      sendJson(res, 200, data);
      return true;
    }
  }

  const autoRemindMatch = pathname.match(/^\/api\/students\/(\d+)\/auto-remind$/);
  if (req.method === 'POST' && autoRemindMatch) {
    const studentId = Number(autoRemindMatch[1]);
    const body = await readBody(req);
    const link = await handlers.toggleAutoReminder(requireApiUser(), studentId, Boolean(body.value));
    sendJson(res, 200, { link });
    return true;
  }

  const priceMatch = pathname.match(/^\/api\/students\/(\d+)\/price$/);
  if ((req.method === 'POST' || req.method === 'PATCH') && priceMatch) {
    const studentId = Number(priceMatch[1]);
    const body = await readBody(req);
    const link = await handlers.updatePricePerLesson(requireApiUser(), studentId, Number(body.value));
    sendJson(res, 200, { link });
    return true;
  }

  const balanceMatch = pathname.match(/^\/api\/students\/(\d+)\/balance$/);
  if (req.method === 'POST' && balanceMatch) {
    const studentId = Number(balanceMatch[1]);
    const body = await readBody(req);
    const link = await handlers.adjustBalance(requireApiUser(), studentId, {
      delta: Number(body.delta || 0),
      type: body.type,
      comment: body.comment,
      createdAt: body.createdAt,
    });
    sendJson(res, 200, { link });
    return true;
  }

  const paymentsMatch = pathname.match(/^\/api\/students\/(\d+)\/payments$/);
  if (req.method === 'GET' && paymentsMatch) {
    const studentId = Number(paymentsMatch[1]);
    const filter = url.searchParams.get('filter') ?? undefined;
    const date = url.searchParams.get('date') ?? undefined;
    const events = await handlers.listPaymentEventsForStudent(requireApiUser(), studentId, { filter, date });
    sendJson(res, 200, { events });
    return true;
  }

  return false;
};

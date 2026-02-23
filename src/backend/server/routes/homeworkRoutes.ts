import type { IncomingMessage, ServerResponse } from 'node:http';
import { readBody, sendJson } from '../lib/http';

type HomeworkRoutesHandlers = {
  createHomework: (user: unknown, body: Record<string, unknown>) => Promise<unknown>;
  updateHomework: (user: unknown, homeworkId: number, body: Record<string, unknown>) => Promise<unknown>;
  takeHomeworkInWork: (homeworkId: number, req: IncomingMessage) => Promise<unknown>;
  sendHomeworkToStudent: (user: unknown, homeworkId: number) => Promise<unknown>;
  deleteHomework: (user: unknown, homeworkId: number) => Promise<unknown>;
  toggleHomework: (user: unknown, homeworkId: number) => Promise<unknown>;
  remindHomeworkById: (user: unknown, homeworkId: number) => Promise<unknown>;
  remindHomework: (user: unknown, studentId: number) => Promise<unknown>;
};

type TryHandleHomeworkRoutesPayload = {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
  requireApiUser: () => unknown;
  handlers: HomeworkRoutesHandlers;
};

export const tryHandleHomeworkRoutes = async ({
  req,
  res,
  pathname,
  requireApiUser,
  handlers,
}: TryHandleHomeworkRoutesPayload) => {
  if (req.method === 'POST' && pathname === '/api/homeworks') {
    const body = await readBody(req);
    const homework = await handlers.createHomework(requireApiUser(), body);
    sendJson(res, 201, { homework });
    return true;
  }

  const homeworkUpdateMatch = pathname.match(/^\/api\/homeworks\/(\d+)$/);
  if (req.method === 'PATCH' && homeworkUpdateMatch) {
    const homeworkId = Number(homeworkUpdateMatch[1]);
    const body = await readBody(req);
    const homework = await handlers.updateHomework(requireApiUser(), homeworkId, body);
    sendJson(res, 200, { homework });
    return true;
  }

  const takeInWorkMatch = pathname.match(/^\/api\/homeworks\/(\d+)\/take-in-work$/);
  if (req.method === 'POST' && takeInWorkMatch) {
    const homeworkId = Number(takeInWorkMatch[1]);
    const homework = await handlers.takeHomeworkInWork(homeworkId, req);
    sendJson(res, 200, { homework });
    return true;
  }

  const homeworkSendMatch = pathname.match(/^\/api\/homeworks\/(\d+)\/send$/);
  if (req.method === 'POST' && homeworkSendMatch) {
    const homeworkId = Number(homeworkSendMatch[1]);
    const result = await handlers.sendHomeworkToStudent(requireApiUser(), homeworkId);
    sendJson(res, 200, result);
    return true;
  }

  if (req.method === 'DELETE' && homeworkUpdateMatch) {
    const homeworkId = Number(homeworkUpdateMatch[1]);
    const result = await handlers.deleteHomework(requireApiUser(), homeworkId);
    sendJson(res, 200, result);
    return true;
  }

  const homeworkToggleMatch = pathname.match(/^\/api\/homeworks\/(\d+)\/toggle$/);
  if (req.method === 'PATCH' && homeworkToggleMatch) {
    const homeworkId = Number(homeworkToggleMatch[1]);
    const homework = await handlers.toggleHomework(requireApiUser(), homeworkId);
    sendJson(res, 200, { homework });
    return true;
  }

  const homeworkRemindMatch = pathname.match(/^\/api\/homeworks\/(\d+)\/remind$/);
  if (req.method === 'POST' && homeworkRemindMatch) {
    const homeworkId = Number(homeworkRemindMatch[1]);
    const result = await handlers.remindHomeworkById(requireApiUser(), homeworkId);
    sendJson(res, 200, result);
    return true;
  }

  const remindMatch = pathname.match(/^\/api\/reminders\/homework$/);
  if (req.method === 'POST' && remindMatch) {
    const body = await readBody(req);
    const result = await handlers.remindHomework(requireApiUser(), Number(body.studentId));
    sendJson(res, 200, result);
    return true;
  }

  return false;
};

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { URL } from 'node:url';
import type { OnboardingReminderTemplate } from '../../../shared/lib/onboardingReminder';
import { badRequest, readBody, sendJson } from '../lib/http';

type RequestRole = 'TEACHER' | 'STUDENT';

type LessonRoutesHandlers = {
  listUnpaidLessons: (user: unknown) => Promise<{ entries: any[] }>;
  listLessonsForRange: (user: unknown, params: { start?: string | null; end?: string | null }) => Promise<{ lessons: any[] }>;
  createRecurringLessons: (user: unknown, body: Record<string, unknown>) => Promise<unknown>;
  createLesson: (user: unknown, body: Record<string, unknown>) => Promise<unknown>;
  updateLessonStatus: (user: unknown, lessonId: number, status: unknown) => Promise<{ lesson: unknown; links: unknown }>;
  updateLesson: (user: unknown, lessonId: number, body: Record<string, unknown>) => Promise<unknown>;
  deleteLesson: (user: unknown, lessonId: number, applyToSeries: boolean) => Promise<unknown>;
  markLessonCompleted: (user: unknown, lessonId: number) => Promise<unknown>;
  toggleLessonPaid: (
    user: unknown,
    lessonId: number,
    cancelBehavior: unknown,
    writeOffBalance: boolean,
  ) => Promise<{ lesson: unknown; link: unknown }>;
  remindLessonPayment: (
    user: unknown,
    lessonId: number,
    studentId: number | null,
    options?: { force?: boolean },
  ) => Promise<unknown>;
  toggleParticipantPaid: (
    user: unknown,
    lessonId: number,
    studentId: number,
    cancelBehavior: unknown,
    writeOffBalance: boolean,
  ) => Promise<{ participant: unknown; lesson: unknown; link: unknown }>;
  sendLessonReminder: (user: unknown, payload: { lessonId: number; template: OnboardingReminderTemplate }) => Promise<unknown>;
};

type TryHandleLessonRoutesPayload = {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
  url: URL;
  role: RequestRole;
  requestedStudentId: number | null | undefined;
  requireApiUser: () => unknown;
  normalizeCancelBehavior: (value: unknown) => unknown;
  isOnboardingReminderTemplate: (value: unknown) => value is OnboardingReminderTemplate;
  handlers: LessonRoutesHandlers;
};

export const tryHandleLessonRoutes = async ({
  req,
  res,
  pathname,
  url,
  role,
  requestedStudentId,
  requireApiUser,
  normalizeCancelBehavior,
  isOnboardingReminderTemplate,
  handlers,
}: TryHandleLessonRoutesPayload) => {
  if (req.method === 'GET' && pathname === '/api/lessons/unpaid') {
    const data = await handlers.listUnpaidLessons(requireApiUser());
    const filteredEntries =
      role === 'STUDENT' && requestedStudentId
        ? data.entries.filter((entry) => entry.studentId === requestedStudentId)
        : data.entries;
    sendJson(res, 200, { entries: filteredEntries });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/lessons') {
    const data = await handlers.listLessonsForRange(requireApiUser(), {
      start: url.searchParams.get('start'),
      end: url.searchParams.get('end'),
    });
    const filteredLessons =
      role === 'STUDENT' && requestedStudentId
        ? data.lessons.filter(
            (lesson) =>
              lesson.studentId === requestedStudentId ||
              lesson.participants?.some((participant: any) => participant.studentId === requestedStudentId),
          )
        : data.lessons;
    sendJson(res, 200, { lessons: filteredLessons });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/lessons/recurring') {
    const body = await readBody(req);
    const lessons = await handlers.createRecurringLessons(requireApiUser(), body);
    sendJson(res, 201, { lessons });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/lessons') {
    const body = await readBody(req);
    const lesson = await handlers.createLesson(requireApiUser(), body);
    sendJson(res, 201, { lesson });
    return true;
  }

  const lessonStatusMatch = pathname.match(/^\/api\/lessons\/(\d+)\/status$/);
  if (req.method === 'PATCH' && lessonStatusMatch) {
    const lessonId = Number(lessonStatusMatch[1]);
    const body = await readBody(req);
    const result = await handlers.updateLessonStatus(requireApiUser(), lessonId, body.status);
    sendJson(res, 200, { lesson: result.lesson, links: result.links });
    return true;
  }

  const lessonUpdateMatch = pathname.match(/^\/api\/lessons\/(\d+)$/);
  if (req.method === 'PATCH' && lessonUpdateMatch) {
    const lessonId = Number(lessonUpdateMatch[1]);
    const body = await readBody(req);
    const result = await handlers.updateLesson(requireApiUser(), lessonId, body);
    if (result && typeof result === 'object' && 'lessons' in result) {
      sendJson(res, 200, { lessons: (result as any).lessons });
      return true;
    }
    sendJson(res, 200, { lesson: result });
    return true;
  }

  if (req.method === 'DELETE' && lessonUpdateMatch) {
    const lessonId = Number(lessonUpdateMatch[1]);
    const body = await readBody(req);
    const result = await handlers.deleteLesson(requireApiUser(), lessonId, Boolean(body.applyToSeries));
    sendJson(res, 200, result);
    return true;
  }

  const lessonCompleteMatch = pathname.match(/^\/api\/lessons\/(\d+)\/complete$/);
  if (req.method === 'POST' && lessonCompleteMatch) {
    const lessonId = Number(lessonCompleteMatch[1]);
    const result = await handlers.markLessonCompleted(requireApiUser(), lessonId);
    sendJson(res, 200, result);
    return true;
  }

  const lessonPaidMatch = pathname.match(/^\/api\/lessons\/(\d+)\/toggle-paid$/);
  if (req.method === 'POST' && lessonPaidMatch) {
    const lessonId = Number(lessonPaidMatch[1]);
    const body = await readBody(req);
    const result = await handlers.toggleLessonPaid(
      requireApiUser(),
      lessonId,
      normalizeCancelBehavior((body as any)?.cancelBehavior),
      Boolean((body as any)?.writeOffBalance),
    );
    sendJson(res, 200, { lesson: result.lesson, link: result.link });
    return true;
  }

  const remindPaymentMatch = pathname.match(/^\/api\/lessons\/(\d+)\/remind-payment$/);
  if (req.method === 'POST' && remindPaymentMatch) {
    const lessonId = Number(remindPaymentMatch[1]);
    const body = await readBody(req);
    const studentId = Number((body as any)?.studentId);
    const resolvedStudentId = Number.isFinite(studentId) ? studentId : null;
    const force = Boolean((body as any)?.force);
    const result = await handlers.remindLessonPayment(requireApiUser(), lessonId, resolvedStudentId, { force });
    sendJson(res, 200, result);
    return true;
  }

  const participantPaidMatch = pathname.match(/^\/api\/lessons\/(\d+)\/participants\/(\d+)\/toggle-paid$/);
  if (req.method === 'POST' && participantPaidMatch) {
    const lessonId = Number(participantPaidMatch[1]);
    const studentId = Number(participantPaidMatch[2]);
    const body = await readBody(req);
    const result = await handlers.toggleParticipantPaid(
      requireApiUser(),
      lessonId,
      studentId,
      normalizeCancelBehavior((body as any)?.cancelBehavior),
      Boolean((body as any)?.writeOffBalance),
    );
    sendJson(res, 200, { participant: result.participant, lesson: result.lesson, link: result.link });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/reminders/lesson') {
    const body = await readBody(req);
    const lessonId = Number((body as any)?.lessonId);
    const template = (body as any)?.template;
    if (!Number.isFinite(lessonId)) {
      badRequest(res, 'invalid_lesson_id');
      return true;
    }
    if (!isOnboardingReminderTemplate(template)) {
      badRequest(res, 'invalid_template');
      return true;
    }
    const result = await handlers.sendLessonReminder(requireApiUser(), { lessonId, template });
    sendJson(res, 200, result);
    return true;
  }

  return false;
};

import crypto from 'node:crypto';
import http, { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { addDays, addYears } from 'date-fns';
import prisma from './prismaClient';
import type { HomeworkStatus, PaymentCancelBehavior } from '../entities/types';

const PORT = Number(process.env.API_PORT ?? 4000);
const DEMO_TEACHER_ID = BigInt(process.env.DEMO_TEACHER_ID ?? '111222333');
const DEFAULT_PAGE_SIZE = 15;
const MAX_PAGE_SIZE = 50;

const sendJson = (res: ServerResponse, status: number, payload: unknown) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(serializeBigInt(payload)));
};

const notFound = (res: ServerResponse) => sendJson(res, 404, { message: 'Not found' });

const badRequest = (res: ServerResponse, message: string) => sendJson(res, 400, { message });

const serializeBigInt = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (_, v) => {
      if (typeof v === 'bigint') return Number(v);
      if (v instanceof Date) return v.toISOString();
      return v;
    }),
  );

const readBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {} as Record<string, unknown>;
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error('Invalid JSON body');
  }
};

const ensureTeacher = async () =>
  prisma.teacher.upsert({
    where: { chatId: DEMO_TEACHER_ID },
    update: {},
    create: {
      chatId: DEMO_TEACHER_ID,
      name: 'Demo Teacher',
      username: 'teacher_demo',
    },
  });

const searchStudents = async (query?: string, filter?: 'all' | 'pendingHomework' | 'noReminder') => {
  const teacher = await ensureTeacher();
  const normalizedQuery = query?.trim().toLowerCase();

  const links = await prisma.teacherStudent.findMany({ where: { teacherId: teacher.chatId } });
  const students = await prisma.student.findMany({
    where: {
      teacherLinks: {
        some: {
          teacherId: teacher.chatId,
        },
      },
    },
  });

  const filteredLinks = links.filter((link) => {
    const student = students.find((s) => s.id === link.studentId);
    if (!student) return false;

    const matchesQuery = !normalizedQuery
      ? true
      : link.customName.toLowerCase().includes(normalizedQuery) ||
        (student.username ?? '').toLowerCase().includes(normalizedQuery);

    if (!matchesQuery) return false;

    if (filter === 'noReminder') return !link.autoRemindHomework;

    if (filter === 'pendingHomework') {
      // Homeworks will be filtered below; preliminary include all to evaluate after fetch.
      return true;
    }

    return true;
  });

  const studentIds = filteredLinks.map((link) => link.studentId);

  const homeworks = await prisma.homework.findMany({
    where: {
      teacherId: teacher.chatId,
      studentId: studentIds.length ? { in: studentIds } : { in: [-1] },
    },
  });

  const withPending = filteredLinks.filter((link) => {
    if (filter !== 'pendingHomework') return true;
    return homeworks.some((hw) => hw.studentId === link.studentId && !hw.isDone);
  });

  return {
    students: students.filter((s) => withPending.some((link) => link.studentId === s.id)),
    links: withPending,
    homeworks,
  };
};

const resolvePageParams = (url: URL) => {
  const limitRaw = Number(url.searchParams.get('limit') ?? DEFAULT_PAGE_SIZE);
  const offsetRaw = Number(url.searchParams.get('offset') ?? 0);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.floor(offsetRaw) : 0;
  return { limit, offset };
};

const isHomeworkDone = (homework: any) => normalizeTeacherStatus(homework.status) === 'DONE' || homework.isDone;

const isHomeworkOverdue = (homework: any, todayStart: Date) => {
  if (!homework.deadline) return false;
  if (isHomeworkDone(homework)) return false;
  return new Date(homework.deadline).getTime() < todayStart.getTime();
};

const buildHomeworkStats = (homeworks: any[], todayStart: Date) => {
  let pendingHomeworkCount = 0;
  let overdueHomeworkCount = 0;
  const totalHomeworkCount = homeworks.length;

  homeworks.forEach((homework) => {
    if (!isHomeworkDone(homework)) {
      pendingHomeworkCount += 1;
    }
    if (isHomeworkOverdue(homework, todayStart)) {
      overdueHomeworkCount += 1;
    }
  });

  return { pendingHomeworkCount, overdueHomeworkCount, totalHomeworkCount };
};

const listStudents = async (query?: string, filter?: 'all' | 'debt' | 'overdue', limit = DEFAULT_PAGE_SIZE, offset = 0) => {
  const teacher = await ensureTeacher();
  const normalizedQuery = query?.trim();
  const where: any = { teacherId: teacher.chatId };

  if (normalizedQuery) {
    where.OR = [
      { customName: { contains: normalizedQuery, mode: 'insensitive' } },
      { student: { username: { contains: normalizedQuery, mode: 'insensitive' } } },
    ];
  }

  const links = await prisma.teacherStudent.findMany({
    where,
    include: { student: true },
    orderBy: { customName: 'asc' },
  });

  const studentIds = links.map((link) => link.studentId);
  const homeworks = studentIds.length
    ? await prisma.homework.findMany({
        where: { teacherId: teacher.chatId, studentId: { in: studentIds } },
      })
    : [];

  const homeworksByStudent = new Map<number, any[]>();
  homeworks.forEach((homework) => {
    const existing = homeworksByStudent.get(homework.studentId) ?? [];
    existing.push(homework);
    homeworksByStudent.set(homework.studentId, existing);
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const statsByStudent = new Map<number, ReturnType<typeof buildHomeworkStats>>();
  links.forEach((link) => {
    const stats = buildHomeworkStats(homeworksByStudent.get(link.studentId) ?? [], todayStart);
    statsByStudent.set(link.studentId, stats);
  });

  const filteredLinks = links.filter((link) => {
    const stats = statsByStudent.get(link.studentId) ?? { pendingHomeworkCount: 0, overdueHomeworkCount: 0, totalHomeworkCount: 0 };
    if (filter === 'debt') return link.balanceLessons < 0;
    if (filter === 'overdue') return stats.overdueHomeworkCount > 0;
    return true;
  });

  const total = filteredLinks.length;
  const pageItems = filteredLinks.slice(offset, offset + limit).map((link) => {
    const { student, ...linkData } = link;
    return {
      student,
      link: linkData,
      stats: statsByStudent.get(link.studentId) ?? { pendingHomeworkCount: 0, overdueHomeworkCount: 0, totalHomeworkCount: 0 },
    };
  });

  const nextOffset = offset + limit < total ? offset + limit : null;
  const counts = {
    withDebt: links.filter((link) => link.balanceLessons < 0).length,
    overdue: links.filter((link) => (statsByStudent.get(link.studentId)?.overdueHomeworkCount ?? 0) > 0).length,
  };

  return { items: pageItems, total, nextOffset, counts };
};

const listStudentHomeworks = async (
  studentId: number,
  filter: 'all' | HomeworkStatus | 'overdue' = 'all',
  limit = DEFAULT_PAGE_SIZE,
  offset = 0,
) => {
  const teacher = await ensureTeacher();
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
  });
  if (!link) throw new Error('Ученик не найден у текущего преподавателя');

  const where: any = { teacherId: teacher.chatId, studentId };
  if (filter === 'overdue') {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    where.deadline = { lt: todayStart };
    where.isDone = false;
    where.NOT = { status: 'DONE' };
  } else if (filter && filter !== 'all') {
    where.status = filter;
  }

  const total = await prisma.homework.count({ where });
  const items = await prisma.homework.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: offset,
    take: limit,
  });
  const nextOffset = offset + limit < total ? offset + limit : null;
  return { items, total, nextOffset };
};

const parseDateFilter = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const listStudentLessons = async (
  studentId: number,
  filters: {
    payment?: 'all' | 'paid' | 'unpaid';
    status?: 'all' | 'completed' | 'not_completed';
    startFrom?: string;
    startTo?: string;
    sort?: 'asc' | 'desc';
  },
) => {
  const teacher = await ensureTeacher();
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
  });
  if (!link) throw new Error('Ученик не найден у текущего преподавателя');

  const participantWhere: Record<string, any> = { studentId };
  if (filters.payment === 'paid') {
    participantWhere.isPaid = true;
  }
  if (filters.payment === 'unpaid') {
    participantWhere.isPaid = false;
  }

  const where: Record<string, any> = {
    teacherId: teacher.chatId,
    participants: {
      some: participantWhere,
    },
  };

  if (filters.status === 'completed') {
    where.status = 'COMPLETED';
  }

  if (filters.status === 'not_completed') {
    where.status = { not: 'COMPLETED' };
  }

  const startFrom = parseDateFilter(filters.startFrom);
  const startTo = parseDateFilter(filters.startTo);
  if (startFrom || startTo) {
    where.startAt = {};
    if (startFrom) where.startAt.gte = startFrom;
    if (startTo) where.startAt.lte = startTo;
  }

  const items = await prisma.lesson.findMany({
    where,
    include: {
      participants: {
        include: {
          student: true,
        },
      },
    },
    orderBy: { startAt: filters.sort === 'asc' ? 'asc' : 'desc' },
  });

  return { items };
};

const bootstrap = async () => {
  const teacher = await ensureTeacher();
  const links = await prisma.teacherStudent.findMany({ where: { teacherId: teacher.chatId } });
  const students = await prisma.student.findMany({
    where: {
      teacherLinks: {
        some: {
          teacherId: teacher.chatId,
        },
      },
    },
  });
  const homeworks = await prisma.homework.findMany({ where: { teacherId: teacher.chatId } });
  const lessons = await prisma.lesson.findMany({
    where: { teacherId: teacher.chatId },
    include: {
      participants: {
        include: {
          student: true,
        },
      },
    },
  });

  return { teacher, students, links, homeworks, lessons };
};

const addStudent = async (body: any) => {
  const { customName, username, pricePerLesson } = body ?? {};
  if (!customName || typeof customName !== 'string' || !customName.trim()) {
    throw new Error('Имя ученика обязательно');
  }

  const teacher = await ensureTeacher();
  const existingStudent =
    username && typeof username === 'string'
      ? await prisma.student.findFirst({ where: { username } })
      : null;

  const student =
    existingStudent ||
    (await prisma.student.create({
      data: {
        username: username || null,
        pricePerLesson: typeof pricePerLesson === 'number' ? pricePerLesson : 0,
      },
    }));

  const existingLink = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId: student.id } },
  });

  if (existingLink) {
    return { student, link: existingLink };
  }

  const link = await prisma.teacherStudent.create({
    data: {
      teacherId: teacher.chatId,
      studentId: student.id,
      customName,
      autoRemindHomework: true,
      balanceLessons: 0,
    },
  });

  return { student, link };
};

const toggleAutoReminder = async (studentId: number, value: boolean) => {
  const teacher = await ensureTeacher();
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
  });
  if (!link) throw new Error('Student link not found');
  return prisma.teacherStudent.update({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
    data: { autoRemindHomework: value },
  });
};

const updatePricePerLesson = async (studentId: number, value: number) => {
  if (Number.isNaN(value) || value < 0) {
    throw new Error('Цена должна быть неотрицательным числом');
  }
  const teacher = await ensureTeacher();
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
  });
  if (!link) throw new Error('Ученик не найден у текущего преподавателя');

  return prisma.student.update({
    where: { id: studentId },
    data: { pricePerLesson: Math.round(value) },
  });
};

const adjustBalance = async (studentId: number, delta: number) => {
  const teacher = await ensureTeacher();
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
    include: { student: true },
  });
  if (!link) throw new Error('Student link not found');
  const nextBalance = link.balanceLessons + delta;
  const updatedLink = await prisma.teacherStudent.update({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
    data: { balanceLessons: nextBalance },
  });
  if (delta !== 0) {
    const type = delta > 0 ? 'TOP_UP' : 'ADJUSTMENT';
    await prisma.paymentEvent.create({
      data: {
        studentId,
        lessonId: null,
        type,
        lessonsDelta: delta,
        priceSnapshot: link.student?.pricePerLesson ?? 0,
        moneyAmount: null,
        createdBy: 'TEACHER',
        reason: type === 'ADJUSTMENT' ? 'BALANCE_ADJUSTMENT' : null,
      },
    });
  }
  return updatedLink;
};

const listPaymentEventsForStudent = async (
  studentId: number,
  options?: { filter?: string; date?: string },
) => {
  const teacher = await ensureTeacher();
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
  });

  if (!link) throw new Error('Ученик не найден у текущего преподавателя');

  const filter = options?.filter ?? 'all';
  const where: Record<string, any> = { studentId };

  if (filter === 'topup') {
    where.type = 'TOP_UP';
  } else if (filter === 'manual') {
    where.type = 'MANUAL_PAID';
  } else if (filter === 'charges') {
    where.type = { in: ['AUTO_CHARGE', 'ADJUSTMENT'] };
    where.lessonsDelta = { lt: 0 };
  }

  if (options?.date) {
    const parsed = new Date(`${options.date}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      const start = new Date(parsed);
      const end = new Date(parsed);
      end.setDate(end.getDate() + 1);
      where.createdAt = { gte: start, lt: end };
    }
  }

  const events = await prisma.paymentEvent.findMany({
    where,
    include: { lesson: true },
    orderBy: { createdAt: 'desc' },
  });

  return events;
};

type RequestRole = 'TEACHER' | 'STUDENT';

const getRequestRole = (req: IncomingMessage): RequestRole => {
  const roleHeader = (req.headers['x-user-role'] as string | undefined) ?? '';
  return roleHeader.toUpperCase() === 'STUDENT' ? 'STUDENT' : 'TEACHER';
};

const VISIBLE_STUDENT_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'DONE'];

const getRequestedStudentId = (req: IncomingMessage): number | null => {
  const studentIdHeader = req.headers['x-student-id'];
  const requesterStudentId = typeof studentIdHeader === 'string' ? Number(studentIdHeader) : NaN;
  return Number.isFinite(requesterStudentId) ? requesterStudentId : null;
};

const filterHomeworksForRole = (homeworks: any[], role: RequestRole, studentId?: number | null) => {
  if (role !== 'STUDENT') return homeworks;

  return homeworks.filter((hw) => {
    const normalizedStatus = normalizeStatus(hw.status);
    const matchesStudent = studentId ? hw.studentId === studentId : true;
    return matchesStudent && VISIBLE_STUDENT_STATUSES.includes(normalizedStatus as any);
  });
};

const normalizeStatus = (status: any) => {
  if (typeof status !== 'string') return 'ASSIGNED';
  const upper = status.toUpperCase();
  if (upper === 'ACTIVE' || upper === 'SENT') return 'ASSIGNED';
  if (upper === 'NEW') return 'DRAFT';
  return ['DRAFT', 'ASSIGNED', 'IN_PROGRESS', 'DONE'].includes(upper) ? upper : 'ASSIGNED';
};

const normalizeTeacherStatus = (status: any) => normalizeStatus(status);

const normalizeLessonStatus = (status: any): 'SCHEDULED' | 'COMPLETED' | 'CANCELED' => {
  if (status === 'COMPLETED') return 'COMPLETED';
  if (status === 'CANCELED') return 'CANCELED';
  return 'SCHEDULED';
};

const normalizeCancelBehavior = (value: any): PaymentCancelBehavior =>
  value === 'writeoff' ? 'writeoff' : 'refund';

const calcLessonPaymentAmount = (participant: any, lesson: any, link: any) =>
  [participant.price, lesson.price, link.student?.pricePerLesson].find(
    (value) => typeof value === 'number' && value > 0,
  ) ?? 0;

const createPaymentEvent = async (tx: any, payload: any) => {
  return tx.paymentEvent.create({ data: payload });
};

const settleLessonPayments = async (lessonId: number) => {
  const teacher = await ensureTeacher();
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { participants: { include: { student: true } } },
  });

  if (!lesson || lesson.teacherId !== teacher.chatId) throw new Error('Урок не найден');
  if (lesson.status === 'CANCELED') return { lesson, links: [] as any[] };

  const participantIds = (lesson.participants ?? []).map((participant: any) => participant.studentId);
  const links = participantIds.length
    ? await prisma.teacherStudent.findMany({
        where: { teacherId: teacher.chatId, studentId: { in: participantIds } },
        include: { student: true },
      })
    : [];

  const linksByStudentId = new Map<number, any>(links.map((link: any) => [link.studentId, link]));

  return prisma.$transaction(async (tx) => {
    const updatedLinks: any[] = [];
    const existingPayments = await tx.payment.findMany({ where: { lessonId: lesson.id } });
    const paymentTeacherStudentIds = new Set(existingPayments.map((payment) => payment.teacherStudentId));
    const existingEvents = await tx.paymentEvent.findMany({ where: { lessonId: lesson.id, type: 'AUTO_CHARGE' } });
    const eventStudentIds = new Set(existingEvents.map((event: any) => event.studentId));

    for (const participant of lesson.participants ?? []) {
      const link = linksByStudentId.get(participant.studentId);
      if (!link || participant.isPaid) continue;
      if (link.balanceLessons <= 0) continue;

      const nextBalance = link.balanceLessons - 1;
      const priceSnapshot = calcLessonPaymentAmount(participant, lesson, link);

      const savedLink = await tx.teacherStudent.update({
        where: { id: link.id },
        data: { balanceLessons: nextBalance },
      });
      updatedLinks.push(savedLink);

      if (!paymentTeacherStudentIds.has(link.id)) {
        await tx.payment.create({
          data: {
            lessonId: lesson.id,
            teacherStudentId: link.id,
            amount: priceSnapshot,
            paidAt: new Date(),
            comment: null,
          },
        });
        paymentTeacherStudentIds.add(link.id);
      }
      if (!eventStudentIds.has(participant.studentId)) {
        await createPaymentEvent(tx, {
          studentId: participant.studentId,
          lessonId: lesson.id,
          type: 'AUTO_CHARGE',
          lessonsDelta: -1,
          priceSnapshot,
          moneyAmount: null,
          createdBy: 'SYSTEM',
          reason: null,
        });
        eventStudentIds.add(participant.studentId);
      }

      await tx.lessonParticipant.update({
        where: { lessonId_studentId: { lessonId: lesson.id, studentId: participant.studentId } },
        data: { isPaid: true },
      });
    }

    const participants = await tx.lessonParticipant.findMany({ where: { lessonId: lesson.id } });
    const allPaid = participants.length ? participants.every((item: any) => item.isPaid) : false;

    const updatedLesson = await tx.lesson.update({
      where: { id: lesson.id },
      data: { isPaid: allPaid, status: 'COMPLETED' },
      include: { participants: { include: { student: true } } },
    });

    return { lesson: updatedLesson, links: updatedLinks };
  });
};

const parseTimeSpentMinutes = (value: any): number | null => {
  if (value === '' || value === undefined || value === null) return null;
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) return null;
  if (numericValue < 0) return null;
  return Math.round(numericValue);
};

const createHomework = async (body: any) => {
  const { studentId, text, deadline, status, attachments, timeSpentMinutes } = body ?? {};
  if (!studentId || !text) throw new Error('studentId и текст обязательны');
  const teacher = await ensureTeacher();
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId: Number(studentId) } },
  });
  if (!link) throw new Error('Ученик не найден у текущего преподавателя');

  const normalizedStatus = normalizeTeacherStatus(status ?? 'DRAFT');
  const normalizedAttachments = Array.isArray(attachments) ? attachments : [];
  const parsedTimeSpent = parseTimeSpentMinutes(timeSpentMinutes);
  const completedAt = normalizedStatus === 'DONE' ? new Date() : null;

  return prisma.homework.create({
    data: {
      studentId: Number(studentId),
      teacherId: teacher.chatId,
      text,
      deadline: deadline ? new Date(deadline) : null,
      status: normalizedStatus,
      isDone: normalizedStatus === 'DONE',
      attachments: JSON.stringify(normalizedAttachments),
      timeSpentMinutes: parsedTimeSpent,
      completedAt,
    },
  });
};

const toggleHomework = async (homeworkId: number) => {
  const teacher = await ensureTeacher();
  const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });
  if (!homework || homework.teacherId !== teacher.chatId) throw new Error('Домашнее задание не найдено');

  const nextIsDone = !homework.isDone;
  const nextStatus = nextIsDone ? 'DONE' : 'ASSIGNED';

  return prisma.homework.update({
    where: { id: homeworkId },
    data: {
      isDone: nextIsDone,
      status: nextStatus,
      completedAt: nextIsDone ? new Date() : null,
    },
  });
};

const updateHomework = async (homeworkId: number, body: any) => {
  const teacher = await ensureTeacher();
  const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });
  if (!homework || homework.teacherId !== teacher.chatId) throw new Error('Домашнее задание не найдено');

  const payload: any = {};
  if (typeof body.text === 'string') payload.text = body.text;
  if ('deadline' in body) {
    payload.deadline = body.deadline ? new Date(body.deadline) : null;
  }
  if (Array.isArray(body.attachments)) {
    payload.attachments = JSON.stringify(body.attachments);
  }
  if ('timeSpentMinutes' in body) {
    payload.timeSpentMinutes = parseTimeSpentMinutes(body.timeSpentMinutes);
  }
  if (body.status) {
    const normalizedStatus = normalizeTeacherStatus(body.status);
    payload.status = normalizedStatus;
    payload.isDone = normalizedStatus === 'DONE';
    if (normalizedStatus === 'DONE' && homework.status !== 'DONE' && !homework.isDone) {
      payload.completedAt = new Date();
    }
    if (normalizedStatus !== 'DONE') {
      payload.completedAt = null;
    }
  }

  return prisma.homework.update({ where: { id: homeworkId }, data: payload });
};

const takeHomeworkInWork = async (homeworkId: number, req: IncomingMessage) => {
  const role = getRequestRole(req);
  if (role !== 'STUDENT') {
    const error: any = new Error('Недостаточно прав для изменения статуса');
    error.statusCode = 403;
    throw error;
  }

  const requesterStudentId = getRequestedStudentId(req);
  if (requesterStudentId === null) {
    const error: any = new Error('studentId обязателен для взятия в работу');
    error.statusCode = 400;
    throw error;
  }

  const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });
  if (!homework) throw new Error('Домашнее задание не найдено');
  if (homework.studentId !== requesterStudentId) {
    const error: any = new Error('Домашнее задание недоступно этому ученику');
    error.statusCode = 403;
    throw error;
  }
  if (homework.status !== 'ASSIGNED' && homework.status !== 'IN_PROGRESS') {
    const error: any = new Error('Неверный статус для перевода в работу');
    error.statusCode = 400;
    throw error;
  }

  return prisma.homework.update({
    where: { id: homeworkId },
    data: {
      status: 'IN_PROGRESS',
      isDone: false,
      takenAt: new Date(),
      takenByStudentId: requesterStudentId,
    },
  });
};

const deleteHomework = async (homeworkId: number) => {
  const teacher = await ensureTeacher();
  const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });
  if (!homework || homework.teacherId !== teacher.chatId) throw new Error('Домашнее задание не найдено');

  await prisma.homework.delete({ where: { id: homeworkId } });
  return { id: homeworkId };
};

const validateLessonPayload = async (body: any) => {
  const { studentId, studentIds, durationMinutes } = body ?? {};
  const ids = studentIds && Array.isArray(studentIds) && studentIds.length > 0
    ? studentIds.map((id: any) => Number(id))
    : studentId
      ? [Number(studentId)]
      : [];

  if (ids.length === 0) throw new Error('Выберите хотя бы одного ученика');
  if (!durationMinutes) throw new Error('Заполните длительность');
  const durationValue = Number(durationMinutes);
  if (!Number.isFinite(durationValue) || durationValue <= 0) throw new Error('Длительность должна быть больше нуля');

  const teacher = await ensureTeacher();

  const links = await prisma.teacherStudent.findMany({
    where: {
      teacherId: teacher.chatId,
      studentId: { in: ids },
    },
  });

  if (links.length !== ids.length) {
    throw new Error('Некоторые ученики не найдены у текущего преподавателя');
  }

  return { teacher, durationValue, studentIds: ids };
};

const createLesson = async (body: any) => {
  const { startAt } = body ?? {};
  if (!startAt) throw new Error('Заполните дату и время урока');
  const { teacher, durationValue, studentIds } = await validateLessonPayload(body);

  const students = await prisma.student.findMany({
    where: { id: { in: studentIds } },
  });
  const basePrice = students[0]?.pricePerLesson ?? 0;
  const markPaid = Boolean(body?.isPaid || body?.markPaid);

  const lesson = await prisma.lesson.create({
    data: {
      teacherId: teacher.chatId,
      studentId: studentIds[0],
      price: 0,
      startAt: new Date(startAt),
      durationMinutes: durationValue,
      status: 'SCHEDULED',
      isPaid: false,
      participants: {
        create: students.map((student) => ({
          studentId: student.id,
          price: 0,
          isPaid: false,
        })),
      },
    },
    include: {
      participants: {
        include: {
          student: true,
        },
      },
    },
  });

  if (markPaid) {
    const confirmedPrice = basePrice;

    await prisma.lessonParticipant.updateMany({
      where: { lessonId: lesson.id },
      data: { isPaid: true, price: confirmedPrice },
    });

    await prisma.payment.createMany({
      data: lesson.participants.map((participant: any) => ({
        lessonId: lesson.id,
        studentId: participant.studentId,
        amount: confirmedPrice,
        teacherId: teacher.chatId,
        paidAt: new Date(),
        comment: null,
      })),
      skipDuplicates: true,
    });
    await prisma.paymentEvent.createMany({
      data: lesson.participants.map((participant: any) => ({
        studentId: participant.studentId,
        lessonId: lesson.id,
        type: 'MANUAL_PAID',
        lessonsDelta: 0,
        priceSnapshot: confirmedPrice,
        moneyAmount: confirmedPrice,
        createdBy: 'TEACHER',
        reason: null,
      })),
      skipDuplicates: true,
    });

    const updated = await prisma.lesson.update({
      where: { id: lesson.id },
      data: { isPaid: true, price: confirmedPrice },
      include: {
        participants: {
          include: { student: true },
        },
      },
    });

    return updated;
  }

  return lesson;
};

const parseWeekdays = (repeatWeekdays: any): number[] => {
  const raw = Array.isArray(repeatWeekdays)
    ? repeatWeekdays
    : typeof repeatWeekdays === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(repeatWeekdays);
            return Array.isArray(parsed) ? parsed : [];
          } catch (error) {
            return [];
          }
        })()
      : [];

  return Array.from(
    new Set(raw.map((day: any) => Number(day)).filter((day: number) => Number.isInteger(day) && day >= 0 && day <= 6)),
  );
};

const createRecurringLessons = async (body: any) => {
  const { startAt, repeatWeekdays, repeatUntil } = body ?? {};
  if (!startAt) throw new Error('Заполните дату и время урока');
  const weekdays: number[] = parseWeekdays(repeatWeekdays);
  if (weekdays.length === 0) throw new Error('Выберите дни недели для повтора');

  const startDate = new Date(startAt);
  if (Number.isNaN(startDate.getTime())) throw new Error('Некорректная дата начала');

  const { teacher, durationValue, studentIds } = await validateLessonPayload(body);

  const students = await prisma.student.findMany({
    where: { id: { in: studentIds } },
  });

  const basePrice = students[0]?.pricePerLesson ?? 0;
  const markPaid = Boolean(body?.isPaid || body?.markPaid);

  const maxEndDate = addYears(startDate, 1);
  const requestedEndDate = repeatUntil ? new Date(repeatUntil) : null;
  const endDate =
    requestedEndDate && !Number.isNaN(requestedEndDate.getTime())
      ? requestedEndDate > maxEndDate
        ? maxEndDate
        : requestedEndDate
      : maxEndDate;

  if (endDate < startDate) {
    throw new Error('Дата окончания повтора должна быть не раньше даты начала');
  }
  const occurrences: Date[] = [];

  for (let cursor = new Date(startDate); cursor <= endDate; cursor = addDays(cursor, 1)) {
    if (weekdays.includes(cursor.getUTCDay())) {
      const withTime = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), startDate.getUTCHours(), startDate.getUTCMinutes()),
      );
      occurrences.push(withTime);
    }
    if (occurrences.length > 500) break;
  }

  if (occurrences.length === 0) throw new Error('Не найдено подходящих дат для создания повторов');

  const existingLessons = await prisma.lesson.findMany({
    where: {
      teacherId: teacher.chatId,
      startAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  const existingStartAt = new Set(existingLessons.map((lesson) => lesson.startAt.toISOString()));
  const slotsToCreate = occurrences.filter((date) => !existingStartAt.has(date.toISOString()));

  if (slotsToCreate.length === 0) {
    throw new Error('Все выбранные даты уже заняты или запланированы');
  }

  const recurrenceGroupId = crypto.randomUUID();
  const weekdaysPayload = JSON.stringify(weekdays);
  const created: any[] = [];
  for (const date of slotsToCreate) {
    const lesson = await prisma.lesson.create({
      data: {
        teacherId: teacher.chatId,
        studentId: studentIds[0],
        price: 0,
        startAt: date,
        durationMinutes: durationValue,
        status: 'SCHEDULED',
        isPaid: false,
        isRecurring: true,
        recurrenceUntil: endDate,
        recurrenceGroupId,
        recurrenceWeekdays: weekdaysPayload,
        participants: {
          create: students.map((student) => ({
            studentId: student.id,
            price: 0,
            isPaid: false,
          })),
        },
      },
      include: {
        participants: {
          include: {
            student: true,
          },
        },
      },
    });
    if (markPaid) {
      const confirmedPrice = basePrice;

      await prisma.lessonParticipant.updateMany({
        where: { lessonId: lesson.id },
        data: { isPaid: true, price: confirmedPrice },
      });

      await prisma.payment.createMany({
        data: lesson.participants.map((participant: any) => ({
          lessonId: lesson.id,
          studentId: participant.studentId,
          amount: confirmedPrice,
          teacherId: teacher.chatId,
          paidAt: new Date(),
          comment: null,
        })),
        skipDuplicates: true,
      });
      await prisma.paymentEvent.createMany({
        data: lesson.participants.map((participant: any) => ({
          studentId: participant.studentId,
          lessonId: lesson.id,
          type: 'MANUAL_PAID',
          lessonsDelta: 0,
          priceSnapshot: confirmedPrice,
          moneyAmount: confirmedPrice,
          createdBy: 'TEACHER',
          reason: null,
        })),
        skipDuplicates: true,
      });

      const updatedLesson = await prisma.lesson.update({
        where: { id: lesson.id },
        data: { isPaid: true, price: confirmedPrice },
        include: {
          participants: { include: { student: true } },
        },
      });

      created.push(updatedLesson);
    } else {
      created.push(lesson);
    }
  }

  return created;
};

const updateLesson = async (lessonId: number, body: any) => {
  const { studentId, studentIds, startAt, durationMinutes, applyToSeries, detachFromSeries, repeatWeekdays, repeatUntil } = body ?? {};
  const teacher = await ensureTeacher();
  const existing = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { participants: true },
  });
  if (!existing || existing.teacherId !== teacher.chatId) throw new Error('Урок не найден');

  const ids = studentIds && Array.isArray(studentIds) && studentIds.length > 0
    ? studentIds.map((id: any) => Number(id))
    : studentId
      ? [Number(studentId)]
      : existing.participants.map((p: any) => p.studentId);

  if (ids.length === 0) throw new Error('Выберите хотя бы одного ученика');

  const nextDuration =
    durationMinutes !== undefined && durationMinutes !== null ? Number(durationMinutes) : existing.durationMinutes;
  if (!Number.isFinite(nextDuration) || nextDuration <= 0) throw new Error('Длительность должна быть больше нуля');

  const links = await prisma.teacherStudent.findMany({
    where: {
      teacherId: teacher.chatId,
      studentId: { in: ids },
    },
  });

  if (links.length !== ids.length) {
    throw new Error('Некоторые ученики не найдены у текущего преподавателя');
  }

  const students = await prisma.student.findMany({
    where: { id: { in: ids } },
  });

  const targetStart = startAt ? new Date(startAt) : existing.startAt;
  const existingLesson = existing as any;
  const weekdays = parseWeekdays(repeatWeekdays ?? existingLesson.recurrenceWeekdays ?? []);
  const recurrenceEndRaw = repeatUntil ?? existingLesson.recurrenceUntil;

  if (!applyToSeries && detachFromSeries && existingLesson.isRecurring) {
    await prisma.lessonParticipant.deleteMany({
      where: { lessonId },
    });

    return prisma.lesson.update({
      where: { id: lessonId },
      data: {
        studentId: ids[0],
        price: existingLesson.isPaid ? (existingLesson as any).price ?? 0 : 0,
        startAt: targetStart,
        durationMinutes: nextDuration,
        isRecurring: false,
        recurrenceUntil: null,
        recurrenceGroupId: null,
        recurrenceWeekdays: null,
        participants: {
          create: students.map((student) => ({
            studentId: student.id,
            price: 0,
            isPaid: false,
          })),
        },
      },
      include: {
        participants: {
          include: {
            student: true,
          },
        },
      },
    });
  }

  if (!existingLesson.isRecurring && weekdays.length > 0 && repeatWeekdays) {
    if (Number.isNaN(targetStart.getTime())) throw new Error('Некорректная дата урока');

    const maxEnd = addYears(targetStart, 1);
    const requestedEnd = recurrenceEndRaw ? new Date(recurrenceEndRaw) : null;
    const recurrenceEnd =
      requestedEnd && !Number.isNaN(requestedEnd.getTime())
        ? requestedEnd > maxEnd
          ? maxEnd
          : requestedEnd
        : maxEnd;

    if (recurrenceEnd < targetStart) throw new Error('Дата окончания повтора должна быть не раньше даты начала');

    await (prisma.lesson as any).delete({ where: { id: lessonId } });

    const recurrenceGroupId = crypto.randomUUID();
    const seriesLessons: any[] = [];
    const weekdaysPayload = JSON.stringify(weekdays);

    for (let cursor = new Date(targetStart); cursor <= recurrenceEnd; cursor = addDays(cursor, 1)) {
      if (weekdays.includes(cursor.getUTCDay())) {
        const start = new Date(
          Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), targetStart.getUTCHours(), targetStart.getUTCMinutes()),
        );

        const created = await prisma.lesson.create({
          data: {
            teacherId: teacher.chatId,
            studentId: ids[0],
            price: 0,
            startAt: start,
            durationMinutes: nextDuration,
            status: 'SCHEDULED',
            isPaid: false,
            isRecurring: true,
            recurrenceUntil: recurrenceEnd,
            recurrenceGroupId,
            recurrenceWeekdays: weekdaysPayload,
            participants: {
              create: students.map((student) => ({
                studentId: student.id,
                price: 0,
                isPaid: false,
              })),
            },
          },
          include: {
            participants: {
              include: {
                student: true,
              },
            },
          },
        });
        seriesLessons.push(created);
      }
      if (seriesLessons.length > 500) break;
    }

    if (seriesLessons.length === 0) {
      throw new Error('Не найдено дат для создания повторяющихся уроков');
    }

    return { lessons: seriesLessons };
  }

  if (applyToSeries && existingLesson.isRecurring && existingLesson.recurrenceGroupId) {
    if (weekdays.length === 0) throw new Error('Выберите дни недели для повтора');
    if (Number.isNaN(targetStart.getTime())) throw new Error('Некорректная дата урока');

    const maxEnd = addYears(targetStart, 1);
    const requestedEnd = recurrenceEndRaw ? new Date(recurrenceEndRaw) : null;
    const recurrenceEnd =
      requestedEnd && !Number.isNaN(requestedEnd.getTime())
        ? requestedEnd > maxEnd
          ? maxEnd
          : requestedEnd
        : maxEnd;

    if (recurrenceEnd < targetStart) throw new Error('Дата окончания повтора должна быть не раньше даты начала');

    const existingIds = (
      await prisma.lesson.findMany({
        where: { recurrenceGroupId: existingLesson.recurrenceGroupId, teacherId: teacher.chatId, status: 'SCHEDULED' },
      })
    ).map((lesson) => lesson.id);

    if (existingIds.length) {
      await (prisma.lesson as any).deleteMany({ where: { id: { in: existingIds } } });
    }

    const seriesLessons: any[] = [];
    const weekdaysPayload = JSON.stringify(weekdays);
    for (let cursor = new Date(targetStart); cursor <= recurrenceEnd; cursor = addDays(cursor, 1)) {
      if (weekdays.includes(cursor.getUTCDay())) {
        const start = new Date(
          Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), targetStart.getUTCHours(), targetStart.getUTCMinutes()),
        );

        const created = await prisma.lesson.create({
          data: {
            teacherId: teacher.chatId,
            studentId: ids[0],
            price: 0,
            startAt: start,
            durationMinutes: nextDuration,
            status: 'SCHEDULED',
            isPaid: false,
            isRecurring: true,
            recurrenceUntil: recurrenceEnd,
            recurrenceGroupId: existingLesson.recurrenceGroupId,
            recurrenceWeekdays: weekdaysPayload,
            participants: {
              create: students.map((student) => ({
                studentId: student.id,
                price: 0,
                isPaid: false,
              })),
            },
          },
          include: {
            participants: {
              include: {
                student: true,
              },
            },
          },
        });
        seriesLessons.push(created);
      }
      if (seriesLessons.length > 500) break;
    }

    if (seriesLessons.length === 0) {
      throw new Error('Не найдено дат для обновления серии');
    }

    return { lessons: seriesLessons };
  }

  await prisma.lessonParticipant.deleteMany({
    where: { lessonId },
  });

  return prisma.lesson.update({
    where: { id: lessonId },
    data: {
      studentId: ids[0],
      price: existingLesson.isPaid ? (existingLesson as any).price ?? 0 : 0,
      startAt: targetStart,
      durationMinutes: nextDuration,
      participants: {
        create: students.map((student) => ({
          studentId: student.id,
          price: 0,
          isPaid: false,
        })),
      },
    },
    include: {
      participants: {
        include: {
          student: true,
        },
      },
    },
  });
};

const deleteLesson = async (lessonId: number, applyToSeries?: boolean) => {
  const teacher = await ensureTeacher();
  const lesson = (await prisma.lesson.findUnique({ where: { id: lessonId } })) as any;
  if (!lesson || lesson.teacherId !== teacher.chatId) throw new Error('Урок не найден');

  if (applyToSeries && lesson.isRecurring && lesson.recurrenceGroupId) {
    const deleted = await (prisma.lesson as any).deleteMany({
      where: { teacherId: teacher.chatId, recurrenceGroupId: lesson.recurrenceGroupId },
    });
    return { deletedIds: [], deletedCount: deleted?.count ?? 0 };
  }

  await (prisma.lesson as any).delete({ where: { id: lessonId } });
  return { deletedIds: [lessonId], deletedCount: 1 };
};

const markLessonCompleted = async (lessonId: number) => {
  const { lesson, links } = await settleLessonPayments(lessonId);
  const primaryLink = links.find((link: any) => link.studentId === lesson.studentId) ?? null;
  return { lesson, link: primaryLink };
};

const togglePaymentForStudent = async (
  lessonId: number,
  studentId: number,
  options?: { cancelBehavior?: PaymentCancelBehavior },
) => {
  const teacher = await ensureTeacher();
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { participants: true },
  });

  if (!lesson || lesson.teacherId !== teacher.chatId) throw new Error('Урок не найден');

  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
    include: { student: true },
  });

  if (!link) throw new Error('Ученик не найден у текущего преподавателя');

  const participant = lesson.participants.find((entry: any) => entry.studentId === studentId);
  if (!participant) throw new Error('Участник урока не найден');

  const existingPayment = await prisma.payment.findUnique({
    where: { teacherStudentId_lessonId: { teacherStudentId: link.id, lessonId } },
  });

  let updatedLink = link;

  if (participant.isPaid || lesson.isPaid) {
    const cancelBehavior = normalizeCancelBehavior(options?.cancelBehavior);
    const shouldRefund = cancelBehavior === 'refund';
    const deltaChange = shouldRefund ? 1 : 0;
    const priceSnapshot =
      [link.student?.pricePerLesson, participant.price, lesson.price].find(
        (value) => typeof value === 'number' && value > 0,
      ) ?? 0;
    if (existingPayment) {
      await prisma.payment.delete({ where: { id: existingPayment.id } });
    }
    if (shouldRefund) {
      updatedLink = await prisma.teacherStudent.update({
        where: { id: link.id },
        data: { balanceLessons: link.balanceLessons + 1 },
      });
    }
    await prisma.paymentEvent.create({
      data: {
        studentId,
        lessonId,
        type: 'ADJUSTMENT',
        lessonsDelta: deltaChange,
        priceSnapshot,
        moneyAmount: null,
        createdBy: 'TEACHER',
        reason: shouldRefund ? 'PAYMENT_REVERT_REFUND' : 'PAYMENT_REVERT_WRITE_OFF',
      },
    });
    if (!existingAdjustment) {
      if (shouldRefund) {
        updatedLink = await prisma.teacherStudent.update({
          where: { id: link.id },
          data: { balanceLessons: link.balanceLessons + 1 },
        });
      }
      await prisma.paymentEvent.create({
        data: {
          studentId,
          lessonId,
          type: 'ADJUSTMENT',
          lessonsDelta: deltaChange,
          priceSnapshot,
          moneyAmount: null,
          createdBy: 'TEACHER',
          reason: shouldRefund ? 'PAYMENT_REVERT_REFUND' : 'PAYMENT_REVERT_WRITE_OFF',
        },
      });
    }

    await prisma.lessonParticipant.update({
      where: { lessonId_studentId: { lessonId, studentId } },
      data: { isPaid: false, price: 0 },
    });

    if (studentId === lesson.studentId) {
      await prisma.lesson.update({ where: { id: lessonId }, data: { price: 0 } });
    }
  } else {
    const amount =
      [link.student?.pricePerLesson, participant.price, lesson.price].find(
        (value) => typeof value === 'number' && value > 0,
      ) ?? 0;
    await prisma.payment.create({
      data: {
        lessonId,
        teacherStudentId: link.id,
        amount,
        paidAt: new Date(),
        comment: null,
      },
    });
    const existingManualEvent = await prisma.paymentEvent.findFirst({
      where: { studentId, lessonId, type: 'MANUAL_PAID' },
    });
    if (!existingManualEvent) {
      await prisma.paymentEvent.create({
        data: {
          studentId,
          lessonId,
          type: 'MANUAL_PAID',
          lessonsDelta: 0,
          priceSnapshot: amount,
          moneyAmount: amount,
          createdBy: 'TEACHER',
          reason: null,
        },
      });
    }

    if (link.balanceLessons < 0) {
      updatedLink = await prisma.teacherStudent.update({
        where: { id: link.id },
        data: { balanceLessons: Math.min(link.balanceLessons + 1, 0) },
      });
    }

    await prisma.lessonParticipant.update({
      where: { lessonId_studentId: { lessonId, studentId } },
      data: { isPaid: true, price: amount },
    });

    if (studentId === lesson.studentId) {
      await prisma.lesson.update({ where: { id: lessonId }, data: { price: amount } });
    }
  }

  const participants = await prisma.lessonParticipant.findMany({
    where: { lessonId },
    include: { student: true },
  });

  const participantsPaid = participants.length ? participants.every((item: any) => item.isPaid) : false;

  const normalizedLesson = await prisma.lesson.update({
    where: { id: lessonId },
    data: { isPaid: participantsPaid, status: lesson.status === 'SCHEDULED' ? 'COMPLETED' : lesson.status },
    include: {
      participants: {
        include: { student: true },
      },
    },
  });

  const updatedParticipant = normalizedLesson.participants.find((item: any) => item.studentId === studentId);
  return { lesson: normalizedLesson, participant: updatedParticipant, link: updatedLink };
};

const toggleLessonPaid = async (lessonId: number, cancelBehavior?: PaymentCancelBehavior) => {
  const baseLesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!baseLesson) throw new Error('Урок не найден');

  const { lesson, link } = await togglePaymentForStudent(lessonId, baseLesson.studentId, { cancelBehavior });
  return { lesson, link };
};

const toggleParticipantPaid = async (lessonId: number, studentId: number, cancelBehavior?: PaymentCancelBehavior) =>
  togglePaymentForStudent(lessonId, studentId, { cancelBehavior });

const updateLessonStatus = async (lessonId: number, status: any) => {
  const teacher = await ensureTeacher();
  const normalizedStatus = normalizeLessonStatus(status);

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { participants: { include: { student: true } } },
  });

  if (!lesson || lesson.teacherId !== teacher.chatId) throw new Error('Урок не найден');

  if (normalizedStatus === 'COMPLETED') {
    return settleLessonPayments(lessonId);
  }
  if (normalizedStatus === 'CANCELED') {
    const result = await prisma.$transaction(async (tx) => {
      const autoChargeEvents = await tx.paymentEvent.findMany({
        where: { lessonId, type: 'AUTO_CHARGE' },
      });
      const existingAdjustments = await tx.paymentEvent.findMany({
        where: { lessonId, type: 'ADJUSTMENT', reason: 'LESSON_CANCELED' },
      });
      const adjustedStudentIds = new Set(existingAdjustments.map((event: any) => event.studentId));
      const autoChargeStudentIds = Array.from(new Set(autoChargeEvents.map((event: any) => event.studentId)));
      const links = autoChargeStudentIds.length
        ? await tx.teacherStudent.findMany({
            where: { teacherId: teacher.chatId, studentId: { in: autoChargeStudentIds } },
          })
        : [];
      const linksByStudentId = new Map<number, any>(links.map((link: any) => [link.studentId, link]));

      for (const event of autoChargeEvents) {
        if (adjustedStudentIds.has(event.studentId)) continue;
        const link = linksByStudentId.get(event.studentId);
        if (!link) continue;

        await tx.teacherStudent.update({
          where: { id: link.id },
          data: { balanceLessons: link.balanceLessons + 1 },
        });
        await createPaymentEvent(tx, {
          studentId: event.studentId,
          lessonId,
          type: 'ADJUSTMENT',
          lessonsDelta: 1,
          priceSnapshot: event.priceSnapshot,
          moneyAmount: null,
          createdBy: 'SYSTEM',
          reason: 'LESSON_CANCELED',
        });
        await tx.lessonParticipant.update({
          where: { lessonId_studentId: { lessonId, studentId: event.studentId } },
          data: { isPaid: false, price: 0 },
        });
      }

      const participants = await tx.lessonParticipant.findMany({
        where: { lessonId },
        include: { student: true },
      });
      const participantsPaid = participants.length ? participants.every((item: any) => item.isPaid) : false;

      const updatedLesson = await tx.lesson.update({
        where: { id: lessonId },
        data: { status: normalizedStatus, isPaid: normalizedStatus === 'COMPLETED' ? participantsPaid : false },
        include: { participants: { include: { student: true } } },
      });

      return { lesson: updatedLesson, links };
    });

    return result;
  }

  const updatedLesson = await prisma.lesson.update({
    where: { id: lessonId },
    data: { status: normalizedStatus, isPaid: false },
    include: { participants: { include: { student: true } } },
  });

  return { lesson: updatedLesson, links: [] as any[] };
};

const remindHomework = async (studentId: number) => {
  const teacher = await ensureTeacher();
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
  });
  if (!link) throw new Error('Ученик не найден у текущего преподавателя');
  return { status: 'queued', studentId, teacherId: Number(teacher.chatId) };
};

const sendHomeworkToStudent = async (homeworkId: number) => {
  const teacher = await ensureTeacher();
  const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });

  if (!homework || homework.teacherId !== teacher.chatId) throw new Error('Домашнее задание не найдено');

  const normalizedStatus = normalizeTeacherStatus(homework.status);
  const nextStatus = normalizedStatus === 'DRAFT' ? 'ASSIGNED' : normalizedStatus;

  const updated = await prisma.homework.update({
    where: { id: homeworkId },
    data: { status: nextStatus, isDone: nextStatus === 'DONE' ? true : homework.isDone },
  });

  return { status: 'queued', homework: updated };
};

const remindHomeworkById = async (homeworkId: number) => {
  const teacher = await ensureTeacher();
  const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });
  if (!homework || homework.teacherId !== teacher.chatId) throw new Error('Домашнее задание не найдено');

  const result = await prisma.homework.update({
    where: { id: homeworkId },
    data: { lastReminderAt: new Date(), status: homework.status === 'DRAFT' ? 'ASSIGNED' : homework.status },
  });

  return { status: 'queued', homework: result };
};

const AUTO_PAYMENT_DELAY_MINUTES = 30;
const AUTO_PAYMENT_INTERVAL_MS = 60_000;

const autoSettleUnpaidLessons = async () => {
  const teacher = await ensureTeacher();
  const now = Date.now();

  const lessons = await prisma.lesson.findMany({
    where: { teacherId: teacher.chatId, status: 'SCHEDULED', isPaid: false, startAt: { lt: new Date() } },
    include: { participants: { include: { student: true } } },
  });

  const dueLessons = lessons.filter((lesson: any) => {
    const lessonEnd = new Date(lesson.startAt).getTime() + (lesson.durationMinutes + AUTO_PAYMENT_DELAY_MINUTES) * 60_000;
    return lessonEnd <= now;
  });

  for (const lesson of dueLessons) {
    await settleLessonPayments(lesson.id);
  }
};

const handle = async (req: IncomingMessage, res: ServerResponse) => {
  if (!req.url) return notFound(res);

  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;
  const role = getRequestRole(req);
  const requestedStudentId = getRequestedStudentId(req);

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Role, X-Student-Id');
    return res.end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    if (req.method === 'GET' && pathname === '/api/bootstrap') {
      const data = await bootstrap();
      const filteredStudents =
        role === 'STUDENT' && requestedStudentId
          ? data.students.filter((student) => student.id === requestedStudentId)
          : data.students;
      const filteredLinks =
        role === 'STUDENT' && requestedStudentId
          ? data.links.filter((link) => link.studentId === requestedStudentId)
          : data.links;
      const filteredLessons =
        role === 'STUDENT' && requestedStudentId
          ? data.lessons.filter(
              (lesson) =>
                lesson.studentId === requestedStudentId ||
                lesson.participants?.some((participant) => participant.studentId === requestedStudentId),
            )
          : data.lessons;
      const filteredHomeworks = filterHomeworksForRole(data.homeworks, role, requestedStudentId);
      return sendJson(res, 200, {
        ...data,
        students: filteredStudents,
        links: filteredLinks,
        lessons: filteredLessons,
        homeworks: filteredHomeworks,
      });
    }

    if (req.method === 'GET' && pathname === '/api/students') {
      const { searchParams } = url;
      const query = searchParams.get('query') ?? undefined;
      const filter = (searchParams.get('filter') as 'all' | 'debt' | 'overdue' | null) ?? 'all';
      const { limit, offset } = resolvePageParams(url);
      const data = await listStudents(query, filter, limit, offset);
      return sendJson(res, 200, data);
    }

    if (req.method === 'GET' && pathname === '/api/students/search') {
      const { searchParams } = url;
      const query = searchParams.get('query') ?? undefined;
      const filter = (searchParams.get('filter') as 'all' | 'pendingHomework' | 'noReminder' | null) ?? 'all';
      const data = await searchStudents(query, filter);
      const filteredHomeworks = filterHomeworksForRole(data.homeworks, role, requestedStudentId);
      const filteredLinks =
        role === 'STUDENT' && requestedStudentId
          ? data.links.filter((link) => link.studentId === requestedStudentId)
          : data.links;
      const filteredStudents =
        role === 'STUDENT' && requestedStudentId
          ? data.students.filter((student) => student.id === requestedStudentId)
          : data.students;
      return sendJson(res, 200, { ...data, homeworks: filteredHomeworks, links: filteredLinks, students: filteredStudents });
    }

    if (req.method === 'POST' && pathname === '/api/students') {
      const body = await readBody(req);
      const data = await addStudent(body);
      return sendJson(res, 201, data);
    }

    const studentHomeworkListMatch = pathname.match(/^\/api\/students\/(\d+)\/homeworks$/);
    if (req.method === 'GET' && studentHomeworkListMatch) {
      const studentId = Number(studentHomeworkListMatch[1]);
      const { searchParams } = url;
      const filter = (searchParams.get('filter') as HomeworkStatus | 'all' | 'overdue' | null) ?? 'all';
      const { limit, offset } = resolvePageParams(url);
      const data = await listStudentHomeworks(studentId, filter, limit, offset);
      const filteredHomeworks = filterHomeworksForRole(data.items, role, requestedStudentId);
      return sendJson(res, 200, { ...data, items: filteredHomeworks });
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
      const data = await listStudentLessons(studentId, { payment, status, startFrom, startTo, sort });
      return sendJson(res, 200, data);
    }

    const autoRemindMatch = pathname.match(/^\/api\/students\/(\d+)\/auto-remind$/);
    if (req.method === 'POST' && autoRemindMatch) {
      const studentId = Number(autoRemindMatch[1]);
      const body = await readBody(req);
      const link = await toggleAutoReminder(studentId, Boolean(body.value));
      return sendJson(res, 200, { link });
    }

    const priceMatch = pathname.match(/^\/api\/students\/(\d+)\/price$/);
    if ((req.method === 'POST' || req.method === 'PATCH') && priceMatch) {
      const studentId = Number(priceMatch[1]);
      const body = await readBody(req);
      const student = await updatePricePerLesson(studentId, Number(body.value));
      return sendJson(res, 200, { student });
    }

    const balanceMatch = pathname.match(/^\/api\/students\/(\d+)\/balance$/);
    if (req.method === 'POST' && balanceMatch) {
      const studentId = Number(balanceMatch[1]);
      const body = await readBody(req);
      const link = await adjustBalance(studentId, Number(body.delta || 0));
      return sendJson(res, 200, { link });
    }

    const paymentsMatch = pathname.match(/^\/api\/students\/(\d+)\/payments$/);
    if (req.method === 'GET' && paymentsMatch) {
      const studentId = Number(paymentsMatch[1]);
      const filter = url.searchParams.get('filter') ?? undefined;
      const date = url.searchParams.get('date') ?? undefined;
      const events = await listPaymentEventsForStudent(studentId, { filter, date });
      return sendJson(res, 200, { events });
    }

    if (req.method === 'POST' && pathname === '/api/homeworks') {
      const body = await readBody(req);
      const homework = await createHomework(body);
      return sendJson(res, 201, { homework });
    }

    const homeworkUpdateMatch = pathname.match(/^\/api\/homeworks\/(\d+)$/);
    if (req.method === 'PATCH' && homeworkUpdateMatch) {
      const homeworkId = Number(homeworkUpdateMatch[1]);
      const body = await readBody(req);
      const homework = await updateHomework(homeworkId, body);
      return sendJson(res, 200, { homework });
    }

    const takeInWorkMatch = pathname.match(/^\/api\/homeworks\/(\d+)\/take-in-work$/);
    if (req.method === 'POST' && takeInWorkMatch) {
      const homeworkId = Number(takeInWorkMatch[1]);
      const homework = await takeHomeworkInWork(homeworkId, req);
      return sendJson(res, 200, { homework });
    }

    const homeworkSendMatch = pathname.match(/^\/api\/homeworks\/(\d+)\/send$/);
    if (req.method === 'POST' && homeworkSendMatch) {
      const homeworkId = Number(homeworkSendMatch[1]);
      const result = await sendHomeworkToStudent(homeworkId);
      return sendJson(res, 200, result);
    }

    if (req.method === 'DELETE' && homeworkUpdateMatch) {
      const homeworkId = Number(homeworkUpdateMatch[1]);
      const result = await deleteHomework(homeworkId);
      return sendJson(res, 200, result);
    }

    const homeworkToggleMatch = pathname.match(/^\/api\/homeworks\/(\d+)\/toggle$/);
    if (req.method === 'PATCH' && homeworkToggleMatch) {
      const homeworkId = Number(homeworkToggleMatch[1]);
      const homework = await toggleHomework(homeworkId);
      return sendJson(res, 200, { homework });
    }

    const homeworkRemindMatch = pathname.match(/^\/api\/homeworks\/(\d+)\/remind$/);
    if (req.method === 'POST' && homeworkRemindMatch) {
      const homeworkId = Number(homeworkRemindMatch[1]);
      const result = await remindHomeworkById(homeworkId);
      return sendJson(res, 200, result);
    }

    if (req.method === 'POST' && pathname === '/api/lessons/recurring') {
      const body = await readBody(req);
      const lessons = await createRecurringLessons(body);
      return sendJson(res, 201, { lessons });
    }

    if (req.method === 'POST' && pathname === '/api/lessons') {
      const body = await readBody(req);
      const lesson = await createLesson(body);
      return sendJson(res, 201, { lesson });
    }

    const lessonStatusMatch = pathname.match(/^\/api\/lessons\/(\d+)\/status$/);
    if (req.method === 'PATCH' && lessonStatusMatch) {
      const lessonId = Number(lessonStatusMatch[1]);
      const body = await readBody(req);
      const result = await updateLessonStatus(lessonId, body.status);
      return sendJson(res, 200, { lesson: result.lesson, links: result.links });
    }

    const lessonUpdateMatch = pathname.match(/^\/api\/lessons\/(\d+)$/);
    if (req.method === 'PATCH' && lessonUpdateMatch) {
      const lessonId = Number(lessonUpdateMatch[1]);
      const body = await readBody(req);
      const result = await updateLesson(lessonId, body);
      if (result && typeof result === 'object' && 'lessons' in result) {
        return sendJson(res, 200, { lessons: (result as any).lessons });
      }
      return sendJson(res, 200, { lesson: result });
    }

    if (req.method === 'DELETE' && lessonUpdateMatch) {
      const lessonId = Number(lessonUpdateMatch[1]);
      const body = await readBody(req);
      const result = await deleteLesson(lessonId, Boolean(body.applyToSeries));
      return sendJson(res, 200, result);
    }

    const lessonCompleteMatch = pathname.match(/^\/api\/lessons\/(\d+)\/complete$/);
    if (req.method === 'POST' && lessonCompleteMatch) {
      const lessonId = Number(lessonCompleteMatch[1]);
      const result = await markLessonCompleted(lessonId);
      return sendJson(res, 200, result);
    }

    const lessonPaidMatch = pathname.match(/^\/api\/lessons\/(\d+)\/toggle-paid$/);
    if (req.method === 'POST' && lessonPaidMatch) {
      const lessonId = Number(lessonPaidMatch[1]);
      const body = await readBody(req);
      const result = await toggleLessonPaid(lessonId, normalizeCancelBehavior((body as any)?.cancelBehavior));
      return sendJson(res, 200, { lesson: result.lesson, link: result.link });
    }

    const participantPaidMatch = pathname.match(/^\/api\/lessons\/(\d+)\/participants\/(\d+)\/toggle-paid$/);
    if (req.method === 'POST' && participantPaidMatch) {
      const lessonId = Number(participantPaidMatch[1]);
      const studentId = Number(participantPaidMatch[2]);
      const body = await readBody(req);
      const result = await toggleParticipantPaid(lessonId, studentId, normalizeCancelBehavior((body as any)?.cancelBehavior));
      return sendJson(res, 200, { participant: result.participant, lesson: result.lesson, link: result.link });
    }

    const remindMatch = pathname.match(/^\/api\/reminders\/homework$/);
    if (req.method === 'POST' && remindMatch) {
      const body = await readBody(req);
      const result = await remindHomework(Number(body.studentId));
      return sendJson(res, 200, result);
    }

    return notFound(res);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return badRequest(res, message);
  }
};

setInterval(() => {
  autoSettleUnpaidLessons().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Не удалось автоматически списать оплату', error);
  });
}, AUTO_PAYMENT_INTERVAL_MS);

void autoSettleUnpaidLessons();

const server = http.createServer((req, res) => {
  handle(req, res);
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API server running on http://localhost:${PORT}`);
});

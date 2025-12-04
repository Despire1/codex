import http, { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import prisma from './prismaClient';

const PORT = Number(process.env.API_PORT ?? 4000);
const DEMO_TEACHER_ID = BigInt(process.env.DEMO_TEACHER_ID ?? '111222333');

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
  const lessons = await prisma.lesson.findMany({ where: { teacherId: teacher.chatId } });

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
      ? await prisma.student.findUnique({ where: { username } })
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
  });
  if (!link) throw new Error('Student link not found');
  const nextBalance = Math.max(0, link.balanceLessons + delta);
  return prisma.teacherStudent.update({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
    data: { balanceLessons: nextBalance },
  });
};

const createHomework = async (body: any) => {
  const { studentId, text, deadline } = body ?? {};
  if (!studentId || !text) throw new Error('studentId и текст обязательны');
  const teacher = await ensureTeacher();
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId: Number(studentId) } },
  });
  if (!link) throw new Error('Ученик не найден у текущего преподавателя');

  return prisma.homework.create({
    data: {
      studentId: Number(studentId),
      teacherId: teacher.chatId,
      text,
      deadline: deadline ? new Date(deadline) : null,
    },
  });
};

const toggleHomework = async (homeworkId: number) => {
  const teacher = await ensureTeacher();
  const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });
  if (!homework || homework.teacherId !== teacher.chatId) throw new Error('Домашнее задание не найдено');

  return prisma.homework.update({
    where: { id: homeworkId },
    data: { isDone: !homework.isDone },
  });
};

const createLesson = async (body: any) => {
  const { studentId, startAt, durationMinutes } = body ?? {};
  if (!studentId || !startAt || !durationMinutes) throw new Error('Заполните ученика, дату и длительность');
  const teacher = await ensureTeacher();
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId: Number(studentId) } },
  });
  if (!link) throw new Error('Ученик не найден у текущего преподавателя');

  return prisma.lesson.create({
    data: {
      teacherId: teacher.chatId,
      studentId: Number(studentId),
      startAt: new Date(startAt),
      durationMinutes: Number(durationMinutes),
      status: 'SCHEDULED',
      isPaid: false,
    },
  });
};

const updateLesson = async (lessonId: number, body: any) => {
  const { studentId, startAt, durationMinutes } = body ?? {};
  const teacher = await ensureTeacher();
  const existing = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!existing || existing.teacherId !== teacher.chatId) throw new Error('Урок не найден');

  const nextStudentId = studentId ?? existing.studentId;
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId: Number(nextStudentId) } },
  });
  if (!link) throw new Error('Ученик не найден у текущего преподавателя');

  return prisma.lesson.update({
    where: { id: lessonId },
    data: {
      studentId: Number(nextStudentId),
      startAt: startAt ? new Date(startAt) : existing.startAt,
      durationMinutes: durationMinutes ? Number(durationMinutes) : existing.durationMinutes,
    },
  });
};

const markLessonCompleted = async (lessonId: number) => {
  const teacher = await ensureTeacher();
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson || lesson.teacherId !== teacher.chatId) throw new Error('Урок не найден');

  const updatedLesson = await prisma.lesson.update({
    where: { id: lessonId },
    data: { status: 'COMPLETED' },
  });

  let updatedLink = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId: lesson.studentId } },
  });

  if (updatedLink && updatedLink.balanceLessons > 0) {
    updatedLink = await prisma.teacherStudent.update({
      where: { teacherId_studentId: { teacherId: teacher.chatId, studentId: lesson.studentId } },
      data: { balanceLessons: updatedLink.balanceLessons - 1 },
    });
  }

  return { lesson: updatedLesson, link: updatedLink };
};

const toggleLessonPaid = async (lessonId: number) => {
  const teacher = await ensureTeacher();
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson || lesson.teacherId !== teacher.chatId) throw new Error('Урок не найден');

  return prisma.lesson.update({
    where: { id: lessonId },
    data: { isPaid: !lesson.isPaid },
  });
};

const remindHomework = async (studentId: number) => {
  const teacher = await ensureTeacher();
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
  });
  if (!link) throw new Error('Ученик не найден у текущего преподавателя');
  return { status: 'queued', studentId, teacherId: Number(teacher.chatId) };
};

const handle = async (req: IncomingMessage, res: ServerResponse) => {
  if (!req.url) return notFound(res);

  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    if (req.method === 'GET' && pathname === '/api/bootstrap') {
      const data = await bootstrap();
      return sendJson(res, 200, data);
    }

    if (req.method === 'POST' && pathname === '/api/students') {
      const body = await readBody(req);
      const data = await addStudent(body);
      return sendJson(res, 201, data);
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

    if (req.method === 'POST' && pathname === '/api/homeworks') {
      const body = await readBody(req);
      const homework = await createHomework(body);
      return sendJson(res, 201, { homework });
    }

    const homeworkToggleMatch = pathname.match(/^\/api\/homeworks\/(\d+)\/toggle$/);
    if (req.method === 'PATCH' && homeworkToggleMatch) {
      const homeworkId = Number(homeworkToggleMatch[1]);
      const homework = await toggleHomework(homeworkId);
      return sendJson(res, 200, { homework });
    }

    if (req.method === 'POST' && pathname === '/api/lessons') {
      const body = await readBody(req);
      const lesson = await createLesson(body);
      return sendJson(res, 201, { lesson });
    }

    const lessonUpdateMatch = pathname.match(/^\/api\/lessons\/(\d+)$/);
    if (req.method === 'PATCH' && lessonUpdateMatch) {
      const lessonId = Number(lessonUpdateMatch[1]);
      const body = await readBody(req);
      const lesson = await updateLesson(lessonId, body);
      return sendJson(res, 200, { lesson });
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
      const lesson = await toggleLessonPaid(lessonId);
      return sendJson(res, 200, { lesson });
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

const server = http.createServer((req, res) => {
  handle(req, res);
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API server running on http://localhost:${PORT}`);
});

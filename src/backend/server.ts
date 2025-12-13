import crypto from 'node:crypto';
import http, { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { addDays, addYears } from 'date-fns';
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
  });
  if (!link) throw new Error('Student link not found');
  const nextBalance = Math.max(0, link.balanceLessons + delta);
  return prisma.teacherStudent.update({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
    data: { balanceLessons: nextBalance },
  });
};

const normalizeStatus = (status: any) => {
  if (typeof status !== 'string') return 'IN_PROGRESS';
  const upper = status.toUpperCase();
  return ['DRAFT', 'IN_PROGRESS', 'SENT', 'DONE'].includes(upper) ? upper : 'IN_PROGRESS';
};

const createHomework = async (body: any) => {
  const { studentId, text, deadline, status } = body ?? {};
  if (!studentId || !text) throw new Error('studentId и текст обязательны');
  const teacher = await ensureTeacher();
  const link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId: Number(studentId) } },
  });
  if (!link) throw new Error('Ученик не найден у текущего преподавателя');

  const normalizedStatus = normalizeStatus(status);

  return prisma.homework.create({
    data: {
      studentId: Number(studentId),
      teacherId: teacher.chatId,
      text,
      deadline: deadline ? new Date(deadline) : null,
      status: normalizedStatus,
      isDone: normalizedStatus === 'DONE',
    },
  });
};

const toggleHomework = async (homeworkId: number) => {
  const teacher = await ensureTeacher();
  const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });
  if (!homework || homework.teacherId !== teacher.chatId) throw new Error('Домашнее задание не найдено');

  return prisma.homework.update({
    where: { id: homeworkId },
    data: { isDone: !homework.isDone, status: homework.isDone ? 'IN_PROGRESS' : 'DONE' },
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
  if (body.status) {
    const normalizedStatus = normalizeStatus(body.status);
    payload.status = normalizedStatus;
    payload.isDone = normalizedStatus === 'DONE';
  }

  return prisma.homework.update({ where: { id: homeworkId }, data: payload });
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

  const lesson = await prisma.lesson.create({
    data: {
      teacherId: teacher.chatId,
      studentId: studentIds[0],
      startAt: new Date(startAt),
      durationMinutes: durationValue,
      status: 'SCHEDULED',
      isPaid: false,
      participants: {
        create: students.map((student) => ({
          studentId: student.id,
          price: student.pricePerLesson ?? 0,
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
            price: student.pricePerLesson ?? 0,
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
    created.push(lesson);
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
        startAt: targetStart,
        durationMinutes: nextDuration,
        isRecurring: false,
        recurrenceUntil: null,
        recurrenceGroupId: null,
        recurrenceWeekdays: null,
        participants: {
          create: students.map((student) => ({
            studentId: student.id,
            price: student.pricePerLesson ?? 0,
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
                price: student.pricePerLesson ?? 0,
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
                price: student.pricePerLesson ?? 0,
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
      startAt: targetStart,
      durationMinutes: nextDuration,
      participants: {
        create: students.map((student) => ({
          studentId: student.id,
          price: student.pricePerLesson ?? 0,
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

const toggleParticipantPaid = async (lessonId: number, studentId: number) => {
  const teacher = await ensureTeacher();
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson || lesson.teacherId !== teacher.chatId) throw new Error('Урок не найден');

  const participant = await prisma.lessonParticipant.findUnique({
    where: { lessonId_studentId: { lessonId, studentId } },
  });

  if (!participant) throw new Error('Участник урока не найден');

  return prisma.lessonParticipant.update({
    where: { lessonId_studentId: { lessonId, studentId } },
    data: { isPaid: !participant.isPaid },
    include: {
      student: true,
      lesson: {
        include: {
          participants: {
            include: {
              student: true,
            },
          },
        },
      },
    },
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

const remindHomeworkById = async (homeworkId: number) => {
  const teacher = await ensureTeacher();
  const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });
  if (!homework || homework.teacherId !== teacher.chatId) throw new Error('Домашнее задание не найдено');

  const result = await prisma.homework.update({
    where: { id: homeworkId },
    data: { lastReminderAt: new Date(), status: homework.status === 'DRAFT' ? 'SENT' : homework.status },
  });

  return { status: 'queued', homework: result };
};

const handle = async (req: IncomingMessage, res: ServerResponse) => {
  if (!req.url) return notFound(res);

  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    if (req.method === 'GET' && pathname === '/api/bootstrap') {
      const data = await bootstrap();
      return sendJson(res, 200, data);
    }

    if (req.method === 'GET' && pathname === '/api/students/search') {
      const { searchParams } = url;
      const query = searchParams.get('query') ?? undefined;
      const filter = (searchParams.get('filter') as 'all' | 'pendingHomework' | 'noReminder' | null) ?? 'all';
      const data = await searchStudents(query, filter);
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

    const homeworkUpdateMatch = pathname.match(/^\/api\/homeworks\/(\d+)$/);
    if (req.method === 'PATCH' && homeworkUpdateMatch) {
      const homeworkId = Number(homeworkUpdateMatch[1]);
      const body = await readBody(req);
      const homework = await updateHomework(homeworkId, body);
      return sendJson(res, 200, { homework });
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
      const lesson = await toggleLessonPaid(lessonId);
      return sendJson(res, 200, { lesson });
    }

    const participantPaidMatch = pathname.match(/^\/api\/lessons\/(\d+)\/participants\/(\d+)\/toggle-paid$/);
    if (req.method === 'POST' && participantPaidMatch) {
      const lessonId = Number(participantPaidMatch[1]);
      const studentId = Number(participantPaidMatch[2]);
      const result = await toggleParticipantPaid(lessonId, studentId);
      return sendJson(res, 200, { participant: result, lesson: result.lesson });
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

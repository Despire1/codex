import type { IncomingMessage, ServerResponse } from 'node:http';
import type { User } from '@prisma/client';
import prisma from '../../prismaClient';
import { isLocalhostRequest, readBody, sendJson } from '../lib/http';

type DevSwitchRolePayload = {
  role?: string;
};

export const isDevToolsEnabled = (req: IncomingMessage) =>
  process.env.NODE_ENV !== 'production' && isLocalhostRequest(req);

const ensureDevTeacher = async (chatId: bigint, username: string | null, name: string | null) => {
  const existing = await prisma.teacher.findUnique({ where: { chatId } });
  if (existing) return existing;
  return prisma.teacher.create({
    data: {
      chatId,
      username: username ?? null,
      name: name ?? null,
    },
  });
};

const ensureDevSelfStudentLink = async (user: User) => {
  const teacher = await ensureDevTeacher(
    user.telegramUserId,
    user.username ?? null,
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.username || null,
  );

  const studentLabel = (user.firstName || user.username || 'Local').trim() || 'Local';
  const devStudentName = `${studentLabel} (DEV)`;

  let student = await prisma.student.findFirst({ where: { telegramId: user.telegramUserId } });
  if (!student) {
    student = await prisma.student.create({
      data: {
        telegramId: user.telegramUserId,
        username: user.username ?? null,
        isActivated: true,
        timezone: null,
      },
    });
  } else if (!student.isActivated) {
    student = await prisma.student.update({
      where: { id: student.id },
      data: { isActivated: true },
    });
  }

  let link = await prisma.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId: teacher.chatId, studentId: student.id } },
  });
  if (!link) {
    link = await prisma.teacherStudent.create({
      data: {
        teacherId: teacher.chatId,
        studentId: student.id,
        customName: devStudentName,
        isArchived: false,
      },
    });
  } else if (link.isArchived) {
    link = await prisma.teacherStudent.update({
      where: { teacherId_studentId: { teacherId: teacher.chatId, studentId: student.id } },
      data: { isArchived: false, customName: link.customName || devStudentName },
    });
  }

  return {
    teacherId: Number(teacher.chatId),
    studentId: student.id,
  };
};

export const handleDevSwitchRole = async (req: IncomingMessage, res: ServerResponse, user: User) => {
  if (!isDevToolsEnabled(req)) {
    sendJson(res, 404, { message: 'Not found' });
    return;
  }

  let payload: DevSwitchRolePayload = {};
  try {
    const body = await readBody(req);
    payload = (body ?? {}) as DevSwitchRolePayload;
  } catch (_error) {
    sendJson(res, 400, { message: 'invalid_body' });
    return;
  }

  const requestedRole = String(payload.role ?? '')
    .trim()
    .toUpperCase();
  if (requestedRole !== 'TEACHER' && requestedRole !== 'STUDENT') {
    sendJson(res, 400, { message: 'invalid_role' });
    return;
  }

  // Без этого resolveSessionUser при LOCAL_AUTH_BYPASS=true перезатрёт роль
  // обратно на значение из LOCAL_DEV_ROLE на следующем же /auth/session.
  process.env.LOCAL_DEV_ROLE = requestedRole;

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { role: requestedRole as 'TEACHER' | 'STUDENT' },
  });

  let studentContext: { teacherId: number; studentId: number } | null = null;
  if (requestedRole === 'STUDENT') {
    studentContext = await ensureDevSelfStudentLink(updatedUser);
  }

  sendJson(res, 200, {
    user: updatedUser,
    studentContext,
  });
};

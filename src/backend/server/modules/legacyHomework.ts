import type { User } from '@prisma/client';

type LegacyHomeworkDependencies = {
  prisma: any;
  ensureTeacher: (user: User) => Promise<{ chatId: bigint }>;
  safeLogActivityEvent: (payload: Record<string, unknown>) => Promise<void>;
  normalizeTeacherStatus: (status: unknown) => string;
  ensureStudentAccessLink: (
    user: User,
    requestedTeacherId?: number | null,
    requestedStudentId?: number | null,
  ) => Promise<unknown>;
};

const parseTimeSpentMinutes = (value: unknown): number | null => {
  if (value === '' || value === undefined || value === null) return null;
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) return null;
  if (numericValue < 0) return null;
  return Math.round(numericValue);
};

export const createLegacyHomeworkService = ({
  prisma,
  ensureTeacher,
  safeLogActivityEvent,
  normalizeTeacherStatus,
  ensureStudentAccessLink,
}: LegacyHomeworkDependencies) => {
  const createHomework = async (user: User, body: any) => {
    const { studentId, text, deadline, status, attachments, timeSpentMinutes } = body ?? {};
    if (!studentId || !text) throw new Error('studentId и текст обязательны');
    const teacher = await ensureTeacher(user);
    const link = await prisma.teacherStudent.findUnique({
      where: { teacherId_studentId: { teacherId: teacher.chatId, studentId: Number(studentId) } },
    });
    if (!link || link.isArchived) throw new Error('Ученик не найден у текущего преподавателя');

    const normalizedStatus = normalizeTeacherStatus(status ?? 'DRAFT');
    const normalizedAttachments = Array.isArray(attachments) ? attachments : [];
    const parsedTimeSpent = parseTimeSpentMinutes(timeSpentMinutes);
    const completedAt = normalizedStatus === 'DONE' ? new Date() : null;

    const homework = await prisma.homework.create({
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
    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId: Number(studentId),
      homeworkId: homework.id,
      category: 'HOMEWORK',
      action: 'CREATE',
      status: 'SUCCESS',
      source: 'USER',
      title: 'Создано домашнее задание',
      details: homework.text.slice(0, 140),
    });
    return homework;
  };

  const toggleHomework = async (user: User, homeworkId: number) => {
    const teacher = await ensureTeacher(user);
    const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });
    if (!homework || homework.teacherId !== teacher.chatId) throw new Error('Домашнее задание не найдено');

    const nextIsDone = !homework.isDone;
    const nextStatus = nextIsDone ? 'DONE' : 'ASSIGNED';

    const updated = await prisma.homework.update({
      where: { id: homeworkId },
      data: {
        isDone: nextIsDone,
        status: nextStatus,
        completedAt: nextIsDone ? new Date() : null,
      },
    });
    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId: homework.studentId,
      homeworkId,
      category: 'HOMEWORK',
      action: 'TOGGLE_DONE',
      status: 'SUCCESS',
      source: 'USER',
      title: nextIsDone ? 'Домашка отмечена выполненной' : 'Домашка возвращена в активные',
    });
    return updated;
  };

  const updateHomework = async (user: User, homeworkId: number, body: any) => {
    const teacher = await ensureTeacher(user);
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

    const updatedHomework = await prisma.homework.update({ where: { id: homeworkId }, data: payload });
    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId: homework.studentId,
      homeworkId,
      category: 'HOMEWORK',
      action: 'UPDATE',
      status: 'SUCCESS',
      source: 'USER',
      title: 'Обновлено домашнее задание',
      details: Object.keys(payload).length > 0 ? `Поля: ${Object.keys(payload).join(', ')}` : null,
    });
    return updatedHomework;
  };

  const takeHomeworkInWork = async (user: User, homeworkId: number) => {
    const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });
    if (!homework) throw new Error('Домашнее задание не найдено');

    try {
      await ensureStudentAccessLink(user, Number(homework.teacherId), homework.studentId);
    } catch {
      const forbidden: any = new Error('Домашнее задание недоступно этому ученику');
      forbidden.statusCode = 403;
      throw forbidden;
    }

    if (homework.status !== 'ASSIGNED' && homework.status !== 'IN_PROGRESS') {
      const error: any = new Error('Неверный статус для перевода в работу');
      error.statusCode = 400;
      throw error;
    }

    const updatedHomework = await prisma.homework.update({
      where: { id: homeworkId },
      data: {
        status: 'IN_PROGRESS',
        isDone: false,
        takenAt: new Date(),
        takenByStudentId: homework.studentId,
      },
    });
    await safeLogActivityEvent({
      teacherId: homework.teacherId,
      studentId: homework.studentId,
      homeworkId,
      category: 'HOMEWORK',
      action: 'TAKE_IN_WORK',
      status: 'SUCCESS',
      source: 'USER',
      title: 'Ученик взял домашку в работу',
      details: `studentId: ${homework.studentId}`,
    });
    return updatedHomework;
  };

  const deleteHomework = async (user: User, homeworkId: number) => {
    const teacher = await ensureTeacher(user);
    const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });
    if (!homework || homework.teacherId !== teacher.chatId) throw new Error('Домашнее задание не найдено');

    await prisma.homework.delete({ where: { id: homeworkId } });
    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId: homework.studentId,
      homeworkId: null,
      category: 'HOMEWORK',
      action: 'DELETE',
      status: 'SUCCESS',
      source: 'USER',
      title: 'Удалено домашнее задание',
      details: homework.text.slice(0, 140),
      payload: { deletedHomeworkId: homeworkId },
    });
    return { id: homeworkId };
  };

  const remindHomework = async (user: User, studentId: number) => {
    const teacher = await ensureTeacher(user);
    const link = await prisma.teacherStudent.findUnique({
      where: { teacherId_studentId: { teacherId: teacher.chatId, studentId } },
    });
    if (!link || link.isArchived) throw new Error('Ученик не найден у текущего преподавателя');
    return { status: 'queued', studentId, teacherId: Number(teacher.chatId) };
  };

  const sendHomeworkToStudent = async (user: User, homeworkId: number) => {
    const teacher = await ensureTeacher(user);
    const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });

    if (!homework || homework.teacherId !== teacher.chatId) throw new Error('Домашнее задание не найдено');

    const normalizedStatus = normalizeTeacherStatus(homework.status);
    const nextStatus = normalizedStatus === 'DRAFT' ? 'ASSIGNED' : normalizedStatus;

    const updated = await prisma.homework.update({
      where: { id: homeworkId },
      data: { status: nextStatus, isDone: nextStatus === 'DONE' ? true : homework.isDone },
    });

    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId: homework.studentId,
      homeworkId,
      category: 'HOMEWORK',
      action: 'SEND',
      status: 'SUCCESS',
      source: 'USER',
      title: 'Домашка отправлена ученику',
      details: `Статус: ${nextStatus}`,
    });

    return { status: 'queued', homework: updated };
  };

  const remindHomeworkById = async (user: User, homeworkId: number) => {
    const teacher = await ensureTeacher(user);
    const homework = await prisma.homework.findUnique({ where: { id: homeworkId } });
    if (!homework || homework.teacherId !== teacher.chatId) throw new Error('Домашнее задание не найдено');

    const result = await prisma.homework.update({
      where: { id: homeworkId },
      data: { lastReminderAt: new Date(), status: homework.status === 'DRAFT' ? 'ASSIGNED' : homework.status },
    });

    await safeLogActivityEvent({
      teacherId: teacher.chatId,
      studentId: homework.studentId,
      homeworkId,
      category: 'HOMEWORK',
      action: 'REMIND',
      status: 'SUCCESS',
      source: 'USER',
      title: 'Отправлено напоминание по домашке',
    });

    return { status: 'queued', homework: result };
  };

  return {
    createHomework,
    toggleHomework,
    updateHomework,
    takeHomeworkInWork,
    deleteHomework,
    remindHomework,
    sendHomeworkToStudent,
    remindHomeworkById,
  };
};

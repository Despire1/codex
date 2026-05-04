import type { Student, User } from '@prisma/client';

type StudentAccessLink = {
  teacherId: bigint;
  studentId: number;
  customName: string;
  teacher?: { chatId: bigint; name?: string | null; username?: string | null; timezone?: string | null } | null;
  student?: Student | null;
};

type StudentAccessDependencies = {
  prisma: any;
  normalizeTelegramUsername: (username?: string | null) => string | null;
  filterSuppressedLessons: (tx: any, lessons: any[]) => Promise<any[]>;
  resolveHomeworkFallbackDeadline: (referenceDate: Date, timeZone?: string | null) => Date;
};

export const createStudentAccessService = ({
  prisma,
  normalizeTelegramUsername,
  filterSuppressedLessons,
  resolveHomeworkFallbackDeadline,
}: StudentAccessDependencies) => {
  const resolveStudentAccessLinks = async (user: User): Promise<StudentAccessLink[]> => {
    const normalizedUsername = normalizeTelegramUsername(user.username);
    const students = await prisma.student.findMany({
      where: {
        OR: [{ telegramId: user.telegramUserId }, ...(normalizedUsername ? [{ username: normalizedUsername }] : [])],
      },
      select: { id: true },
    });
    if (students.length === 0) return [];
    const studentIds = students.map((student: { id: number }) => student.id);
    const links = (await prisma.teacherStudent.findMany({
      where: { studentId: { in: studentIds }, isArchived: false },
      include: { student: true, teacher: true },
      orderBy: [{ teacherId: 'asc' }, { studentId: 'asc' }],
    })) as StudentAccessLink[];

    const byPair = new Map<string, StudentAccessLink>();
    links.forEach((link) => {
      byPair.set(`${link.teacherId.toString()}:${link.studentId}`, link);
    });
    return Array.from(byPair.values());
  };

  const pickStudentAccessLink = (
    links: StudentAccessLink[],
    requestedTeacherId?: number | null,
    requestedStudentId?: number | null,
  ) => {
    const teacherIdProvided = requestedTeacherId !== null && requestedTeacherId !== undefined;
    const studentIdProvided = requestedStudentId !== null && requestedStudentId !== undefined;
    const teacherIdNumeric = teacherIdProvided ? Number(requestedTeacherId) : NaN;
    const studentIdNumeric = studentIdProvided ? Number(requestedStudentId) : NaN;
    if (teacherIdProvided && !Number.isFinite(teacherIdNumeric)) return null;
    if (studentIdProvided && !Number.isFinite(studentIdNumeric)) return null;
    const teacherId = teacherIdProvided ? teacherIdNumeric : null;
    const studentId = studentIdProvided ? studentIdNumeric : null;

    if (teacherId !== null && studentId !== null) {
      const matches = links.filter((link) => Number(link.teacherId) === teacherId && link.studentId === studentId);
      return matches.length === 1 ? matches[0] : null;
    }

    if (teacherId !== null) {
      const matches = links.filter((link) => Number(link.teacherId) === teacherId);
      return matches.length === 1 ? matches[0] : null;
    }

    if (studentId !== null) {
      const matches = links.filter((link) => link.studentId === studentId);
      return matches.length === 1 ? matches[0] : null;
    }

    if (links.length === 1) return links[0];
    return null;
  };

  const ensureStudentAccessLink = async (
    user: User,
    requestedTeacherId?: number | null,
    requestedStudentId?: number | null,
  ) => {
    const links = await resolveStudentAccessLinks(user);
    if (links.length === 0) {
      throw new Error('student_context_not_found');
    }
    const active = pickStudentAccessLink(links, requestedTeacherId, requestedStudentId);
    if (!active) {
      throw new Error('student_context_required');
    }
    return { links, active };
  };

  const ensureTeacherStudentLinkV2 = async (teacherId: bigint, studentId: number) => {
    const link = await prisma.teacherStudent.findUnique({
      where: { teacherId_studentId: { teacherId, studentId } },
      include: { student: true, teacher: true },
    });
    if (!link || link.isArchived) throw new Error('Ученик не найден у текущего преподавателя');
    return link;
  };

  const resolveHomeworkDefaultDeadline = async (teacherId: bigint, studentId: number, lessonId?: number | null) => {
    const teacher = await prisma.teacher.findUnique({ where: { chatId: teacherId } });
    let referenceDate = new Date();
    if (lessonId) {
      const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
      if (lesson && lesson.teacherId === teacherId) {
        referenceDate = lesson.startAt;
      }
    }
    const nextLessons = await prisma.lesson.findMany({
      where: {
        teacherId,
        isSuppressed: false,
        status: { not: 'CANCELED' },
        startAt: { gt: referenceDate },
        OR: [{ studentId }, { participants: { some: { studentId } } }],
      },
      orderBy: { startAt: 'asc' },
      take: 25,
    });
    const [nextLesson] = await filterSuppressedLessons(prisma, nextLessons);
    if (nextLesson) {
      return { deadlineAt: nextLesson.startAt, warning: null as string | null };
    }
    return {
      deadlineAt: resolveHomeworkFallbackDeadline(referenceDate, teacher?.timezone ?? null),
      warning: 'NO_NEXT_LESSON',
    };
  };

  const listStudentContextV2 = async (
    user: User,
    requestedTeacherId?: number | null,
    requestedStudentId?: number | null,
  ) => {
    const links = await resolveStudentAccessLinks(user);
    const active = pickStudentAccessLink(links, requestedTeacherId, requestedStudentId);
    return {
      contexts: links.map((link) => ({
        teacherId: Number(link.teacherId),
        studentId: link.studentId,
        teacherName: link.teacher?.name ?? link.teacher?.username ?? 'Преподаватель',
        teacherUsername: link.teacher?.username ?? null,
        studentName: link.customName || link.student?.username || 'Ученик',
        studentUsername: link.student?.username ?? null,
      })),
      activeTeacherId: active ? Number(active.teacherId) : null,
      activeStudentId: active?.studentId ?? null,
    };
  };

  return {
    resolveStudentAccessLinks,
    pickStudentAccessLink,
    ensureStudentAccessLink,
    ensureTeacherStudentLinkV2,
    resolveHomeworkDefaultDeadline,
    listStudentContextV2,
  };
};

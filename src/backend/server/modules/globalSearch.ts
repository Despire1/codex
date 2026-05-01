import type { User } from '@prisma/client';

export type GlobalSearchScope = 'all' | 'students' | 'lessons' | 'homework';

export type GlobalSearchStudent = {
  studentId: number;
  name: string;
  username: string | null;
  level: string | null;
};

export type GlobalSearchLesson = {
  lessonId: number;
  title: string;
  studentId: number;
  studentName: string;
  studentUsername: string | null;
  startAt: string;
  durationMinutes: number;
  status: string;
  isPaid: boolean;
  meetingLink: string | null;
};

export type GlobalSearchHomework =
  | {
      kind: 'assignment';
      assignmentId: number;
      title: string;
      studentId: number | null;
      studentName: string | null;
      status: string;
      deadlineAt: string | null;
      templateTitle: string | null;
    }
  | {
      kind: 'template';
      templateId: number;
      title: string;
      subject: string | null;
      level: string | null;
      tags: string[];
      isArchived: boolean;
    };

export type GlobalSearchResponse = {
  query: string;
  scope: GlobalSearchScope;
  totals: { students: number; lessons: number; homework: number };
  students: GlobalSearchStudent[];
  lessons: GlobalSearchLesson[];
  homework: GlobalSearchHomework[];
};

type GlobalSearchDeps = {
  prisma: any;
  ensureTeacher: (user: User) => Promise<{ chatId: bigint }>;
};

const DEFAULT_PER_CATEGORY_LIMIT = 8;
const MAX_PER_CATEGORY_LIMIT = 25;

const clampLimit = (raw: number | undefined) => {
  if (!Number.isFinite(raw)) return DEFAULT_PER_CATEGORY_LIMIT;
  const value = Math.trunc(Number(raw));
  if (value <= 0) return DEFAULT_PER_CATEGORY_LIMIT;
  return Math.min(value, MAX_PER_CATEGORY_LIMIT);
};

const normalizeScope = (raw: string | null | undefined): GlobalSearchScope => {
  if (raw === 'students' || raw === 'lessons' || raw === 'homework') return raw;
  return 'all';
};

export const parseGlobalSearchScope = (raw: string | null | undefined) => normalizeScope(raw);

export const createGlobalSearchService = ({ prisma, ensureTeacher }: GlobalSearchDeps) => {
  const globalSearch = async (
    user: User,
    params: { query?: string | null; scope?: GlobalSearchScope; limit?: number },
  ): Promise<GlobalSearchResponse> => {
    const teacher = await ensureTeacher(user);
    const scope = normalizeScope(params.scope);
    const limit = clampLimit(params.limit);
    const trimmed = (params.query ?? '').trim();

    const empty: GlobalSearchResponse = {
      query: trimmed,
      scope,
      totals: { students: 0, lessons: 0, homework: 0 },
      students: [],
      lessons: [],
      homework: [],
    };
    if (!trimmed) return empty;

    const wantStudents = scope === 'all' || scope === 'students';
    const wantLessons = scope === 'all' || scope === 'lessons';
    const wantHomework = scope === 'all' || scope === 'homework';

    const [studentsResult, lessonsResult, homeworkResult] = await Promise.all([
      wantStudents ? searchStudents(prisma, teacher.chatId, trimmed, limit) : Promise.resolve({ items: [], total: 0 }),
      wantLessons ? searchLessons(prisma, teacher.chatId, trimmed, limit) : Promise.resolve({ items: [], total: 0 }),
      wantHomework ? searchHomework(prisma, teacher.chatId, trimmed, limit) : Promise.resolve({ items: [], total: 0 }),
    ]);

    return {
      query: trimmed,
      scope,
      totals: {
        students: studentsResult.total,
        lessons: lessonsResult.total,
        homework: homeworkResult.total,
      },
      students: studentsResult.items,
      lessons: lessonsResult.items,
      homework: homeworkResult.items,
    };
  };

  return { globalSearch };
};

const searchStudents = async (
  prisma: any,
  teacherId: bigint,
  query: string,
  limit: number,
): Promise<{ items: GlobalSearchStudent[]; total: number }> => {
  const where = {
    teacherId,
    isArchived: false,
    OR: [
      { customName: { contains: query, mode: 'insensitive' as const } },
      { student: { username: { contains: query, mode: 'insensitive' as const } } },
    ],
  };

  const [total, links] = await Promise.all([
    prisma.teacherStudent.count({ where }),
    prisma.teacherStudent.findMany({
      where,
      include: { student: { select: { id: true, username: true } } },
      orderBy: { customName: 'asc' },
      take: limit,
    }),
  ]);

  const items: GlobalSearchStudent[] = links
    .filter((link: any) => Boolean(link.student))
    .map((link: any) => ({
      studentId: link.studentId,
      name: link.customName?.trim() || link.student?.username || `Ученик #${link.studentId}`,
      username: link.student?.username ?? null,
      level: link.studentLevel ?? null,
    }));

  return { items, total };
};

const searchLessons = async (
  prisma: any,
  teacherId: bigint,
  query: string,
  limit: number,
): Promise<{ items: GlobalSearchLesson[]; total: number }> => {
  const matchedLinks = await prisma.teacherStudent.findMany({
    where: {
      teacherId,
      isArchived: false,
      customName: { contains: query, mode: 'insensitive' as const },
    },
    select: { studentId: true, customName: true },
  });

  const matchedStudentIds = matchedLinks.map((link: any) => link.studentId);

  const where: Record<string, unknown> = {
    teacherId,
    isSuppressed: false,
    OR: [
      ...(matchedStudentIds.length ? [{ studentId: { in: matchedStudentIds } }] : []),
      { student: { username: { contains: query, mode: 'insensitive' as const } } },
      { meetingLink: { contains: query, mode: 'insensitive' as const } },
      { participants: { some: { student: { username: { contains: query, mode: 'insensitive' as const } } } } },
    ],
  };

  if (!matchedStudentIds.length && (where.OR as unknown[]).length === 0) {
    return { items: [], total: 0 };
  }

  const [total, lessons] = await Promise.all([
    prisma.lesson.count({ where }),
    prisma.lesson.findMany({
      where,
      include: {
        student: { select: { id: true, username: true } },
        participants: { include: { student: { select: { id: true, username: true } } } },
      },
      orderBy: { startAt: 'desc' },
      take: limit,
    }),
  ]);

  const allStudentIds = new Set<number>();
  lessons.forEach((lesson: any) => {
    if (lesson.studentId) allStudentIds.add(lesson.studentId);
    (lesson.participants ?? []).forEach((participant: any) => {
      if (participant.studentId) allStudentIds.add(participant.studentId);
    });
  });

  const links = allStudentIds.size
    ? await prisma.teacherStudent.findMany({
        where: { teacherId, studentId: { in: Array.from(allStudentIds) } },
        select: { studentId: true, customName: true },
      })
    : [];
  const linkByStudentId = new Map<number, string>(links.map((link: any) => [link.studentId, link.customName]));

  const items: GlobalSearchLesson[] = lessons.map((lesson: any) => {
    const primaryStudentName =
      linkByStudentId.get(lesson.studentId) || lesson.student?.username || `Ученик #${lesson.studentId}`;
    const participantNames: string[] = (lesson.participants ?? []).map(
      (participant: any) =>
        linkByStudentId.get(participant.studentId) ||
        participant.student?.username ||
        `Ученик #${participant.studentId}`,
    );
    const title = participantNames.length > 0 ? participantNames.join(', ') : primaryStudentName;

    return {
      lessonId: lesson.id,
      title,
      studentId: lesson.studentId,
      studentName: primaryStudentName,
      studentUsername: lesson.student?.username ?? null,
      startAt: lesson.startAt instanceof Date ? lesson.startAt.toISOString() : String(lesson.startAt),
      durationMinutes: Number(lesson.durationMinutes ?? 60),
      status: String(lesson.status ?? 'SCHEDULED'),
      isPaid: Boolean(lesson.isPaid),
      meetingLink: typeof lesson.meetingLink === 'string' ? lesson.meetingLink : null,
    };
  });

  return { items, total };
};

const parseTemplateTags = (raw: unknown): string[] => {
  if (Array.isArray(raw)) return raw.filter((tag): tag is string => typeof tag === 'string');
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : [];
  } catch {
    return [];
  }
};

const searchHomework = async (
  prisma: any,
  teacherId: bigint,
  query: string,
  limit: number,
): Promise<{ items: GlobalSearchHomework[]; total: number }> => {
  const matchedLinks = await prisma.teacherStudent.findMany({
    where: {
      teacherId,
      isArchived: false,
      customName: { contains: query, mode: 'insensitive' as const },
    },
    select: { studentId: true },
  });
  const matchedStudentIds = matchedLinks.map((link: any) => link.studentId);

  const assignmentWhere: Record<string, unknown> = {
    teacherId,
    OR: [
      { title: { contains: query, mode: 'insensitive' as const } },
      { template: { title: { contains: query, mode: 'insensitive' as const } } },
      { student: { username: { contains: query, mode: 'insensitive' as const } } },
      ...(matchedStudentIds.length ? [{ studentId: { in: matchedStudentIds } }] : []),
    ],
  };

  const templateWhere: Record<string, unknown> = {
    teacherId,
    OR: [
      { title: { contains: query, mode: 'insensitive' as const } },
      { tags: { contains: query, mode: 'insensitive' as const } },
      { subject: { contains: query, mode: 'insensitive' as const } },
      { level: { contains: query, mode: 'insensitive' as const } },
    ],
  };

  const [assignmentTotal, assignments, templateTotal, templates] = await Promise.all([
    prisma.homeworkAssignment.count({ where: assignmentWhere }),
    prisma.homeworkAssignment.findMany({
      where: assignmentWhere,
      include: {
        student: { select: { id: true, username: true } },
        template: { select: { title: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit,
    }),
    prisma.homeworkTemplate.count({ where: templateWhere }),
    prisma.homeworkTemplate.findMany({
      where: templateWhere,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit,
    }),
  ]);

  const studentIds = Array.from(
    new Set(assignments.map((a: any) => a.studentId).filter((id: number | null) => Number.isFinite(id))),
  ) as number[];
  const links = studentIds.length
    ? await prisma.teacherStudent.findMany({
        where: { teacherId, studentId: { in: studentIds } },
        select: { studentId: true, customName: true },
      })
    : [];
  const linkByStudentId = new Map<number, string>(links.map((link: any) => [link.studentId, link.customName]));

  const assignmentItems: GlobalSearchHomework[] = assignments.map((assignment: any) => {
    const studentName = assignment.studentId
      ? linkByStudentId.get(assignment.studentId) || assignment.student?.username || `Ученик #${assignment.studentId}`
      : null;
    return {
      kind: 'assignment',
      assignmentId: assignment.id,
      title: assignment.title || assignment.template?.title || 'Домашнее задание',
      studentId: assignment.studentId ?? null,
      studentName,
      status: String(assignment.status ?? 'DRAFT'),
      deadlineAt:
        assignment.deadlineAt instanceof Date
          ? assignment.deadlineAt.toISOString()
          : assignment.deadlineAt
            ? String(assignment.deadlineAt)
            : null,
      templateTitle: assignment.template?.title ?? null,
    };
  });

  const templateItems: GlobalSearchHomework[] = templates.map((template: any) => ({
    kind: 'template',
    templateId: template.id,
    title: template.title || 'Шаблон без названия',
    subject: typeof template.subject === 'string' ? template.subject : null,
    level: typeof template.level === 'string' ? template.level : null,
    tags: parseTemplateTags(template.tags),
    isArchived: Boolean(template.isArchived),
  }));

  const items = [...templateItems, ...assignmentItems].slice(0, limit);
  return { items, total: assignmentTotal + templateTotal };
};

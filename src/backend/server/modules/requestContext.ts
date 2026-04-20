import type { IncomingMessage } from 'node:http';

export type RequestRole = 'TEACHER' | 'STUDENT';

const VISIBLE_STUDENT_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'DONE'] as const;

export const getRequestRole = (req: IncomingMessage): RequestRole => {
  const roleHeader = (req.headers['x-user-role'] as string | undefined) ?? '';
  return roleHeader.toUpperCase() === 'STUDENT' ? 'STUDENT' : 'TEACHER';
};

export const getRequestedStudentId = (req: IncomingMessage): number | null => {
  const studentIdHeader = req.headers['x-student-id'];
  const requesterStudentId = typeof studentIdHeader === 'string' ? Number(studentIdHeader) : NaN;
  return Number.isFinite(requesterStudentId) ? requesterStudentId : null;
};

export const getRequestedTeacherId = (req: IncomingMessage): number | null => {
  const teacherIdHeader = req.headers['x-teacher-id'];
  const requesterTeacherId = typeof teacherIdHeader === 'string' ? Number(teacherIdHeader) : NaN;
  return Number.isFinite(requesterTeacherId) ? requesterTeacherId : null;
};

export const parseOptionalNumberQueryParam = (value: string | null): number | null => {
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const parseOptionalBooleanQueryParam = (value: string | null): boolean | null => {
  if (value === null) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true') return true;
  if (normalized === '0' || normalized === 'false') return false;
  return null;
};

export const normalizeStatus = (status: unknown) => {
  if (typeof status !== 'string') return 'ASSIGNED';
  const upper = status.toUpperCase();
  if (upper === 'ACTIVE' || upper === 'SENT') return 'ASSIGNED';
  if (upper === 'NEW') return 'DRAFT';
  return ['DRAFT', 'ASSIGNED', 'IN_PROGRESS', 'DONE'].includes(upper) ? upper : 'ASSIGNED';
};

export const normalizeTeacherStatus = (status: unknown) => normalizeStatus(status);

export const filterHomeworksForRole = (homeworks: any[], role: RequestRole, studentId?: number | null) => {
  if (role !== 'STUDENT') return homeworks;

  return homeworks.filter((homework) => {
    const normalizedStatus = normalizeStatus(homework.status);
    const matchesStudent = studentId ? homework.studentId === studentId : true;
    return matchesStudent && VISIBLE_STUDENT_STATUSES.includes(normalizedStatus as (typeof VISIBLE_STUDENT_STATUSES)[number]);
  });
};

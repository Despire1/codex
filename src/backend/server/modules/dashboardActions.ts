import type { User } from '@prisma/client';
import { ru } from 'date-fns/locale';
import { format, formatDistanceToNowStrict } from 'date-fns';
import type {
  DashboardActionKind,
  DashboardActionRequiredItem,
  DashboardActionSeverity,
  DashboardActionType,
  DashboardHomeworkReviewItem,
} from '../../../entities/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const UNCOMPLETED_THRESHOLD_HOURS = 6;
const UNPAID_LONG_THRESHOLD_DAYS = 7;
const INACTIVE_STUDENT_THRESHOLD_DAYS = 14;
const NO_NEXT_LESSON_HORIZON_DAYS = 14;
const NOT_ACTIVATED_THRESHOLD_DAYS = 7;

const MAX_ITEMS = 6;

type DashboardActionsDependencies = {
  prisma: any;
  ensureTeacher: (user: User) => Promise<any>;
  filterSuppressedLessons: (tx: any, lessons: any[]) => Promise<any[]>;
};

const formatRuShortDate = (date: Date) => format(date, 'd MMM', { locale: ru }).replace('.', '');

const formatRelativeRu = (date: Date) => formatDistanceToNowStrict(date, { addSuffix: false, locale: ru });

const buildItem = (params: {
  id: string;
  kind: DashboardActionKind;
  severity: DashboardActionSeverity;
  tag: string;
  title: string;
  meta: string;
  studentId?: number | null;
  lessonId?: number | null;
  occurredAt: Date;
  actionType: DashboardActionType;
  actionLabel: string;
}): DashboardActionRequiredItem => ({
  id: params.id,
  kind: params.kind,
  severity: params.severity,
  tag: params.tag,
  title: params.title,
  meta: params.meta,
  studentId: params.studentId ?? null,
  lessonId: params.lessonId ?? null,
  occurredAt: params.occurredAt.toISOString(),
  action: { type: params.actionType, label: params.actionLabel },
});

const SEVERITY_RANK: Record<DashboardActionSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export const createDashboardActionsService = ({
  prisma,
  ensureTeacher,
  filterSuppressedLessons,
}: DashboardActionsDependencies) => {
  const resolveStudentName = (link: any, student: any) => {
    const customName = typeof link?.customName === 'string' ? link.customName.trim() : '';
    if (customName) return customName;
    const username = typeof student?.username === 'string' ? student.username.trim() : '';
    return username || 'Ученик';
  };

  const listActionRequired = async (user: User): Promise<{ items: DashboardActionRequiredItem[] }> => {
    const teacher = await ensureTeacher(user);
    const teacherId = teacher.chatId;
    const now = new Date();
    const nowMs = now.getTime();

    const links = await prisma.teacherStudent.findMany({
      where: { teacherId, isArchived: false },
    });
    const studentIds = links.map((link: any) => Number(link.studentId)).filter((id: number) => Number.isFinite(id));

    const students = studentIds.length ? await prisma.student.findMany({ where: { id: { in: studentIds } } }) : [];
    const studentById = new Map<number, any>(students.map((student: any) => [Number(student.id), student]));
    const linkByStudentId = new Map<number, any>(links.map((link: any) => [Number(link.studentId), link]));

    let lessons = await prisma.lesson.findMany({
      where: {
        teacherId,
        isSuppressed: false,
        status: { not: 'CANCELED' },
      },
      include: {
        student: { select: { id: true, username: true } },
        participants: { select: { studentId: true, isPaid: true, price: true } },
      },
    });
    lessons = await filterSuppressedLessons(prisma, lessons);

    const items: DashboardActionRequiredItem[] = [];

    for (const lesson of lessons) {
      const startMs = new Date(lesson.startAt).getTime();
      const ageMs = nowMs - startMs;

      if (lesson.status === 'SCHEDULED' && ageMs > UNCOMPLETED_THRESHOLD_HOURS * HOUR_MS) {
        const studentLink = linkByStudentId.get(Number(lesson.studentId));
        const student = studentById.get(Number(lesson.studentId)) ?? lesson.student;
        const name = resolveStudentName(studentLink, student);
        const dateLabel = formatRuShortDate(new Date(lesson.startAt));
        items.push(
          buildItem({
            id: `lesson-uncompleted-${lesson.id}`,
            kind: 'OVERDUE_LESSON_UNCOMPLETED',
            severity: 'critical',
            tag: 'Отметить',
            title: `Урок ${name} ещё не отмечен`,
            meta: `Прошёл ${dateLabel} · ${lesson.durationMinutes} мин`,
            studentId: Number(lesson.studentId),
            lessonId: lesson.id,
            occurredAt: new Date(lesson.startAt),
            actionType: 'mark_lesson_completed',
            actionLabel: 'Отметить',
          }),
        );
      }

      if (
        lesson.status === 'COMPLETED' &&
        lesson.completedAt &&
        nowMs - new Date(lesson.completedAt).getTime() > UNPAID_LONG_THRESHOLD_DAYS * DAY_MS
      ) {
        const collectUnpaidParticipants = (lesson.participants ?? []).filter((participant: any) => !participant.isPaid);
        if (collectUnpaidParticipants.length === 0 && !lesson.isPaid) {
          const studentLink = linkByStudentId.get(Number(lesson.studentId));
          const student = studentById.get(Number(lesson.studentId)) ?? lesson.student;
          const name = resolveStudentName(studentLink, student);
          const daysOverdue = Math.floor((nowMs - new Date(lesson.completedAt).getTime()) / DAY_MS);
          items.push(
            buildItem({
              id: `lesson-unpaid-${lesson.id}-${lesson.studentId}`,
              kind: 'OVERDUE_LESSON_UNPAID_LONG',
              severity: 'critical',
              tag: 'Напомнить',
              title: `${name} давно не оплатил урок`,
              meta: `Долг ${daysOverdue} дн. · ${Math.max(0, Number(lesson.price) || 0)} ₽`,
              studentId: Number(lesson.studentId),
              lessonId: lesson.id,
              occurredAt: new Date(lesson.completedAt),
              actionType: 'remind_payment',
              actionLabel: 'Напомнить',
            }),
          );
        } else {
          for (const participant of collectUnpaidParticipants) {
            const studentLink = linkByStudentId.get(Number(participant.studentId));
            const student = studentById.get(Number(participant.studentId));
            const name = resolveStudentName(studentLink, student);
            const daysOverdue = Math.floor((nowMs - new Date(lesson.completedAt).getTime()) / DAY_MS);
            items.push(
              buildItem({
                id: `lesson-unpaid-${lesson.id}-${participant.studentId}`,
                kind: 'OVERDUE_LESSON_UNPAID_LONG',
                severity: 'critical',
                tag: 'Напомнить',
                title: `${name} давно не оплатил урок`,
                meta: `Долг ${daysOverdue} дн. · ${Math.max(0, Number(participant.price) || 0)} ₽`,
                studentId: Number(participant.studentId),
                lessonId: lesson.id,
                occurredAt: new Date(lesson.completedAt),
                actionType: 'remind_payment',
                actionLabel: 'Напомнить',
              }),
            );
          }
        }
      }
    }

    const lastLessonByStudent = new Map<number, Date>();
    const nextLessonByStudent = new Map<number, Date>();
    for (const lesson of lessons) {
      const startDate = new Date(lesson.startAt);
      const startMs = startDate.getTime();
      const involved = new Set<number>();
      involved.add(Number(lesson.studentId));
      for (const participant of lesson.participants ?? []) {
        involved.add(Number(participant.studentId));
      }
      for (const studentId of involved) {
        if (startMs <= nowMs && lesson.status === 'COMPLETED') {
          const prev = lastLessonByStudent.get(studentId);
          if (!prev || prev.getTime() < startMs) lastLessonByStudent.set(studentId, startDate);
        }
        if (startMs > nowMs && lesson.status === 'SCHEDULED') {
          const prev = nextLessonByStudent.get(studentId);
          if (!prev || prev.getTime() > startMs) nextLessonByStudent.set(studentId, startDate);
        }
      }
    }

    const horizonMs = nowMs + NO_NEXT_LESSON_HORIZON_DAYS * DAY_MS;

    for (const link of links) {
      const studentId = Number(link.studentId);
      if (!Number.isFinite(studentId)) continue;
      const student = studentById.get(studentId);
      if (!student) continue;
      const name = resolveStudentName(link, student);
      const lastLesson = lastLessonByStudent.get(studentId) ?? null;
      const nextLesson = nextLessonByStudent.get(studentId) ?? null;

      if (
        lastLesson &&
        nowMs - lastLesson.getTime() > INACTIVE_STUDENT_THRESHOLD_DAYS * DAY_MS &&
        (!nextLesson || nextLesson.getTime() > horizonMs)
      ) {
        const ago = formatRelativeRu(lastLesson);
        items.push(
          buildItem({
            id: `student-inactive-${studentId}`,
            kind: 'STUDENT_INACTIVE',
            severity: 'critical',
            tag: 'Вернуть',
            title: `${name} не ходит ${ago}`,
            meta: `Последний урок: ${formatRuShortDate(lastLesson)}`,
            studentId,
            occurredAt: lastLesson,
            actionType: 'open_student',
            actionLabel: 'Связаться',
          }),
        );
        continue;
      }

      if (lastLesson && (!nextLesson || nextLesson.getTime() > horizonMs)) {
        items.push(
          buildItem({
            id: `student-no-next-${studentId}`,
            kind: 'NO_NEXT_LESSON',
            severity: 'warning',
            tag: 'Запланировать',
            title: `У ${name} нет ближайших уроков`,
            meta: `Последний: ${formatRuShortDate(lastLesson)}`,
            studentId,
            occurredAt: lastLesson,
            actionType: 'create_lesson',
            actionLabel: 'Создать',
          }),
        );
      }

      const createdAt = link.createdAt ? new Date(link.createdAt) : null;
      const isActivated = Boolean(student.isActivated);
      if (!isActivated && createdAt && nowMs - createdAt.getTime() > NOT_ACTIVATED_THRESHOLD_DAYS * DAY_MS) {
        const ago = formatRelativeRu(createdAt);
        items.push(
          buildItem({
            id: `student-not-activated-${studentId}`,
            kind: 'STUDENT_NOT_ACTIVATED_LONG',
            severity: 'info',
            tag: 'Активировать',
            title: `${name} не активировал бот`,
            meta: `Добавлен ${ago} назад`,
            studentId,
            occurredAt: createdAt,
            actionType: 'open_student',
            actionLabel: 'Открыть',
          }),
        );
      }
    }

    items.sort((a, b) => {
      const severityDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
    });

    return { items: items.slice(0, MAX_ITEMS) };
  };

  const listHomeworkToReview = async (user: User): Promise<{ items: DashboardHomeworkReviewItem[] }> => {
    const teacher = await ensureTeacher(user);
    const teacherId = teacher.chatId;

    const assignments = await (prisma as any).homeworkAssignment.findMany({
      where: {
        teacherId,
        status: { in: ['SUBMITTED', 'IN_REVIEW'] },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: {
        student: { select: { id: true, username: true } },
        template: { select: { title: true } },
      },
    });

    if (!assignments.length) return { items: [] };

    const studentIds = Array.from(new Set(assignments.map((assignment: any) => Number(assignment.studentId))));
    const links = await prisma.teacherStudent.findMany({
      where: { teacherId, studentId: { in: studentIds } },
    });
    const linkByStudentId = new Map<number, any>(links.map((link: any) => [Number(link.studentId), link]));

    const submissions = await (prisma as any).homeworkSubmission.findMany({
      where: { assignmentId: { in: assignments.map((assignment: any) => assignment.id) } },
      orderBy: [{ assignmentId: 'asc' }, { attemptNo: 'desc' }],
    });
    const latestByAssignment = new Map<number, any>();
    for (const submission of submissions) {
      const id = Number(submission.assignmentId);
      if (!latestByAssignment.has(id)) latestByAssignment.set(id, submission);
    }

    const items: DashboardHomeworkReviewItem[] = assignments
      .map((assignment: any): DashboardHomeworkReviewItem => {
        const studentId = Number(assignment.studentId);
        const link = linkByStudentId.get(studentId);
        const studentName = resolveStudentName(link, assignment.student);
        const submission = latestByAssignment.get(Number(assignment.id));
        const blocks: any[] = Array.isArray(assignment.contentSnapshot) ? assignment.contentSnapshot : [];
        const totalQuestions = blocks.filter(
          (block) =>
            block &&
            typeof block === 'object' &&
            (block.type === 'question' || block.type === 'test' || block.type === 'task'),
        ).length;
        const attachments: any[] = Array.isArray(submission?.attachments) ? submission.attachments : [];
        const voice: any[] = Array.isArray(submission?.voice) ? submission.voice : [];
        const answerText = typeof submission?.answerText === 'string' ? submission.answerText : null;
        return {
          assignmentId: Number(assignment.id),
          studentId,
          studentName,
          templateTitle:
            typeof assignment.template?.title === 'string' && assignment.template.title.trim().length
              ? assignment.template.title
              : null,
          title:
            typeof assignment.title === 'string' && assignment.title.trim().length
              ? assignment.title
              : (assignment.template?.title ?? 'Задание'),
          submittedAt: submission?.submittedAt ? new Date(submission.submittedAt).toISOString() : null,
          attemptNo: submission?.attemptNo ?? null,
          autoScore:
            typeof submission?.autoScore === 'number'
              ? submission.autoScore
              : typeof assignment.autoScore === 'number'
                ? assignment.autoScore
                : null,
          totalQuestions: totalQuestions > 0 ? totalQuestions : null,
          attachmentsCount: attachments.length,
          voiceCount: voice.length,
          hasTextAnswer: Boolean(answerText && answerText.trim().length > 0),
        };
      })
      .sort((a: DashboardHomeworkReviewItem, b: DashboardHomeworkReviewItem) => {
        const aTime = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
        const bTime = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 8);

    return { items };
  };

  return { listActionRequired, listHomeworkToReview };
};

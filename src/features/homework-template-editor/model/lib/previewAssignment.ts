import type { HomeworkAssignment, HomeworkSubmission } from '../../../../entities/types';
import type { HomeworkEditorDraft } from '../types';

const PREVIEW_ASSIGNMENT_ID = -101;
const PREVIEW_TEACHER_ID = -1;
const PREVIEW_SUBMISSION_ID = -201;

const buildNowIso = () => new Date().toISOString();

type BuildPreviewHomeworkAssignmentPayload = {
  draft: HomeworkEditorDraft;
  studentName?: string | null;
  groupTitle?: string | null;
};

export const buildPreviewHomeworkAssignment = ({
  draft,
  studentName,
  groupTitle,
}: BuildPreviewHomeworkAssignmentPayload): HomeworkAssignment => {
  const nowIso = buildNowIso();

  return {
    id: PREVIEW_ASSIGNMENT_ID,
    teacherId: PREVIEW_TEACHER_ID,
    studentId: draft.assignment.studentId ?? -1,
    studentName: studentName ?? 'Ученик',
    lessonId: draft.assignment.lessonId,
    templateId: draft.assignment.sourceTemplateId,
    groupId: draft.assignment.groupId,
    groupTitle: groupTitle ?? null,
    title: draft.title.trim() || 'Домашнее задание без названия',
    status: 'SENT',
    sendMode: draft.assignment.sendMode,
    deadlineAt: draft.assignment.deadlineAt,
    sentAt: nowIso,
    contentSnapshot: draft.blocks,
    overdueReminderCount: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
    score: {},
  };
};

export const createPreviewAttemptSubmission = (assignment: HomeworkAssignment): HomeworkSubmission => {
  const nowIso = buildNowIso();

  return {
    id: PREVIEW_SUBMISSION_ID,
    assignmentId: assignment.id,
    studentId: assignment.studentId,
    attemptNo: 1,
    status: 'DRAFT',
    attachments: [],
    voice: [],
    testAnswers: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    score: {},
  };
};

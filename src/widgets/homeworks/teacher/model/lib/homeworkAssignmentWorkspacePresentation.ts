import { HomeworkAssignment, HomeworkTemplate } from '../../../../../entities/types';
import {
  formatAssignmentStatus,
  resolveAssignmentDeadlineMeta,
  resolveAssignmentResponseMeta,
} from './assignmentPresentation';
import {
  resolveHomeworkLibraryMetrics,
  resolveHomeworkLibraryUpdatedLabel,
  type HomeworkLibraryCategoryTone,
} from './homeworkLibraryPresentation';
import { resolveHomeworkTemplatePreview } from './templatePresentation';

export type HomeworkAssignmentCardBadge = {
  id: string;
  label: string;
  tone: HomeworkLibraryCategoryTone;
};

export type HomeworkDraftScope = 'all' | 'draft' | 'scheduled';

const EMPTY_PREVIEW_LABEL = 'Описание не заполнено';

const buildPreviewTemplate = (assignment: HomeworkAssignment): HomeworkTemplate => ({
  id: assignment.id,
  teacherId: assignment.teacherId,
  title: assignment.title,
  tags: [],
  subject: null,
  level: null,
  blocks: assignment.contentSnapshot,
  isArchived: false,
  createdAt: assignment.createdAt,
  updatedAt: assignment.updatedAt,
});

const resolveStatusTone = (assignment: HomeworkAssignment): HomeworkLibraryCategoryTone => {
  if (assignment.hasConfigError) return 'gray';
  switch (assignment.status) {
    case 'DRAFT':
      return 'indigo';
    case 'SCHEDULED':
      return 'blue';
    case 'SENT':
      return 'green';
    case 'SUBMITTED':
    case 'IN_REVIEW':
      return 'orange';
    case 'RETURNED':
      return 'pink';
    case 'REVIEWED':
      return 'green';
    case 'OVERDUE':
      return 'orange';
    default:
      return 'gray';
  }
};

const resolveDeadlineBadgeTone = (assignment: HomeworkAssignment): HomeworkLibraryCategoryTone => {
  const deadlineMeta = resolveAssignmentDeadlineMeta(assignment);
  if (deadlineMeta.tone === 'danger') return 'orange';
  if (deadlineMeta.tone === 'today') return 'green';
  if (deadlineMeta.primary === 'Без дедлайна') return 'gray';
  return 'blue';
};

export const resolveHomeworkAssignmentCardCategoryTone = (assignment: HomeworkAssignment) =>
  resolveStatusTone(assignment);

export const resolveHomeworkAssignmentCardCategoryLabel = (assignment: HomeworkAssignment) =>
  formatAssignmentStatus(assignment).toUpperCase();

export const resolveHomeworkAssignmentCardDescription = (assignment: HomeworkAssignment) => {
  const preview = resolveHomeworkTemplatePreview(buildPreviewTemplate(assignment));
  if (preview && preview !== EMPTY_PREVIEW_LABEL) {
    return preview;
  }

  // TEA-357: имя ученика уже выводится в badges — не дублируем его в description.
  if (assignment.templateTitle && assignment.templateTitle !== assignment.title) {
    return `Источник: ${assignment.templateTitle}`;
  }

  return EMPTY_PREVIEW_LABEL;
};

export const resolveHomeworkAssignmentCardBadges = (assignment: HomeworkAssignment): HomeworkAssignmentCardBadge[] => {
  const badges: HomeworkAssignmentCardBadge[] = [];
  const studentLabel = assignment.studentName?.trim() || assignment.studentUsername?.trim();
  if (studentLabel) {
    badges.push({ id: 'student', label: studentLabel, tone: 'gray' });
  }

  const deadlineMeta = resolveAssignmentDeadlineMeta(assignment);
  if (deadlineMeta.primary !== 'Без дедлайна') {
    badges.push({
      id: 'deadline',
      label: deadlineMeta.primary,
      tone: resolveDeadlineBadgeTone(assignment),
    });
  } else {
    const responseMeta = resolveAssignmentResponseMeta(assignment);
    if (responseMeta !== 'Нет ответа') {
      badges.push({ id: 'response', label: responseMeta, tone: 'gray' });
    }
  }

  return badges.slice(0, 3);
};

export const resolveHomeworkAssignmentCardMetrics = (assignment: HomeworkAssignment) =>
  resolveHomeworkLibraryMetrics(buildPreviewTemplate(assignment));

export const resolveHomeworkAssignmentCardUpdatedLabel = (assignment: HomeworkAssignment) => {
  const deadlineAt = assignment.deadlineAt;
  if (deadlineAt) {
    const deadlineDate = new Date(deadlineAt);
    if (!Number.isNaN(deadlineDate.getTime())) {
      const formatted = deadlineDate.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: 'short',
      });
      if (assignment.status === 'OVERDUE') {
        return `Просрочено с ${formatted}`;
      }
      return `Дедлайн: ${formatted}`;
    }
  }
  return `Выдано ${resolveHomeworkLibraryUpdatedLabel(assignment.updatedAt).replace(/^Изм\.\s*/u, '')}`;
};

export const resolveHomeworkAssignmentActionLabel = (assignment: HomeworkAssignment) => {
  if (assignment.hasConfigError) return 'Исправить';
  if (assignment.status === 'SUBMITTED' || assignment.status === 'IN_REVIEW') return 'Проверить';
  if (assignment.status === 'DRAFT' || assignment.status === 'SCHEDULED') return 'Выдать';
  return 'Открыть';
};

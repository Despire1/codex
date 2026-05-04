import { format, formatDistanceToNow, isToday, isTomorrow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { HomeworkAssignment, HomeworkTemplate } from '../../../../../entities/types';
import {
  HomeworkLibraryCategoryTone,
  resolveHomeworkLibraryBadges,
  resolveHomeworkLibraryCategoryLabel,
  resolveHomeworkLibraryCategoryTone,
  resolveHomeworkLibraryDescription,
  resolveHomeworkLibraryMetrics,
  resolveHomeworkLibrarySearchText,
  resolveHomeworkLibraryUpdatedLabel,
} from './homeworkLibraryPresentation';
import { formatAssignmentStatus, resolveAssignmentResponseMeta } from './assignmentPresentation';

export type MobileLibraryScope = 'all' | 'active' | 'favorites' | 'archived';
export type MobileLibrarySort = 'updated' | 'title' | 'issued';
export type MobileUrgencyFilter = 'all' | 'overdue' | 'review' | 'closed' | 'progress';

const normalize = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

export const resolveMobileTemplateTopicTone = (template: HomeworkTemplate): HomeworkLibraryCategoryTone =>
  resolveHomeworkLibraryCategoryTone(template);

export const resolveMobileTemplateTopicLabel = (template: HomeworkTemplate) => {
  const label = resolveHomeworkLibraryCategoryLabel(template).trim();
  const normalized = label.toLowerCase();
  if (normalized === 'общее' || normalized === 'general') return null;
  return label;
};

export const resolveMobileTemplateDescription = (template: HomeworkTemplate) => {
  const value = resolveHomeworkLibraryDescription(template);
  return normalize(value) === 'описание не заполнено' ? '' : value;
};

export const resolveMobileTemplateMeta = (template: HomeworkTemplate) => resolveHomeworkLibraryMetrics(template);

export const resolveMobileTemplateUpdatedLabel = (template: HomeworkTemplate) =>
  resolveHomeworkLibraryUpdatedLabel(template.updatedAt);

export const resolveMobileTemplateSecondaryBadges = (template: HomeworkTemplate) =>
  resolveHomeworkLibraryBadges(template).slice(0, 2);

export const resolveMobileTemplateSearchText = (template: HomeworkTemplate) =>
  resolveHomeworkLibrarySearchText(template);

export const resolveMobileTemplateCategory = (template: HomeworkTemplate) =>
  resolveHomeworkLibraryCategoryLabel(template);

export const resolveMobileTemplateCollection = (template: HomeworkTemplate) =>
  resolveHomeworkLibraryBadges(template).find((badge) => badge.id === 'tag')?.label ?? null;

export const resolveDraftChangedLabel = (assignment: HomeworkAssignment) => {
  const date = new Date(assignment.updatedAt);
  if (Number.isNaN(date.getTime())) return 'Изменён недавно';
  // TEA-354: future timestamps (clock skew) → «только что».
  const safeDate = date.getTime() > Date.now() ? new Date() : date;
  if (Date.now() - safeDate.getTime() < 60_000) return 'Изменён только что';
  return `Изменён ${formatDistanceToNow(safeDate, { addSuffix: true, locale: ru })}`;
};

export const resolveDraftSavedLabel = (assignment: HomeworkAssignment) => {
  const date = new Date(assignment.updatedAt);
  if (Number.isNaN(date.getTime())) return 'Сохранено недавно';
  return `Сохранено ${format(date, 'dd.MM, HH:mm')}`;
};

export const resolveAssignedDueLabel = (assignment: HomeworkAssignment) => {
  const source = assignment.deadlineAt ?? assignment.scheduledFor ?? assignment.sentAt ?? assignment.updatedAt;
  const date = source ? new Date(source) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Без срока';
  if (isToday(date)) return `Сегодня, ${format(date, 'HH:mm')}`;
  if (isTomorrow(date)) return `Завтра, ${format(date, 'HH:mm')}`;
  return format(date, 'dd.MM, HH:mm');
};

export const resolveAssignedDueTone = (assignment: HomeworkAssignment) => {
  if (assignment.isOverdue || assignment.status === 'OVERDUE') return 'danger' as const;
  const source = assignment.deadlineAt ?? assignment.scheduledFor ?? assignment.sentAt ?? assignment.updatedAt;
  const date = source ? new Date(source) : null;
  if (!date || Number.isNaN(date.getTime())) return 'default' as const;
  if (isToday(date)) return 'warning' as const;
  return 'default' as const;
};

export const resolveAssignedStatusLabel = (assignment: HomeworkAssignment) => {
  if (assignment.hasConfigError) return 'Ошибка';
  if (assignment.status === 'RETURNED') return 'На доработке';
  return formatAssignmentStatus(assignment);
};

export const resolveAssignedSubmissionLabel = (assignment: HomeworkAssignment) =>
  resolveAssignmentResponseMeta(assignment) || 'Нет ответа';

export const isAssignmentDueToday = (assignment: HomeworkAssignment) => {
  const value = assignment.deadlineAt ?? assignment.scheduledFor;
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return isToday(date);
};

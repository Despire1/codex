import { HomeworkTemplate } from '../../../types';

export const getHomeworkTemplateIssuedAssignmentsCount = (template: HomeworkTemplate | null | undefined) =>
  Number.isFinite(Number(template?.issuedAssignmentsCount)) ? Number(template?.issuedAssignmentsCount) : 0;

export const canTeacherEditHomeworkTemplate = (template: HomeworkTemplate | null | undefined) => {
  if (!template) return false;
  if (typeof template.canTeacherEdit === 'boolean') return template.canTeacherEdit;
  return getHomeworkTemplateIssuedAssignmentsCount(template) === 0;
};

export const canTeacherDeleteHomeworkTemplate = (template: HomeworkTemplate | null | undefined) => {
  if (!template) return false;
  if (typeof template.canTeacherDelete === 'boolean') return template.canTeacherDelete;
  return canTeacherEditHomeworkTemplate(template);
};

export const hasIssuedHomeworkTemplateAssignments = (template: HomeworkTemplate | null | undefined) =>
  getHomeworkTemplateIssuedAssignmentsCount(template) > 0;

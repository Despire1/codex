import { HomeworkBlock, HomeworkSendMode } from '../../../entities/types';

export type HomeworkEditorTaskType = 'TEST' | 'WRITTEN' | 'ORAL' | 'FILE' | 'COMBO' | 'EXTERNAL';

export type HomeworkTemplateEditorDraft = {
  title: string;
  tagsText: string;
  subject: string;
  level: string;
  selectedType: HomeworkEditorTaskType;
  blocks: HomeworkBlock[];
};

export type HomeworkEditorTemplateContext = {
  tagsText: string;
  subject: string;
  level: string;
  selectedType: HomeworkEditorTaskType;
};

export type HomeworkEditorAssignmentContext = {
  studentId: number | null;
  lessonId: number | null;
  groupId: number | null;
  deadlineAt: string | null;
  sendMode: HomeworkSendMode;
  sourceTemplateId: number | null;
};

export type HomeworkEditorDraft = {
  title: string;
  blocks: HomeworkBlock[];
  assignment: HomeworkEditorAssignmentContext;
  template: HomeworkEditorTemplateContext;
};

export type HomeworkEditorVariant = 'template' | 'assignment';

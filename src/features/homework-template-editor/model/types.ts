import { HomeworkBlock } from '../../../entities/types';

export type HomeworkTemplateEditorMode = 'create' | 'edit';

export type HomeworkTemplateEditorDraft = {
  title: string;
  tagsText: string;
  subject: string;
  level: string;
  blocks: HomeworkBlock[];
};

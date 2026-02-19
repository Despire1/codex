import { HomeworkBlock } from '../../../entities/types';

export type HomeworkTemplateEditorDraft = {
  title: string;
  tagsText: string;
  subject: string;
  level: string;
  blocks: HomeworkBlock[];
};

import { HomeworkBlock } from '../../../entities/types';
import { validateTemplateDraft } from '../../../features/homework-template-editor/model/lib/templateValidation';
import { FormValidationIssue } from '../../../shared/lib/form-validation/types';

export interface HomeworkTemplateValidationResult {
  issues: FormValidationIssue[];
  errorIssues: FormValidationIssue[];
}

export const validateHomeworkTemplatePayload = (input: {
  title: string;
  blocks: HomeworkBlock[];
}): HomeworkTemplateValidationResult => {
  const result = validateTemplateDraft({
    title: input.title,
    blocks: input.blocks,
  });

  const errorIssues = result.issues.filter((issue) => issue.severity === 'error');

  return {
    issues: result.issues,
    errorIssues,
  };
};

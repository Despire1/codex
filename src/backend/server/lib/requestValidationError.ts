import { FormValidationIssue } from '../../../shared/lib/form-validation/types';

export class RequestValidationError extends Error {
  statusCode: number;
  issues: FormValidationIssue[];

  constructor(message: string, issues: FormValidationIssue[]) {
    super(message);
    this.name = 'RequestValidationError';
    this.statusCode = 400;
    this.issues = issues;
  }
}

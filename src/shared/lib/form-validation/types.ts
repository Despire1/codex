export type FormValidationPath = Array<string | number>;

export type FormValidationSeverity = 'error' | 'warning';

export interface FormValidationIssue {
  path: FormValidationPath;
  code: string;
  message: string;
  severity: FormValidationSeverity;
}

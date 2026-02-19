import { FormValidationIssue, FormValidationPath, FormValidationSeverity } from './types';

const toSegment = (segment: string | number) =>
  typeof segment === 'number' ? `[${segment}]` : segment.replace(/\./g, '\\.');

const parseSegment = (segment: string) => {
  if (/^\[\d+\]$/.test(segment)) {
    return Number(segment.slice(1, -1));
  }
  return segment.replace(/\\\./g, '.');
};

export const pathToKey = (path: FormValidationPath): string => {
  if (path.length === 0) return '';
  return path.map((segment, index) => {
    const serialized = toSegment(segment);
    if (serialized.startsWith('[') || index === 0) return serialized;
    return `.${serialized}`;
  }).join('');
};

export const keyToPath = (key: string): FormValidationPath => {
  if (!key.trim()) return [];
  const segments = key.match(/(\[[0-9]+\]|[^.[\]]+)/g) ?? [];
  return segments.map(parseSegment);
};

export const pathsEqual = (left: FormValidationPath, right: FormValidationPath) =>
  left.length === right.length && left.every((segment, index) => segment === right[index]);

export const isPathPrefix = (path: FormValidationPath, prefix: FormValidationPath) =>
  prefix.length <= path.length && prefix.every((segment, index) => segment === path[index]);

export const findIssueByPath = (
  issues: FormValidationIssue[],
  path: FormValidationPath,
  severity: FormValidationSeverity = 'error',
): FormValidationIssue | null => {
  return (
    issues.find((issue) => issue.severity === severity && pathsEqual(issue.path, path)) ?? null
  );
};

export const filterIssuesBySeverity = (
  issues: FormValidationIssue[],
  severity: FormValidationSeverity,
): FormValidationIssue[] => issues.filter((issue) => issue.severity === severity);

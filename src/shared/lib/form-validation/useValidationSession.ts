import { useCallback, useMemo, useState } from 'react';
import {
  filterIssuesBySeverity,
  findIssueByPath,
  isPathPrefix,
} from './path';
import { FormValidationIssue, FormValidationPath } from './types';

export interface ValidationSessionState {
  submitAttempted: boolean;
  hasVisibleErrors: boolean;
  visibleIssues: FormValidationIssue[];
  visibleErrorIssues: FormValidationIssue[];
  firstVisibleError: FormValidationIssue | null;
  markSubmitAttempt: () => void;
  clearIssueAtPath: (path: FormValidationPath) => void;
  getIssueForPath: (path: FormValidationPath) => FormValidationIssue | null;
  resetValidationSession: () => void;
}

export const useValidationSession = (issues: FormValidationIssue[]): ValidationSessionState => {
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [dismissedPaths, setDismissedPaths] = useState<FormValidationPath[]>([]);

  const visibleIssues = useMemo(() => {
    if (!submitAttempted) return [];
    if (dismissedPaths.length === 0) return issues;
    return issues.filter((issue) => !dismissedPaths.some((dismissedPath) => isPathPrefix(issue.path, dismissedPath)));
  }, [dismissedPaths, issues, submitAttempted]);

  const visibleErrorIssues = useMemo(
    () => filterIssuesBySeverity(visibleIssues, 'error'),
    [visibleIssues],
  );

  const clearIssueAtPath = useCallback((path: FormValidationPath) => {
    setDismissedPaths((previous) => {
      if (previous.some((dismissedPath) => dismissedPath.length === path.length && dismissedPath.every((value, index) => value === path[index]))) {
        return previous;
      }
      return [...previous, path];
    });
  }, []);

  const getIssueForPath = useCallback(
    (path: FormValidationPath) => findIssueByPath(visibleIssues, path, 'error'),
    [visibleIssues],
  );

  const markSubmitAttempt = useCallback(() => {
    setSubmitAttempted(true);
    setDismissedPaths([]);
  }, []);

  const resetValidationSession = useCallback(() => {
    setSubmitAttempted(false);
    setDismissedPaths([]);
  }, []);

  return {
    submitAttempted,
    hasVisibleErrors: visibleErrorIssues.length > 0,
    visibleIssues,
    visibleErrorIssues,
    firstVisibleError: visibleErrorIssues[0] ?? null,
    markSubmitAttempt,
    clearIssueAtPath,
    getIssueForPath,
    resetValidationSession,
  };
};

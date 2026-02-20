import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type UnsavedChangesEntry = {
  isDirty: boolean;
  onSave: () => Promise<boolean>;
  onDiscard?: () => void;
  message?: string;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  cancelKeepsEditing?: boolean;
  onSaveErrorMessage?: string;
};

export type ActiveUnsavedEntry = {
  key: string;
  entry: UnsavedChangesEntry;
};

type UnsavedChangesContextValue = {
  hasUnsavedChanges: boolean;
  setEntry: (key: string, entry: UnsavedChangesEntry) => void;
  clearEntry: (key: string) => void;
  getActiveEntry: () => ActiveUnsavedEntry | null;
};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

export const UnsavedChangesProvider = ({ children }: PropsWithChildren) => {
  const [entries, setEntries] = useState<Record<string, UnsavedChangesEntry>>({});

  const setEntry = useCallback((key: string, entry: UnsavedChangesEntry) => {
    setEntries((prev) => ({ ...prev, [key]: entry }));
  }, []);

  const clearEntry = useCallback((key: string) => {
    setEntries((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const getActiveEntry = useCallback((): ActiveUnsavedEntry | null => {
    const found = Object.entries(entries).find(([, entry]) => entry.isDirty);
    if (!found) return null;
    const [key, entry] = found;
    return { key, entry };
  }, [entries]);

  const hasUnsavedChanges = useMemo(() => Object.values(entries).some((entry) => entry.isDirty), [entries]);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const value = useMemo<UnsavedChangesContextValue>(
    () => ({ hasUnsavedChanges, setEntry, clearEntry, getActiveEntry }),
    [clearEntry, getActiveEntry, hasUnsavedChanges, setEntry],
  );

  return <UnsavedChangesContext.Provider value={value}>{children}</UnsavedChangesContext.Provider>;
};

export const useUnsavedChanges = () => {
  const context = useContext(UnsavedChangesContext);
  if (!context) {
    throw new Error('useUnsavedChanges must be used within an UnsavedChangesProvider');
  }
  return context;
};

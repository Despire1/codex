import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScheduleNote, ScheduleNoteType } from '../../../entities/types';
import { api } from '../../../shared/api/client';
import { normalizeScheduleNote } from '../../../shared/lib/normalizers';

type ScheduleNotesRange = {
  key: string;
  startKey: string;
  endKey: string;
};

const WEEK_STARTS_ON = 1;

const sortScheduleNotes = (items: ScheduleNote[]) =>
  [...items].sort((left, right) => {
    if (left.dateKey !== right.dateKey) {
      return left.dateKey.localeCompare(right.dateKey);
    }
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });

const rangeIncludesDateKey = (range: ScheduleNotesRange, dateKey: string) =>
  dateKey >= range.startKey && dateKey <= range.endKey;

const parseRangeKey = (key: string): ScheduleNotesRange | null => {
  const [startKey, endKey] = key.split('_');
  if (!startKey || !endKey) return null;
  return { key, startKey, endKey };
};

export const useScheduleNotesRangeInternal = (monthDate: Date) => {
  const [notes, setNotes] = useState<ScheduleNote[]>([]);
  const [notesByRange, setNotesByRange] = useState<Record<string, ScheduleNote[]>>({});
  const [loading, setLoading] = useState(false);
  const notesRef = useRef(notes);
  const notesByRangeRef = useRef(notesByRange);
  const currentRangeRef = useRef<ScheduleNotesRange | null>(null);
  const requestIdRef = useRef(0);
  const tempIdRef = useRef(-1);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    notesByRangeRef.current = notesByRange;
  }, [notesByRange]);

  const buildMonthRange = useCallback((targetMonth: Date): ScheduleNotesRange => {
    const monthStart = startOfWeek(startOfMonth(targetMonth), { weekStartsOn: WEEK_STARTS_ON as 0 | 1 });
    const monthEnd = endOfWeek(endOfMonth(targetMonth), { weekStartsOn: WEEK_STARTS_ON as 0 | 1 });
    const startKey = format(monthStart, 'yyyy-MM-dd');
    const endKey = format(monthEnd, 'yyyy-MM-dd');
    return {
      key: `${startKey}_${endKey}`,
      startKey,
      endKey,
    };
  }, []);

  const currentMonthRange = useMemo(() => buildMonthRange(monthDate), [buildMonthRange, monthDate]);

  const syncCurrentNotes = useCallback((cache: Record<string, ScheduleNote[]>) => {
    const currentRange = currentRangeRef.current;
    if (!currentRange) return;
    setNotes(cache[currentRange.key] ?? []);
  }, []);

  const commitCache = useCallback(
    (nextCache: Record<string, ScheduleNote[]>) => {
      notesByRangeRef.current = nextCache;
      setNotesByRange(nextCache);
      syncCurrentNotes(nextCache);
    },
    [syncCurrentNotes],
  );

  const loadNotesForRange = useCallback(
    async (range: ScheduleNotesRange) => {
      currentRangeRef.current = range;
      const cached = notesByRangeRef.current[range.key];
      if (cached) {
        setNotes(cached);
        return;
      }

      setLoading(true);
      const requestId = (requestIdRef.current += 1);

      try {
        const response = await api.listScheduleNotes({ start: range.startKey, end: range.endKey });
        const normalized = sortScheduleNotes((response.notes ?? []).map(normalizeScheduleNote));
        const nextCache = {
          ...notesByRangeRef.current,
          [range.key]: normalized,
        };

        notesByRangeRef.current = nextCache;
        setNotesByRange(nextCache);
        if (requestIdRef.current === requestId) {
          setNotes(normalized);
        }
      } finally {
        if (requestIdRef.current === requestId) {
          setLoading(false);
        }
      }
    },
    [],
  );

  const applyToCachedRanges = useCallback(
    (updater: (items: ScheduleNote[], range: ScheduleNotesRange) => ScheduleNote[]) => {
      const nextCache: Record<string, ScheduleNote[]> = {};
      const currentCache = notesByRangeRef.current;

      Object.entries(currentCache).forEach(([key, items]) => {
        const range = parseRangeKey(key);
        nextCache[key] = range ? sortScheduleNotes(updater(items, range)) : sortScheduleNotes(items);
      });

      const currentRange = currentRangeRef.current;
      if (currentRange && !nextCache[currentRange.key]) {
        nextCache[currentRange.key] = sortScheduleNotes(updater(notesRef.current, currentRange));
      }

      return nextCache;
    },
    [],
  );

  const createNote = useCallback(
    async (payload: { dateKey: string; noteType: ScheduleNoteType; content: string }) => {
      const { dateKey, noteType, content } = payload;
      const trimmedContent = content.trim();
      if (!trimmedContent) return;

      const nowIso = new Date().toISOString();
      const optimisticNote: ScheduleNote = {
        id: tempIdRef.current--,
        teacherId: 0,
        dateKey,
        noteType,
        content: trimmedContent,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const previousCache = notesByRangeRef.current;
      const previousNotes = notesRef.current;
      commitCache(
        applyToCachedRanges((items, range) =>
          rangeIncludesDateKey(range, optimisticNote.dateKey) ? [...items, optimisticNote] : items,
        ),
      );

      try {
        const response = await api.createScheduleNote({ dateKey, noteType, content: trimmedContent });
        const saved = normalizeScheduleNote(response.note);
        commitCache(
          applyToCachedRanges((items, range) => {
            const filtered = items.filter((item) => item.id !== optimisticNote.id);
            return rangeIncludesDateKey(range, saved.dateKey) ? [...filtered, saved] : filtered;
          }),
        );
      } catch (error) {
        notesByRangeRef.current = previousCache;
        setNotesByRange(previousCache);
        setNotes(previousNotes);
        throw error;
      }
    },
    [applyToCachedRanges, commitCache],
  );

  const updateNote = useCallback(
    async (noteId: number, payload: { noteType: ScheduleNoteType; content: string }) => {
      const { noteType, content } = payload;
      const trimmedContent = content.trim();
      if (!trimmedContent) return;

      const existingNote = notesRef.current.find((item) => item.id === noteId);
      if (!existingNote) return;

      const previousCache = notesByRangeRef.current;
      const previousNotes = notesRef.current;
      const optimisticNote: ScheduleNote = {
        ...existingNote,
        noteType,
        content: trimmedContent,
        updatedAt: new Date().toISOString(),
      };

      commitCache(
        applyToCachedRanges((items) => items.map((item) => (item.id === noteId ? optimisticNote : item))),
      );

      try {
        const response = await api.updateScheduleNote(noteId, { noteType, content: trimmedContent });
        const saved = normalizeScheduleNote(response.note);
        commitCache(
          applyToCachedRanges((items) => items.map((item) => (item.id === noteId ? saved : item))),
        );
      } catch (error) {
        notesByRangeRef.current = previousCache;
        setNotesByRange(previousCache);
        setNotes(previousNotes);
        throw error;
      }
    },
    [applyToCachedRanges, commitCache],
  );

  const deleteNote = useCallback(
    async (noteId: number) => {
      const previousCache = notesByRangeRef.current;
      const previousNotes = notesRef.current;

      commitCache(
        applyToCachedRanges((items) => items.filter((item) => item.id !== noteId)),
      );

      try {
        await api.deleteScheduleNote(noteId);
      } catch (error) {
        notesByRangeRef.current = previousCache;
        setNotesByRange(previousCache);
        setNotes(previousNotes);
        throw error;
      }
    },
    [applyToCachedRanges, commitCache],
  );

  const notesCountByDay = useMemo(
    () =>
      notes.reduce<Record<string, number>>((acc, note) => {
        acc[note.dateKey] = (acc[note.dateKey] ?? 0) + 1;
        return acc;
      }, {}),
    [notes],
  );

  const getNotesForDay = useCallback(
    (dateKey: string | null) => (dateKey ? notes.filter((note) => note.dateKey === dateKey) : []),
    [notes],
  );

  return {
    loading,
    currentMonthRange,
    notesCountByDay,
    loadNotesForRange,
    getNotesForDay,
    createNote,
    updateNote,
    deleteNote,
  };
};

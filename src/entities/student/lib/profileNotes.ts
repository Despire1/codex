import { ScheduleNoteType } from '../../types';

const STUDENT_PROFILE_NOTES_MARKER = '__TB_STUDENT_PROFILE_NOTES_V1__:';

type PersistedStudentProfileNote = {
  id?: string | null;
  content?: string | null;
  noteType?: ScheduleNoteType | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type PersistedStudentProfileNotesPayload = {
  version: 1;
  primaryNote?: {
    content?: string | null;
    noteType?: ScheduleNoteType | null;
  } | null;
  entries?: PersistedStudentProfileNote[] | null;
};

export type StudentProfileNote = {
  id: string;
  content: string;
  noteType: ScheduleNoteType;
  createdAt: string | null;
  updatedAt: string | null;
  source: 'primary' | 'entry';
};

type ParsedStudentProfileNotes = {
  primaryText: string;
  primaryType: ScheduleNoteType;
  entries: StudentProfileNote[];
};

const normalizeNoteType = (value: unknown, fallback: ScheduleNoteType = 'INFO'): ScheduleNoteType =>
  value === 'IMPORTANT' || value === 'INFO' ? value : fallback;

const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const normalizeTimestamp = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const createNoteId = () => `student-note-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

type StudentProfileEntryNote = Omit<StudentProfileNote, 'source'> & { source: 'entry' };

const serializeStudentProfileNotes = (payload: ParsedStudentProfileNotes) => {
  const primaryText = payload.primaryText.trim();
  const entries = payload.entries.map((note) => ({
    id: note.id,
    content: note.content.trim(),
    noteType: note.noteType,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }));

  if (entries.length === 0 && payload.primaryType === 'INFO') {
    return primaryText;
  }

  const nextPayload: PersistedStudentProfileNotesPayload = {
    version: 1,
    primaryNote: primaryText
      ? {
          content: primaryText,
          noteType: payload.primaryType,
        }
      : null,
    entries,
  };

  return `${STUDENT_PROFILE_NOTES_MARKER}${JSON.stringify(nextPayload)}`;
};

const parseStructuredPayload = (raw: string): ParsedStudentProfileNotes | null => {
  if (!raw.startsWith(STUDENT_PROFILE_NOTES_MARKER)) {
    return null;
  }

  try {
    const payload = JSON.parse(raw.slice(STUDENT_PROFILE_NOTES_MARKER.length)) as PersistedStudentProfileNotesPayload;
    const primaryText = normalizeText(payload.primaryNote?.content);
    const primaryType = normalizeNoteType(payload.primaryNote?.noteType, 'INFO');
    const entries = Array.isArray(payload.entries)
      ? payload.entries
          .map((entry): StudentProfileEntryNote | null => {
            const content = normalizeText(entry.content);
            if (!content) return null;
            return {
              id: normalizeText(entry.id) || createNoteId(),
              content,
              noteType: normalizeNoteType(entry.noteType, 'IMPORTANT'),
              createdAt: normalizeTimestamp(entry.createdAt),
              updatedAt: normalizeTimestamp(entry.updatedAt),
              source: 'entry',
            };
          })
          .filter((entry): entry is StudentProfileEntryNote => Boolean(entry))
      : [];

    return {
      primaryText,
      primaryType,
      entries,
    };
  } catch (_error) {
    return null;
  }
};

const parseStudentProfileNotes = (rawNotes: string | null | undefined): ParsedStudentProfileNotes => {
  const normalizedRaw = typeof rawNotes === 'string' ? rawNotes.trim() : '';
  if (!normalizedRaw) {
    return {
      primaryText: '',
      primaryType: 'INFO',
      entries: [],
    };
  }

  const structured = parseStructuredPayload(normalizedRaw);
  if (structured) {
    return structured;
  }

  return {
    primaryText: normalizedRaw,
    primaryType: 'INFO',
    entries: [],
  };
};

export const getStudentProfileNoteItems = (rawNotes: string | null | undefined): StudentProfileNote[] => {
  const parsed = parseStudentProfileNotes(rawNotes);
  const primaryNote: StudentProfileNote[] = parsed.primaryText
    ? [
        {
          id: 'primary',
          content: parsed.primaryText,
          noteType: parsed.primaryType,
          createdAt: null,
          updatedAt: null,
          source: 'primary' as const,
        },
      ]
    : [];

  return [...primaryNote, ...parsed.entries].sort((left, right) => {
    const priorityDiff =
      (left.noteType === 'IMPORTANT' ? 0 : 1) - (right.noteType === 'IMPORTANT' ? 0 : 1);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    if (left.source !== right.source) {
      return left.source === 'primary' ? -1 : 1;
    }

    const leftTimestamp = new Date(left.updatedAt ?? left.createdAt ?? 0).getTime();
    const rightTimestamp = new Date(right.updatedAt ?? right.createdAt ?? 0).getTime();
    return rightTimestamp - leftTimestamp;
  });
};

export const getStudentPrimaryNoteText = (rawNotes: string | null | undefined) =>
  parseStudentProfileNotes(rawNotes).primaryText;

export const replaceStudentPrimaryNote = (
  rawNotes: string | null | undefined,
  payload: { content: string; noteType?: ScheduleNoteType },
) => {
  const parsed = parseStudentProfileNotes(rawNotes);
  parsed.primaryText = payload.content.trim();
  parsed.primaryType = normalizeNoteType(payload.noteType, parsed.primaryType);
  return serializeStudentProfileNotes(parsed);
};

export const appendStudentProfileNote = (
  rawNotes: string | null | undefined,
  payload: { content: string; noteType: ScheduleNoteType; createdAt?: string },
) => {
  const parsed = parseStudentProfileNotes(rawNotes);
  const timestamp = normalizeTimestamp(payload.createdAt) ?? new Date().toISOString();
  parsed.entries = [
    {
      id: createNoteId(),
      content: payload.content.trim(),
      noteType: payload.noteType,
      createdAt: timestamp,
      updatedAt: timestamp,
      source: 'entry',
    },
    ...parsed.entries,
  ];
  return serializeStudentProfileNotes(parsed);
};

export const updateStudentProfileNote = (
  rawNotes: string | null | undefined,
  noteId: string,
  payload: { content: string; noteType: ScheduleNoteType },
) => {
  if (noteId === 'primary') {
    return replaceStudentPrimaryNote(rawNotes, payload);
  }

  const parsed = parseStudentProfileNotes(rawNotes);
  parsed.entries = parsed.entries.map((note) =>
    note.id === noteId
      ? {
          ...note,
          content: payload.content.trim(),
          noteType: payload.noteType,
          updatedAt: new Date().toISOString(),
        }
      : note,
  );
  return serializeStudentProfileNotes(parsed);
};

export const deleteStudentProfileNote = (rawNotes: string | null | undefined, noteId: string) => {
  const parsed = parseStudentProfileNotes(rawNotes);
  if (noteId === 'primary') {
    parsed.primaryText = '';
    return serializeStudentProfileNotes(parsed);
  }

  parsed.entries = parsed.entries.filter((note) => note.id !== noteId);
  return serializeStudentProfileNotes(parsed);
};

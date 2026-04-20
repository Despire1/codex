import { format } from 'date-fns';
import type { User } from '@prisma/client';

const SCHEDULE_NOTE_DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SCHEDULE_NOTE_MAX_LENGTH = 4000;

type ScheduleNoteTypeValue = 'IMPORTANT' | 'INFO';

type ScheduleNotesDependencies = {
  prisma: any;
  ensureTeacher: (user: User) => Promise<{ chatId: bigint }>;
};

const normalizeScheduleNoteDateKey = (value: unknown) => {
  if (typeof value !== 'string') {
    throw new Error('Укажите дату заметки.');
  }

  const normalized = value.trim();
  if (!SCHEDULE_NOTE_DATE_KEY_RE.test(normalized)) {
    throw new Error('Дата заметки должна быть в формате YYYY-MM-DD.');
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || format(parsed, 'yyyy-MM-dd') !== normalized) {
    throw new Error('Укажите корректную дату заметки.');
  }

  return normalized;
};

const normalizeScheduleNoteContent = (value: unknown) => {
  if (typeof value !== 'string') {
    throw new Error('Текст заметки обязателен.');
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new Error('Текст заметки не может быть пустым.');
  }

  if (normalized.length > SCHEDULE_NOTE_MAX_LENGTH) {
    throw new Error(`Заметка не должна превышать ${SCHEDULE_NOTE_MAX_LENGTH} символов.`);
  }

  return normalized;
};

const normalizeScheduleNoteType = (
  value: unknown,
  fallback: ScheduleNoteTypeValue = 'IMPORTANT',
): ScheduleNoteTypeValue => {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value !== 'string') {
    throw new Error('Укажите тип заметки.');
  }

  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    return fallback;
  }

  if (normalized === 'IMPORTANT' || normalized === 'INFO') {
    return normalized;
  }

  throw new Error('Тип заметки должен быть IMPORTANT или INFO.');
};

const serializeScheduleNote = (note: any) => ({
  id: Number(note.id),
  teacherId: Number(note.teacherId),
  dateKey: note.dateKey,
  noteType: normalizeScheduleNoteType(note.noteType),
  content: note.content,
  createdAt:
    typeof note.createdAt === 'string' ? note.createdAt : new Date(note.createdAt).toISOString(),
  updatedAt:
    typeof note.updatedAt === 'string' ? note.updatedAt : new Date(note.updatedAt).toISOString(),
});

const createNotFoundError = (message: string) => {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = 404;
  return error;
};

export const createScheduleNotesService = ({ prisma, ensureTeacher }: ScheduleNotesDependencies) => {
  const listScheduleNotes = async (
    user: User,
    params: {
      start?: string | null;
      end?: string | null;
    },
  ) => {
    const teacher = await ensureTeacher(user);
    const where: Record<string, unknown> = { teacherId: teacher.chatId };
    const startKey = params.start ? normalizeScheduleNoteDateKey(params.start) : null;
    const endKey = params.end ? normalizeScheduleNoteDateKey(params.end) : null;

    if (startKey || endKey) {
      where.dateKey = {};
      if (startKey) {
        (where.dateKey as Record<string, string>).gte = startKey;
      }
      if (endKey) {
        (where.dateKey as Record<string, string>).lte = endKey;
      }
    }

    const notes = await (prisma as any).scheduleNote.findMany({
      where,
      orderBy: [{ dateKey: 'asc' }, { updatedAt: 'desc' }],
    });

    return {
      notes: notes.map(serializeScheduleNote),
    };
  };

  const createScheduleNote = async (user: User, body: Record<string, unknown>) => {
    const teacher = await ensureTeacher(user);
    const dateKey = normalizeScheduleNoteDateKey(body.dateKey);
    const noteType = normalizeScheduleNoteType(body.noteType);
    const content = normalizeScheduleNoteContent(body.content);

    const note = await (prisma as any).scheduleNote.create({
      data: {
        teacherId: teacher.chatId,
        dateKey,
        noteType,
        content,
      },
    });

    return { note: serializeScheduleNote(note) };
  };

  const updateScheduleNote = async (user: User, noteId: number, body: Record<string, unknown>) => {
    const teacher = await ensureTeacher(user);
    const existing = await (prisma as any).scheduleNote.findUnique({
      where: { id: noteId },
    });

    if (!existing || existing.teacherId !== teacher.chatId) {
      throw createNotFoundError('Заметка не найдена.');
    }

    const noteType = normalizeScheduleNoteType(body.noteType, normalizeScheduleNoteType(existing.noteType));
    const content = normalizeScheduleNoteContent(body.content);

    const updated = await (prisma as any).scheduleNote.update({
      where: { id: noteId },
      data: { noteType, content },
    });

    return { note: serializeScheduleNote(updated) };
  };

  const deleteScheduleNote = async (user: User, noteId: number) => {
    const teacher = await ensureTeacher(user);
    const existing = await (prisma as any).scheduleNote.findUnique({
      where: { id: noteId },
    });

    if (!existing || existing.teacherId !== teacher.chatId) {
      throw createNotFoundError('Заметка не найдена.');
    }

    await (prisma as any).scheduleNote.delete({
      where: { id: noteId },
    });

    return { deletedId: noteId };
  };

  return {
    listScheduleNotes,
    createScheduleNote,
    updateScheduleNote,
    deleteScheduleNote,
  };
};

/**
 * Бэкенд для расписания v2: новые поля у урока (тема, формат, заметки, план, материалы)
 * и сервис, который их парсит/сохраняет. Эндпоинты живут под /api/v2/schedule/*,
 * чтобы не пересекаться со старым `tryHandleLessonRoutes`.
 *
 * Принцип хранения plan-items: на серии (`LessonSeries.planItems`) лежит «дефолтный план»;
 * у конкретного урока (`Lesson.planItemsOverride`) — null = наследовать, "[]" = осознанно
 * пустой, иначе свой массив. На клиент отдаётся уже computed `planItems` + `planSource`.
 */
import type { User } from '@prisma/client';
import crypto from 'node:crypto';
import type { LessonFormat, LessonPlanItem } from '../../../entities/types';
import { FILE_LIMITS, FILE_LIMIT_MESSAGES } from '../../../shared/config/fileLimits';
import { UploadLimitError } from './fileLimits';

type ScheduleV2Dependencies = {
  prisma: any;
  ensureTeacher: (user: User) => Promise<{ chatId: bigint }>;
};

const ALLOWED_FORMATS: LessonFormat[] = [
  'ONLINE_ZOOM',
  'ONLINE_SKYPE',
  'ONLINE_MEET',
  'IN_PERSON_STUDENT',
  'IN_PERSON_OFFICE',
  'OTHER',
];

const isLessonFormat = (value: unknown): value is LessonFormat =>
  typeof value === 'string' && (ALLOWED_FORMATS as string[]).includes(value);

const isPlanItem = (value: unknown): value is LessonPlanItem => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.text === 'string' && typeof v.completed === 'boolean';
};

const parsePlanJson = (raw: string | null | undefined): LessonPlanItem[] | null => {
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPlanItem);
  } catch {
    return [];
  }
};

const stringifyPlan = (items: LessonPlanItem[]) => JSON.stringify(items);

const sanitizePlanItem = (input: unknown, fallbackId?: string): LessonPlanItem | null => {
  if (typeof input !== 'object' || input === null) return null;
  const v = input as Record<string, unknown>;
  const text = typeof v.text === 'string' ? v.text.trim() : '';
  if (!text) return null;
  const id = typeof v.id === 'string' && v.id.trim().length > 0 ? v.id.trim() : (fallbackId ?? crypto.randomUUID());
  return {
    id,
    text: text.slice(0, 500),
    completed: Boolean(v.completed),
  };
};

const sanitizePlanArray = (input: unknown): LessonPlanItem[] => {
  if (!Array.isArray(input)) return [];
  const out: LessonPlanItem[] = [];
  input.forEach((item) => {
    const sanitized = sanitizePlanItem(item);
    if (sanitized) out.push(sanitized);
  });
  return out;
};

export const createScheduleV2Service = ({ prisma, ensureTeacher }: ScheduleV2Dependencies) => {
  const computePlan = (overrideRaw: string | null | undefined, seriesPlanRaw: string | null | undefined) => {
    if (overrideRaw != null) {
      // override присутствует — он диктует план (даже пустой)
      return {
        planItems: parsePlanJson(overrideRaw) ?? [],
        planSource: 'override' as const,
      };
    }
    return {
      planItems: parsePlanJson(seriesPlanRaw) ?? [],
      planSource: 'series' as const,
    };
  };

  const lessonV2ToDto = (lessonRecord: any) => {
    const overrideRaw = lessonRecord?.planItemsOverride ?? null;
    const seriesPlanRaw = lessonRecord?.series?.planItems ?? null;
    const { planItems, planSource } = computePlan(overrideRaw, seriesPlanRaw);
    const attachments = Array.isArray(lessonRecord?.attachments)
      ? lessonRecord.attachments.map((a: any) => ({
          id: a.id,
          fileName: a.fileName,
          url: a.url,
          size: a.size,
          fileObjectId: a.fileObjectId ?? null,
        }))
      : [];
    const seriesAttachmentsRaw = lessonRecord?.series?.attachments;
    const seriesAttachments = Array.isArray(seriesAttachmentsRaw)
      ? seriesAttachmentsRaw.map((a: any) => ({
          id: a.id,
          fileName: a.fileName,
          size: a.size,
          fileObjectId: a.fileObjectId,
          url: a.fileObject?.storageKey ? `/api/v2/files/object/${a.fileObject.storageKey}` : null,
        }))
      : [];
    return {
      id: lessonRecord.id,
      topic: lessonRecord.topic ?? null,
      format: isLessonFormat(lessonRecord.format) ? lessonRecord.format : null,
      notes: lessonRecord.notes ?? null,
      planItems,
      planSource,
      planItemsOverride: parsePlanJson(overrideRaw),
      seriesPlanItems: lessonRecord.seriesId ? (parsePlanJson(seriesPlanRaw) ?? []) : null,
      attachments,
      seriesAttachments,
      seriesId: lessonRecord.seriesId ?? null,
    };
  };

  /**
   * GET /api/v2/schedule/lessons/:id — полная инфа об уроке для drawer.
   * Включает attachments и computed plan (override либо series).
   */
  const getLessonV2 = async (user: User, lessonId: number) => {
    const teacher = await ensureTeacher(user);
    const lesson = await prisma.lesson.findFirst({
      where: { id: lessonId, teacherId: teacher.chatId },
      include: {
        attachments: { orderBy: { createdAt: 'asc' } },
        series: {
          include: {
            attachments: {
              orderBy: { createdAt: 'asc' },
              include: { fileObject: true },
            },
          },
        },
      },
    });
    if (!lesson) {
      const err: any = new Error('lesson_not_found');
      err.statusCode = 404;
      throw err;
    }
    return lessonV2ToDto(lesson);
  };

  /**
   * PATCH /api/v2/schedule/lessons/:id — частичное обновление полей расписания v2.
   * Обновляет: topic, format, notes, planItemsOverride, price, startAt, durationMinutes.
   * planItemsOverride: null = вернуть план серии, [] = пустой override, [...] = override.
   *
   * Перенос startAt/durationMinutes для уроков в серии запрещён —
   * там нужен series-scope dialog, который живёт в существующем reschedule-flow
   * (`shiftLessonTime` / `rescheduleLessonByDrag`). Для серий клиент должен вызвать его.
   */
  const updateLessonV2 = async (user: User, lessonId: number, body: any) => {
    const teacher = await ensureTeacher(user);
    const existing = await prisma.lesson.findFirst({
      where: { id: lessonId, teacherId: teacher.chatId },
      select: { id: true, seriesId: true, status: true },
    });
    if (!existing) {
      const err: any = new Error('lesson_not_found');
      err.statusCode = 404;
      throw err;
    }

    const data: Record<string, any> = {};

    if (body.topic !== undefined) {
      if (body.topic === null || body.topic === '') {
        data.topic = null;
      } else if (typeof body.topic === 'string') {
        data.topic = body.topic.trim().slice(0, 200) || null;
      }
    }

    if (body.format !== undefined) {
      if (body.format === null || body.format === '') {
        data.format = null;
      } else if (isLessonFormat(body.format)) {
        data.format = body.format;
      }
    }

    if (body.notes !== undefined) {
      if (body.notes === null) data.notes = null;
      else if (typeof body.notes === 'string') data.notes = body.notes.slice(0, 5000);
    }

    if (body.price !== undefined) {
      const numeric = Number(body.price);
      if (Number.isFinite(numeric) && numeric >= 0) data.price = Math.trunc(numeric);
    }

    if (body.planItemsOverride !== undefined) {
      if (body.planItemsOverride === null) {
        data.planItemsOverride = null;
      } else if (Array.isArray(body.planItemsOverride)) {
        data.planItemsOverride = stringifyPlan(sanitizePlanArray(body.planItemsOverride));
      }
    }

    const wantsStartAt = body.startAt !== undefined;
    const wantsDuration = body.durationMinutes !== undefined;
    if (wantsStartAt || wantsDuration) {
      if (existing.seriesId != null) {
        const err: any = new Error('use_reschedule_for_series');
        err.statusCode = 400;
        throw err;
      }
      if (existing.status === 'COMPLETED') {
        const err: any = new Error('lesson_completed');
        err.statusCode = 400;
        throw err;
      }
      if (wantsStartAt) {
        const parsed = body.startAt ? new Date(body.startAt) : null;
        if (!parsed || Number.isNaN(parsed.getTime())) {
          const err: any = new Error('invalid_start_at');
          err.statusCode = 400;
          throw err;
        }
        data.startAt = parsed;
      }
      if (wantsDuration) {
        const dur = Math.trunc(Number(body.durationMinutes));
        if (!Number.isFinite(dur) || dur < 5 || dur > 24 * 60) {
          const err: any = new Error('invalid_duration');
          err.statusCode = 400;
          throw err;
        }
        data.durationMinutes = dur;
      }
    }

    if (Object.keys(data).length === 0) {
      const err: any = new Error('no_updatable_fields');
      err.statusCode = 400;
      throw err;
    }
    await prisma.lesson.update({ where: { id: lessonId }, data });

    const refreshed = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        attachments: { orderBy: { createdAt: 'asc' } },
        series: {
          include: {
            attachments: {
              orderBy: { createdAt: 'asc' },
              include: { fileObject: true },
            },
          },
        },
      },
    });
    return lessonV2ToDto(refreshed);
  };

  /**
   * PUT /api/v2/schedule/series/:id/plan — обновить план серии.
   * Все уроки серии без override автоматически "увидят" новый план.
   */
  const updateSeriesPlan = async (user: User, seriesId: number, body: any) => {
    const teacher = await ensureTeacher(user);
    const series = await prisma.lessonSeries.findFirst({
      where: { id: seriesId, teacherId: teacher.chatId },
      select: { id: true },
    });
    if (!series) {
      const err: any = new Error('series_not_found');
      err.statusCode = 404;
      throw err;
    }
    const sanitized = sanitizePlanArray(body?.planItems);
    await prisma.lessonSeries.update({
      where: { id: seriesId },
      data: { planItems: stringifyPlan(sanitized) },
    });
    return { planItems: sanitized };
  };

  /**
   * POST /api/v2/schedule/lessons/:id/attachments — записать загруженный файл в БД.
   * Аплоад идёт через `/api/v2/files/upload/:token` presign-механизм (см. модуль uploads).
   * Клиент шлёт fileObjectId, fileName, size; url вычисляется из FileObject.storageKey.
   * Legacy-форма {fileName, url, size} без fileObjectId оставлена как fallback.
   */
  const addLessonAttachment = async (user: User, lessonId: number, body: any) => {
    const teacher = await ensureTeacher(user);
    const lesson = await prisma.lesson.findFirst({
      where: { id: lessonId, teacherId: teacher.chatId },
      select: { id: true },
    });
    if (!lesson) {
      const err: any = new Error('lesson_not_found');
      err.statusCode = 404;
      throw err;
    }

    const existingCount = await prisma.lessonAttachment.count({ where: { lessonId } });
    if (existingCount >= FILE_LIMITS.maxFilesPerLesson) {
      throw new UploadLimitError('too_many_files', FILE_LIMIT_MESSAGES.tooManyFiles('lesson'));
    }

    const fileObjectId = typeof body?.fileObjectId === 'string' ? body.fileObjectId.trim() : '';
    const fileNameRaw = typeof body?.fileName === 'string' ? body.fileName.trim() : '';

    if (fileObjectId) {
      const fo = await prisma.fileObject.findFirst({
        where: { id: fileObjectId, ownerUserId: user.id },
      });
      if (!fo) {
        const err: any = new Error('file_object_not_found');
        err.statusCode = 404;
        throw err;
      }
      const created = await prisma.lessonAttachment.create({
        data: {
          id: crypto.randomUUID(),
          lessonId,
          fileObjectId: fo.id,
          fileName: (fileNameRaw || fo.storageKey).slice(0, 200),
          url: `/api/v2/files/object/${fo.storageKey}`,
          size: fo.size,
        },
      });
      return {
        id: created.id,
        fileName: created.fileName,
        url: created.url,
        size: created.size,
        fileObjectId: created.fileObjectId,
      };
    }

    const url = typeof body?.url === 'string' ? body.url.trim() : '';
    const size = Number(body?.size ?? 0);
    if (!fileNameRaw || !url || !Number.isFinite(size) || size < 0) {
      const err: any = new Error('invalid_attachment');
      err.statusCode = 400;
      throw err;
    }
    if (size > FILE_LIMITS.maxFileBytes) {
      throw new UploadLimitError('file_too_large', FILE_LIMIT_MESSAGES.fileTooLarge());
    }
    const created = await prisma.lessonAttachment.create({
      data: {
        id: crypto.randomUUID(),
        lessonId,
        fileName: fileNameRaw.slice(0, 200),
        url,
        size: Math.trunc(size),
      },
    });
    return {
      id: created.id,
      fileName: created.fileName,
      url: created.url,
      size: created.size,
      fileObjectId: null,
    };
  };

  /**
   * DELETE /api/v2/schedule/lessons/:id/attachments/:attachmentId
   */
  const removeLessonAttachment = async (user: User, lessonId: number, attachmentId: string) => {
    const teacher = await ensureTeacher(user);
    const lesson = await prisma.lesson.findFirst({
      where: { id: lessonId, teacherId: teacher.chatId },
      select: { id: true },
    });
    if (!lesson) {
      const err: any = new Error('lesson_not_found');
      err.statusCode = 404;
      throw err;
    }
    await prisma.lessonAttachment.deleteMany({ where: { id: attachmentId, lessonId } });
    return { ok: true };
  };

  /**
   * POST /api/v2/schedule/series/:id/attachments — материал для всей серии уроков.
   * Один FileObject — одна запись SeriesAttachment, без дублей по урокам.
   */
  const addSeriesAttachment = async (user: User, seriesId: number, body: any) => {
    const teacher = await ensureTeacher(user);
    const series = await prisma.lessonSeries.findFirst({
      where: { id: seriesId, teacherId: teacher.chatId },
      select: { id: true },
    });
    if (!series) {
      const err: any = new Error('series_not_found');
      err.statusCode = 404;
      throw err;
    }
    const existingCount = await prisma.seriesAttachment.count({ where: { seriesId } });
    if (existingCount >= FILE_LIMITS.maxFilesPerSeries) {
      throw new UploadLimitError('too_many_files', FILE_LIMIT_MESSAGES.tooManyFiles('series'));
    }
    const fileObjectId = typeof body?.fileObjectId === 'string' ? body.fileObjectId.trim() : '';
    if (!fileObjectId) {
      const err: any = new Error('file_object_id_required');
      err.statusCode = 400;
      throw err;
    }
    const fo = await prisma.fileObject.findFirst({
      where: { id: fileObjectId, ownerUserId: user.id },
    });
    if (!fo) {
      const err: any = new Error('file_object_not_found');
      err.statusCode = 404;
      throw err;
    }
    const fileNameRaw = typeof body?.fileName === 'string' ? body.fileName.trim() : '';
    const created = await prisma.seriesAttachment.create({
      data: {
        id: crypto.randomUUID(),
        seriesId,
        fileObjectId: fo.id,
        fileName: (fileNameRaw || fo.storageKey).slice(0, 200),
        size: fo.size,
      },
    });
    return {
      id: created.id,
      fileName: created.fileName,
      size: created.size,
      fileObjectId: created.fileObjectId,
      url: `/api/v2/files/object/${fo.storageKey}`,
    };
  };

  /**
   * DELETE /api/v2/schedule/series/:id/attachments/:attachmentId
   */
  const removeSeriesAttachment = async (user: User, seriesId: number, attachmentId: string) => {
    const teacher = await ensureTeacher(user);
    const series = await prisma.lessonSeries.findFirst({
      where: { id: seriesId, teacherId: teacher.chatId },
      select: { id: true },
    });
    if (!series) {
      const err: any = new Error('series_not_found');
      err.statusCode = 404;
      throw err;
    }
    await prisma.seriesAttachment.deleteMany({ where: { id: attachmentId, seriesId } });
    return { ok: true };
  };

  /**
   * GET /api/v2/schedule/series/:id/attachments — список материалов серии.
   */
  const listSeriesAttachments = async (user: User, seriesId: number) => {
    const teacher = await ensureTeacher(user);
    const series = await prisma.lessonSeries.findFirst({
      where: { id: seriesId, teacherId: teacher.chatId },
      select: { id: true },
    });
    if (!series) {
      const err: any = new Error('series_not_found');
      err.statusCode = 404;
      throw err;
    }
    const rows = await prisma.seriesAttachment.findMany({
      where: { seriesId },
      orderBy: { createdAt: 'asc' },
      include: { fileObject: true },
    });
    return rows.map((a: any) => ({
      id: a.id,
      fileName: a.fileName,
      size: a.size,
      fileObjectId: a.fileObjectId,
      url: a.fileObject?.storageKey ? `/api/v2/files/object/${a.fileObject.storageKey}` : null,
    }));
  };

  /**
   * GET /api/v2/schedule/students/:id/topics — история тем по этому ученику,
   * самые свежие сверху, без пустых, без дубликатов.
   */
  const listStudentTopics = async (user: User, studentId: number) => {
    const teacher = await ensureTeacher(user);
    const rows = await prisma.lesson.findMany({
      where: {
        teacherId: teacher.chatId,
        studentId,
        topic: { not: null },
      },
      select: { topic: true, startAt: true },
      orderBy: { startAt: 'desc' },
      take: 200,
    });
    const seen = new Set<string>();
    const topics: { topic: string; usedAt: string }[] = [];
    for (const row of rows) {
      const t = (row.topic ?? '').trim();
      if (!t) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      topics.push({ topic: t, usedAt: row.startAt.toISOString() });
      if (topics.length >= 50) break;
    }
    return { topics };
  };

  return {
    getLessonV2,
    updateLessonV2,
    updateSeriesPlan,
    addLessonAttachment,
    removeLessonAttachment,
    addSeriesAttachment,
    removeSeriesAttachment,
    listSeriesAttachments,
    listStudentTopics,
  };
};

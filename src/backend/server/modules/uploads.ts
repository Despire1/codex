import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { FILE_LIMITS } from '../../../shared/config/fileLimits';
import {
  UploadLimitError,
  getUserUsedStorageBytes,
  validateUploadOrThrow,
  type UploadValidationContext,
} from './fileLimits';

type UploadsDependencies = {
  prisma: any;
  clampNumber: (value: number, min: number, max: number) => number;
  readRawBody: (req: IncomingMessage, options?: { maxBytes?: number }) => Promise<Buffer>;
  notFound: (res: ServerResponse) => void;
};

const HOMEWORK_UPLOAD_TTL_SEC = 15 * 60;
const HOMEWORK_UPLOAD_DIR = path.resolve(process.cwd(), 'tmp', 'uploads');

const isExecutableMagicBytes = (data: Buffer): boolean => {
  if (data.length < 2) return false;
  // Windows PE/COFF (MZ)
  if (data[0] === 0x4d && data[1] === 0x5a) return true;
  // ELF (Linux/Unix executables)
  if (data.length >= 4 && data[0] === 0x7f && data[1] === 0x45 && data[2] === 0x4c && data[3] === 0x46) return true;
  // Mach-O (macOS): feedface, feedfacf, cafebabe
  if (data.length >= 4) {
    const w = data.readUInt32BE(0);
    if (w === 0xfeedface || w === 0xfeedfacf || w === 0xcafebabe || w === 0xcffaedfe || w === 0xcefaedfe) return true;
  }
  // Shebang scripts (#!)
  if (data[0] === 0x23 && data[1] === 0x21) return true;
  // .NET PE / Windows .com / .bat (#@) — already covered by MZ for PE; .bat starts with text, harder.
  return false;
};

type PendingUpload = {
  ownerUserId: number;
  objectKey: string;
  contentType: string;
  maxSize: number;
  expiresAt: number;
};

const parseValidationContext = (raw: unknown): UploadValidationContext | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const kind = typeof obj.kind === 'string' ? obj.kind : '';
  switch (kind) {
    case 'lesson': {
      const lessonId = Number(obj.lessonId);
      if (!Number.isFinite(lessonId) || lessonId <= 0) return undefined;
      return { kind: 'lesson', lessonId: Math.trunc(lessonId) };
    }
    case 'series': {
      const seriesId = Number(obj.seriesId);
      if (!Number.isFinite(seriesId) || seriesId <= 0) return undefined;
      return { kind: 'series', seriesId: Math.trunc(seriesId) };
    }
    case 'homeworkTemplate':
    case 'homeworkSubmission':
    case 'homeworkSubmissionVoice': {
      const currentCount = Number(obj.currentCount ?? 0);
      const safe = Number.isFinite(currentCount) ? Math.max(0, Math.trunc(currentCount)) : 0;
      return { kind, currentCount: safe } as UploadValidationContext;
    }
    default:
      return undefined;
  }
};

export const createUploadsService = ({ prisma, clampNumber, readRawBody, notFound }: UploadsDependencies) => {
  const pendingHomeworkUploads = new Map<string, PendingUpload>();

  const cleanupPendingHomeworkUploads = () => {
    const nowTs = Date.now();
    for (const [token, value] of pendingHomeworkUploads.entries()) {
      if (value.expiresAt <= nowTs) pendingHomeworkUploads.delete(token);
    }
  };

  const sanitizeFileName = (value: string) =>
    value
      .trim()
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 120) || 'file';

  const createFilePresignUploadV2 = async (user: { id: number }, body: Record<string, unknown>) => {
    cleanupPendingHomeworkUploads();
    const rawFileName = typeof body.fileName === 'string' ? body.fileName : 'file';
    const fileName = sanitizeFileName(rawFileName);
    const contentType =
      typeof body.contentType === 'string' && body.contentType.trim() ? body.contentType : 'application/octet-stream';
    const requestedSize = Number(body.size ?? 0);
    if (!Number.isFinite(requestedSize) || requestedSize <= 0) {
      throw new UploadLimitError('invalid_size', 'Некорректный размер файла', 400);
    }
    const size = clampNumber(requestedSize, 1, FILE_LIMITS.maxFileBytes);
    const context = parseValidationContext(body.context);

    await validateUploadOrThrow({
      prisma,
      ownerUserId: user.id,
      size,
      mime: contentType,
      context,
    });

    const token = crypto.randomUUID();
    const objectKey = `${Date.now()}_${crypto.randomUUID()}_${fileName}`;
    pendingHomeworkUploads.set(token, {
      ownerUserId: user.id,
      objectKey,
      contentType,
      maxSize: size,
      expiresAt: Date.now() + HOMEWORK_UPLOAD_TTL_SEC * 1000,
    });

    return {
      uploadUrl: `/api/v2/files/upload/${token}`,
      method: 'PUT' as const,
      headers: { 'Content-Type': contentType },
      fileUrl: `/api/v2/files/object/${objectKey}`,
      objectKey,
      expiresInSeconds: HOMEWORK_UPLOAD_TTL_SEC,
    };
  };

  const handlePresignedUploadPutV2 = async (req: IncomingMessage, res: ServerResponse, token: string) => {
    cleanupPendingHomeworkUploads();
    const pending = pendingHomeworkUploads.get(token);
    if (!pending || pending.expiresAt <= Date.now()) {
      res.statusCode = 410;
      return res.end('upload_token_expired');
    }

    let data: Buffer;
    try {
      data = await readRawBody(req, { maxBytes: pending.maxSize });
    } catch (error) {
      const statusCodeRaw = (error as { statusCode?: unknown } | null)?.statusCode;
      const statusCode =
        typeof statusCodeRaw === 'number' && Number.isFinite(statusCodeRaw) ? Math.trunc(statusCodeRaw) : null;
      if (statusCode === 413) {
        res.statusCode = 413;
        return res.end('payload_too_large');
      }
      throw error;
    }

    if (isExecutableMagicBytes(data)) {
      res.statusCode = 415;
      return res.end('executable_uploads_not_allowed');
    }

    const fullPath = path.join(HOMEWORK_UPLOAD_DIR, pending.objectKey);
    const normalizedRoot = path.resolve(HOMEWORK_UPLOAD_DIR);
    const normalizedPath = path.resolve(fullPath);
    if (!normalizedPath.startsWith(normalizedRoot)) {
      res.statusCode = 400;
      return res.end('invalid_object_key');
    }

    await fs.mkdir(path.dirname(normalizedPath), { recursive: true });
    await fs.writeFile(normalizedPath, data);
    pendingHomeworkUploads.delete(token);

    const hash = crypto.createHash('sha256').update(data).digest('hex');
    const actualSize = data.byteLength;

    const existing = await prisma.fileObject.findUnique({
      where: { ownerUserId_hash: { ownerUserId: pending.ownerUserId, hash } },
    });

    let fileObjectId: string;
    let storageKey: string;
    if (existing) {
      try {
        await fs.unlink(normalizedPath);
      } catch {
        // ignore cleanup failure
      }
      fileObjectId = existing.id;
      storageKey = existing.storageKey;
    } else {
      const created = await prisma.fileObject.create({
        data: {
          id: crypto.randomUUID(),
          ownerUserId: pending.ownerUserId,
          hash,
          mime: pending.contentType,
          size: actualSize,
          storageKey: pending.objectKey,
        },
      });
      fileObjectId = created.id;
      storageKey = created.storageKey;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(
      JSON.stringify({
        ok: true,
        fileObjectId,
        fileUrl: `/api/v2/files/object/${storageKey}`,
        size: actualSize,
        deduplicated: Boolean(existing),
      }),
    );
  };

  const resolveUploadedFileContentType = (objectKey: string) => {
    const extension = path.extname(objectKey).toLowerCase();
    if (extension === '.m4a') return 'audio/mp4';
    if (extension === '.webm') return 'audio/webm';
    if (extension === '.ogg') return 'audio/ogg';
    if (extension === '.mp3') return 'audio/mpeg';
    if (extension === '.wav') return 'audio/wav';
    if (extension === '.pdf') return 'application/pdf';
    if (extension === '.png') return 'image/png';
    if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
    if (extension === '.gif') return 'image/gif';
    if (extension === '.mp4') return 'video/mp4';
    if (extension === '.mov') return 'video/quicktime';
    return 'application/octet-stream';
  };

  const handleUploadedFileObjectGetV2 = async (req: IncomingMessage, res: ServerResponse, objectKeyRaw: string) => {
    const objectKey = objectKeyRaw.replace(/\\/g, '/');
    const fullPath = path.join(HOMEWORK_UPLOAD_DIR, objectKey);
    const normalizedRoot = path.resolve(HOMEWORK_UPLOAD_DIR);
    const normalizedPath = path.resolve(fullPath);
    if (!normalizedPath.startsWith(normalizedRoot)) {
      return notFound(res);
    }
    try {
      const stat = await fs.stat(normalizedPath);
      const fileSize = stat.size;
      const contentType = resolveUploadedFileContentType(objectKey);
      const rangeHeader = req.headers.range;
      const file = await fs.readFile(normalizedPath);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Accept-Ranges', 'bytes');

      if (rangeHeader && fileSize > 0) {
        const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
        if (match) {
          const startRaw = match[1] ? Number(match[1]) : Number.NaN;
          const endRaw = match[2] ? Number(match[2]) : Number.NaN;
          const hasStart = Number.isFinite(startRaw);
          const hasEnd = Number.isFinite(endRaw);

          let start = hasStart ? startRaw : 0;
          let end = hasEnd ? endRaw : fileSize - 1;

          if (!hasStart && hasEnd) {
            const suffixLength = Math.max(0, endRaw);
            start = Math.max(0, fileSize - suffixLength);
            end = fileSize - 1;
          }

          if (start > end || start < 0 || end >= fileSize) {
            res.statusCode = 416;
            res.setHeader('Content-Range', `bytes */${fileSize}`);
            return res.end();
          }

          const chunk = file.subarray(start, end + 1);
          res.statusCode = 206;
          res.setHeader('Content-Length', String(chunk.length));
          res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
          return res.end(chunk);
        }
      }

      res.statusCode = 200;
      res.setHeader('Content-Length', String(file.length));
      res.end(file);
    } catch {
      notFound(res);
    }
  };

  const getStorageQuotaV2 = async (user: { id: number }) => {
    const usedBytes = await getUserUsedStorageBytes(prisma, user.id);
    return {
      usedBytes,
      quotaBytes: FILE_LIMITS.maxStorageBytesPerUser,
      maxFileBytes: FILE_LIMITS.maxFileBytes,
      maxFilesPerLesson: FILE_LIMITS.maxFilesPerLesson,
      maxFilesPerSeries: FILE_LIMITS.maxFilesPerSeries,
      maxFilesPerHomeworkTemplate: FILE_LIMITS.maxFilesPerHomeworkTemplate,
      maxFilesPerSubmission: FILE_LIMITS.maxFilesPerSubmission,
      maxVoiceFilesPerSubmission: FILE_LIMITS.maxVoiceFilesPerSubmission,
    };
  };

  return {
    createFilePresignUploadV2,
    handlePresignedUploadPutV2,
    handleUploadedFileObjectGetV2,
    getStorageQuotaV2,
  };
};

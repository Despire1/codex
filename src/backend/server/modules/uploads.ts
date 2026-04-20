import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

type UploadsDependencies = {
  clampNumber: (value: number, min: number, max: number) => number;
  readRawBody: (req: IncomingMessage, options?: { maxBytes?: number }) => Promise<Buffer>;
  notFound: (res: ServerResponse) => void;
};

const HOMEWORK_UPLOAD_TTL_SEC = 15 * 60;
const HOMEWORK_UPLOAD_DIR = path.resolve(process.cwd(), 'tmp', 'uploads');

export const createUploadsService = ({ clampNumber, readRawBody, notFound }: UploadsDependencies) => {
  const pendingHomeworkUploads = new Map<
    string,
    { objectKey: string; contentType: string; maxSize: number; expiresAt: number }
  >();

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

  const createFilePresignUploadV2 = (_req: IncomingMessage, body: Record<string, unknown>) => {
    cleanupPendingHomeworkUploads();
    const rawFileName = typeof body.fileName === 'string' ? body.fileName : 'file';
    const fileName = sanitizeFileName(rawFileName);
    const contentType =
      typeof body.contentType === 'string' && body.contentType.trim() ? body.contentType : 'application/octet-stream';
    const requestedSize = Number(body.size ?? 0);
    const size =
      Number.isFinite(requestedSize) && requestedSize > 0
        ? clampNumber(requestedSize, 1, 50 * 1024 * 1024)
        : 50 * 1024 * 1024;
    const token = crypto.randomUUID();
    const objectKey = `${Date.now()}_${crypto.randomUUID()}_${fileName}`;
    pendingHomeworkUploads.set(token, {
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
        typeof statusCodeRaw === 'number' && Number.isFinite(statusCodeRaw)
          ? Math.trunc(statusCodeRaw)
          : null;
      if (statusCode === 413) {
        res.statusCode = 413;
        return res.end('payload_too_large');
      }
      throw error;
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
    res.statusCode = 200;
    return res.end('ok');
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

  const handleUploadedFileObjectGetV2 = async (
    req: IncomingMessage,
    res: ServerResponse,
    objectKeyRaw: string,
  ) => {
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

  return {
    createFilePresignUploadV2,
    handlePresignedUploadPutV2,
    handleUploadedFileObjectGetV2,
  };
};

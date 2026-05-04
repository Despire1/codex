import {
  FILE_LIMITS,
  FILE_LIMIT_MESSAGES,
  getMaxFilesForContext,
  isMimeAllowed,
  type FileLimitContext,
} from '../../../shared/config/fileLimits';

export type UploadValidationContext =
  | { kind: 'lesson'; lessonId: number }
  | { kind: 'series'; seriesId: number }
  | { kind: 'homeworkTemplate'; currentCount: number }
  | { kind: 'homeworkSubmission'; currentCount: number }
  | { kind: 'homeworkSubmissionVoice'; currentCount: number };

export class UploadLimitError extends Error {
  statusCode: number;
  code: string;

  constructor(code: string, message: string, statusCode = 413) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.name = 'UploadLimitError';
  }
}

export type UploadValidationParams = {
  prisma: any;
  ownerUserId: number;
  size: number;
  mime: string;
  context?: UploadValidationContext;
};

export const getUserUsedStorageBytes = async (prisma: any, ownerUserId: number): Promise<number> => {
  const aggregated = await prisma.fileObject.aggregate({
    where: { ownerUserId },
    _sum: { size: true },
  });
  return Number(aggregated._sum?.size ?? 0);
};

const assertContextCount = async (prisma: any, ctx: UploadValidationContext): Promise<void> => {
  const max = getMaxFilesForContext(ctx.kind);
  let count = 0;
  switch (ctx.kind) {
    case 'lesson':
      count = await prisma.lessonAttachment.count({ where: { lessonId: ctx.lessonId } });
      break;
    case 'series':
      count = await prisma.seriesAttachment.count({ where: { seriesId: ctx.seriesId } });
      break;
    case 'homeworkTemplate':
    case 'homeworkSubmission':
    case 'homeworkSubmissionVoice':
      count = Math.max(0, Math.trunc(ctx.currentCount));
      break;
  }
  if (count >= max) {
    throw new UploadLimitError('too_many_files', FILE_LIMIT_MESSAGES.tooManyFiles(ctx.kind, max));
  }
};

export const validateUploadOrThrow = async (params: UploadValidationParams): Promise<void> => {
  const { prisma, ownerUserId, size, mime, context } = params;

  if (!Number.isFinite(size) || size <= 0) {
    throw new UploadLimitError('invalid_size', 'Некорректный размер файла', 400);
  }
  if (size > FILE_LIMITS.maxFileBytes) {
    throw new UploadLimitError('file_too_large', FILE_LIMIT_MESSAGES.fileTooLarge());
  }
  if (!isMimeAllowed(mime)) {
    throw new UploadLimitError('mime_not_allowed', FILE_LIMIT_MESSAGES.unsupportedMime(), 415);
  }

  const used = await getUserUsedStorageBytes(prisma, ownerUserId);
  if (used + size > FILE_LIMITS.maxStorageBytesPerUser) {
    throw new UploadLimitError(
      'storage_quota_exceeded',
      FILE_LIMIT_MESSAGES.storageQuotaExceeded(FILE_LIMITS.maxStorageBytesPerUser, used),
    );
  }

  if (context) {
    await assertContextCount(prisma, context);
  }
};

export const countFilesInContext = async (
  prisma: any,
  ctx: { kind: 'lesson'; lessonId: number } | { kind: 'series'; seriesId: number },
): Promise<number> => {
  if (ctx.kind === 'lesson') {
    return prisma.lessonAttachment.count({ where: { lessonId: ctx.lessonId } });
  }
  return prisma.seriesAttachment.count({ where: { seriesId: ctx.seriesId } });
};

export type { FileLimitContext };
